import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getDataQuality, getIndexSeries, getMovers } from "@/lib/queries";
import {
  LOCALES,
  coerceLocale,
  localePath,
  makeFormatters,
  pick,
  type Locale,
} from "@/lib/i18n";
import { market } from "@/lib/i18n/market";
import IndexBoard from "@/components/IndexBoard";
import MoversList from "@/components/MoversList";

/**
 * MERCADO HOY: la portada tipo terminal. Indice por segmentos, movers entre
 * nuestras capturas, curva de vida por año de edicion y calidad de datos.
 * Todo fechado y con su intervalo: el archivo tiene dos observaciones y la
 * pagina lo dice en vez de disimularlo.
 */

// Los datos cambian con cada captura: no tiene sentido congelar la pagina en el build.
export const dynamic = "force-dynamic";

const MOVERS_PER_SIDE = 10;
/** Cuantos dias de captura se listan uno a uno antes de plegarse en un rango. */
const MAX_DAYS_LISTED = 10;
const TOP_GAPS = 5;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = coerceLocale((await params).locale);
  const t = pick(market, locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: {
      canonical: localePath(locale, "mercado"),
      languages: Object.fromEntries(LOCALES.map((l) => [l, localePath(l, "mercado")])),
    },
  };
}

interface LifeRow {
  year: string;
  n: number;
  median: number;
}

/**
 * Mediana del precio ACTUAL por año de salida de la edicion.
 *
 * Mismos filtros que el resto del sitio (sin digitales, sin colisiones de
 * producto) y misma deduplicacion por producto de Cardmarket: sin ella, las
 * variantes que comparten precio contarian la misma cifra varias veces y
 * sesgarian la mediana. La mediana en SQLite se calcula a mano: se ordena cada
 * año y se promedian sus una o dos filas centrales.
 *
 * Es una foto de HOY con sesgo de supervivencia (declarado en la interfaz):
 * de 1999 solo cotiza lo que alguien conservo.
 */
function getLifeCurve(): LifeRow[] {
  return db().prepare(`
    WITH latest AS (
      SELECT COALESCE('p' || i.cm_id_product, i.instrument_id) AS dedupe_key,
             p.cm_trend AS price, s.release_date
      FROM instruments i
      JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
      JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
      JOIN price_obs p ON p.instrument_id = i.instrument_id
           AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
      WHERE i.is_digital = 0 AND i.cm_collision = 0
        AND p.cm_trend IS NOT NULL AND s.release_date IS NOT NULL
    ),
    dedup AS (
      SELECT substr(release_date, 1, 4) AS year, price,
             ROW_NUMBER() OVER (PARTITION BY dedupe_key ORDER BY price DESC) AS rn
      FROM latest
    ),
    ranked AS (
      SELECT year, price,
             ROW_NUMBER() OVER (PARTITION BY year ORDER BY price) AS pos,
             COUNT(*) OVER (PARTITION BY year) AS cnt
      FROM dedup WHERE rn = 1
    )
    SELECT year, MAX(cnt) AS n, AVG(price) AS median
    FROM ranked
    WHERE pos IN ((cnt + 1) / 2, (cnt + 2) / 2)
    GROUP BY year ORDER BY year
  `).all() as LifeRow[];
}

/** Artefactos de la fuente excluidos de los movers en la ultima captura. */
function countArtifacts(): number {
  return (db().prepare(
    `SELECT COUNT(*) n FROM movers
     WHERE as_of = (SELECT MAX(as_of) FROM movers) AND is_artifact = 1`,
  ).get() as { n: number }).n;
}

