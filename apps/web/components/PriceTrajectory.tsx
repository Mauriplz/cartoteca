import type { CSSProperties } from "react";
import { makeFormatters, pick, type Formatters, type Locale } from "@/lib/i18n";
import { cards as cardsDict, type CardsDict } from "@/lib/i18n/cards";

/**
 * Trayectoria de precio de una carta, en dos dibujos que NO se mezclan.
 *
 * A) Las medias que publica Cardmarket (30 días, 7 días) y la tendencia actual.
 *    NO son puntos sucesivos de una serie temporal: son ventanas SOLAPADAS
 *    calculadas hacia atrás desde hoy. Unirlas con una línea sería inventarse un
 *    histórico que no tenemos, y calcular retornos sobre ellas produce una
 *    autocorrelación altísima por pura construcción del filtro. Por eso aquí cada
 *    una es un MARCADOR sobre un eje de precio, en su propia fila, con la media
 *    de 30 días como referencia vertical. Lo que sí es verdad, y es lo que se lee
 *    de un vistazo, es dónde está el precio de hoy respecto a esas medias.
 *
 * B) Nuestras observaciones diarias, que sí son mediciones puntuales en fechas
 *    concretas y sí van sobre un eje temporal real. Hoy son poquísimas —el
 *    archivo empezó el 25/08/2026— y el pie del gráfico lo dice con el número
 *    exacto. Tampoco se unen con una línea: con dos puntos, una línea de
 *    tendencia es un dibujo, no una medición.
 *
 * Se dibuja con SVG en línea, sin librerías y sin JavaScript de cliente: el
 * componente se renderiza entero en el servidor. Los colores salen de las
 * variables del tema, así que funciona en claro y en oscuro.
 *
 * Nota técnica: los colores van SIEMPRE por `style`, nunca por atributo de
 * presentación. `fill="var(--pos)"` no se sustituye en Chrome ni en Safari
 * —los atributos de presentación no resuelven var()—, mientras que
 * `style={{ fill: "var(--pos)" }}` sí, porque ya es una declaración CSS.
 */

/* ---------------------------------------------------------------- contrato */

/** Una medición propia: precio observado en una fecha concreta. */
export interface TrajectoryObservation {
  obs_date: string;
  cm_trend: number | null;
  tcg_market: number | null;
}

/**
 * Una media de la fuente. `windowDays` declara la ventana hacia atrás: 30 y 7
 * para las medias, 0 para la tendencia actual, que no promedia nada.
 */
export interface TrajectoryAggregate {
  key: string;
  windowDays: number;
  value: number;
}

/** Lo que devuelve getPriceTrajectory(), descrito por su forma. */
export interface Trajectory {
  observations: TrajectoryObservation[];
  aggregates: TrajectoryAggregate[];
  drift: number | null;
  asOf: string | null;
}

/* ------------------------------------------------------------------ escala */

/** Un valor por debajo de esto se lee como «igual», no como subida ni bajada. */
const LEVEL_EPS = 0.005;

interface Axis {
  lo: number;
  hi: number;
  ticks: number[];
}

/**
 * Dominio con extremos redondeados a valores legibles.
 *
 * Primero acolcha el rango (para que ningún marcador quede pegado al borde) y
 * después lo estira hasta el múltiplo de paso más cercano, de modo que las
 * etiquetas del eje sean cifras redondas y no el mínimo arbitrario de la
 * muestra. Los precios no son negativos: si el acolchado empuja el suelo por
 * debajo de cero, se corta en cero en vez de dibujar un eje imposible.
 */
function niceAxis(min: number, max: number, target = 4): Axis {
  let lo = min;
  let hi = max;
  if (hi > lo) {
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
  } else {
    // Todos los valores coinciden: se abre una ventana alrededor del punto.
    const pad = Math.max(Math.abs(hi) * 0.08, 0.02);
    lo = hi - pad;
    hi = hi + pad;
  }
  if (min >= 0 && lo < 0) lo = 0;

  const rawStep = (hi - lo) / Math.max(1, target);
  if (!(rawStep > 0) || !Number.isFinite(rawStep)) {
    return { lo, hi: lo + 1, ticks: [lo, lo + 1] };
  }
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;

  let base = Math.floor(lo / step) * step;
  if (min >= 0 && base < 0) base = 0;
  const top = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  for (let i = 0; i < 40; i++) {
    const v = base + i * step;
    ticks.push(v);
    if (v >= top - step * 1e-6) break;
  }
  const last = ticks[ticks.length - 1];
  return { lo: base, hi: last > base ? last : base + step, ticks };
}

