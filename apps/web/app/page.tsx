import { getMarketStats, getScreener } from "@/lib/queries";
import { cardImage, eur, variantLabel, SIGNAL_META } from "@/lib/format";
// Ruta canonica a la ficha de un instrumento: codifica los ':' y el '%' literal
// que llevan algunos instrument_id. Se importa en vez de reconstruirla a mano
// para que el ranking y el explorador no se separen nunca.
import { cardHref } from "@/components/CardTile";
import ScoreBar, {
  CLIP,
  ScoreBarHeader,
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

// Agrupacion por defecto del espanol: los numeros de cuatro cifras van sin
// separador ("1333"), igual que hace eur() de lib/format. Una sola regla en
// toda la pagina, aunque el ojo anglosajon eche de menos la coma.
const N = new Intl.NumberFormat("es-ES");
const SCORE = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Porcentajes con coma decimal. El pct() compartido usa toFixed y escribe punto. */
function porc(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** Sin Date: la fecha viene ya como texto ISO y convertirla solo invita a un desfase de zona. */
function fecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const RARITY_ES: Record<string, string> = { None: "Sin rareza" };
function rarityLabel(r: string): string {
  return RARITY_ES[r] ?? r;
}

const LANGS: Array<{ code: "en" | "ja"; short: string; long: string }> = [
  { code: "en", short: "EN", long: "Inglés" },
  { code: "ja", short: "JA", long: "Japonés" },
];

type Query = { idioma?: string; min?: string; rareza?: string };

function href(cur: Query, patch: Query): string {
  const next: Query = { ...cur, ...patch };
  const p = new URLSearchParams();
  if (next.idioma) p.set("idioma", next.idioma);
  if (next.min) p.set("min", next.min);
  if (next.rareza) p.set("rareza", next.rareza);
  const q = p.toString();
  return q ? `/?${q}` : "/";
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

export default async function Ranking({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const idiomaRaw = first(sp.idioma);
  const lang = idiomaRaw === "en" || idiomaRaw === "ja" ? idiomaRaw : undefined;
  const minRaw = first(sp.min);
  const minNum = minRaw === undefined ? NaN : Number(minRaw);
  const minPrice = Number.isFinite(minNum) && minNum > 0 ? minNum : undefined;
  const rareza = first(sp.rareza);
  const cur: Query = { idioma: lang, min: minPrice ? String(minPrice) : undefined, rareza };
  const hayFiltros = Boolean(lang || minPrice || rareza);

  const stats = getMarketStats();

  // Una sola consulta: el universo puntuado bajo los filtros de idioma y precio.
  // De ahi salen a la vez el recuento real, las rarezas disponibles con su
  // frecuencia y las cien filas de la tabla. Son ~1.300 filas: cuesta 12 ms.
  const universo = getScreener({ limit: UNIVERSE_CAP, lang, minPrice });

  const conteoRareza = new Map<string, number>();
  for (const r of universo) {
    if (r.rarity) conteoRareza.set(r.rarity, (conteoRareza.get(r.rarity) ?? 0) + 1);
  }
  const rarezas = [...conteoRareza.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .filter(([k, n]) => n >= 3 || k === rareza)
    .slice(0, 16);

  const seleccion = rareza ? universo.filter((r) => r.rarity === rareza) : universo;
  const filas = seleccion.slice(0, TOP);
  const cols = signalColumns(filas);

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

  return (
    <>
      <h1>Ranking de inversión</h1>
      <p className="sub">
        Los instrumentos cuyo precio más se sale hoy del patrón de sus pares, ordenados por
        desajuste. Señales calculadas el {fecha(stats.asOf)}. Cada fila es un instrumento
        —carta × variante × idioma—, no una carta: la misma ilustración puede aparecer varias veces
        en normal, holo y reverse, y son mercados distintos.
      </p>

      <div className="stats">
        <Stat v={N.format(stats.cards)} k="Cartas" ctx="catálogo físico, sin TCG Pocket" />
        <Stat
          v={N.format(stats.instruments)}
          k="Instrumentos"
          ctx="carta × variante × idioma"
        />
        <Stat
          v={N.format(stats.priced)}
          k="Con precio"
          ctx={`${porc(stats.priced / Math.max(stats.instruments, 1), 0)} de los instrumentos`}
        />
        <Stat
          v={N.format(stats.investable)}
          k="Invertibles"
          ctx={`ida y vuelta ≤ 25% · solo ${porc(cotizanPct, 1)} de los que cotizan`}
        />
        <Stat
          v={N.format(stats.days)}
          k="Días de archivo"
          ctx={`desde el ${fecha(stats.firstDay)} · sin serie histórica`}
        />
        <Stat v={N.format(stats.sets)} k="Ediciones" ctx="inglesas y japonesas" />
        <Stat v={N.format(stats.jpEnPairs)} k="Pares JP/EN" ctx="misma carta en los dos idiomas" />
        <Stat v={N.format(stats.arbs)} k="Arbitrajes" ctx="con precio en Europa y EE. UU." />
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: "10px 0 18px", maxWidth: "78ch" }}>
        La cifra incómoda es la cuarta: de los {N.format(stats.priced)} instrumentos con precio,
        solo {N.format(stats.investable)} se pueden comprar y revender con un coste de ida y vuelta
        del 25% o menos. Los portes y la comisión son un coste fijo, así que se comen entero el
        margen de las cartas baratas —y la mediana del catálogo ronda los 0,59 €—. Por eso este
        ranking no contiene cartas de un euro: no es un sesgo de selección, es el mercado. Y de
        esos {N.format(stats.investable)} invertibles, aquí se puntúan{" "}
        {N.format(totalPuntuado)}
        {sinPuntuar > 0 ? (
          <>
            : los {N.format(sinPuntuar)} restantes tienen una sola señal o ninguna, y con una sola
            no hay nada con lo que contrastarla
          </>
        ) : null}
        .
      </p>

      <div className="note" style={{ marginBottom: 18 }}>
        La puntuación combina en z-scores hasta cuatro señales de desajuste{" "}
        <strong>observable hoy</strong> —dónde cotiza la carta dentro de su cohorte de set y rareza,
        la prima histórica de su ilustrador, lo que pide su gemela japonesa y el diferencial entre
        Cardmarket y TCGplayer— promediadas con pesos iguales sobre las señales que existen para
        cada carta. <strong>No es una previsión validada:</strong> el archivo propio tiene{" "}
        {N.format(stats.days)} días, empezó el {fecha(stats.firstDay)} y todavía no hay ningún
        resultado contra el que contrastarla, así que mide dónde el precio se sale de su patrón, no
        cuánto va a subir.
      </div>

      <div className="card pad" style={{ marginBottom: 18, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", width: 74 }}>
            Idioma
          </span>
          <Filtro activo={!lang} destino={href(cur, { idioma: undefined })}>
            Ambos
          </Filtro>
          {LANGS.map((l) => (
            <Filtro
              key={l.code}
              activo={lang === l.code}
              destino={href(cur, { idioma: l.code })}
              title={`Solo la edición ${l.long.toLowerCase()}`}
            >
              {l.long}
            </Filtro>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", width: 74 }}>
            Precio mín.
          </span>
          <Filtro activo={!minPrice} destino={href(cur, { min: undefined })}>
            Sin mínimo
          </Filtro>
          {MIN_PRESETS.map((m) => (
            <Filtro
              key={m}
              activo={minPrice === m}
              destino={href(cur, { min: String(m) })}
              title={`Solo instrumentos que cotizan a ${eur(m)} o más`}
            >
              ≥ {N.format(m)} €
            </Filtro>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", width: 74 }}>
            Rareza
          </span>
          <Filtro activo={!rareza} destino={href(cur, { rareza: undefined })}>
            Todas
          </Filtro>
          {rarezas.map(([k, n]) => (
            <Filtro
              key={k}
              activo={rareza === k}
              destino={href(cur, { rareza: k })}
              title={`${n} instrumentos con rareza ${k} en el ranking actual`}
            >
              {rarityLabel(k)} <span className="num faint">{N.format(n)}</span>
            </Filtro>
          ))}
          {hayFiltros ? (
            <a href="/" className="faint" style={{ fontSize: 12 }}>
              Quitar todos los filtros
            </a>
          ) : null}
        </div>
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
            <strong className="num">{N.format(Math.min(TOP, seleccion.length))}</strong> de{" "}
            <span className="num">{N.format(seleccion.length)}</span> instrumentos puntuados
            {hayFiltros ? " con los filtros actuales" : ""}. Posición dentro de esta selección.
          </div>
          <div className="dim">
            {masBarata === null ? (
              "Sin precios en la selección"
            ) : (
              <>
                El más barato del ranking cotiza a{" "}
                <span className="num">{eur(masBarata)}</span>
                {rtMediano === null ? null : (
                  <>
                    {" · "}coste de ida y vuelta mediano{" "}
                    <span className="num">{porc(rtMediano, 1)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {filas.length === 0 ? (
          <div className="pad dim" style={{ padding: 28, textAlign: "center" }}>
            Ningún instrumento puntuado cumple estos filtros.{" "}
            <a href="/" style={{ color: "var(--accent)" }}>
              Quitar los filtros
            </a>
            .
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th />
                  <th>Carta</th>
                  <th>Ilustrador</th>
                  <th>Idioma</th>
                  <th
                    className="r"
                    title="Tendencia de Cardmarket en euros. Debajo, precio de mercado de TCGplayer en dólares, sin convertir."
                  >
                    Precio
                  </th>
                  <th className="r" title={SIGNAL_META.roundtrip_cost.help}>
                    Ida y vuelta
                  </th>
                  <th className="r" title={SIGNAL_META.invest_score.help}>
                    Puntuación
                  </th>
                  <th>
                    <div style={{ marginBottom: 3 }}>Desglose (z, −3 a +3)</div>
                    <ScoreBarHeader keys={cols} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const img = cardImage(r.image, "low");
                  const variante = variantLabel(r.variant_type, r.variant_subtype);
                  const nComp = Object.keys(r.components).length;
                  const lg = LANGS.find((l) => l.code === r.lang);
                  return (
                    <tr key={r.instrument_id}>
                      <td className="r num faint">{i + 1}</td>
                      <td style={{ width: 46 }}>
                        {img ? (
                          <img
                            src={img}
                            alt={`${r.name ?? "Carta"} — ${r.set_name ?? ""} ${variante}`}
                            width={34}
                            height={47}
                            loading="lazy"
                            decoding="async"
                            style={{ borderRadius: 3, display: "block", background: "var(--surface-2)" }}
                          />
                        ) : (
                          <div
                            title="TCGdex no publica imagen de esta carta"
                            style={{
                              width: 34,
                              height: 47,
                              borderRadius: 3,
                              border: "1px dashed var(--border-strong)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--text-faint)",
                              fontSize: 10,
                            }}
                          >
                            —
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 550, whiteSpace: "nowrap" }}>
                          <a
                            href={cardHref(r.instrument_id)}
                            title="Ficha de este instrumento: precio, señales y variantes hermanas"
                          >
                            {r.name ?? "Sin nombre"}
                          </a>{" "}
                          {r.local_id ? <span className="num faint">#{r.local_id}</span> : null}
                        </div>
                        <div style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                          <span className="faint">
                            {r.set_name ?? "Edición desconocida"}
                            {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                            {r.rarity ? ` · ${rarityLabel(r.rarity)}` : ""}
                          </span>{" "}
                          <span
                            className="tag"
                            title={
                              r.cm_variant_ambiguous
                                ? "Cardmarket publica un único precio para varios acabados de esta carta, así que el precio europeo no distingue entre ellos."
                                : "Variante del instrumento: este acabado cotiza como producto propio en Cardmarket."
                            }
                          >
                            {variante}
                          </span>
                          {r.variant_count > 1 ? (
                            <>
                              {" "}
                              <span
                                className="tag"
                                title={`Cardmarket agrupa ${r.variant_count} acabados de esta carta bajo un mismo producto y un mismo precio. Se muestran como una sola fila: son la misma oportunidad, no ${r.variant_count}.`}
                              >
                                +{r.variant_count - 1} acabado{r.variant_count > 2 ? "s" : ""}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.illustrator ? (
                          <a
                            href={`/cartas?artist=${encodeURIComponent(r.illustrator)}`}
                            title={`Ver todas las cartas ilustradas por ${r.illustrator}`}
                          >
                            {r.illustrator}
                          </a>
                        ) : (
                          <span className="faint">Sin acreditar</span>
                        )}
                      </td>
                      <td>
                        <span className="tag" title={`Edición ${lg ? lg.long.toLowerCase() : r.lang}`}>
                          {lg ? lg.short : r.lang.toUpperCase()}
                        </span>
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        <div className="num">{eur(r.price_eur)}</div>
                        {r.tcg_market == null ? (
                          <div className="faint" style={{ fontSize: 10.5 }} title="Sin precio en TCGplayer">
                            —
                          </div>
                        ) : (
                          <div
                            className="num faint"
                            style={{ fontSize: 10.5 }}
                            title="Precio de mercado en TCGplayer, en dólares y sin convertir."
                          >
                            {USD.format(r.tcg_market)}
                          </div>
                        )}
                      </td>
                      <td className="r num">
                        {r.roundtrip_cost == null ? (
                          <span className="faint">—</span>
                        ) : (
                          <span className={r.roundtrip_cost <= 0.15 ? "pos" : undefined}>
                            {porc(r.roundtrip_cost, 1)}
                          </span>
                        )}
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        <div
                          className="num"
                          style={{ fontWeight: 600 }}
                          title={
                            r.score >= CLIP
                              ? "Puntuación topada en el recorte de ±3 desviaciones típicas."
                              : undefined
                          }
                        >
                          {SCORE.format(r.score)}
                        </div>
                        <div
                          className="num faint"
                          style={{ fontSize: 10.5 }}
                          title={`Se han promediado ${nComp} de las ${cols.length} señales; para el resto no hay dato en esta carta.`}
                        >
                          {nComp}/{cols.length}
                        </div>
                      </td>
                      <td>
                        <ScoreBar components={r.components} keys={cols} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card pad" style={{ marginTop: 18 }}>
        <h2>Cómo se lee el desglose</h2>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px", maxWidth: "82ch" }}>
          Cada barra es un z-score con el signo ya orientado: a la derecha y en verde empuja la
          puntuación hacia arriba, a la izquierda y en rojo la frena. El centro de la caja es el
          cero. Un punto en lugar de barra significa que esa señal no existe para esa carta —no que
          valga cero—, y por eso bajo cada puntuación se indica sobre cuántas de las {cols.length}{" "}
          señales se ha promediado.{" "}
          {filas.length > 0 && dosSenales > 0 ? (
            <>
              Conviene mirar ese cociente antes que la puntuación: hoy{" "}
              <strong className="num">{N.format(dosSenales)}</strong> de las{" "}
              <span className="num">{N.format(filas.length)}</span> filas visibles se apoyan en solo
              dos señales, y la misma cifra sostenida por dos descansa en menos evidencia que
              sostenida por cuatro.{" "}
            </>
          ) : null}
          Tanto los componentes como la puntuación llegan recortados a
          ±{CLIP}: un {SCORE.format(CLIP)} está topado.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {cols.map((k) => {
            const m = signalMeta(k);
            const extra =
              k === "artist_premium"
                ? " Fiabilidad medida del 80,6% en la descomposición de varianza."
                : k === "jp_en_ratio"
                  ? " El adelanto medido del mercado japonés es de 56 días de mediana (p25 49, p75 83)."
                  : "";
            return (
              <div key={k}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span className="tag num">{signalShort(k)}</span>
                  <span style={{ fontWeight: 550, fontSize: 13 }}>{m?.label ?? k}</span>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {(m?.help ?? "Señal sin descripción.") + extra}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="faint" style={{ fontSize: 11.5, marginTop: 18, maxWidth: "88ch" }}>
        Precios de Cardmarket (tendencia, EUR) y TCGplayer (mercado, USD), catálogo de TCGdex.
        Quedan fuera de todo el sitio las cartas digitales de TCG Pocket y los instrumentos cuyo
        producto de Cardmarket está compartido por varias cartas, porque su precio no es atribuible.
        Ni esta página ni ninguna otra de Cartoteca son asesoramiento de inversión.
      </p>
    </>
  );
}