export default async function MercadoPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale: Locale = coerceLocale((await params).locale);
  const t = pick(market, locale);
  const f = makeFormatters(locale);

  const series = getIndexSeries();
  // La direccion es parte del contrato de cada columna: una lista de "suben"
  // con una fila en negativo (o al reves) seria un relleno disfrazado.
  const up = getMovers({ limit: MOVERS_PER_SIDE, direction: "up" })
    .filter((r) => r.pct_change > 0);
  const down = getMovers({ limit: MOVERS_PER_SIDE, direction: "down" })
    .filter((r) => r.pct_change < 0);
  const artifacts = countArtifacts();
  const life = getLifeCurve();
  const quality = getDataQuality();

  const lastCapture = quality.captureDays[quality.captureDays.length - 1] ?? null;
  const maxMedian = life.reduce((m, r) => Math.max(m, r.median), 0);

  const declared = quality.completeness.reduce((s, r) => s + r.declared, 0);
  const present = quality.completeness.reduce((s, r) => s + r.present, 0);
  const emptySets = quality.completeness.filter((r) => r.present === 0).length;
  const gaps = quality.completeness
    .filter((r) => r.declared > r.present)
    .slice(0, TOP_GAPS);

  return (
    <>
      <h1>{t.h1}</h1>
      <p className="sub">{t.sub(f.date(lastCapture))}</p>

      <IndexBoard series={series} locale={locale} />

      <MoversList up={up} down={down} artifactsExcluded={artifacts} locale={locale} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Curva de vida: mediana de hoy por año de edicion. Una fila por año,
            con una barra de magnitud; no es una serie temporal de precios sino
            una foto de la ultima captura, y el sesgo de supervivencia va dicho. */}
        <section className="card pad">
          <h2>{t.life.title}</h2>
          <p className="dim" style={{ fontSize: 12.5, margin: "0 0 4px" }}>{t.life.intro}</p>
          <p className="faint" style={{ fontSize: 11.5, margin: "0 0 12px" }}>{t.life.bias}</p>

          <div
            className="faint"
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr 84px 64px",
              gap: 8,
              fontSize: 10.5,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 4,
            }}
          >
            <span>{t.life.year}</span>
            <span />
            <span style={{ textAlign: "right" }}>{t.life.median}</span>
            <span style={{ textAlign: "right" }}>{t.life.count}</span>
          </div>

          <div style={{ display: "grid", gap: 3 }}>
            {life.map((r) => (
              <div
                key={r.year}
                title={t.life.rowTitle(r.year, f.eur(r.median), f.num(r.n))}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 84px 64px",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <span className="num dim" style={{ fontSize: 11.5 }}>{r.year}</span>
                <span style={{ background: "var(--surface-2)", borderRadius: 4, height: 8 }}>
                  <span
                    style={{
                      display: "block",
                      height: 8,
                      borderRadius: 4,
                      width: `${maxMedian > 0 ? Math.max((r.median / maxMedian) * 100, 2) : 0}%`,
                      background: "var(--accent)",
                    }}
                  />
                </span>
                <span className="num" style={{ fontSize: 11.5, textAlign: "right" }}>
                  {f.eur(r.median)}
                </span>
                <span className="num faint" style={{ fontSize: 11, textAlign: "right" }}>
                  {f.num(r.n)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Calidad de datos: las costuras, en publico. */}
        <section className="card pad">
          <h2>{t.quality.title}</h2>

          <p className="dim" style={{ fontSize: 12.5, margin: "0 0 6px" }}>
            {quality.captureDays.length <= MAX_DAYS_LISTED
              ? t.quality.daysList(
                  f.num(quality.captureDays.length),
                  quality.captureDays.length,
                  quality.captureDays.map((d) => f.date(d)).join(" · "),
                )
              : t.quality.daysRange(
                  f.num(quality.captureDays.length),
                  f.date(quality.captureDays[0]),
                  f.date(lastCapture),
                )}
          </p>
          <p className="dim" style={{ fontSize: 12.5, margin: "0 0 6px" }}>
            {t.quality.coverage(
              f.num(present),
              f.num(declared),
              f.pct(declared > 0 ? present / declared : null, 1),
            )}
          </p>
          {emptySets > 0 ? (
            <p className="faint" style={{ fontSize: 12, margin: "0 0 12px" }}>
              {t.quality.emptySets(f.num(emptySets))}
            </p>
          ) : null}

          <h2 style={{ fontSize: 13, margin: "12px 0 6px" }}>{t.quality.gapsTitle}</h2>
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t.quality.set}</th>
                  <th className="r">{t.quality.declared}</th>
                  <th className="r">{t.quality.present}</th>
                  <th className="r">{t.quality.missing}</th>
                </tr>
              </thead>
              <tbody>
                {gaps.map((g) => (
                  <tr key={`${g.set_id}:${g.lang}`}>
                    <td>
                      <span style={{ fontWeight: 550 }}>{g.name ?? g.set_id}</span>{" "}
                      <span className="tag" style={{ fontSize: 10 }}>
                        {g.lang.toUpperCase()}
                      </span>
                      {g.release_date ? (
                        <span className="faint num" style={{ fontSize: 11 }}>
                          {" "}
                          · {g.release_date.slice(0, 4)}
                        </span>
                      ) : null}
                    </td>
                    <td className="r num">{f.num(g.declared)}</td>
                    <td className="r num">{f.num(g.present)}</td>
                    <td className="r num neg">{f.num(g.declared - g.present)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, margin: "12px 0 0" }}>
            <a href={localePath(locale, "metodologia")} style={{ color: "var(--accent)" }}>
              {t.quality.methodology}
            </a>
          </p>
        </section>
      </div>
    </>
  );
}
