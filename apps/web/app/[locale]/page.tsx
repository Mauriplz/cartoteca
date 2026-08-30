import { Fragment, type CSSProperties } from "react";
import {
  getCardSignals,
  getMarketStats,
  getPriceTrajectory,
  getScreener,
} from "@/lib/queries";
import { resolveImage } from "@/lib/format";
import { ArtworkPlaceholder } from "@/components/CardArtwork";
import {
  coerceLocale,
  localePath,
  makeFormatters,
  pick,
  type Formatters,
  type Locale,
} from "@/lib/i18n";
import { common, type CommonDict } from "@/lib/i18n/common";
import { ranking, type CaseKey, type Frag, type RankingDict } from "@/lib/i18n/ranking";
import type { ScoredCard } from "@/lib/types";
// Ruta canonica a la ficha de un instrumento: codifica los ':' y el '%' literal
// que llevan algunos instrument_id. Se importa en vez de reconstruirla a mano
// para que el ranking y el explorador no se separen nunca. Devuelve la ruta sin
// idioma, asi que se envuelve en localePath() para no sacar al usuario del suyo.
import { cardHref } from "@/components/CardTile";
import ScoreBar, {
  CLIP,
  ScoreBarHeader,
  makeScoreFormat,
  signalColumns,
  signalMeta,
  signalShort,
} from "@/components/ScoreBar";

// Los precios y las senales cambian cada dia y la pagina depende del querystring:
// no tiene sentido congelarla en el build.
export const dynamic = "force-dynamic";

const TOP = 100;
/** Techo defensivo: hoy el universo puntuado son ~1.300 instrumentos. */
const UNIVERSE_CAP = 5000;
const MIN_PRESETS = [50, 100, 300, 1000];

/** Los dos idiomas del catalogo. No son los idiomas de la interfaz. */
const LANGS = [
  { code: "en", short: "EN" },
  { code: "ja", short: "JA" },
] as const;

const CASE_KEYS = ["arbitraje", "cohorte", "japon", "ilustrador"] as const;

/**
 * Que senal define cada tipo de caso. Una fila pertenece al grupo de la senal
 * que MAS pesa en su puntuacion, porque es la que sostiene el argumento; las
 * demas lo acompanan.
 */
const CASE_OF_SIGNAL: Record<string, CaseKey> = {
  market_divergence: "arbitraje",
  cohort_pct: "cohorte",
  jp_en_ratio: "japon",
  artist_premium: "ilustrador",
};

/**
 * Umbral de "senal fuerte" en z. Una contribucion por debajo de esto existe,
 * pero no sostiene una frase: decir "cotiza mas barata que el 52% de sus pares"
 * es ruido con forma de argumento.
 */
const STRONG = 0.35;
/** A partir de aqui, una senal negativa merece decirse aunque estropee el caso. */
const AGAINST = -1;

// Los nombres de las claves del querystring se quedan en espanol: son la URL
// publica de la pagina, no texto visible. Traducirlas romperia los enlaces ya
// compartidos y no le diria nada nuevo a nadie.
type Orden = "deriva" | "deriva_asc";
type Query = {
  idioma?: string;
  min?: string;
  rareza?: string;
  caso?: string;
  orden?: string;
};

function href(locale: Locale, cur: Query, patch: Query): string {
  const next: Query = { ...cur, ...patch };
  const p = new URLSearchParams();
  if (next.caso) p.set("caso", next.caso);
  if (next.idioma) p.set("idioma", next.idioma);
  if (next.min) p.set("min", next.min);
  if (next.rareza) p.set("rareza", next.rareza);
  if (next.orden) p.set("orden", next.orden);
  const q = p.toString();
  const base = localePath(locale);
  return q ? `${base}?${q}` : base;
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] ?? null;
}

/** Etiqueta de variante en el idioma de la interfaz. El subtipo es dato: no se traduce. */
function variantName(c: CommonDict, type: string | null, sub: string | null): string {
  const base = type ? (c.variant[type] ?? type) : c.variantNone;
  return sub && sub !== "-" ? `${base} · ${sub}` : base;
}

/**
 * Los nombres de rareza son dato de origen y salen tal cual. La unica excepcion
 * es "None", que no es un nombre sino la ausencia de rareza, y esa si se dice en
 * el idioma del usuario. Vive en una funcion para que la etiqueta visible y el
 * tooltip no puedan volver a decir cosas distintas.
 */
function rarityName(t: RankingDict, rarity: string): string {
  return rarity === "None" ? t.rarityNone : rarity;
}

/** Contribuciones utilizables de una fila, de mayor a menor peso CON signo. */
function weighted(components: Record<string, number>): Array<[string, number]> {
  return Object.entries(components)
    .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
    .sort((a, b) => b[1] - a[1]);
}