/** Color de una desviación: verde arriba, rojo abajo, gris cuando no se mueve. */
function tone(x: number | null): string {
  if (x == null || Math.abs(x) < LEVEL_EPS) return "var(--text-dim)";
  return x > 0 ? "var(--pos)" : "var(--neg)";
}

function toneClass(x: number | null): string | undefined {
  if (x == null || Math.abs(x) < LEVEL_EPS) return undefined;
  return x > 0 ? "pos" : "neg";
}

/** Porcentaje con el signo siempre escrito: +22,0% y −3,2% se leen igual de rápido. */
function signedPct(f: Formatters, v: number): string {
  return `${v > 0 ? "+" : ""}${f.pct(v, 1)}`;
}

/* ------------------------------------------------------------- dimensiones */

/**
 * Ancho del lienzo en unidades de usuario. El SVG escala al 100% del contenedor
 * con un tope, así que este número fija la relación entre el tamaño del texto
 * dentro del dibujo y el ancho disponible: cuanto más estrecho es el lienzo,
 * más grande se lee la etiqueta en un móvil.
 */
const VB_W = 440;
const MAX_W = 520;

const SVG_STYLE: CSSProperties = {
  width: "100%",
  height: "auto",
  maxWidth: MAX_W,
  display: "block",
};

const FONT_LABEL = 12;
const FONT_TICK = 10;

/* --------------------------------------------------- A · niveles y medias */

const ROW_ORDER = ["trend", "avg7", "avg30"] as const;

const LBL_END = 116;
const PX0 = 126;
const PX1 = 322;
const VAL_X = 438;
const ROW_Y0 = 30;
const ROW_H = 32;

