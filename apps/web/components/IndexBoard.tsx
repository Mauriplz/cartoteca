import type { CSSProperties } from "react";
import { localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { market } from "@/lib/i18n/market";
import type { getIndexSeries } from "@/lib/queries";

/**
 * El Indice Cartoteca, un segmento por tarjeta.
 *
 * Hoy la serie tiene DOS puntos (base 100 y una observacion mas) y con dos
 * puntos no se dibuja una linea de tendencia: cada tarjeta enseña el valor
 * actual, la variacion desde la base, el intervalo real entre observaciones y
 * el contador "dia N del indice". Los puntos se pintan como MARCADORES fechados
 * sobre una franja, sin interpolacion: el componente ya escala a N puntos
 * (posicion horizontal proporcional al tiempo real, no al ordinal), asi que
 * cuando el archivo crezca no hay que tocarlo, solo la linea seguira sin
 * existir hasta que alguien decida que el archivo la sostiene.
 */

export type IndexPoint = ReturnType<typeof getIndexSeries>[number];

/** Orden editorial: el total delante, luego los segmentos. */
const SEGMENT_ORDER = ["TOTAL", "EN-vintage", "EN-moderno", "JA"] as const;

/** Cuantos puntos se listan como texto antes de plegar los antiguos. */
const MAX_LISTED = 8;

const STRIP_H = 46;

/**
 * Franja de marcadores: cada observacion es un punto en su fecha, y nada los
 * une. La linea discontinua es la base 100, una referencia fija, no una serie.
 */
function Markers({
  pts,
  fmtValue,
  fmtDate,
  pointTitle,
  baseLine,
  label,
}: {
  pts: IndexPoint[];
  fmtValue: (v: number) => string;
  fmtDate: (iso: string) => string;
  pointTitle: (date: string, value: string) => string;
  baseLine: string;
  label: string;
}) {
  const t0 = Date.parse(pts[0].as_of);
  const t1 = Date.parse(pts[pts.length - 1].as_of);
  const vals = pts.map((p) => p.value);
  // La base 100 entra en la escala aunque ningun punto la toque: es la referencia.
  const min = Math.min(...vals, 100);
  const max = Math.max(...vals, 100);
  // Amplitud minima de 1,5 puntos de indice: sin ella, una variacion del 0,7%
  // ocuparia la franja entera y pareceria un desplome.
  const span = Math.max(max - min, 1.5);
  const mid = (min + max) / 2;
  const bottomPct = (v: number) => 12 + ((v - (mid - span / 2)) / span) * 76;
  const leftPct = (iso: string) =>
    t1 > t0 ? 6 + ((Date.parse(iso) - t0) / (t1 - t0)) * 88 : 50;

  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      style={{ position: "relative", height: STRIP_H, margin: "10px 0 4px" }}
    >
      <div
        title={baseLine}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${bottomPct(100)}%`,
          borderTop: "1px dashed var(--border-strong)",
        }}
      />
      {pts.map((p) => (
        <span
          key={p.as_of}
          title={pointTitle(fmtDate(p.as_of), fmtValue(p.value))}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 0 2px var(--surface)",
            left: `calc(${leftPct(p.as_of)}% - 4px)`,
            bottom: `calc(${bottomPct(p.value)}% - 4px)`,
          }}
        />
      ))}
    </div>
  );
}

const CHIP: CSSProperties = { fontSize: 10.5, whiteSpace: "nowrap" };

export default function IndexBoard({
  series,
  locale,
}: {
  series: IndexPoint[];
  locale: Locale;
}) {
  const t = pick(market, locale).index;
  const f = makeFormatters(locale);
  // Valor de indice con dos decimales fijos, con el separador del idioma (el
  // mismo criterio que usa makeFormatters para los porcentajes).
  const idx = (v: number) => v.toFixed(2).replace(".", locale === "es" ? "," : ".");

  const bySeg = new Map<string, IndexPoint[]>();
  for (const p of series) {
    const arr = bySeg.get(p.segment);
    if (arr) arr.push(p);
    else bySeg.set(p.segment, [p]);
  }
  const segments = [
    ...SEGMENT_ORDER.filter((s) => bySeg.has(s)),
    ...[...bySeg.keys()].filter((s) => !(SEGMENT_ORDER as readonly string[]).includes(s)),
  ];

  if (segments.length === 0) return null;

  const dayN = new Set(series.map((p) => p.as_of)).size;
  const baseDate = series.reduce((m, p) => (p.as_of < m ? p.as_of : m), series[0].as_of);

  return (
    <section style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>{t.title}</h2>
        <span className="tag acc">{t.day(f.num(dayN))}</span>
        <span className="faint" style={{ fontSize: 12 }}>
          {t.base(f.date(baseDate))}
        </span>
        <a
          href={localePath(locale, "metodologia")}
          style={{ fontSize: 12, color: "var(--accent)" }}
        >
          {t.methodology}
        </a>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: 12,
        }}
      >
        {segments.map((seg) => {
          const pts = bySeg.get(seg)!; // por construccion: seg sale de bySeg
          const last = pts[pts.length - 1];
          const delta = last.value / 100 - 1;
          // El n de constituyentes vive en los puntos calculados, no en la base.
          const nConst = [...pts].reverse().find((p) => p.n_constituents != null)?.n_constituents;
          const listed = pts.length > MAX_LISTED ? pts.slice(-MAX_LISTED) : pts;

          return (
            <div key={seg} className="card pad">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {t.segment[seg] ?? seg}
                </span>
                {nConst != null ? (
                  <span className="tag num" style={CHIP}>
                    {t.constituents(f.num(nConst))}
                  </span>
                ) : null}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 8,
                }}
              >
                <span
                  className="num"
                  style={{ fontSize: 26, fontWeight: 650, letterSpacing: "-0.02em" }}
                >
                  {idx(last.value)}
                </span>
                <span
                  className={`num ${delta > 0 ? "pos" : delta < 0 ? "neg" : "dim"}`}
                  style={{ fontSize: 14, fontWeight: 600 }}
                  title={t.sinceBase}
                >
                  {delta >= 0 ? "+" : ""}
                  {f.pct(delta, 2)}
                </span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {t.sinceBase}
                </span>
              </div>

              <Markers
                pts={pts}
                fmtValue={idx}
                fmtDate={f.date}
                pointTitle={t.pointTitle}
                baseLine={t.baseLine}
                label={t.pointsLabel}
              />

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {pts.length > MAX_LISTED ? (
                  <span className="tag faint num" style={CHIP}>
                    +{f.num(pts.length - MAX_LISTED)}
                  </span>
                ) : null}
                {listed.map((p) => (
                  <span key={p.as_of} className="tag num" style={CHIP}>
                    {f.date(p.as_of)} · {idx(p.value)}
                  </span>
                ))}
              </div>

              <div className="faint num" style={{ fontSize: 11, marginTop: 8 }}>
                {last.prev_date && last.interval_days != null
                  ? t.interval(
                      f.date(last.prev_date),
                      f.date(last.as_of),
                      f.num(last.interval_days),
                      last.interval_days,
                    )
                  : t.base(f.date(last.as_of))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="faint" style={{ fontSize: 11.5, margin: "10px 0 0", maxWidth: "88ch" }}>
        {t.note}
      </p>
    </section>
  );
}