/**
 * Tipo de caso de una fila. Solo cuenta la senal que mas empuja: si ninguna
 * empuja, la fila no tiene caso y solo aparece en la vista "todos". Devolver
 * un grupo por defecto seria colocar una carta en un argumento que no la
 * sostiene.
 */
function caseOf(components: Record<string, number>): CaseKey | null {
  const top = weighted(components)[0];
  if (!top || top[1] <= 0) return null;
  return CASE_OF_SIGNAL[top[0]] ?? null;
}

type Detail = Record<string, unknown>;
type Raw = { value: number; detail: Detail };

// El detalle de cada senal es JSON de la base, no una estructura tipada: el
// compilador no puede prometer nada sobre lo que hay dentro. Todo lo que no sea
// un numero finito o una cadena con contenido es falta de dato, y sin dato no
// se escribe la clausula: una frase con un "NaN" dentro es peor que no tenerla.
function numAt(d: Detail, k: string): number | null {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function strAt(d: Detail, k: string): string | null {
  const v = d[k];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * Cohortes por debajo de esto no sostienen un porcentaje: "mas barata que el
 * 67% de las 3 cartas" es una cifra con aire de medicion que no mide nada.
 * El caso extremo —la mas barata de todas— si se puede decir con muy pocas,
 * porque no es un porcentaje sino un hecho contable.
 */
const COHORT_MIN = 5;
const COHORT_MIN_EDGE = 3;

/** Una senal dicha en llano, y si su cifra real juega a favor o en contra. */
type Said = { text: string; good: boolean };

/**
 * Traduce UNA senal a lenguaje llano con las cifras reales de esa carta.
 *
 * Las cifras salen del detalle de la senal, no del z-score: el z dice cuanto se
 * sale del reparto, y eso no es decible en una frase. El percentil de cohorte,
 * la prima del ilustrador, el ratio con la japonesa y el diferencial entre
 * continentes si lo son, y son lo que de verdad se ha medido.
 */
function clause(
  signal: string,
  raw: Raw | undefined,
  r: ScoredCard,
  t: RankingDict,
  f: Formatters,
  rarity: string | null,
): Said | null {
  if (!raw) return null;
  const d = raw.detail;

  switch (signal) {
    case "cohort_pct": {
      const n = numAt(d, "n");
      if (n === null || n < 2) return null;
      // Medido: el percentil es rango/(n-1) con el rango en base 0, asi que 0 y 1
      // son el extremo real de la cohorte. Decir ahi "mas barata que el 100% de
      // las 12 cartas" se contradice solo, porque la carta es una de esas doce.
      const p = raw.value;
      const cheap = p < 0.5;
      const grupo = { n: f.num(n), set: r.set_name, rarity, cheap };
      if (p <= 0.005 || p >= 0.995) {
        return n < COHORT_MIN_EDGE ? null : { text: t.plain.cohortEdge(grupo), good: cheap };
      }
      if (n < COHORT_MIN) return null;
      // La frase nombra LAS n CARTAS de la cohorte, asi que el porcentaje tiene
      // que estar tomado sobre esas n y no sobre las n-1 restantes, que es lo que
      // devuelve el percentil en crudo. Se deshace hasta el rango y se cuenta:
      // con n=7 y rango 1 salia "el 83%" (5/6) cuando lo cierto es que 5 de las
      // 7 son mas caras, o sea el 71%. El grupo dicho y la cifra dicha tienen que
      // ser el mismo conjunto.
      const rank = Math.round(p * (n - 1));
      const share = (cheap ? n - 1 - rank : rank) / n;
      return {
        text: t.plain.cohort({ ...grupo, share: f.pct(share, 0) }),
        good: cheap,
      };
    }

    case "artist_premium": {
      const n = numAt(d, "n");
      const artist = strAt(d, "artist") ?? r.illustrator;
      if (!artist || n === null) return null;
      // La senal es una posicion en percentil con 0,50 como neutro, y la distancia
      // al neutro son PUNTOS de percentil, no un porcentaje de precio.
      //
      // Ojo con lo que es este numero: `value` es el valor CONTRAIDO hacia el
      // neutro por el tamano de muestra (artist_premium.shrunk), no la media
      // cruda de las cartas del ilustrador (artist_premium.raw_mean). Las dos
      // llegan a separarse 8,7 puntos. Por eso la frase dice "prima estimada" y
      // no "se situan de media": lo segundo describiria una media observada, y
      // esto es un estimador.
      const points = (raw.value - 0.5) * 100;
      if (Math.abs(points) < 0.5) return null;
      return {
        text: t.plain.artist({
          artist,
          points: f.num(Number(Math.abs(points).toFixed(1))),
          n: f.num(n),
          above: points > 0,
        }),
        good: points > 0,
      };
    }

    case "jp_en_ratio": {
      const ja = numAt(d, "ja_eur");
      const en = numAt(d, "en_eur");
      const ratio = raw.value;
      if (ja === null || en === null || !(ratio > 0)) return null;
      const higher = ratio >= 1;
      const gap = higher ? ratio - 1 : 1 - ratio;
      if (gap < 0.02) return null;
      return {
        text: t.plain.jp({ pct: f.pct(gap, 0), ja: f.eur(ja), en: f.eur(en), higher }),
        good: higher,
      };
    }

    case "market_divergence": {
      const gross = numAt(d, "gross_spread_pct");
      if (gross === null) return null;
      // El valor de la senal ya es el diferencial NETO: lo que queda del bruto
      // despues del cambio y del coste de ida y vuelta, y solo existe cuando es
      // positivo. Por eso este caso siempre juega a favor.
      return {
        text: t.plain.arb({
          gross: f.pct(Math.abs(gross) / 100, 1),
          net: f.pct(Math.max(raw.value, 0), 1),
          buyEu: gross > 0,
        }),
        good: true,
      };
    }

    default:
      return null;
  }
}

/**
 * La frase de la fila: las dos senales de mayor peso, con sus cifras.
 *
 * Solo entran las senales cuya cifra real apunta en el mismo sentido que su
 * contribucion. No siempre coinciden: el z compara contra el reparto de TODAS
 * las cartas, asi que un percentil del 50% en una cohorte de cinco puede salir
 * con z positivo, y entonces la frase diria "cotiza mas cara que sus pares"
 * dentro de un argumento a favor. Ante esa contradiccion, se calla la senal.
 *
 * Si ademas hay una senal fuerte que juega en contra y no ha entrado en la
 * frase, se dice aparte: un caso de inversion que esconde su propio
 * contraargumento no es un caso, es un anuncio.
 */
function sentence(
  r: ScoredCard,
  sigs: Record<string, Raw>,
  t: RankingDict,
  f: Formatters,
  rarity: string | null,
): { main: string; against: string | null } | null {
  // weighted() ya viene de mayor a menor peso, asi que `dichas` lo hereda.
  const dichas: Array<{ key: string; z: number; text: string }> = [];
  for (const [k, z] of weighted(r.components)) {
    const said = clause(k, sigs[k], r, t, f, rarity);
    if (said && said.good === z > 0) dichas.push({ key: k, z, text: said.text });
  }
  if (dichas.length === 0) return null;

  const positive = dichas.filter((u) => u.z > 0);
  const strong = positive.filter((u) => u.z >= STRONG).slice(0, 2);
  const picked =
    strong.length > 0
      ? strong
      : positive.length > 0
        ? positive.slice(0, 1)
        : // Ninguna senal empuja: la fila no tiene caso, y lo honesto es decir
          // en que se sale del patron, aunque sea por cara.
          [...dichas].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 1);
  if (picked.length === 0) return null;

  const main =
    picked.length >= 2 ? t.plain.join(picked[0].text, picked[1].text) : t.plain.one(picked[0].text);

  const used = new Set(picked.map((u) => u.key));
  const worst = dichas
    .filter((u) => u.z <= AGAINST && !used.has(u.key))
    .sort((a, b) => a.z - b.z)[0];

  return { main, against: worst ? t.plain.against(worst.text) : null };
}

/**
 * Pinta un parrafo que el diccionario devuelve troceado. La negrita y la
 * tipografia tabular viajan en los fragmentos, de modo que cada idioma puede
 * colocar el enfasis y las cifras donde le corresponda; el japones, por ejemplo,
 * pone los numeros antes del sustantivo y cierra con el verbo.
 */
function Rich({ parts }: { parts: readonly Frag[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === "string") return <Fragment key={i}>{p}</Fragment>;
        const Tag = p.b ? "strong" : "span";
        return (
          <Tag key={i} className={p.n ? "num" : undefined}>
            {p.t}
          </Tag>
        );
      })}
    </>
  );
}

