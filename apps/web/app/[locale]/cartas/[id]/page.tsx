import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cardHref, variantName } from "@/components/CardTile";
import { resolveImage } from "@/lib/format";
import {
  LOCALES, coerceLocale, localePath, makeFormatters, pick,
  type Formatters, type Locale,
} from "@/lib/i18n";
import { cards as cardsDict, type CardsDict } from "@/lib/i18n/cards";
import { common, type CommonDict } from "@/lib/i18n/common";
import {
  getCard, getCardSignals, getMarketStats, getPriceHistory, getSiblingVariants,
} from "@/lib/queries";
import type { CardRow, SignalDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ formato */

/**
 * Decimales con longitud fija. No sale de makeFormatters porque alli num() usa el
 * formato por defecto, y aqui hacen falta siempre los mismos decimales: un ratio
 * de 1,50 no puede pintarse "1,5" al lado de otro que pone "1,53". Lo que si
 * depende del idioma es el separador, y para eso basta el propio codigo de
 * idioma, que ya es una etiqueta BCP-47 valida.
 */
function makeDecimals(locale: Locale) {
  const cache = new Map<number, Intl.NumberFormat>();
  const at = (d: number): Intl.NumberFormat => {
    const hit = cache.get(d);
    if (hit) return hit;
    const made = new Intl.NumberFormat(locale, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    cache.set(d, made);
    return made;
  };
  const dec = (v: number, d = 2): string => at(d).format(v);
  return {
    dec,
    /** Contribucion al compuesto: el signo positivo tambien se escribe. */
    signed: (v: number, d = 2): string => `${v > 0 ? "+" : ""}${dec(v, d)}`,
  };
}

/** Todo lo que la ficha necesita para hablar un idioma: textos y formateadores. */
interface Ctx {
  locale: Locale;
  t: CardsDict;
  c: CommonDict;
  f: Formatters;
  dec: (v: number, d?: number) => string;
  signed: (v: number, d?: number) => string;
}

function makeCtx(locale: Locale): Ctx {
  const { dec, signed } = makeDecimals(locale);
  return {
    locale,
    t: pick(cardsDict, locale),
    c: pick(common, locale),
    f: makeFormatters(locale),
    dec,
    signed,
  };
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

/** Vuelta al explorador con un filtro puesto, siempre dentro del idioma actual. */
function filterHref(locale: Locale, patch: Record<string, string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(patch)) p.set(k, v);
  return `${localePath(locale, "cartas")}?${p.toString()}`;
}

/** Los enlaces de texto heredan el color: sin esto no se distinguen del texto plano. */
const LINK: CSSProperties = { color: "var(--accent)" };

/** En el par JP/EN el detalle trae identificadores de set; el nombre solo lo tenemos del lado de esta carta. */
function setLabel(setId: string, lg: "en" | "ja", card: CardRow): string {
  return (card.lang === lg && card.set_id === setId ? card.set_name : null) ?? setId;
}

/**
 * La cohorte llega como "en/2011bw/None": identificador de set y el None de Python.
 * Se traduce lo que es interfaz —la rareza ausente y el idioma— y se deja el
 * nombre del set, que es dato.
 */
function cohortLabel(raw: string, card: CardRow, ctx: Ctx): string {
  const [lg, setId, rar] = raw.split("/");
  const set = (setId && setId === card.set_id ? card.set_name : null) ?? setId ?? raw;
  const rarity = !rar || rar === "None" ? ctx.t.detail.facts.noRarity : rar;
  const language = lg === "en" || lg === "ja" ? ctx.c.langName[lg] : (lg ?? raw);
  return ctx.t.detail.cohort.cohortLabel(set, rarity, language);
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
  { params }: { params: Promise<{ locale: string; id: string }> },
): Promise<Metadata> {
  const { locale: rawLocale, id } = await params;
  const locale = coerceLocale(rawLocale);
  const t = pick(cardsDict, locale);
  const c = pick(common, locale);

  const card = resolveCard(id);
  if (!card) return { title: t.detail.notFoundTitle };

  const variant = variantName(c, card.variant_type, card.variant_subtype);
  const name = card.name ?? card.card_id;
  // La misma carta existe en las tres interfaces: se declara donde esta cada una.
  const path = cardHref(card.instrument_id);
  return {
    title: t.detail.metaTitle(name, variant),
    description: t.detail.metaDescription(
      name,
      card.set_name ?? card.set_id ?? t.detail.unknownSet,
      c.langName[card.lang],
      variant,
    ),
    alternates: {
      canonical: localePath(locale, path),
      languages: Object.fromEntries(LOCALES.map((l) => [l, localePath(l, path)])),
    },
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

function headline(s: SignalDetail, ctx: Ctx): { text: string; tone: string } {
  const h = ctx.t.detail.headline;
  switch (s.signal) {
    case "cohort_pct":
      return {
        text: h.cohortPct(ctx.dec(s.value * 100, 0)),
        tone: s.value <= 0.25 ? "pos" : s.value >= 0.75 ? "neg" : "",
      };
    case "artist_premium":
      return {
        text: h.artistPremium(ctx.dec(s.value)),
        tone: s.value >= 0.6 ? "pos" : s.value <= 0.4 ? "neg" : "",
      };
    case "jp_en_ratio":
      return {
        text: h.jpEnRatio(ctx.dec(s.value, s.value < 0.1 ? 3 : 2)),
        tone: s.value >= 1.2 ? "pos" : s.value <= 0.8 ? "neg" : "",
      };
    case "eu_us_arb":
      return { text: h.euUsArb(ctx.f.pct(s.value, 1)), tone: s.value > 0 ? "pos" : "neg" };
    case "roundtrip_cost":
      return { text: ctx.f.pct(s.value, 1), tone: s.value <= 0.25 ? "pos" : "neg" };
    case "invest_score":
      return { text: h.investScore(ctx.signed(s.value)), tone: s.value > 0 ? "pos" : "neg" };
    default:
      return { text: ctx.dec(s.value, 3), tone: "" };
  }
}

/* --------------------------------------------------------------- la pagina */

export default async function CartaPage(
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale: rawLocale, id } = await params;
  const locale = coerceLocale(rawLocale);
  const ctx = makeCtx(locale);
  const { t, c, f } = ctx;

  const card = resolveCard(id);
  if (!card) notFound();

  const signals = getCardSignals(card.instrument_id);
  const siblings = getSiblingVariants(card.card_id, card.lang);
  const history = getPriceHistory(card.instrument_id);
  const stats = getMarketStats();

  const name = card.name ?? card.card_id;
  const variant = variantName(c, card.variant_type, card.variant_subtype);
  const language = c.langName[card.lang];
  const { src: img, fallbackLang } = resolveImage(card, "high");
  const fallbackName =
    fallbackLang === "en" || fallbackLang === "ja" ? c.langName[fallbackLang] : fallbackLang;

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
        <a href={localePath(locale, "cartas")} style={LINK}>{c.nav.cards}</a>
        {card.set_id && (
          <>
            {" / "}
            <a href={filterHref(locale, { set: card.set_id, lang: card.lang })} style={LINK}>
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
              src={img} alt={t.tile.title(name, variant, language)} decoding="async"
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
              {c.noImage}
            </div>
          )}
          {/* La ilustracion prestada es de otra carta: la ficha esta obligada a decirlo. */}
          {fallbackName && (
            <p className="faint" style={{ fontSize: 11.5, margin: "8px 0 0", lineHeight: 1.45 }}>
              {t.detail.imageFallback(fallbackName)}
            </p>
          )}
          <div className="faint num" style={{ fontSize: 11, marginTop: 8, wordBreak: "break-all" }}>
            {card.instrument_id}
          </div>
        </div>

        {/* Columna de identidad y precios */}
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <h1 style={{ marginBottom: 8 }}>{name}</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            <span className="tag acc">{variant}</span>
            <span className="tag">{language}</span>
            {card.rarity && (
              <a className="tag" href={filterHref(locale, { rarity: card.rarity })}>{card.rarity}</a>
            )}
            {card.local_id && <span className="tag">{t.cardNumber(card.local_id)}</span>}
          </div>

          <div className="stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              {card.price_eur != null ? (
                <div className="v">{f.eur(card.price_eur)}</div>
              ) : (
                <div className="v faint" style={{ fontSize: 15 }}>{t.noPrice}</div>
              )}
              <div className="k">{t.detail.stats.cmTrend}</div>
            </div>
            <div className="stat">
              {card.tcg_market != null ? (
                <div className="v">{f.usd(card.tcg_market)}</div>
              ) : (
                <div className="v faint" style={{ fontSize: 15 }}>{t.notListed}</div>
              )}
              <div className="k">{t.detail.stats.tcgMarket}</div>
            </div>
            {usdInEur != null && (
              <div className="stat">
                <div className="v">{f.eur(usdInEur)}</div>
                <div className="k">
                  {t.detail.stats.tcgInEur}
                  {fx != null ? t.detail.stats.fxSuffix(ctx.dec(fx, 4)) : ""}
                </div>
              </div>
            )}
            {roundtrip && (
              <div className="stat">
                <div className="v">{f.pct(roundtrip.value, 1)}</div>
                <div className="k">{c.signal.roundtrip_cost.label}</div>
              </div>
            )}
          </div>

          <div className="scroll-x">
            <table className="grid">
              <tbody>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.set}</th>
                  <td>
                    {card.set_id ? (
                      <a href={filterHref(locale, { set: card.set_id, lang: card.lang })} style={LINK}>
                        {card.set_name ?? card.set_id}
                      </a>
                    ) : (
                      <span className="faint">{t.detail.facts.noSet}</span>
                    )}{" "}
                    <span className="faint num">{card.set_id}</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.release}</th>
                  <td className="num">
                    {f.date(card.release_date)}
                    {card.release_date == null && (
                      <span className="faint">{t.detail.facts.notRecorded}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.illustrator}</th>
                  <td>
                    {card.illustrator ? (
                      <a href={filterHref(locale, { artist: card.illustrator })} style={LINK}>
                        {card.illustrator}
                      </a>
                    ) : (
                      <span className="faint">{t.detail.facts.notAttributed}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.rarity}</th>
                  <td>{card.rarity ?? <span className="faint">{t.detail.facts.noRarity}</span>}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.variant}</th>
                  <td>{variant}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.language}</th>
                  <td>{language}</td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.lastObs}</th>
                  <td className="num">
                    {card.obs_date ? f.date(card.obs_date) : (
                      <span className="faint">{t.detail.facts.neverObserved}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th scope="row" style={TH_ROW}>{t.detail.facts.card}</th>
                  <td className="num faint">{card.card_id}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ señales */}
      <h2 style={{ marginTop: 32 }}>{t.detail.signals.h2}</h2>
      {/*
        La leyenda de colores describe unas tarjetas que solo existen si hay
        señales. Sin ellas, «Miden…» / «They measure…» / «これらが測るのは…» se
        queda sin sujeto en los tres idiomas, asi que se calla entera.
      */}
      <p className="sub" style={{ marginBottom: 12 }}>
        {signals.length === 0 ? (
          t.detail.signals.none
        ) : (
          <>
            {t.detail.signals.computed(signals.length, f.num(signals.length), f.date(stats.asOf))}
            {t.detail.signals.measureA}
            <strong>{t.detail.signals.measureStrong}</strong>
            {t.detail.signals.measureB(stats.days, f.num(stats.days))}
          </>
        )}
      </p>

      {signals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
          {ordered.map((s) => (
            <SignalCard key={s.signal} sig={s} card={card} stats={stats} ctx={ctx} />
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------- variantes */}
      <h2 style={{ marginTop: 32 }}>{t.detail.siblings.h2}</h2>
      {siblings.length <= 1 ? (
        <p className="note">
          {t.detail.siblings.onlyOne(name, language, c.signal.jp_en_ratio.label)}
        </p>
      ) : (
        <>
          <p className="sub" style={{ marginBottom: 10 }}>
            {t.detail.siblings.sameCardA(siblings.length, f.num(siblings.length))}
            <span className="num">{card.card_id}</span>
            {t.detail.siblings.sameCardB(language)}
          </p>
          <div className="card scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t.detail.siblings.thVariant}</th>
                  <th className="r">{t.detail.siblings.thCardmarket}</th>
                  <th className="r">{t.detail.siblings.thTcgplayer}</th>
                  <th className="r">{t.detail.siblings.thObserved}</th>
                </tr>
              </thead>
              <tbody>
                {siblings.map((v) => {
                  const current = v.instrument_id === card.instrument_id;
                  const label = variantName(c, v.variant_type, v.variant_subtype);
                  return (
                    <tr key={v.instrument_id}>
                      <td>
                        {current ? (
                          <>
                            <span>{label}</span>{" "}
                            <span className="tag acc">{t.detail.siblings.current}</span>
                          </>
                        ) : (
                          <a href={localePath(locale, cardHref(v.instrument_id))} style={LINK}>
                            {label}
                          </a>
                        )}
                      </td>
                      <td className="r num">
                        {v.price_eur != null ? f.eur(v.price_eur) : (
                          <span className="faint">{t.noPrice}</span>
                        )}
                      </td>
                      <td className="r num">
                        {v.tcg_market != null ? f.usd(v.tcg_market) : <span className="faint">—</span>}
                      </td>
                      <td className="r num faint">{v.obs_date ? f.date(v.obs_date) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ----------------------------------------------------------- archivo */}
      <h2 style={{ marginTop: 32 }}>{t.detail.archive.h2}</h2>
      {history.length === 0 ? (
        <p className="note">{t.detail.archive.none}</p>
      ) : (
        <>
          <div className="card scroll-x" style={{ marginBottom: 10 }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>{t.detail.archive.thDate}</th>
                  <th className="r">{t.detail.archive.thTrend}</th>
                  <th className="r">{t.detail.archive.thAvg7}</th>
                  <th className="r">{t.detail.archive.thAvg30}</th>
                  <th className="r">{t.detail.archive.thTcg}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.obs_date}>
                    <td className="num">{f.date(h.obs_date)}</td>
                    <td className="r num">{h.cm_trend != null ? f.eur(h.cm_trend) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.cm_avg7 != null ? f.eur(h.cm_avg7) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.cm_avg30 != null ? f.eur(h.cm_avg30) : <span className="faint">—</span>}</td>
                    <td className="r num">{h.tcg_market != null ? f.usd(h.tcg_market) : <span className="faint">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            {t.detail.archive.note(
              history.length,
              f.num(history.length),
              f.date(history[0].obs_date),
              f.date(history[history.length - 1].obs_date),
              f.date(stats.firstDay),
            )}
          </p>
        </>
      )}

      <p className="faint" style={{ fontSize: 12.5, marginTop: 24 }}>
        {t.detail.footer.before}
        <a href={localePath(locale, "metodologia")} style={{ color: "var(--accent)" }}>
          {t.detail.footer.link}
        </a>
        {t.detail.footer.after}
      </p>
    </>
  );
}

/* ------------------------------------------------------- tarjeta de señal */

type Stats = ReturnType<typeof getMarketStats>;

function SignalCard(
  { sig, card, stats, ctx }: { sig: SignalDetail; card: CardRow; stats: Stats; ctx: Ctx },
) {
  // La etiqueta y la explicacion de cada senal ya viven en common: aqui no se
  // duplican, se leen. Una sola definicion para el ranking, la tabla y la ficha.
  const meta = ctx.c.signal[sig.signal];
  const { text, tone } = headline(sig, ctx);
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
        {meta?.help ?? ctx.t.detail.signals.noHelp}
      </p>
      <SignalDetailBody sig={sig} card={card} stats={stats} ctx={ctx} />
    </section>
  );
}

function SignalDetailBody(
  { sig, card, stats, ctx }: { sig: SignalDetail; card: CardRow; stats: Stats; ctx: Ctx },
) {
  const d = sig.detail;
  const { t, c, f, dec, signed, locale } = ctx;

  if (sig.signal === "invest_score") {
    const raw = d.components;
    const comps: Array<[string, number]> =
      raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, unknown>).filter(
            (e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]),
          )
        : [];
    const scale = Math.max(3, ...comps.map(([, v]) => Math.abs(v)));
    const n = comps.length || (num(d, "n_components") ?? 0);
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
                  <span style={{ fontSize: 12.5 }}>{c.signal[k]?.label ?? k}</span>
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
            {t.detail.investScore.noBreakdown}
          </p>
        )}
        <Explain>{t.detail.investScore.explain(n, f.num(n))}</Explain>
      </>
    );
  }

  if (sig.signal === "roundtrip_cost") {
    const price = num(d, "price_eur");
    const breakeven = num(d, "breakeven_move_pct");
    const investable = bool(d, "investable");
    return (
      <>
        {price != null && <Def k={t.detail.priceUsed} v={f.eur(price)} />}
        {breakeven != null && (
          <Def k={t.detail.roundtrip.breakeven} v={`${dec(breakeven, 1)}%`} />
        )}
        <Def
          k={t.detail.roundtrip.investableUniverse}
          v={
            investable == null ? (
              <span className="faint">{c.noData}</span>
            ) : (
              <span className={investable ? "tag pos" : "tag neg"}>
                {investable ? t.detail.roundtrip.yes : t.detail.roundtrip.no}
              </span>
            )
          }
          mono={false}
        />
        <Explain>
          {t.detail.roundtrip.explain(f.num(stats.instruments), f.num(stats.investable))}
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
        {cohort && <Def k={t.detail.cohort.label} v={cohortLabel(cohort, card, ctx)} mono={false} />}
        {n != null && <Def k={t.detail.cohort.size} v={f.num(n)} />}
        {price != null && <Def k={t.detail.priceUsed} v={f.eur(price)} />}
        <Explain>
          {p >= 1
            ? t.detail.cohort.top
            : p <= 0
              ? t.detail.cohort.bottom
              : t.detail.cohort.middle(dec(p * 100, 0))}
          {t.detail.cohort.caveatA}
          <em>{t.detail.cohort.caveatEm}</em>
          {t.detail.cohort.caveatB}
          {n != null && n < 10 ? t.detail.cohort.noisy(n, f.num(n)) : ""}
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
            k={t.detail.facts.illustrator}
            v={<a href={filterHref(locale, { artist })} style={LINK}>{artist}</a>}
            mono={false}
          />
        )}
        {n != null && <Def k={t.detail.artist.cardCount} v={f.num(n)} />}
        {rel != null && <Def k={t.detail.artist.reliability} v={f.pct(rel, 1)} />}
        <Explain>
          {t.detail.artist.explain(
            artist ?? t.detail.artist.someone,
            dec(sig.value * 100, 0),
          )}
          {rel != null ? t.detail.artist.reliabilityNote(f.pct(rel, 1)) : ""}
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
                <th>{t.detail.jpEn.thEnglish}</th>
                <th>{t.detail.jpEn.thJapanese}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" style={TH_ROW}>{t.detail.jpEn.rowCard}</th>
                <td className="num">{enCard ?? "—"}</td>
                <td className="num">{jaCard ?? "—"}</td>
              </tr>
              <tr>
                <th scope="row" style={TH_ROW}>{t.detail.jpEn.rowSet}</th>
                <td>
                  {enSet ? (
                    <a href={filterHref(locale, { set: enSet, lang: "en" })} style={LINK}>
                      {setLabel(enSet, "en", card)}
                    </a>
                  ) : "—"}
                </td>
                <td>
                  {jaSet ? (
                    <a href={filterHref(locale, { set: jaSet, lang: "ja" })} style={LINK}>
                      {setLabel(jaSet, "ja", card)}
                    </a>
                  ) : "—"}
                </td>
              </tr>
              <tr>
                <th scope="row" style={TH_ROW}>{t.detail.jpEn.rowPrice}</th>
                <td className="num">{enEur != null ? f.eur(enEur) : <span className="faint">—</span>}</td>
                <td className="num">{jaEur != null ? f.eur(jaEur) : <span className="faint">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 10 }}>
          <Def k={t.detail.jpEn.ratio} v={`×${dec(r, r < 0.1 ? 3 : 2)}`} />
          {lead != null && (
            <Def
              k={t.detail.jpEn.gap}
              v={lead === 0 ? t.detail.jpEn.sameDay : t.detail.jpEn.days(lead, f.num(lead))}
              mono={lead !== 0}
            />
          )}
        </div>
        <Explain>
          {r >= 2
            ? t.detail.jpEn.timesAbove(dec(r, 2))
            : r > 1
              ? t.detail.jpEn.pctAbove(dec((r - 1) * 100, 0))
              : r < 1
                ? t.detail.jpEn.pctOf(dec(r * 100, r < 0.1 ? 1 : 0))
                : t.detail.jpEn.equal}
          {t.detail.jpEn.why(f.num(stats.jpEnPairs))}
          {r >= 5 || r <= 0.2 ? t.detail.jpEn.extreme : ""}
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
        {e != null && <Def k={t.detail.euUs.cmEu} v={f.eur(e)} />}
        {u != null && <Def k={t.detail.euUs.tcgUs} v={f.usd(u)} />}
        {uEur != null && <Def k={t.detail.euUs.tcgConverted} v={f.eur(uEur)} />}
        {fx != null && (
          <Def
            k={`${t.detail.euUs.fx}${fxDate ? ` · ${f.date(fxDate)}` : ""}`}
            v={t.detail.euUs.fxValue(dec(fx, 4))}
          />
        )}
        {gross != null && <Def k={t.detail.euUs.gross} v={`${signed(gross, 1)}%`} />}
        {cost != null && <Def k={c.signal.roundtrip_cost.label} v={`${dec(cost, 1)}%`} />}
        <Def k={t.detail.euUs.net} v={<span className="pos">{f.pct(sig.value, 1)}</span>} />
        {dir && (
          <div style={{ marginTop: 10 }}>
            {/* La direccion se guarda en castellano en el almacen: aqui se traduce. */}
            <span className="tag acc">{t.detail.euUs.direction[dir] ?? dir}</span>
          </div>
        )}
        <Explain>
          {t.detail.euUs.explain(f.num(stats.arbs))}
          {sig.value >= 0.5 ? t.detail.euUs.extreme : ""}
        </Explain>
      </>
    );
  }

  // Señal desconocida: se vuelca el detalle tal cual en vez de esconderla.
  const entries = Object.entries(d);
  return (
    <>
      <Def k={t.detail.unknown.value} v={dec(sig.value, 4)} />
      {entries.map(([k, v]) => (
        <Def key={k} k={k} v={typeof v === "object" ? JSON.stringify(v) : String(v)} />
      ))}
      <Explain>
        {t.detail.unknown.explainA}
        <span className="num">{card.instrument_id}</span>
        {t.detail.unknown.explainB}
      </Explain>
    </>
  );
}