function Levels(
  { aggs, drift, t, f }: {
    aggs: TrajectoryAggregate[];
    drift: number | null;
    t: CardsDict["detail"]["trajectory"];
    f: Formatters;
  },
) {
  const find = (k: string): TrajectoryAggregate | null =>
    aggs.find((a) => a.key === k) ?? null;
  const trend = find("trend");
  const a7 = find("avg7");
  const a30 = find("avg30");

  const rows = ROW_ORDER.map(find).filter((a): a is TrajectoryAggregate => a !== null);

  // Con un solo marcador no hay «respecto a», que es justo lo que este dibujo
  // dice. Se calla entero en vez de pintar un eje con un punto suelto.
  if (rows.length < 2 || trend == null) {
    return <p className="note">{t.levels.none}</p>;
  }

  const rel = (a: TrajectoryAggregate | null): number | null =>
    a != null && a.value > 0 ? trend.value / a.value - 1 : null;
  // `drift` ya es tendencia ÷ media de 30 días − 1: se reutiliza tal cual.
  const vs30 = a30 != null ? (drift ?? rel(a30)) : null;
  const vs7 = rel(a7);

  // La lectura principal es contra la media de 30 días; si no la hay, contra la de 7.
  const headBase = a30 ?? a7;
  const head = a30 != null ? vs30 : vs7;

  const values = rows.map((r) => r.value);
  const ax = niceAxis(Math.min(...values), Math.max(...values));
  const span = ax.hi - ax.lo || 1;
  const X = (v: number) => PX0 + ((v - ax.lo) / span) * (PX1 - PX0);

  const ref = a30 ?? a7 ?? trend;
  const refX = X(ref.value);

  const axisY = ROW_Y0 + (rows.length - 1) * ROW_H + 24;
  const height = axisY + 28;
  const topY = 14;

  const label: Record<string, string> = {
    trend: t.levels.label.trend,
    avg7: t.levels.label.avg7,
    avg30: t.levels.label.avg30,
  };

  return (
    <>
      {/* La tendencia en euros ya sale arriba en la ficha y otra vez en el eje: aqui
          las baldosas solo llevan lo que este bloque anade, que es la distancia a
          cada media. Dos cifras, ademas, llenan la fila entera en un movil. */}
      <div className="stats" style={{ marginBottom: 12 }}>
        {vs30 != null && (
          <div className="stat">
            <div className={`v ${toneClass(vs30) ?? "dim"}`}>{signedPct(f, vs30)}</div>
            <div className="k">{t.levels.statVs30}</div>
          </div>
        )}
        {vs7 != null && (
          <div className="stat">
            <div className={`v ${toneClass(vs7) ?? "dim"}`}>{signedPct(f, vs7)}</div>
            <div className="k">{t.levels.statVs7}</div>
          </div>
        )}
      </div>

      {head != null && headBase != null && (
        <p style={{ fontSize: 14, margin: "0 0 14px", lineHeight: 1.5 }}>
          <strong className={toneClass(head)}>
            {Math.abs(head) < LEVEL_EPS
              ? t.levels.reading.level(f.num(headBase.windowDays))
              : head > 0
                ? t.levels.reading.above(f.pct(Math.abs(head), 1), f.num(headBase.windowDays))
                : t.levels.reading.below(f.pct(Math.abs(head), 1), f.num(headBase.windowDays))}
          </strong>
        </p>
      )}

      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        style={SVG_STYLE}
        role="img"
        aria-labelledby="pt-levels-title pt-levels-desc"
      >
        <title id="pt-levels-title">{t.levels.svgTitle}</title>
        <desc id="pt-levels-desc">
          {t.levels.svgDesc(
            f.eur(trend.value),
            f.eur(a7?.value ?? null),
            f.eur(a30?.value ?? null),
          )}
        </desc>

        {/* Rejilla del eje de precio. */}
        {ax.ticks.map((v) => (
          <line
            key={`g${v}`}
            x1={X(v)} y1={topY} x2={X(v)} y2={axisY}
            style={{ stroke: "var(--border)", strokeWidth: 1 }}
          />
        ))}

        {/* Referencia: la media más larga disponible. Todo se lee respecto a ella. */}
        <line
          x1={refX} y1={topY} x2={refX} y2={axisY}
          style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          strokeDasharray="3 4"
        />

        {rows.map((r, i) => {
          const y = ROW_Y0 + i * ROW_H;
          const x = X(r.value);
          const isTrend = r.key === "trend";
          const d = r.value - ref.value;
          const rd = ref.value > 0 ? d / ref.value : null;
          // Solo se colorea la fila de la tendencia, que es la unica lectura que este
          // panel promete: donde esta el precio de HOY respecto a su referencia. Pintar
          // tambien la media de 7 dias segun su distancia a la de 30 convertiria el cruce
          // de dos ventanas solapadas en una senal de direccion, y ademas se contradecia
          // con la baldosa de arriba: la misma media podia salir roja en el dibujo y
          // verde en la cifra, porque no responden a la misma pregunta.
          const c = isTrend ? tone(rd) : "var(--text-dim)";
          return (
            <g key={r.key}>
              {/* Segmento desde la referencia hasta el valor: la distancia ES el dato. */}
              {Math.abs(x - refX) > 0.5 && (
                <line
                  x1={refX} y1={y} x2={x} y2={y}
                  style={{
                    stroke: c,
                    strokeWidth: isTrend ? 2.5 : 1.5,
                    strokeLinecap: "round",
                  }}
                />
              )}
              {isTrend ? (
                <circle cx={x} cy={y} r={5.5} style={{ fill: c }} />
              ) : (
                <circle
                  cx={x} cy={y} r={4.5}
                  style={{ fill: "var(--surface)", stroke: "var(--text-dim)", strokeWidth: 2 }}
                />
              )}
              <text
                x={LBL_END} y={y + 4} textAnchor="end"
                style={{
                  fontSize: FONT_LABEL,
                  fill: isTrend ? "var(--text)" : "var(--text-dim)",
                  fontWeight: isTrend ? 600 : 400,
                }}
              >
                {label[r.key] ?? r.key}
              </text>
              <text
                x={VAL_X} y={y + 4} textAnchor="end"
                style={{
                  fontSize: FONT_LABEL,
                  fill: "var(--text)",
                  fontFamily: "var(--mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {f.eur(r.value)}
              </text>
            </g>
          );
        })}

        {/* Eje de precio. Solo se etiquetan los extremos: en 196 px de ancho, cuatro
            cifras en euros se pisarían unas a otras. */}
        <line
          x1={PX0} y1={axisY} x2={PX1} y2={axisY}
          style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
        />
        {ax.ticks.map((v) => (
          <line
            key={`t${v}`}
            x1={X(v)} y1={axisY} x2={X(v)} y2={axisY + 4}
            style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          />
        ))}
        <text
          x={PX0} y={axisY + 16} textAnchor="start"
          style={{ fontSize: FONT_TICK, fill: "var(--text-faint)", fontFamily: "var(--mono)" }}
        >
          {f.eur(ax.lo)}
        </text>
        <text
          x={PX1} y={axisY + 16} textAnchor="end"
          style={{ fontSize: FONT_TICK, fill: "var(--text-faint)", fontFamily: "var(--mono)" }}
        >
          {f.eur(ax.hi)}
        </text>
      </svg>

      <p className="note" style={{ marginTop: 12 }}>
        {t.levels.windowsA}
        <em>{t.levels.windowsEm}</em>
        {t.levels.windowsB}
      </p>
    </>
  );
}

/* --------------------------------------------- B · observaciones diarias */

const BX0 = 84;
const BX1 = 426;
/** Margen interior del eje temporal: sin el, el primer y el ultimo punto se
 *  quedan clavados en el borde y su mitad se sale del dibujo. */
const B_INSET = 16;
const BY0 = 18;
const BY1 = 104;
const B_H = 140;

interface Point {
  date: string;
  value: number;
  t: number;
}

function Archive(
  { points, firstDay, archiveDays, t, f }: {
    points: Point[];
    firstDay: string | null;
    /** Dias distintos que tiene el archivo propio ENTERO, no los de esta carta. */
    archiveDays: number;
    t: CardsDict["detail"]["trajectory"];
    f: Formatters;
  },
) {
  if (points.length === 0) return <p className="note">{t.archive.none}</p>;

  const values = points.map((p) => p.value);
  const ax = niceAxis(Math.min(...values), Math.max(...values), 3);
  const span = ax.hi - ax.lo || 1;
  const Y = (v: number) => BY1 - ((v - ax.lo) / span) * (BY1 - BY0);

  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  // Un solo día —o varios el mismo día— no define un eje: el punto va al centro.
  const px0 = BX0 + B_INSET;
  const px1 = BX1 - B_INSET;
  const X = (ms: number) => (t1 > t0 ? px0 + ((ms - t0) / (t1 - t0)) * (px1 - px0) : (px0 + px1) / 2);

  // Con pocos puntos cabe la fecha de todos; con muchos, solo los extremos, y el
  // resto se consulta en la tabla de respaldo. El tope son tres porque la fecha
  // japonesa —2026年8月25日— ocupa casi el doble que la inglesa.
  const labelAll = points.length <= 3;
  const last = points.length - 1;

  return (
    <>
      <svg
        viewBox={`0 0 ${VB_W} ${B_H}`}
        style={SVG_STYLE}
        role="img"
        aria-labelledby="pt-archive-title pt-archive-desc"
      >
        <title id="pt-archive-title">{t.archive.svgTitle}</title>
        <desc id="pt-archive-desc">
          {t.archive.svgDesc(
            points.length,
            f.num(points.length),
            f.date(points[0].date),
            f.date(points[last].date),
          )}
        </desc>

        {/* Rejilla de precio, con su cifra a la izquierda. */}
        {ax.ticks.map((v, i) => {
          const text = f.eur(v);
          // Dos escalones seguidos pueden redondear a la misma cifra en euros
          // cuando la carta cotiza en centimos: se dibuja la linea, no el duplicado.
          const dup = i > 0 && f.eur(ax.ticks[i - 1]) === text;
          return (
            <g key={`y${v}`}>
              <line
                x1={BX0} y1={Y(v)} x2={BX1} y2={Y(v)}
                style={{ stroke: "var(--border)", strokeWidth: 1 }}
              />
              {!dup && (
                <text
                  x={BX0 - 8} y={Y(v) + 3.5} textAnchor="end"
                  style={{ fontSize: FONT_TICK, fill: "var(--text-faint)", fontFamily: "var(--mono)" }}
                >
                  {text}
                </text>
              )}
            </g>
          );
        })}

        {/* Eje temporal. */}
        <line
          x1={BX0} y1={BY1} x2={BX1} y2={BY1}
          style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
        />

        {points.map((p, i) => {
          const x = X(p.t);
          const y = Y(p.value);
          // El anclaje va por POSICION, no por indice: con una sola observacion el
          // punto cae en el centro del eje y su fecha tiene que ir centrada bajo el,
          // no colgando hacia la derecha como si fuera el primero de una serie.
          const anchor = x < px0 + 30 ? "start" : x > px1 - 30 ? "end" : "middle";
          return (
            <g key={p.date}>
              {/* Caída punteada hasta el eje: sitúa el punto en su fecha sin sugerir
                  continuidad entre uno y otro. */}
              <line
                x1={x} y1={y} x2={x} y2={BY1}
                style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                strokeDasharray="2 3"
              />
              <line
                x1={x} y1={BY1} x2={x} y2={BY1 + 4}
                style={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              />
              <circle
                cx={x} cy={y} r={4.5}
                style={{ fill: "var(--accent)", stroke: "var(--bg)", strokeWidth: 1.5 }}
              />
              {(labelAll || i === 0 || i === last) && (
                <text
                  x={x} y={BY1 + 18} textAnchor={anchor}
                  style={{ fontSize: FONT_TICK, fill: "var(--text-faint)" }}
                >
                  {f.date(p.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="note" style={{ marginTop: 12 }}>
        {t.archive.foot(
          points.length,
          f.num(points.length),
          f.date(points[0].date),
          archiveDays,
          f.num(archiveDays),
          f.date(firstDay ?? points[0].date),
        )}
        {t.archive.noLine(points.length, f.num(points.length))}
      </p>
    </>
  );
}

/* ------------------------------------------------------- tabla de respaldo */

function Backup(
  { rows, points, refValue, t, f }: {
    rows: TrajectoryAggregate[];
    points: Point[];
    refValue: number | null;
    t: CardsDict["detail"]["trajectory"];
    f: Formatters;
  },
) {
  const label: Record<string, string> = {
    trend: t.levels.label.trend,
    avg7: t.levels.label.avg7,
    avg30: t.levels.label.avg30,
  };

  return (
    <details style={{ marginTop: 14 }}>
      <summary className="dim" style={{ fontSize: 12.5, cursor: "pointer" }}>
        {t.table.summary}
      </summary>

      {rows.length > 0 && (
        <div className="card scroll-x" style={{ marginTop: 10 }}>
          <table className="grid">
            <caption
              className="faint"
              style={{ fontSize: 11.5, textAlign: "left", padding: "8px 10px 0" }}
            >
              {t.table.capLevels}
            </caption>
            <thead>
              <tr>
                <th>{t.table.thWhat}</th>
                <th className="r">{t.table.thValue}</th>
                <th className="r">{t.table.thVsRef}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const d =
                  refValue != null && refValue > 0 ? r.value / refValue - 1 : null;
                return (
                  <tr key={r.key}>
                    <td>{label[r.key] ?? r.key}</td>
                    <td className="r num">{f.eur(r.value)}</td>
                    <td className={`r num ${toneClass(d) ?? "faint"}`}>
                      {d == null ? "—" : signedPct(f, d)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {points.length > 0 && (
        <div className="card scroll-x" style={{ marginTop: 10 }}>
          <table className="grid">
            <caption
              className="faint"
              style={{ fontSize: 11.5, textAlign: "left", padding: "8px 10px 0" }}
            >
              {t.table.capArchive}
            </caption>
            <thead>
              <tr>
                <th>{t.table.thDate}</th>
                <th className="r">{t.table.thValue}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td className="num">{f.date(p.date)}</td>
                  <td className="r num">{f.eur(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

/* --------------------------------------------------------------- montaje */

export default function PriceTrajectory(
  { trajectory, locale, archiveDays, firstDay = null }: {
    trajectory: Trajectory;
    locale: Locale;
    /**
     * Días distintos que tiene el archivo propio. Va sin valor por defecto a
     * propósito: es la cifra que impide leer estos dos dibujos como un histórico,
     * así que quien monte el componente está obligado a darla.
     */
    archiveDays: number;
    /** Primer día del archivo completo: el pie del gráfico dice desde cuándo medimos. */
    firstDay?: string | null;
  },
) {
  const t = pick(cardsDict, locale).detail.trajectory;
  const f = makeFormatters(locale);

  // Los valores vienen de la base, no del compilador: lo que no sea un número
  // finito es falta de dato y no entra en ningún eje.
  const aggs = trajectory.aggregates.filter(
    (a) => typeof a.value === "number" && Number.isFinite(a.value),
  );
  const rows = ROW_ORDER.map((k) => aggs.find((a) => a.key === k))
    .filter((a): a is TrajectoryAggregate => a !== undefined);

  const points: Point[] = trajectory.observations
    .map((o) => ({
      date: o.obs_date,
      value: o.cm_trend,
      t: Date.parse(o.obs_date),
    }))
    .filter((p): p is Point =>
      p.value != null && Number.isFinite(p.value) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

  const ref = aggs.find((a) => a.key === "avg30") ?? aggs.find((a) => a.key === "avg7") ?? null;

  return (
    <section style={{ marginTop: 32 }}>
      <h2>{t.h2}</h2>
      <p className="sub" style={{ marginBottom: 14 }}>{t.sub}</p>

      {rows.length === 0 && points.length === 0 ? (
        <p className="note">{t.none}</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
            gap: 12,
          }}
        >
          <section className="card pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
              {t.levels.h3}
            </h3>
            <Levels aggs={aggs} drift={trajectory.drift} t={t} f={f} />
          </section>

          <section className="card pad">
            <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600 }}>
              {t.archive.h3}
            </h3>
            <Archive points={points} firstDay={firstDay} archiveDays={archiveDays} t={t} f={f} />
          </section>
        </div>
      )}

      {(rows.length > 0 || points.length > 0) && (
        <Backup rows={rows} points={points} refValue={ref?.value ?? null} t={t} f={f} />
      )}
    </section>
  );
}
