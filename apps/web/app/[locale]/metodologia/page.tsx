import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getCardSignals, getMarketStats, getScreener } from "@/lib/queries";
import { coerceLocale, localePath, makeFormatters, pick } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { methodology as dict, type Text } from "@/lib/i18n/methodology";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return pick(dict, coerceLocale((await params).locale)).meta;
}

/**
 * Los anclas del indice no se traducen: un enlace a #limites tiene que seguir
 * apuntando a la misma seccion cuando se comparte entre idiomas.
 */
const IDS = [
  "fuentes",
  "instrumento",
  "marcas",
  "senales",
  "compuesto",
  "limites",
  "no-hacemos",
  "parametros",
  "comprobar",
] as const;

export default async function MetodologiaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = coerceLocale((await params).locale);
  const t = pick(dict, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);

  const s = getMarketStats();
  const fx = readFx();

  const titles = [
    t.sections.sources,
    t.sections.instrument,
    t.sections.marks,
    t.sections.signals,
    t.sections.composite,
    t.sections.limits,
    t.sections.notDoing,
    t.sections.parameters,
    t.sections.audit,
  ];

  // Los nombres de las senales salen del diccionario compartido: la metodologia y
  // las tablas de la aplicacion tienen que llamarlas igual en los tres idiomas.
  const signalRows = [
    { label: c.signal.roundtrip_cost.label, id: "roundtrip_cost", ...t.signals.roundtrip },
    { label: c.signal.cohort_pct.label, id: "cohort_pct", ...t.signals.cohort },
    { label: c.signal.artist_premium.label, id: "artist_premium", ...t.signals.artist },
    { label: c.signal.jp_en_ratio.label, id: "jp_en_ratio", ...t.signals.jpEn },
    {
      label: c.signal.eu_us_arb.label,
      id: "eu_us_arb",
      measures: t.signals.arb.measures(f.num(s.arbs)),
      bounds: t.signals.arb.bounds,
    },
    { label: c.signal.invest_score.label, id: "invest_score", ...t.signals.score },
  ];

  const compositeRows = [
    { label: c.signal.cohort_pct.label, sign: "−", why: t.composite.why.cohort },
    { label: c.signal.artist_premium.label, sign: "+", why: t.composite.why.artist },
    { label: c.signal.jp_en_ratio.label, sign: "+", why: t.composite.why.jpEn },
    { label: c.signal.eu_us_arb.label, sign: "+", why: t.composite.why.arb },
  ];

  const marks = [t.marks.trend, t.marks.settle, t.marks.low, t.marks.lastDay, t.marks.stamp];

  const archive = t.days(s.days, f.num(s.days));
  const limits: { title: string; body: Text }[] = [
    { title: t.limits.archive.title, body: t.limits.archive.body(archive, f.date(s.firstDay)) },
    t.limits.stale,
    t.limits.universe,
    t.limits.ambiguous,
    t.limits.digital,
    t.limits.jpUsd,
    t.limits.rarity,
    t.limits.graded,
  ];

  const notDoing = [
    t.notDoing.momentum,
    t.notDoing.ml,
    t.notDoing.charts,
    t.notDoing.targets,
    t.notDoing.graded,
    t.notDoing.minBook,
  ];

  return (
    <>
      <h1>{t.h1}</h1>
      <p className="sub">{t.sub(f.date(s.asOf))}</p>

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="v">{f.num(s.cards)}</div>
          <div className="k">{t.stats.cards}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(s.instruments)}</div>
          <div className="k">{t.stats.instruments}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(s.priced)}</div>
          <div className="k">{t.stats.priced}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(s.days)}</div>
          <div className="k">{t.stats.days}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(s.jpEnPairs)}</div>
          <div className="k">{t.stats.jpEn}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(s.arbs)}</div>
          <div className="k">{t.stats.arbs}</div>
        </div>
      </div>

      <nav
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}
        aria-label={t.navLabel}
      >
        {IDS.map((id, i) => (
          <a key={id} href={`#${id}`} className="tag">
            <span className="faint num">{f.num(i + 1)}</span> {titles[i]}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[0]} n={1} title={titles[0]} f={f}>
        <P>
          <Rich text={t.sources.intro} />
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>{t.sources.th.source}</th>
                <th>{t.sources.th.provides}</th>
                <th>{t.sources.th.currency}</th>
                <th>{t.sources.th.note}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <B>
                    <a href="https://tcgdex.dev" style={{ color: "var(--accent)" }}>
                      {t.sources.tcgdex.name}
                    </a>
                  </B>{" "}
                  <span className="faint">{t.sources.tcgdex.tag}</span>
                </td>
                <td>{t.sources.tcgdex.provides}</td>
                <td className="dim">—</td>
                <td className="num dim">{t.sources.tcgdex.note(f.num(s.cards), f.num(s.sets))}</td>
              </tr>
              <tr>
                <td>
                  <B>{t.sources.cardmarket.name}</B>{" "}
                  <span className="faint">{t.sources.cardmarket.tag}</span>
                </td>
                <td>{t.sources.cardmarket.provides}</td>
                <td className="num">EUR</td>
                <td className="dim">{t.sources.cardmarket.note}</td>
              </tr>
              <tr>
                <td>
                  <B>{t.sources.tcgplayer.name}</B>{" "}
                  <span className="faint">{t.sources.tcgplayer.tag}</span>
                </td>
                <td>{t.sources.tcgplayer.provides}</td>
                <td className="num">USD</td>
                <td className="dim">{t.sources.tcgplayer.note}</td>
              </tr>
              <tr>
                <td>
                  <B>{t.sources.ecb.name}</B>
                </td>
                <td>
                  {t.sources.ecb.provides}
                  {fx ? <> · {t.sources.ecb.rate(t.fmt.rate(fx.rate), f.date(fx.date))}</> : null}
                </td>
                <td className="num">EUR/USD</td>
                <td className="dim">{t.sources.ecb.note}</td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <P>{t.sources.outro}</P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[1]} n={2} title={titles[1]} f={f}>
        <P>
          <Rich text={t.instrument.lead} />
        </P>
        <Formula>{t.instrument.formula}</Formula>
        <P>{t.instrument.scale(f.num(s.cards), f.num(s.instruments))}</P>
        <P>
          <Rich text={t.instrument.ui} />
        </P>
        <P className="faint">{t.instrument.reserved}</P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[2]} n={3} title={titles[2]} f={f}>
        <P>{t.marks.lead}</P>
        <div style={{ display: "grid", gap: 12 }}>
          {marks.map((m) => (
            <Why key={m.title} title={m.title}>
              <Rich text={m.body} />
            </Why>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[3]} n={4} title={titles[3]} f={f}>
        <P>
          <Rich text={t.signals.lead} />
        </P>
        <P>
          <Rich text={t.signals.cost} />
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>{t.signals.th.signal}</th>
                <th style={{ minWidth: 280 }}>{t.signals.th.measures}</th>
                <th style={{ minWidth: 280 }}>{t.signals.th.bounds}</th>
              </tr>
            </thead>
            <tbody>
              {signalRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <B>{r.label}</B>
                    <div className="faint">{r.id}</div>
                  </td>
                  <td>{r.measures}</td>
                  <td>
                    {r.bounds}
                    {"link" in r ? (
                      <>
                        {" "}
                        <Link
                          href={localePath(locale, "ilustradores")}
                          style={{ color: "var(--accent)" }}
                        >
                          {r.link}
                        </Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Grid>
        <P className="faint">
          <Rich text={t.signals.pairing} />
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[4]} n={5} title={titles[4]} f={f}>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>{t.composite.th.component}</th>
                <th className="r">{t.composite.th.sign}</th>
                <th>{t.composite.th.why}</th>
              </tr>
            </thead>
            <tbody>
              {compositeRows.map((r) => (
                <tr key={r.label}>
                  <td>
                    <B>{r.label}</B>
                  </td>
                  <td className="r num" style={{ fontSize: 15 }}>
                    <span className={r.sign === "+" ? "pos" : "neg"}>{r.sign}</span>
                  </td>
                  <td className="dim">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Grid>
        <P>
          <Rich text={t.composite.universe} />
        </P>
        <P>
          <Rich text={t.composite.weights} />
        </P>
        <div className="note">
          <Rich text={t.composite.note} />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[5]} n={6} title={titles[5]} f={f}>
        <div style={{ display: "grid", gap: 12 }}>
          {limits.map((l) => (
            <Why key={l.title} title={l.title}>
              <Rich text={l.body} />
            </Why>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[6]} n={7} title={titles[6]} f={f}>
        <div style={{ display: "grid", gap: 12 }}>
          {notDoing.map((w) => (
            <Why key={w.title} title={w.title}>
              <Rich text={w.body} />
            </Why>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[7]} n={8} title={titles[7]} f={f}>
        <P>
          <Rich text={t.parameters.p1} />
        </P>
        <P>
          <Rich text={t.parameters.p2} />
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id={IDS[8]} n={9} title={titles[8]} f={f}>
        <P>{t.audit.lead}</P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>{t.audit.th.fact}</th>
                <th className="r">{t.audit.th.value}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t.audit.asOf}</td>
                <td className="r num">{f.date(s.asOf)}</td>
              </tr>
              <tr>
                <td>{t.audit.firstDay}</td>
                <td className="r num">{f.date(s.firstDay)}</td>
              </tr>
              <tr>
                <td>{t.audit.days}</td>
                <td className="r num">{f.num(s.days)}</td>
              </tr>
              <tr>
                <td>{t.audit.fx}</td>
                <td className="r num">
                  {fx ? `${t.fmt.rate(fx.rate)} · ${f.date(fx.date)}` : t.audit.noFx}
                </td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <div className="note">
          <Rich text={t.audit.note} />
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  id,
  n,
  title,
  f,
  children,
}: {
  id: string;
  n: number;
  title: string;
  f: { num: (v: number) => string };
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 28, scrollMarginTop: 72 }}>
      <h2 style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="num faint" style={{ fontSize: 13 }}>
          {f.num(n)}
        </span>
        {title}
      </h2>
      <div className="card pad" style={{ display: "grid", gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

/** Pinta un parrafo del diccionario respetando el orden que fija cada idioma. */
function Rich({ text }: { text: Text }) {
  const parts = typeof text === "string" ? [text] : text;
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : "b" in p ? (
          <B key={i}>{p.b}</B>
        ) : (
          <em key={i}>{p.em}</em>
        ),
      )}
    </>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={className} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="scroll-x">{children}</div>;
}

function Why({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderLeft: "2px solid var(--border-strong)", paddingLeft: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

/** Definicion en bloque: la unidad de analisis, no una formula de calculo. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="scroll-x"
      style={{
        fontFamily: "var(--mono)",
        fontSize: 12.5,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/**
 * El tipo de cambio realmente aplicado viaja dentro del detalle de la senal de
 * arbitraje. Se lee en vivo, de una sola pasada por el ranking, para que la pagina
 * no repita a mano una cifra que el motor ya haya recalculado.
 */
function readFx(): { rate: number; date: string } | null {
  const arb = getScreener({ limit: 100 }).find((x) => x.components.eu_us_arb !== undefined);
  if (!arb) return null;
  const sig = getCardSignals(arb.instrument_id).find((x) => x.signal === "eu_us_arb");
  const rate = sig?.detail["fx_eurusd"];
  const date = sig?.detail["fx_date"];
  if (typeof rate !== "number") return null;
  return { rate, date: typeof date === "string" ? date : "" };
}
