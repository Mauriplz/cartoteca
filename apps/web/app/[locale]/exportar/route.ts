import { NextResponse } from "next/server";
import { latestAsOf } from "@/lib/db";
import { getScreener } from "@/lib/queries";
import { coerceLocale, pick } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { ranking, type CaseKey } from "@/lib/i18n/ranking";
// Misma etiqueta de variante que el resto del sitio: la base del acabado se
// traduce y el subtipo viaja crudo porque es dato de origen.
import { variantName } from "@/components/CardTile";

/**
 * Export CSV del ranking de inversion.
 *
 * Reusa getScreener con los mismos filtros de querystring que la pagina del
 * ranking (idioma, min, rareza, caso), mas los que el screener ya soporta
 * aunque la pagina aun no los exponga (max, ilustrador). Se aceptan tambien
 * los alias en ingles del explorador de cartas (lang, minPrice, maxPrice,
 * rarity, artist) para que un querystring copiado de alli siga funcionando.
 * La deduplicacion por producto de Cardmarket viene heredada del screener:
 * el fichero contiene las mismas filas que veria la pagina, en el mismo orden.
 *
 * Convenciones del fichero:
 *  - los NUMEROS van sin formato local (punto decimal, sin separador de miles)
 *    para que cualquier parser los lea; las ETIQUETAS (variante, idioma,
 *    rareza ausente, cabeceras) si van en el idioma de la interfaz;
 *  - BOM UTF-8 delante: sin el, Excel abre el UTF-8 como ANSI y los nombres
 *    japoneses y los acentos llegan rotos;
 *  - un componente sin dato es una celda VACIA, no un cero: cero seria un
 *    z-score neutro medido, y eso no se ha medido;
 *  - la columna de posicion es la posicion dentro de esta seleccion ordenada
 *    por puntuacion, igual que en la tabla. El parametro `orden` de la pagina
 *    (deriva) se ignora a proposito: la deriva reordena, no puntua, y el CSV
 *    documenta el ranking.
 */
export const dynamic = "force-dynamic";

/** Limite de filas del fichero. */
const MAX_ROWS = 1000;
/** Mismo techo defensivo que la pagina: hoy el universo puntuado son ~1.300. */
const SCAN_CAP = 5000;

/**
 * Una columna por componente de la puntuacion. Son las tres senales que
 * componen invest_score (el detalle `components` de la base no lleva otras).
 * Sus cabeceras conservan la clave de la senal en los tres idiomas: son
 * identificadores de la metodologia, no palabras, y traducirlos separaria el
 * CSV de la documentacion y del resto del sitio.
 */
// Todas las senales que el compuesto PUEDE llevar, no solo las que lleva hoy: si
// el pipeline incorpora market_divergence al score, el CSV no la omitira en
// silencio y la puntuacion seguira siendo reproducible desde sus columnas.
const COMPONENT_COLS = ["cohort_pct", "artist_premium", "jp_en_ratio", "market_divergence"] as const;

/**
 * Copia literal de CASE_OF_SIGNAL y caseOf() de la pagina del ranking
 * (app/[locale]/page.tsx), que no los exporta porque es una pagina. Si aquello
 * cambia, esto debe cambiar igual: el CSV con ?caso= tiene que contener
 * exactamente las filas que la pagina muestra con ese filtro.
 */
const CASE_OF_SIGNAL: Record<string, CaseKey> = {
  market_divergence: "arbitraje",
  cohort_pct: "cohorte",
  jp_en_ratio: "japon",
  artist_premium: "ilustrador",
};

const CASE_KEYS: readonly CaseKey[] = ["arbitraje", "cohorte", "japon", "ilustrador"];

function caseOf(components: Record<string, number>): CaseKey | null {
  const top = Object.entries(components)
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] <= 0) return null;
  return CASE_OF_SIGNAL[top[0]] ?? null;
}

/**
 * Numero para el CSV: punto decimal siempre, sin separador de miles y sin ceros
 * de cola. Sin dato, celda vacia; "—" o "N/A" romperia el parseo numerico de la
 * columna.
 */
function cell(v: number | null | undefined, dec: number): string {
  if (v == null || !Number.isFinite(v)) return "";
  return v.toFixed(dec).replace(/0+$/, "").replace(/\.$/, "");
}

/** Escapado CSV (RFC 4180): comillas solo cuando el campo las necesita. */
function esc(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ locale: string }> },
): Promise<NextResponse> {
  const locale = coerceLocale((await ctx.params).locale);
  const t = pick(ranking, locale);
  const c = pick(common, locale);

  const sp = new URL(request.url).searchParams;
  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = sp.get(k);
      if (v !== null && v.trim() !== "") return v.trim();
    }
    return undefined;
  };
  const positive = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // Mismo saneado que la pagina: valores no reconocidos = filtro apagado.
  const idioma = get("idioma", "lang");
  const lang = idioma === "en" || idioma === "ja" ? idioma : undefined;
  const minPrice = positive(get("min", "minPrice"));
  const maxPrice = positive(get("max", "maxPrice"));
  const rarity = get("rareza", "rarity");
  const artist = get("ilustrador", "artist");
  const casoRaw = get("caso");
  const caso = (CASE_KEYS as readonly string[]).includes(casoRaw ?? "")
    ? (casoRaw as CaseKey)
    : undefined;

  // El filtro de caso no vive en SQL sino sobre los componentes, igual que en
  // la pagina: se trae el universo filtrado y se criba aqui.
  const universo = getScreener({ limit: SCAN_CAP, lang, minPrice, maxPrice, rarity, artist });
  const filas = (caso ? universo.filter((r) => caseOf(r.components) === caso) : universo)
    .slice(0, MAX_ROWS);

  const h = t.csv.header;
  const cabecera = [
    h.position, h.name, h.set, h.variant, h.lang, h.illustrator, h.rarity,
    h.price, h.roundtrip, h.score, ...COMPONENT_COLS,
  ];

  const lineas = filas.map((r, i) =>
    [
      String(i + 1),
      esc(r.name ?? ""),
      esc(r.set_name ?? ""),
      esc(variantName(c, r.variant_type, r.variant_subtype)),
      esc(c.langName[r.lang]),
      esc(r.illustrator ?? ""),
      // Los nombres de rareza son dato de origen y viajan crudos; "None" es la
      // ausencia de rareza y es lo unico que se dice en el idioma del usuario.
      esc(r.rarity === "None" ? t.rarityNone : (r.rarity ?? "")),
      cell(r.price_eur, 2),
      // El coste viene como fraccion (0.184); la columna se llama _pct y dice 18.4.
      cell(r.roundtrip_cost == null ? null : r.roundtrip_cost * 100, 2),
      cell(r.score, 4),
      ...COMPONENT_COLS.map((k) => cell(r.components[k], 4)),
    ].join(","),
  );

  const csv = "\uFEFF" + [cabecera.map(esc).join(","), ...lineas].join("\r\n") + "\r\n";

  // La fecha del nombre es la de calculo de las senales, no la de descarga:
  // es la fecha de los datos, que es la que importa al reabrir el fichero.
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cartoteca-ranking-${latestAsOf()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