function Filtro({
  activo,
  destino,
  children,
  title,
}: {
  activo: boolean;
  destino: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <a href={destino} className={activo ? "tag acc" : "tag"} title={title}>
      {children}
    </a>
  );
}

function Fila({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
      {children}
    </div>
  );
}

function Stat({ v, k, ctx }: { v: string; k: string; ctx?: string }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
      {ctx ? (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, lineHeight: 1.4 }}>
          {ctx}
        </div>
      ) : null}
    </div>
  );
}

const CAPTION_STYLE = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  width: 92,
} as const;

/**
 * Cada instrumento ocupa DOS <tr>: el de los datos y el de la frase. Para que se
 * lean como un solo bloque, el de datos renuncia a su linea inferior y la del
 * grupo la pone el de la frase.
 */
const OPEN: CSSProperties = { borderBottom: "none" };

export default async function Ranking({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const [{ locale: rawLocale }, sp] = await Promise.all([params, searchParams]);
  const locale = coerceLocale(rawLocale);
  const t = pick(ranking, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);
  const fmt = makeScoreFormat(locale);

  const idiomaRaw = first(sp.idioma);
  const lang = idiomaRaw === "en" || idiomaRaw === "ja" ? idiomaRaw : undefined;
  const minRaw = first(sp.min);
  const minNum = minRaw === undefined ? NaN : Number(minRaw);
  const minPrice = Number.isFinite(minNum) && minNum > 0 ? minNum : undefined;
  const rareza = first(sp.rareza);
  const casoRaw = first(sp.caso);
  const caso = (CASE_KEYS as readonly string[]).includes(casoRaw ?? "")
    ? (casoRaw as CaseKey)
    : undefined;
  const ordenRaw = first(sp.orden);
  const orden: Orden | undefined =
    ordenRaw === "deriva" || ordenRaw === "deriva_asc" ? ordenRaw : undefined;

  const cur: Query = {
    idioma: lang,
    min: minPrice ? String(minPrice) : undefined,
    rareza,
    caso,
    orden,
  };
  const hayFiltros = Boolean(lang || minPrice || rareza || caso);

  const stats = getMarketStats();

  // Una sola consulta: el universo puntuado bajo los filtros de idioma y precio.
  // De ahi salen a la vez el recuento real, las rarezas disponibles con su
  // frecuencia y las cien filas de la tabla. Son ~1.300 filas: cuesta 12 ms.
  const universo = getScreener({ limit: UNIVERSE_CAP, lang, minPrice });

  // El tipo de caso y la rareza se cruzan: cada barra de fichas cuenta sobre el
  // universo filtrado por LA OTRA, para que el numero de la ficha sea el numero
  // de filas que se veran al pulsarla.
  const porCaso = new Map<CaseKey, number>();
  for (const r of universo) {
    if (rareza && r.rarity !== rareza) continue;
    const k = caseOf(r.components);
    if (k) porCaso.set(k, (porCaso.get(k) ?? 0) + 1);
  }

  const conteoRareza = new Map<string, number>();
  for (const r of universo) {
    if (caso && caseOf(r.components) !== caso) continue;
    if (r.rarity) conteoRareza.set(r.rarity, (conteoRareza.get(r.rarity) ?? 0) + 1);
  }
  const rarezas = [...conteoRareza.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale))
    .filter(([k, n]) => n >= 3 || k === rareza)
    .slice(0, 16);

  const seleccion = universo.filter(
    (r) => (!rareza || r.rarity === rareza) && (!caso || caseOf(r.components) === caso),
  );

  /**
   * Deriva reciente: donde esta el precio de hoy respecto a la media de 30 dias
   * que publica Cardmarket. No sale del screener, asi que hay que pedirla
   * instrumento a instrumento; medido, cien filas cuestan 0,7 ms y el universo
   * entero unos 9 ms, que solo se pagan cuando se ordena por esta columna.
   *
   * NO es una serie temporal ni un retorno medido por nosotros: es la posicion
   * frente a una media movil de la fuente. Por eso informa y ordena, pero no
   * puntua.
   */
  type Deriva = { pct: number; price: number; avg30: number; avg7: number | null };
  const cacheDeriva = new Map<string, Deriva | null>();
  const derivaDe = (id: string): Deriva | null => {
    const hit = cacheDeriva.get(id);
    if (hit !== undefined) return hit;
    const tr = getPriceTrajectory(id);
    const at = (k: string) => tr.aggregates.find((a) => a.key === k)?.value ?? null;
    const price = at("trend");
    const avg30 = at("avg30");
    const d: Deriva | null =
      tr.drift != null && price != null && avg30 != null
        ? { pct: tr.drift, price, avg30, avg7: at("avg7") }
        : null;
    cacheDeriva.set(id, d);
    return d;
  };

  const ordenadas = orden
    ? [...seleccion].sort((a, b) => {
        const da = derivaDe(a.instrument_id)?.pct ?? null;
        const db = derivaDe(b.instrument_id)?.pct ?? null;
        // Sin media de 30 dias no hay deriva: esas filas van al final en
        // cualquiera de los dos sentidos, no al principio disfrazadas de cero.
        if (da === null && db === null) return b.score - a.score;
        if (da === null) return 1;
        if (db === null) return -1;
        return (orden === "deriva_asc" ? da - db : db - da) || b.score - a.score;
      })
    : seleccion;

  const filas = ordenadas.slice(0, TOP);
  const cols = signalColumns(filas);

  // Si la fuente no publica medias para ninguna fila visible, la columna se
  // omite entera. Rellenarla con guiones seria fingir una medicion.
  const hayDeriva = filas.some((r) => derivaDe(r.instrument_id) !== null);
  const nCols = hayDeriva ? 10 : 9;

  const precios = seleccion.map((r) => r.price_eur).filter((v): v is number => v != null);
  const masBarata = precios.length ? Math.min(...precios) : null;
  const rtMediano = median(seleccion.map((r) => r.roundtrip_cost).filter((v): v is number => v != null));

  const cotizanPct = stats.priced > 0 ? stats.investable / stats.priced : null;

  // El ranking no es el catalogo ordenado: solo se puntuan los instrumentos
  // invertibles que ademas tienen dos senales o mas, porque con una sola no hay
  // nada con lo que contrastarla. Sin filtros ese total ya lo tenemos; con
  // filtros hace falta preguntar por el universo completo para poder decir de
  // cuantos se ha partido en vez de dejar el hueco sin explicar.
  const totalPuntuado = hayFiltros
    ? getScreener({ limit: UNIVERSE_CAP }).length
    : universo.length;
  const sinPuntuar = Math.max(stats.investable - totalPuntuado, 0);
  // Cuantas de las filas visibles descansan en solo dos de las cuatro senales.
  const dosSenales = filas.filter((r) => Object.keys(r.components).length <= 2).length;

  const leyenda: Frag[] = [
    ...t.legend.body(cols.length),
    ...(filas.length > 0 && dosSenales > 0
      ? t.legend.thin({ two: f.num(dosSenales), rows: f.num(filas.length) })
      : []),
    ...t.legend.clip({ clip: f.num(CLIP), clipped: fmt.score(CLIP) }),
  ];

  // Cabecera ordenable: la columna de deriva cicla descendente -> ascendente ->
  // orden por puntuacion, que es el del ranking y al que siempre se puede volver.
  const siguienteOrden: Orden | undefined =
    orden === undefined ? "deriva" : orden === "deriva" ? "deriva_asc" : undefined;
  const tituloOrden =
    orden === undefined ? t.drift.sortDesc : orden === "deriva" ? t.drift.sortAsc : t.drift.sortOff;
  const marcaOrden = orden === "deriva" ? " ↓" : orden === "deriva_asc" ? " ↑" : "";

  // El enlace de descarga conserva los filtros activos con las mismas claves de
  // querystring de la pagina. El `orden` por deriva no viaja a proposito: el
  // CSV documenta el ranking y va siempre en orden de puntuacion, que es lo que
  // cuenta su columna de posicion.
  const qsCsv = new URLSearchParams();
  if (caso) qsCsv.set("caso", caso);
  if (lang) qsCsv.set("idioma", lang);
  if (minPrice) qsCsv.set("min", String(minPrice));
  if (rareza) qsCsv.set("rareza", rareza);
  const qCsv = qsCsv.toString();
  const hrefCsv = qCsv
    ? `${localePath(locale, "exportar")}?${qCsv}`
    : localePath(locale, "exportar");

  return (
    <>
      <h1>{t.title}</h1>
      <p className="sub">{t.intro(f.date(stats.asOf))}</p>

      <div className="stats">
        <Stat v={f.num(stats.cards)} k={t.stat.cards} ctx={t.stat.cardsCtx} />
        <Stat v={f.num(stats.instruments)} k={t.stat.instruments} ctx={t.stat.instrumentsCtx} />
        <Stat
          v={f.num(stats.priced)}
          k={t.stat.priced}
          ctx={t.stat.pricedCtx(f.pct(stats.priced / Math.max(stats.instruments, 1), 0))}
        />
        <Stat
          v={f.num(stats.investable)}
          k={t.stat.investable}
          ctx={t.stat.investableCtx(f.pct(cotizanPct, 1))}
        />
        <Stat
          v={f.num(stats.days)}
          k={t.stat.days}
          ctx={t.stat.daysCtx(f.date(stats.firstDay))}
        />
        <Stat v={f.num(stats.sets)} k={t.stat.sets} ctx={t.stat.setsCtx} />
        <Stat v={f.num(stats.jpEnPairs)} k={t.stat.pairs} ctx={t.stat.pairsCtx} />
        <Stat v={f.num(stats.arbs)} k={t.stat.arbs} ctx={t.stat.arbsCtx} />
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: "10px 0 18px", maxWidth: "78ch" }}>
        {t.reality({
          priced: f.num(stats.priced),
          investable: f.num(stats.investable),
          scored: f.num(totalPuntuado),
          unscored: sinPuntuar > 0 ? f.num(sinPuntuar) : null,
        })}
      </p>

      <div className="note" style={{ marginBottom: 18 }}>
        <Rich parts={t.method({ days: f.num(stats.days), firstDay: f.date(stats.firstDay) })} />
      </div>

      <div className="card pad" style={{ marginBottom: 18, display: "grid", gap: 8 }}>
        <Fila>
          <span className="faint" style={CAPTION_STYLE}>
            {t.cases.label}
          </span>
          <Filtro
            activo={!caso}
            destino={href(locale, cur, { caso: undefined })}
            title={t.cases.allHelp}
          >
            {t.cases.all}
          </Filtro>
          {CASE_KEYS.map((k) => (
            <Filtro
              key={k}
              activo={caso === k}
              destino={href(locale, cur, { caso: k })}
              title={t.cases.help[k]}
            >
              {t.cases.name[k]} <span className="num faint">{f.num(porCaso.get(k) ?? 0)}</span>
            </Filtro>
          ))}
        </Fila>
        <div className="faint" style={{ fontSize: 11.5, maxWidth: "94ch", lineHeight: 1.5 }}>
          {t.cases.note}
        </div>

        <Fila>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.lang}
          </span>
          <Filtro activo={!lang} destino={href(locale, cur, { idioma: undefined })}>
            {t.filters.langAll}
          </Filtro>
          {LANGS.map((l) => (
            <Filtro
              key={l.code}
              activo={lang === l.code}
              destino={href(locale, cur, { idioma: l.code })}
              title={t.filters.langOnly(c.langName[l.code])}
            >
              {c.langName[l.code]}
            </Filtro>
          ))}
        </Fila>

        <Fila>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.minPrice}
          </span>
          <Filtro activo={!minPrice} destino={href(locale, cur, { min: undefined })}>
            {t.filters.minNone}
          </Filtro>
          {MIN_PRESETS.map((m) => (
            <Filtro
              key={m}
              activo={minPrice === m}
              destino={href(locale, cur, { min: String(m) })}
              title={t.filters.minHelp(f.eur(m))}
            >
              {t.filters.minChip(f.num(m))}
            </Filtro>
          ))}
        </Fila>

        <Fila>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.rarity}
          </span>
          <Filtro activo={!rareza} destino={href(locale, cur, { rareza: undefined })}>
            {t.filters.rarityAll}
          </Filtro>
          {rarezas.map(([k, n]) => (
            <Filtro
              key={k}
              activo={rareza === k}
              destino={href(locale, cur, { rareza: k })}
              title={
                k === "None"
                  ? t.filters.rarityNoneHelp(f.num(n))
                  : t.filters.rarityHelp(f.num(n), k)
              }
            >
              {rarityName(t, k)} <span className="num faint">{f.num(n)}</span>
            </Filtro>
          ))}
          {hayFiltros ? (
            <a href={localePath(locale)} className="faint" style={{ fontSize: 12 }}>
              {t.filters.clearAll}
            </a>
          ) : null}
        </Fila>

        <Fila>
          <span className="faint" style={CAPTION_STYLE}>
            {t.csv.label}
          </span>
          <a href={hrefCsv} className="tag" title={t.csv.title(f.date(stats.asOf))}>
            {t.csv.button}
          </a>
        </Fila>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          className="pad"
          style={{
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 12.5,
          }}
        >
          <div>
            <Rich
              parts={t.table.caption({
                shown: f.num(Math.min(TOP, seleccion.length)),
                total: f.num(seleccion.length),
                filtered: hayFiltros,
              })}
            />
            {orden ? (
              <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                {t.drift.orderedBy(orden === "deriva")}
              </div>
            ) : null}
          </div>
          <div className="dim">
            {masBarata === null ? (
              t.table.noPrices
            ) : (
              <Rich
                parts={t.table.cheapest({
                  price: f.eur(masBarata),
                  roundtrip: rtMediano === null ? null : f.pct(rtMediano, 1),
                })}
              />
            )}
          </div>
        </div>

        {filas.length === 0 ? (
          <div className="pad dim" style={{ padding: 28, textAlign: "center" }}>
            {caso ? t.cases.none : t.table.empty}{" "}
            <a href={localePath(locale)} style={{ color: "var(--accent)" }}>
              {t.table.clear}
            </a>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th />
                  <th>{t.table.col.card}</th>
                  <th>{t.table.col.illustrator}</th>
                  <th>{t.table.col.lang}</th>
                  <th className="r" title={t.table.col.priceHelp}>
                    {t.table.col.price}
                  </th>
                  <th className="r" title={c.signal.roundtrip_cost.help}>
                    {t.table.col.roundtrip}
                  </th>
                  {hayDeriva ? (
                    <th className="r" title={t.drift.colHelp}>
                      <a
                        href={href(locale, cur, { orden: siguienteOrden })}
                        title={tituloOrden}
                        style={{ color: orden ? "var(--accent)" : undefined }}
                      >
                        {t.drift.col}
                        {marcaOrden}
                      </a>
                    </th>
                  ) : null}
                  <th className="r" title={c.signal.invest_score.help}>
                    {orden ? (
                      <a href={href(locale, cur, { orden: undefined })} title={t.drift.sortOff}>
                        {t.table.col.score}
                      </a>
                    ) : (
                      <span title={t.drift.byScore}>
                        {t.table.col.score} ↓
                      </span>
                    )}
                  </th>
                  <th>
                    <div style={{ marginBottom: 3 }}>{t.table.col.breakdown(CLIP)}</div>
                    <ScoreBarHeader keys={cols} locale={locale} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const { src: img, fallbackLang } = resolveImage(r, "low");
                  // La imagen prestada es OTRO objeto fisico: mismo arte, otro
                  // marco y otro texto. Se dice, y se marca con borde discontinuo.
                  const prestada =
                    fallbackLang === "en" || fallbackLang === "ja"
                      ? c.langName[fallbackLang]
                      : fallbackLang;
                  const variante = variantName(c, r.variant_type, r.variant_subtype);
                  const nComp = Object.keys(r.components).length;
                  const alt = t.row.imageAlt({
                    name: r.name ?? t.row.unnamed,
                    set: r.set_name ?? t.row.unknownSet,
                    variant: variante,
                  });

                  // Ojo con el nombre: `rareza` a secas es el filtro de la pagina.
                  const rarezaFila = r.rarity ? rarityName(t, r.rarity) : null;
                  // Una consulta por fila visible: 0,4 ms las cien juntas.
                  const sigs: Record<string, Raw> = {};
                  for (const s of getCardSignals(r.instrument_id)) {
                    sigs[s.signal] = { value: s.value, detail: s.detail };
                  }
                  const frase = sentence(r, sigs, t, f, rarezaFila);
                  const grupo = caseOf(r.components);
                  const deriva = derivaDe(r.instrument_id);
                  // Contexto extra del tooltip: la misma lectura contra la media
                  // de 7 dias. Con signo explicito, porque un "+" delante deja
                  // claro que es una posicion relativa y no una cotizacion.
                  const contraAvg7 =
                    deriva && deriva.avg7 && deriva.avg7 > 0 ? deriva.price / deriva.avg7 - 1 : null;
                  const td = frase ? OPEN : undefined;

                  return (
                    <Fragment key={r.instrument_id}>
                      <tr>
                        <td className="r num faint" style={td}>
                          {f.num(i + 1)}
                        </td>
                        <td style={{ ...td, width: 46 }}>
                          {img ? (
                            <img
                              src={img}
                              alt={alt}
                              title={prestada ? t.row.imageFallback(prestada) : undefined}
                              width={34}
                              height={47}
                              loading="lazy"
                              decoding="async"
                              style={{
                                borderRadius: 3,
                                display: "block",
                                background: "var(--surface-2)",
                                border: prestada ? "1px dashed var(--border-strong)" : undefined,
                              }}
                            />
                          ) : (
                            // Sin ilustracion en ninguna fuente: el marcador lleva el
                            // nombre y la edicion, para que la fila siga siendo
                            // identificable sin abrir la ficha.
                            <ArtworkPlaceholder
                              card={r}
                              title={c.artwork.none}
                              width={34}
                            />
                          )}
                        </td>
                        <td style={{ ...td, maxWidth: 320 }}>
                          <div style={{ fontWeight: 550, whiteSpace: "nowrap" }}>
                            <a
                              href={localePath(locale, cardHref(r.instrument_id))}
                              title={t.row.cardLink}
                            >
                              {r.name ?? t.row.unnamed}
                            </a>{" "}
                            {r.local_id ? <span className="num faint">#{r.local_id}</span> : null}
                          </div>
                          <div style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                            <span className="faint">
                              {r.set_name ?? t.row.unknownSet}
                              {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                              {rarezaFila ? ` · ${rarezaFila}` : ""}
                            </span>{" "}
                            <span
                              className="tag"
                              title={
                                r.cm_variant_ambiguous ? t.row.variantShared : t.row.variantOwn
                              }
                            >
                              {variante}
                            </span>
                            {r.variant_count > 1 ? (
                              <>
                                {" "}
                                <span className="tag" title={t.row.finishesHelp(r.variant_count)}>
                                  {t.row.finishesChip(r.variant_count - 1)}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                          {r.illustrator ? (
                            <a
                              href={`${localePath(locale, "cartas")}?artist=${encodeURIComponent(r.illustrator)}`}
                              title={t.row.illustratorLink(r.illustrator)}
                            >
                              {r.illustrator}
                            </a>
                          ) : (
                            <span className="faint">{t.row.noIllustrator}</span>
                          )}
                        </td>
                        <td style={td}>
                          <span className="tag" title={t.row.langTag(c.langName[r.lang])}>
                            {LANGS.find((l) => l.code === r.lang)?.short ?? r.lang.toUpperCase()}
                          </span>
                        </td>
                        <td className="r" style={{ ...td, whiteSpace: "nowrap" }}>
                          <div className="num">{f.eur(r.price_eur)}</div>
                          {r.tcg_market == null ? (
                            <div className="faint" style={{ fontSize: 10.5 }} title={t.row.noTcg}>
                              —
                            </div>
                          ) : (
                            <div
                              className="num faint"
                              style={{ fontSize: 10.5 }}
                              title={t.row.tcgHelp}
                            >
                              {f.usd(r.tcg_market)}
                            </div>
                          )}
                        </td>
                        <td className="r num" style={td}>
                          {r.roundtrip_cost == null ? (
                            <span className="faint">—</span>
                          ) : (
                            <span className={r.roundtrip_cost <= 0.15 ? "pos" : undefined}>
                              {f.pct(r.roundtrip_cost, 1)}
                            </span>
                          )}
                        </td>
                        {hayDeriva ? (
                          <td className="r num" style={td}>
                            {deriva === null ? (
                              <span className="faint" title={t.drift.none}>
                                —
                              </span>
                            ) : (
                              <span
                                className={deriva.pct >= 0 ? "pos" : "neg"}
                                title={t.drift.cell({
                                  pct: f.pct(Math.abs(deriva.pct), 1),
                                  price: f.eur(deriva.price),
                                  avg: f.eur(deriva.avg30),
                                  above: deriva.pct >= 0,
                                  short:
                                    contraAvg7 === null
                                      ? null
                                      : `${contraAvg7 >= 0 ? "+" : ""}${f.pct(contraAvg7, 1)}`,
                                })}
                                style={{ cursor: "help" }}
                              >
                                {deriva.pct >= 0 ? "+" : ""}
                                {f.pct(deriva.pct, 1)}
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="r" style={{ ...td, whiteSpace: "nowrap" }}>
                          <div
                            className="num"
                            style={{ fontWeight: 600 }}
                            title={r.score >= CLIP ? t.row.scoreClipped(CLIP) : undefined}
                          >
                            {fmt.score(r.score)}
                          </div>
                          <div
                            className="num faint"
                            style={{ fontSize: 10.5 }}
                            title={t.row.componentsHelp(nComp, cols.length)}
                          >
                            {nComp}/{cols.length}
                          </div>
                        </td>
                        <td style={td}>
                          <ScoreBar components={r.components} keys={cols} locale={locale} />
                        </td>
                      </tr>

                      {frase ? (
                        <tr>
                          <td colSpan={2} style={{ paddingTop: 0 }} />
                          <td colSpan={nCols - 2} style={{ paddingTop: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "baseline",
                                flexWrap: "wrap",
                                maxWidth: "118ch",
                              }}
                            >
                              {grupo ? (
                                <a
                                  href={href(locale, cur, { caso: grupo })}
                                  className="tag"
                                  title={t.cases.tag(t.cases.name[grupo])}
                                >
                                  {t.cases.short[grupo]}
                                </a>
                              ) : null}
                              <span
                                className="dim"
                                style={{ fontSize: 12.5, lineHeight: 1.5 }}
                              >
                                {frase.main}
                                {frase.against ? (
                                  <span className="faint"> {frase.against}</span>
                                ) : null}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {hayDeriva ? (
        <div className="note" style={{ marginTop: 18 }}>
          <Rich parts={t.drift.note} />
        </div>
      ) : null}

      <div className="card pad" style={{ marginTop: 18 }}>
        <h2>{t.plain.title}</h2>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 14px", maxWidth: "82ch" }}>
          {t.plain.help}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {CASE_KEYS.map((k) => (
            <div key={k}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <a
                  href={href(locale, cur, { caso: k })}
                  className={caso === k ? "tag acc" : "tag"}
                  title={t.cases.tag(t.cases.name[k])}
                >
                  {t.cases.short[k]}
                </a>
                <span style={{ fontWeight: 550, fontSize: 13 }}>{t.cases.name[k]}</span>
                <span className="num faint" style={{ fontSize: 11.5 }}>
                  {f.num(porCaso.get(k) ?? 0)}
                </span>
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {t.cases.help[k]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card pad" style={{ marginTop: 18 }}>
        <h2>{t.legend.title}</h2>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px", maxWidth: "82ch" }}>
          <Rich parts={leyenda} />
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {cols.map((k) => {
            const m = signalMeta(k, locale);
            return (
              <div key={k}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span className="tag num">{signalShort(k)}</span>
                  <span style={{ fontWeight: 550, fontSize: 13 }}>{m?.label ?? k}</span>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {(m?.help ?? t.legend.noHelp) + (t.legend.extra[k] ?? "")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="faint" style={{ fontSize: 11.5, marginTop: 18, maxWidth: "88ch" }}>
        {t.footer}
      </p>
    </>
  );
}
