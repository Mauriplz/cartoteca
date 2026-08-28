import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardHref, LANG_NAME } from "@/components/CardTile";
import { cardImage, eur, pct, SIGNAL_META, variantLabel } from "@/lib/format";
import {
  getCard, getCardSignals, getMarketStats, getPriceHistory, getSiblingVariants,
} from "@/lib/queries";
import type { CardRow, SignalDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ formato */

const INT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "USD", maximumFractionDigits: 2,
});

/** Decimales en castellano: coma decimal, como el resto de cifras de la pantalla. */
function dec(v: number, d = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);
}
function signed(v: number, d = 2): string {
  return `${v > 0 ? "+" : ""}${dec(v, d)}`;
}
function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(d);
}

/** Lecturas defensivas del JSON de detalle: viene de la base, no del compilador. */
function str(d: Record<string, unknown>, k: string): string | null {
  const v = d[k];
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(d: Record<string, unknown>, k: string): number | null {
  const v = d[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function bool(d: Record<string, unknown>, k: string): boolean | null {
  const v = d[k];
  return typeof v === "boolean" ? v : null;
}

function filterHref(patch: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(patch)) p.set(k, v);
  return `/cartas?${p.toString()}`;
}

/** Los enlaces de texto heredan el color: sin esto no se distinguen del texto plano. */
const LINK: CSSProperties = { color: "var(--accent)" };

/** En el par JP/EN el detalle trae identificadores de set; el nombre solo lo tenemos del lado de esta carta. */
function setLabel(setId: string, lg: "en" | "ja", card: CardRow): string {
  return (card.lang === lg && card.set_id === setId ? card.set_name : null) ?? setId;
}

/**
 * La cohorte llega como "en/2011bw/None": identificador de set y el None de Python.
 * Se lee en castellano, y con el nombre del set cuando es el de esta misma carta.
 */
function cohortLabel(raw: string, card: CardRow): string {
  const [lg, setId, rar] = raw.split("/");
  const set = (setId && setId === card.set_id ? card.set_name : null) ?? setId ?? raw;
  const rareza = !rar || rar === "None" ? "sin rareza declarada" : rar;
  const idioma = lg === "en" ? "inglés" : lg === "ja" ? "japonés" : lg;
  return `${set} · ${rareza} · ${idioma}`;
}

/* -------------------------------------------------------- resolucion del id */

/**
 * Next entrega el segmento de ruta ya decodificado una vez, pero hay un
 * instrument_id que contiene un '%' literal (en:exu-%3F:holo:-): decodificarlo
 * otra vez lo convertiria en otro id inexistente. Se prueba tal cual y solo se
 * decodifica si no aparece, de modo que ambos casos funcionan.
 */
function resolveCard(raw: string): CardRow | null {
  const direct = getCard(raw);
  if (direct) return direct;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded === raw ? null : getCard(decoded);
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const card = resolveCard(id);
  if (!card) return { title: "Carta no encontrada — Cartoteca" };
  const variante = variantLabel(card.variant_type, card.variant_subtype);
  return {
    title: `${card.name ?? card.card_id} · ${variante} — Cartoteca`,
    description: `${card.name ?? card.card_id} (${card.set_name ?? card.set_id ?? "set desconocido"}, ${
      LANG_NAME[card.lang] ?? card.lang
    }, ${variante}): precio de Cardmarket, señales de desajuste y variantes de la misma carta.`,
  };
}

/* ------------------------------------------------------------ piezas de UI */

const TH_ROW: CSSProperties = { borderBottom: "1px solid var(--border)" };

function Def({ k, v, mono = true }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", gap: 14,
        padding: "4px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      <span className="dim" style={{ fontSize: 12 }}>{k}</span>
      <span className={mono ? "num" : undefined} style={{ fontSize: 12.5, textAlign: "right" }}>{v}</span>
    </div>
  );
}

function Explain({ children }: { children: ReactNode }) {
  return (
    <p className="dim" style={{ fontSize: 12.5, margin: "10px 0 0", lineHeight: 1.5 }}>{children}</p>
  );
}

function headline(s: SignalDetail): { text: string; tone: string } {
  switch (s.signal) {
    case "cohort_pct":
      return { text: `percentil ${dec(s.value * 100, 0)}`, tone: s.value <= 0.25 ? "pos" : s.value >= 0.75 ? "neg" : "" };
    case "artist_premium":
      return { text: `${dec(s.value)} de 1,00`, tone: s.value >= 0.6 ? "pos" : s.value <= 0.4 ? "neg" : "" };
    case "jp_en_ratio":
      return { text: `×${dec(s.value, s.value < 0.1 ? 3 : 2)}`, tone: s.value >= 1.2 ? "pos" : s.value <= 0.8 ? "neg" : "" };
    case "eu_us_arb":
      return { text: `${pct(s.value, 1)} neto`, tone: s.value > 0 ? "pos" : "neg" };
    case "roundtrip_cost":
      return { text: pct(s.value, 1), tone: s.value <= 0.25 ? "pos" : "neg" };
    case "invest_score":
      return { text: `${signed(s.value)} z`, tone: s.value > 0 ? "pos" : "neg" };
    default:
      return { text: dec(s.value, 3), tone: "" };
  }
}

/* --------------------------------------------------------------- la pagina */

export default async function CartaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = resolveCard(id);
  if (!card) notFound();

  const signals = getCardSignals(card.instrument_id);
  const siblings = getSiblingVariants(card.card_id, card.lang);
  const history = getPriceHistory(card.instrument_id);
  const stats = getMarketStats();

  const name = card.name ?? card.card_id;
  const variante = variantLabel(card.variant_type, card.variant_subtype);
  const idioma = LANG_NAME[card.lang] ?? card.lang;
  const img = cardImage(card.image, "high");

  const arb = signals.find((s) => s.signal === "eu_us_arb");
  const usdInEur = arb ? num(arb.detail, "usd_in_eur") : null;
  const fx = arb ? num(arb.detail, "fx_eurusd") : null;
  const roundtrip = signals.find((s) => s.signal === "roundtrip_cost");

  const ORDER = ["invest_score", "roundtrip_cost", "cohort_pct", "artist_premium", "jp_en_ratio", "eu_us_arb"];
  const ordered = [...signals].sort((a, b) => {
    const ia = ORDER.indexOf(a.signal), ib = ORDER.indexOf(b.signal);
    return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib) || a.signal.localeCompare(b.signal);
  });

  return (
    <>
      <p style={{ fontSize: 12.5, margin: "0 0 12px" }} className="dim">
        <a href="/cartas" style={LINK}>Cartas</a>
        {card.set_id && (
          <>
            {" / "}
            <a href={filterHref({ set: card.set_id, lang: card.lang })} style={LINK}>
              {card.set_name ?? card.set_id}
            </a>
          </>
        )}
        {" / "}
        <span className="faint">{name}</span>
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        {/* Columna de la imagen */}
        <div style={{ flex: "0 1 280px", minWidth: 200, maxWidth: 300 }}>
          {img ? (
            <img
              src={img} alt={`${name} — ${variante}`} decoding="async"
              style={{
                width: "100%", height: "auto", borderRadius: 8, display: "block",
                background: "var(--surface-2)", border: "1px solid var(--border)",
              }}
            />
          ) : (
            <div
              style={{
                aspectRatio: "5 / 7", width: "100%", borderRadius: 8,
                background: "var(--surface-2)", border: "1px dashed var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-faint)", fontSize: 12, textAlign: "center", padding: 12,
              }}
            >
              Sin imagen en el catálogo de origen
            </div>
          )}
          <div className="faint num" style={{ fontSize: 11, marginTop: 8, wordBreak: "break-all" }}>
            {card.instrument_id}
          </div>
        </div>

        {/* Columna de identidad y precios */}
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <h1 style={{ marginBottom: 8 }}>{name}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            <span className="tag acc">{variante}</span>
            <span className="tag">{idioma}</span>
            {card.rarity && (
              <a className="tag" href={filterHref({ rarity: card.rarity })}>{card.rarity}</a>
            )}
            {card.local_id && <span className="tag">nº {card.local_id}</span>}
          </div>

          <div className="stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              {card.price_eur != null ? (
                <div className="v">{eur(card.price_eur)}</div>
              ) : (
                <div className="v faint" style={{ fontSize: 15 }}>sin precio</div>
              )}
              <div className="k">Cardmarket · tendencia</div>
            </div>
            <div className="stat">
              {card.tcg_market != null ? (
                <div className="v">{USD.format(card.tcg_market)}</div>
              ) : (
                <div className="v faint" style={{ fontSize: 15 }}>no cotiza</div>
              )}
              <div className="k">TCGplayer · precio de mercado</div>
            </div>
            {usdInEur != null && (
              <div className="stat">
                <div className="v">{eur(usdInEur)}</div>
                <div className="k">TCGplayer en euros{fx != null ? ` · 1 € = ${dec(fx, 4)} $` : ""}</div>
              </div>
            )}
            {roundtrip && (
              <div className="stat">
                <div className="v">{pct(roundtrip.value, 1)}</div>
                <div className="k">Coste de ida y vuelta</div>
              </div>
            )}
          </div>

          <div className="scroll-x">
            <table className="grid">
              <tbody>
                <tr>
                  <th scope="row" style={TH_ROW}>Set</th>
                  <td>
                    {card.set_id ? (
                      <a href={filterHref({ set: card.set_id, lang: card.lang })} style={LINK}>
                        {card.set_name ?? card.set_id}
                      </a>
                    ) : (
                      <span className="faint">sin set</span>
                    )}{" "}
                    <span className="faint num">{card.set_id}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Lanzamiento</th>
                  <td className="num">
                    {fecha(card.release_date)}
                    {card.release_date == null && <span className="faint"> (no registrado)</span>}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Ilustrador</th>
                  <td>
                    {card.illustrator ? (
                      <a href={filterHref({ artist: card.illustrator })} style={LINK}>
                        {card.illustrator}
                      </a>
                    ) : (
                      <span className="faint">no atribuido</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Rareza</th>
                  <td>{card.rarity ?? <span className="faint">sin rareza declarada</span>}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Variante</th>
                  <td>{variante}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Idioma</th>
                  <td>{idioma}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Última observación</th>
                  <td className="num">
                    {card.obs_date ? fecha(card.obs_date) : <span className="faint">nunca observada</span>}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>Carta</th>
                  <td className="num faint">{card.card_id}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ señales */}
      <h2 style={{ marginTop: 32 }}>Señales activas</h2>
      <p className="sub" style={{ marginBottom: 12 }}>
        {signals.length === 0
          ? "Este instrumento no tiene ninguna señal calculada."
          : `${signals.length} ${signals.length === 1 ? "señal calculada" : "señales calculadas"} el ${fecha(stats.asOf)}.`}{" "}
        Miden <strong>desajuste observable hoy</strong>: verde = la señal juega a favor del desajuste,
        rojo = en contra. Ninguna es una previsión de precio, y no hay histórico con el que validarla:
        el archivo propio tiene {stats.days} {stats.days === 1 ? "día" : "días"}.
      </p>

      {signals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
          {ordered.map((s) => (
            <SignalCard key={s.signal} sig={s} card={card} stats={stats} />
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- variantes */}
      <h2 style={{ marginTop: 32 }}>Otras variantes de esta carta</h2>
      {siblings.length <= 1 ? (
        <p className="note">
          No hay más variantes registradas de {name} en {idioma.toLowerCase()}. La versión en el otro idioma
          es otra carta del catálogo, con su propio identificador: si existe pareja, aparece en la señal
          «Ratio Japón / Inglés».
        </p>
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 10 }}>
            {siblings.length} instrumentos son la misma carta{" "}
            (<span className="num">{card.card_id}</span>, {idioma.toLowerCase()}) con acabados distintos.
            Cotizan por separado porque en Cardmarket son productos distintos.
          </p>
          <div className="card scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>Variante</th>
                  <th className="r">Cardmarket</th>
                  <th className="r">TCGplayer</th>
                  <th className="r">Observado</th>
                </tr>
              </thead>
              <tbody>
                {siblings.map((v) => {
                  const actual = v.instrument_id === card.instrument_id;
                  return (
                    <tr key={v.instrument_id}>
                      <td>
                        {actual ? (
                          <>
                            <span>{variantLabel(v.variant_type, v.variant_subtype)}</span>{" "}
                            <span className="tag acc">esta</span>
                          </>
                        ) : (
                          <a href={cardHref(v.instrument_id)} style={LINK}>
                            {variantLabel(v.variant_type, v.variant_subtype)}
                          </a>
                        )}
                      </td>
                      <td className="r num">
                        {v.price_eur != null ? eur(v.price_eur) : <span className="faint">sin precio</span>}
                      </td>
                      <td className="r num">
                        {v.tcg_market != null ? USD.format(v.tcg_market) : <span className="faint">—</span>}
                      </td>
                      <td className="r num faint">{v.obs_date ? fecha(v.obs_date) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ----------------------------------------------------------- archivo */}
      <h2 style={{ marginTop: 32 }}>Archivo de precios</h2>
      {history.length === 0 ? (
        <p className="note">
          Este instrumento no tiene ninguna observación de precio: existe en el catálogo, pero no hemos
          registrado ninguna cotización suya.
        </p>
      ) : (
        <>
          <div className="card scroll-x" style={{ marginBottom: 10 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="r">Tendencia (EUR)</th>
                  <th className="r">Media 7 d (EUR)</th>
                  <th className="r">Media 30 d (EUR)</th>
                  <th className="r">TCGplayer (USD)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.obs_date}>
                    <td className="num">{fecha(h.obs_date)}</td>
                    <td className="r num">{h.cm_trend != null ? eur(h.cm_trend) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.cm_avg7 != null ? eur(h.cm_avg7) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.cm_avg30 != null ? eur(h.cm_avg30) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.tcg_market != null ? USD.format(h.tcg_market) : <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            {history.length} {history.length === 1 ? "observación propia" : "observaciones propias"}, del{" "}
            {fecha(history[0].obs_date)} al {fecha(history[history.length - 1].obs_date)}. Se muestran como
            tabla y no como gráfico a propósito: con {history.length}{" "}
            {history.length === 1 ? "punto" : "puntos"} una línea de tendencia sería un dibujo, no un dato.
            Las medias de 7 y 30 días las publica Cardmarket con su propio histórico; no salen de este
            archivo, que empezó el {fecha(stats.firstDay)}.
          </p>
        </>
      )}

      <p className="faint" style={{ fontSize: 12.5, marginTop: 24 }}>
        Cómo se calcula cada señal, con sus umbrales y sus límites:{" "}
        <a href="/metodologia" style={{ color: "var(--accent)" }}>metodología</a>.
      </p>
    </>
  );
}

/* ------------------------------------------------------- tarjeta de señal */

type Stats = ReturnType<typeof getMarketStats>;

function SignalCard({ sig, card, stats }: { sig: SignalDetail; card: CardRow; stats: Stats }) {
  const meta = SIGNAL_META[sig.signal];
  const { text, tone } = headline(sig);
  const wide = sig.signal === "invest_score" || sig.signal === "jp_en_ratio";

  return (
    <section className="card pad" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div
        style={{
          display: "flex", gap: 10, alignItems: "baseline",
          justifyContent: "space-between", flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{meta?.label ?? sig.signal}</h3>
        <span className={tone ? `tag ${tone}` : "tag"}>{text}</span>
      </div>
      <p className="faint" style={{ fontSize: 12, margin: "6px 0 12px", lineHeight: 1.45 }}>
        {meta?.help ?? "Señal sin descripción registrada en el diccionario de señales."}
      </p>
      <SignalDetailBody sig={sig} card={card} stats={stats} />
    </section>
  );
}

function SignalDetailBody({ sig, card, stats }: { sig: SignalDetail; card: CardRow; stats: Stats }) {
  const d = sig.detail;

  if (sig.signal === "invest_score") {
    const raw = d.components;
    const comps: Array<[string, number]> =
      raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, unknown>).filter(
            (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
          )
        : [];
    const scale = Math.max(3, ...comps.map(([, v]) => Math.abs(v)));
    return (
      <>
        {comps.length > 0 ? (
          <div
            style={{
              display: "grid", gridTemplateColumns: "minmax(120px, 1fr) auto auto",
              gap: "7px 12px", alignItems: "center",
            }}
          >
            {comps.map(([k, v]) => {
              const w = Math.min(50, (Math.abs(v) / scale) * 50);
              return (
                <Fragment key={k}>
                  <span style={{ fontSize: 12.5 }}>{SIGNAL_META[k]?.label ?? k}</span>
                  <div className="contrib-bar" style={{ width: 120 }}>
                    <i
                      style={
                        v >= 0
                          ? { left: "50%", width: `${w}%`, background: "var(--pos)" }
                          : { left: `${50 - w}%`, width: `${w}%`, background: "var(--neg)" }
                      }
                    />
                  </div>
                  <span className={`num ${v >= 0 ? "pos" : "neg"}`} style={{ fontSize: 12.5 }}>
                    {signed(v)}
                  </span>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>
            El desglose por componentes no está disponible para este instrumento.
          </p>
        )}
        <Explain>
          Compuesto de {comps.length || (num(d, "n_components") ?? 0)} señales de las cuatro posibles; las
          que no existen para esta carta no entran en la media, no puntúan como cero. Cada componente es un
          z-score con el signo ya orientado: positivo significa que empuja el desajuste a favor. El compuesto
          no es una previsión de rentabilidad —no hay serie con la que haberla validado— sino una medida de
          cuánto se separa hoy esta carta de lo que se paga por sus pares.
        </Explain>
      </>
    );
  }

  if (sig.signal === "roundtrip_cost") {
    const price = num(d, "price_eur");
    const breakeven = num(d, "breakeven_move_pct");
    const investable = bool(d, "investable");
    return (
      <>
        {price != null && <Def k="Precio usado" v={eur(price)} />}
        {breakeven != null && <Def k="Subida necesaria para no perder" v={`${dec(breakeven, 1)}%`} />}
        <Def
          k="Dentro del universo invertible (≤ 25%)"
          v={
            investable == null ? (
              <span className="faint">sin dato</span>
            ) : (
              <span className={investable ? "tag pos" : "tag neg"}>{investable ? "sí" : "no"}</span>
            )
          }
          mono={false}
        />
        <Explain>
          Comisión y portes son un coste fijo: no bajan cuando la carta es barata, así que se comen un
          porcentaje enorme de las cotizaciones pequeñas. De los {INT.format(stats.instruments)} instrumentos
          del catálogo, solo {INT.format(stats.investable)} quedan por debajo del 25%. Todo lo que hay por
          encima de ese umbral se puede coleccionar, pero no se puede operar.
        </Explain>
      </>
    );
  }

  if (sig.signal === "cohort_pct") {
    const cohort = str(d, "cohort");
    const n = num(d, "n");
    const price = num(d, "price_eur");
    const p = sig.value;
    return (
      <>
        {cohort && <Def k="Cohorte" v={cohortLabel(cohort, card)} mono={false} />}
        {n != null && <Def k="Instrumentos en la cohorte" v={INT.format(n)} />}
        {price != null && <Def k="Precio usado" v={eur(price)} />}
        <Explain>
          {p >= 1
            ? "Es la más cara de su cohorte: mismo set, misma rareza, mismo idioma."
            : p <= 0
              ? "Es la más barata de su cohorte: mismo set, misma rareza, mismo idioma."
              : `Cotiza por encima del ${dec(p * 100, 0)}% de su cohorte: mismo set, misma rareza, mismo idioma.`}{" "}
          Un percentil bajo dice que está barata <em>respecto a sus pares</em>; no dice por qué, y a veces la
          razón es buena (la carta es menos deseada).{" "}
          {n != null && n < 10
            ? `Con solo ${n} pares, este percentil es ruidoso: cada carta mueve el resultado varios puntos.`
            : ""}
        </Explain>
      </>
    );
  }

  if (sig.signal === "artist_premium") {
    const artist = str(d, "artist");
    const n = num(d, "n");
    const rel = num(d, "reliability_global");
    return (
      <>
        {artist && (
          <Def
            k="Ilustrador"
            v={<a href={filterHref({ artist })} style={LINK}>{artist}</a>}
            mono={false}
          />
        )}
        {n != null && <Def k="Cartas suyas en el catálogo" v={INT.format(n)} />}
        {rel != null && <Def k="Fiabilidad global de la señal" v={pct(rel, 1)} />}
        <Explain>
          Las cartas de {artist ?? "este ilustrador"} alcanzan de media el percentil{" "}
          {dec(sig.value * 100, 0)} dentro de sus cohortes, ya corregido por tamaño de muestra: un ilustrador
          con pocas cartas se arrastra hacia el 0,50 neutro en vez de coronar el ranking por casualidad.
          {rel != null
            ? ` La descomposición de varianza atribuye al ilustrador un ${pct(rel, 1)} de fiabilidad: es una cifra global de la señal, la misma para todos los ilustradores, no una medida de la solidez de este en concreto. El resto lo explican el set, la rareza y el ruido.`
            : ""}
        </Explain>
      </>
    );
  }

  if (sig.signal === "jp_en_ratio") {
    const enCard = str(d, "en_card"), jaCard = str(d, "ja_card");
    const enSet = str(d, "en_set"), jaSet = str(d, "ja_set");
    const enEur = num(d, "en_eur"), jaEur = num(d, "ja_eur");
    const lead = num(d, "lead_days");
    const r = sig.value;
    return (
      <>
        <div className="scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th />
                <th>Inglesa</th>
                <th>Japonesa</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" style={TH_ROW}>Carta</th>
                <td className="num">{enCard ?? "—"}</td>
                <td className="num">{jaCard ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row" style={TH_ROW}>Set</th>
                <td>
                  {enSet ? (
                    <a href={filterHref({ set: enSet, lang: "en" })} style={LINK}>
                      {setLabel(enSet, "en", card)}
                    </a>
                  ) : "—"}
                </td>
                <td>
                  {jaSet ? (
                    <a href={filterHref({ set: jaSet, lang: "ja" })} style={LINK}>
                      {setLabel(jaSet, "ja", card)}
                    </a>
                  ) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row" style={TH_ROW}>Precio</th>
                <td className="num">{enEur != null ? eur(enEur) : <span className="faint">—</span>}</td>
                <td className="num">{jaEur != null ? eur(jaEur) : <span className="faint">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}>
          <Def k="Ratio japonesa ÷ inglesa" v={`×${dec(r, r < 0.1 ? 3 : 2)}`} />
          {lead != null && (
            <Def
              k="Diferencia entre las dos ediciones"
              v={lead === 0 ? "salieron el mismo día" : `${INT.format(lead)} días`}
            />
          )}
        </div>
        <Explain>
          {r >= 2
            ? `La japonesa cotiza a ${dec(r, 2)} veces el precio de la inglesa.`
            : r > 1
              ? `La japonesa cotiza un ${dec((r - 1) * 100, 0)}% por encima de la inglesa.`
              : r < 1
                ? `La japonesa cotiza al ${dec(r * 100, r < 0.1 ? 1 : 0)}% del precio de la inglesa.`
                : "Ambas cotizan igual."}{" "}
          Se comparan porque el mercado japonés se adelanta al inglés una mediana de 56 días (p25 49, p75
          83) sobre {INT.format(stats.jpEnPairs)} parejas casadas. Eso justifica mirar el par, no promete que
          converjan: son productos distintos, con tiradas distintas y compradores distintos.
          {r >= 5 || r <= 0.2
            ? " Una diferencia de esta magnitud rara vez es una dislocación de mercado: lo habitual es que el emparejamiento no sea equivalente (otra variante, otro estado, otra tirada) o que uno de los dos precios salga de muy pocas ventas. Compruébalo a mano antes de darlo por bueno."
            : ""}
        </Explain>
      </>
    );
  }

  if (sig.signal === "eu_us_arb") {
    const e = num(d, "eur"), u = num(d, "usd"), uEur = num(d, "usd_in_eur");
    const gross = num(d, "gross_spread_pct"), cost = num(d, "roundtrip_cost_pct");
    const fx = num(d, "fx_eurusd"), fxDate = str(d, "fx_date");
    const dir = str(d, "direction");
    return (
      <>
        {e != null && <Def k="Cardmarket (EU)" v={eur(e)} />}
        {u != null && <Def k="TCGplayer (US)" v={USD.format(u)} />}
        {uEur != null && <Def k="TCGplayer convertido" v={eur(uEur)} />}
        {fx != null && (
          <Def k={`Tipo de cambio${fxDate ? ` · ${fecha(fxDate)}` : ""}`} v={`1 € = ${dec(fx, 4)} $`} />
        )}
        {gross != null && <Def k="Diferencial bruto (US en euros frente a EU)" v={`${signed(gross, 1)}%`} />}
        {cost != null && <Def k="Coste de ida y vuelta" v={`${dec(cost, 1)}%`} />}
        <Def k="Diferencial neto" v={<span className="pos">{pct(sig.value, 1)}</span>} />
        {dir && (
          <div style={{ marginTop: 10 }}>
            <span className="tag acc">{dir}</span>
          </div>
        )}
        <Explain>
          Es lo que queda del diferencial entre los dos mercados después de convertir a euros y descontar
          comisión y portes. El signo del bruto solo dice qué lado está más barato —negativo significa que
          TCGplayer cotiza por debajo de Cardmarket, y entonces se compra en Estados Unidos—, así que la
          dirección la marca la etiqueta, no el signo. El neto siempre sale positivo porque solo se guardan
          los {INT.format(stats.arbs)} diferenciales que sobreviven a los costes. Ojo con extrapolarlo a una
          operación real: no incluye aduanas, IVA de importación ni el riesgo de que el tipo de cambio se
          mueva mientras el sobre cruza el Atlántico.
          {sig.value >= 0.5
            ? " Y un diferencial neto de este tamaño casi nunca es dinero en la calle: lo normal es que los dos mercados no estén cotizando el mismo producto (edición, estado o tirada distintos) o que uno de los precios venga de muy pocas ventas. Verifícalo carta a carta antes de operar."
            : ""}
        </Explain>
      </>
    );
  }

  // Señal desconocida: se vuelca el detalle tal cual en vez de esconderla.
  const entries = Object.entries(d);
  return (
    <>
      <Def k="Valor" v={dec(sig.value, 4)} />
      {entries.map(([k, v]) => (
        <Def key={k} k={k} v={typeof v === "object" ? JSON.stringify(v) : String(v)} />
      ))}
      <Explain>
        Esta señal no está en el diccionario de la interfaz: se muestra su contenido sin interpretar para no
        inventar una explicación. Instrumento <span className="num">{card.instrument_id}</span>.
      </Explain>
    </>
  );
}
