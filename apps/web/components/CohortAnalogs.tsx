import type { CSSProperties } from "react";
import { db } from "@/lib/db";
import { cardHref, variantName } from "@/components/CardTile";
import { resolveImage } from "@/lib/format";
import { localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { cards as cardsDict } from "@/lib/i18n/cards";
import { common } from "@/lib/i18n/common";
import type { CardRow } from "@/lib/types";

/**
 * Analogas de cohorte: donde cotiza ESTA carta entre las cartas mas parecidas.
 *
 * "Parecida" tiene una definicion mecanica y se dice en pantalla: mismo idioma,
 * misma rareza y era cercana (el año de edicion del set difiere en 2 o menos),
 * excluyendo la propia carta en todas sus variantes. Solo entran instrumentos
 * con precio, y con las mismas exclusiones que el resto del sitio: sin cartas
 * digitales y sin productos de Cardmarket compartidos por varias cartas.
 *
 * Igual que en el explorador, las variantes que comparten producto (y por tanto
 * precio) en Cardmarket cuentan UNA vez: si no, el mismo precio entraria dos
 * veces en los cuartiles y la mini-lista enseñaria la misma oportunidad repetida.
 *
 * Es CONTEXTO de valoracion —donde queda el precio entre comparables hoy—, no
 * una prediccion, y la linea de ayuda lo dice. Con menos de 4 analogas los
 * cuartiles no significan nada, asi que la seccion entera se calla.
 */

/** Exclusiones compartidas con lib/queries.ts; ver el comentario de CLEAN alli. */
const CLEAN = "i.is_digital = 0 AND i.cm_collision = 0";

/** El WHERE de la cohorte, una sola vez: las dos consultas deben coincidir. */
const COHORT_WHERE = `
  ${CLEAN}
  AND i.lang = ? AND c.rarity = ? AND i.card_id <> ?
  AND p.cm_trend IS NOT NULL
  AND s.release_date IS NOT NULL
  AND ABS(CAST(substr(s.release_date, 1, 4) AS INTEGER) - ?) <= 2
`;

const MIN_COHORT = 4;
const N_CLOSEST = 6;

/** Cuantil por interpolacion lineal sobre la lista ya ordenada. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const LINK: CSSProperties = { color: "var(--accent)" };

const ONE_LINE: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export default function CohortAnalogs({ card, locale }: { card: CardRow; locale: Locale }) {
  // Sin precio no hay percentil; sin rareza o sin año no hay cohorte definible.
  // En cualquiera de esos casos la seccion no aparece: nada de cohortes a medias.
  const year = card.release_date ? Number(card.release_date.slice(0, 4)) : NaN;
  if (card.price_eur == null || card.rarity == null || !Number.isFinite(year)) return null;

  // Cohorte: solo precios, deduplicados por producto de Cardmarket, para los
  // cuartiles y el percentil. Los campos completos solo se traen para las 6 vecinas.
  const prices = (db().prepare(`
    WITH cohort AS (
      SELECT p.cm_trend AS price,
             ROW_NUMBER() OVER (PARTITION BY COALESCE('p' || i.cm_id_product, i.instrument_id)
                                ORDER BY i.instrument_id) AS rn
      FROM instruments i
      JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
      JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
      JOIN price_obs p ON p.instrument_id = i.instrument_id
           AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
      WHERE ${COHORT_WHERE}
    )
    SELECT price FROM cohort WHERE rn = 1 ORDER BY price
  `).all(card.lang, card.rarity, card.card_id, year) as Array<{ price: number }>)
    .map((r) => r.price);

  const n = prices.length;
  if (n < MIN_COHORT) return null;

  const closest = db().prepare(`
    WITH cohort AS (
      SELECT i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
             c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image,
             c.image_alt, c.image_alt_lang, c.image_ext, c.image_ext_src, c.types,
             s.name AS set_name, s.release_date,
             p.cm_trend AS price_eur, p.tcg_market, p.obs_date,
             ROW_NUMBER() OVER (PARTITION BY COALESCE('p' || i.cm_id_product, i.instrument_id)
                                ORDER BY i.instrument_id) AS rn
      FROM instruments i
      JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
      JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
      JOIN price_obs p ON p.instrument_id = i.instrument_id
           AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
      WHERE ${COHORT_WHERE}
    )
    SELECT * FROM cohort WHERE rn = 1
    ORDER BY ABS(price_eur - ?), instrument_id
    LIMIT ?
  `).all(card.lang, card.rarity, card.card_id, year, card.price_eur, N_CLOSEST) as CardRow[];

  const t = pick(cardsDict, locale).detail;
  const c = pick(common, locale);
  const f = makeFormatters(locale);

  const p25 = quantile(prices, 0.25);
  const median = quantile(prices, 0.5);
  const p75 = quantile(prices, 0.75);

  // Percentil de ESTA carta con rango medio en los empates: una carta que cotiza
  // exactamente igual que media cohorte no esta "por encima" ni "por debajo" de ella.
  const price = card.price_eur;
  const below = prices.filter((v) => v < price).length;
  const ties = prices.filter((v) => v === price).length;
  const percentile = Math.round(((below + ties / 2) / n) * 100);

  // La rareza 'None' es el None de Python que ya llega asi del almacen: en
  // pantalla se dice "sin rareza" en el idioma de la interfaz, como en la señal.
  const rarityLabel = card.rarity === "None" ? t.facts.noRarity : card.rarity;

  return (
    <>
      <h2 style={{ marginTop: 32 }}>{t.analogs.h2}</h2>
      <p className="sub" style={{ marginBottom: 4 }}>
        {t.analogs.intro(n, f.num(n), f.eur(p25), f.eur(p75))}
        {t.analogs.criteria(c.langName[card.lang], rarityLabel, String(year - 2), String(year + 2))}
      </p>
      <p className="faint" style={{ fontSize: 12, margin: "0 0 12px", lineHeight: 1.45 }}>
        {t.analogs.help}
      </p>

      <div className="stats" style={{ marginBottom: 14 }}>
        <div className="stat">
          <div className="v">{f.eur(p25)}</div>
          <div className="k">{t.analogs.p25}</div>
        </div>
        <div className="stat">
          <div className="v">{f.eur(median)}</div>
          <div className="k">{t.analogs.median}</div>
        </div>
        <div className="stat">
          <div className="v">{f.eur(p75)}</div>
          <div className="k">{t.analogs.p75}</div>
        </div>
        <div className="stat">
          <div className="v">{f.eur(price)}</div>
          <div className="k">{t.analogs.thisCard(f.num(percentile))}</div>
        </div>
      </div>

      {closest.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 8px", fontSize: 13.5, fontWeight: 600 }}>
            {t.analogs.closest(closest.length, f.num(closest.length))}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))",
              gap: 10,
            }}
          >
            {closest.map((a) => {
              const aName = a.name ?? a.card_id;
              const aVariant = variantName(c, a.variant_type, a.variant_subtype);
              const { src } = resolveImage(a, "low");
              return (
                <a
                  key={a.instrument_id}
                  className="card"
                  href={localePath(locale, cardHref(a.instrument_id))}
                  title={`${aName} · ${aVariant}`}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, minWidth: 0 }}
                >
                  {src ? (
                    <img
                      src={src} alt="" loading="lazy" decoding="async"
                      style={{
                        width: 38, height: 53, objectFit: "cover", borderRadius: 4,
                        flex: "0 0 auto", background: "var(--surface-2)",
                      }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 38, height: 53, borderRadius: 4, flex: "0 0 auto",
                        background: "var(--surface-2)", border: "1px solid var(--border)",
                      }}
                    />
                  )}
                  <span style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <span style={{ ...ONE_LINE, display: "block", fontSize: 13, fontWeight: 550, ...LINK }}>
                      {aName}
                    </span>
                    <span className="faint" style={{ ...ONE_LINE, display: "block", fontSize: 11.5 }}>
                      {a.set_name ?? a.set_id ?? ""}
                      {a.set_name || a.set_id ? " · " : ""}
                      {aVariant}
                    </span>
                  </span>
                  <span className="num" style={{ fontSize: 13, fontWeight: 600, flex: "0 0 auto" }}>
                    {f.eur(a.price_eur)}
                  </span>
                </a>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
