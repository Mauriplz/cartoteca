import { db, latestAsOf } from "./db";
import type { ArtistPremium, CardRow, ScoredCard, SignalDetail } from "./types";

/**
 * Toda consulta que sirva precios pasa por este filtro. Son exclusiones medidas
 * sobre los datos, no precauciones teoricas:
 *   is_digital = 0    1.681 cartas EN son de TCG Pocket: digitales, sin mercado fisico.
 *   cm_collision = 0  el 10,6% de las cartas EN comparten idProduct de Cardmarket,
 *                     asi que su precio esta atribuido a mas de una carta.
 */
const CLEAN = "i.is_digital = 0 AND i.cm_collision = 0";

const BASE_SELECT = `
  SELECT i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
         c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image,
         c.image_alt, c.image_alt_lang,
         s.name AS set_name, s.release_date,
         p.cm_trend AS price_eur, p.tcg_market, p.obs_date
  FROM instruments i
  JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
  LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
  LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
       AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
`;

export interface ScreenerOpts {
  limit?: number;
  offset?: number;
  lang?: string;
  minPrice?: number;
  maxPrice?: number;
  rarity?: string;
  artist?: string;
}

/**
 * El ranking de inversion: instrumentos del universo invertible, ordenados por desajuste.
 *
 * Deduplicacion por producto de Cardmarket. Para 15.020 instrumentos, TCGdex adjunta
 * el mismo producto de Cardmarket a varias variantes de la misma carta, asi que
 * 'Piloswine normal' y 'Piloswine reverse' llevan exactamente el mismo precio europeo.
 * Mostrarlos como dos filas no es un detalle cosmetico: es publicar UNA oportunidad
 * dos veces y gastar dos plazas del ranking en ella. Se colapsan en una sola fila, y
 * se devuelve cuantas variantes cubre para poder decirlo en la interfaz.
 */
export function getScreener(o: ScreenerOpts = {}): ScoredCard[] {
  const asOf = latestAsOf();
  const w: string[] = [CLEAN, "sc.signal = 'invest_score'", "sc.as_of = ?"];
  const a: unknown[] = [asOf];

  if (o.lang) { w.push("i.lang = ?"); a.push(o.lang); }
  if (o.rarity) { w.push("c.rarity = ?"); a.push(o.rarity); }
  if (o.artist) { w.push("c.illustrator = ?"); a.push(o.artist); }
  if (o.minPrice != null) { w.push("p.cm_trend >= ?"); a.push(o.minPrice); }
  if (o.maxPrice != null) { w.push("p.cm_trend <= ?"); a.push(o.maxPrice); }

  const rows = db().prepare(`
    WITH scored AS (
      SELECT sc.value AS score, sc.detail AS detail_json, rc.value AS roundtrip_cost,
             i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
             i.cm_variant_ambiguous,
             c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image,
             c.image_alt, c.image_alt_lang,
             s.name AS set_name, s.release_date,
             p.cm_trend AS price_eur, p.tcg_market, p.obs_date,
             -- Clave de agrupacion: el producto de Cardmarket cuando existe; si no,
             -- el propio instrumento (que entonces es unico por definicion).
             COALESCE('p' || i.cm_id_product, i.instrument_id) AS dedupe_key
      FROM signals sc
      JOIN instruments i ON i.instrument_id = sc.instrument_id
      JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
      LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
      LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
           AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
      LEFT JOIN signals rc ON rc.instrument_id = i.instrument_id
           AND rc.signal = 'roundtrip_cost' AND rc.as_of = sc.as_of
      WHERE ${w.join(" AND ")}
    ),
    ranked AS (
      SELECT *,
             ROW_NUMBER() OVER (PARTITION BY dedupe_key ORDER BY score DESC) AS rn,
             COUNT(*)     OVER (PARTITION BY dedupe_key) AS variant_count
      FROM scored
    )
    SELECT * FROM ranked WHERE rn = 1
    ORDER BY score DESC
    LIMIT ? OFFSET ?
  `).all(...a, o.limit ?? 50, o.offset ?? 0) as Array<
    CardRow & {
      score: number; detail_json: string; roundtrip_cost: number | null;
      variant_count: number; cm_variant_ambiguous: number;
    }
  >;

  return rows.map((r) => {
    const { detail_json, ...rest } = r;
    let components: Record<string, number> = {};
    try {
      components = (JSON.parse(detail_json)?.components ?? {}) as Record<string, number>;
    } catch { /* detalle ilegible: se muestra la puntuacion sin desglose */ }
    return { ...rest, components };
  });
}

/** Cuantos instrumentos hay puntuados en total, respetando la deduplicacion. */
export function countScreener(o: ScreenerOpts = {}): number {
  const asOf = latestAsOf();
  const w: string[] = [CLEAN, "sc.signal = 'invest_score'", "sc.as_of = ?"];
  const a: unknown[] = [asOf];
  if (o.lang) { w.push("i.lang = ?"); a.push(o.lang); }
  if (o.rarity) { w.push("c.rarity = ?"); a.push(o.rarity); }
  if (o.artist) { w.push("c.illustrator = ?"); a.push(o.artist); }
  if (o.minPrice != null) { w.push("p.cm_trend >= ?"); a.push(o.minPrice); }
  if (o.maxPrice != null) { w.push("p.cm_trend <= ?"); a.push(o.maxPrice); }

  return (db().prepare(`
    SELECT COUNT(DISTINCT COALESCE('p' || i.cm_id_product, i.instrument_id)) n
    FROM signals sc
    JOIN instruments i ON i.instrument_id = sc.instrument_id
    JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
    LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
         AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
    WHERE ${w.join(" AND ")}
  `).get(...a) as { n: number }).n;
}

export interface CardsOpts {
  q?: string;
  lang?: string;
  set?: string;
  rarity?: string;
  artist?: string;
  minPrice?: number;
  sort?: "price_desc" | "price_asc" | "name" | "release_desc";
  limit?: number;
  offset?: number;
}

export function getCards(o: CardsOpts = {}): { rows: CardRow[]; total: number } {
  const w: string[] = [CLEAN];
  const a: unknown[] = [];
  if (o.q) { w.push("c.name LIKE ?"); a.push(`%${o.q}%`); }
  if (o.lang) { w.push("i.lang = ?"); a.push(o.lang); }
  if (o.set) { w.push("c.set_id = ?"); a.push(o.set); }
  if (o.rarity) { w.push("c.rarity = ?"); a.push(o.rarity); }
  if (o.artist) { w.push("c.illustrator = ?"); a.push(o.artist); }
  if (o.minPrice != null) { w.push("p.cm_trend >= ?"); a.push(o.minPrice); }

  const order = {
    price_desc: "p.cm_trend DESC NULLS LAST",
    price_asc: "p.cm_trend ASC NULLS LAST",
    name: "c.name ASC",
    release_desc: "s.release_date DESC NULLS LAST",
  }[o.sort ?? "price_desc"];

  const where = `WHERE ${w.join(" AND ")}`;
  const rows = db().prepare(
    `${BASE_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...a, o.limit ?? 60, o.offset ?? 0) as CardRow[];

  const total = (db().prepare(`
    SELECT COUNT(*) n FROM instruments i
    JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
    LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
    LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
         AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
    ${where}`).get(...a) as { n: number }).n;

  return { rows, total };
}

export function getCard(instrumentId: string): CardRow | null {
  return (db().prepare(`${BASE_SELECT} WHERE ${CLEAN} AND i.instrument_id = ?`)
    .get(instrumentId) as CardRow) ?? null;
}

/** Todas las senales activas de un instrumento, con su detalle explicativo. */
export function getCardSignals(instrumentId: string): SignalDetail[] {
  const rows = db().prepare(
    `SELECT signal, value, detail FROM signals
     WHERE instrument_id = ? AND as_of = ? ORDER BY signal`
  ).all(instrumentId, latestAsOf()) as Array<{ signal: string; value: number; detail: string }>;

  return rows.map((r) => {
    let detail: Record<string, unknown> = {};
    try { detail = JSON.parse(r.detail) ?? {}; } catch { /* ilegible */ }
    return { signal: r.signal, value: r.value, detail };
  });
}

/** Historico de precio. Hoy son dos dias: el archivo acaba de empezar. */
export function getPriceHistory(instrumentId: string) {
  return db().prepare(
    `SELECT obs_date, cm_trend, cm_avg7, cm_avg30, tcg_market
     FROM price_obs WHERE instrument_id = ? ORDER BY obs_date`
  ).all(instrumentId) as Array<{
    obs_date: string; cm_trend: number | null; cm_avg7: number | null;
    cm_avg30: number | null; tcg_market: number | null;
  }>;
}

/** Otras variantes de la misma carta (holo, reverse, 1ª edición...). */
export function getSiblingVariants(cardId: string, lang: string) {
  return db().prepare(`${BASE_SELECT} WHERE ${CLEAN} AND i.card_id = ? AND i.lang = ?
                       ORDER BY p.cm_trend DESC NULLS LAST`)
    .all(cardId, lang) as CardRow[];
}

export function getArtists(minN = 30): ArtistPremium[] {
  return db().prepare(
    `SELECT artist, n, raw_mean, shrunk, weight FROM artist_premium
     WHERE n >= ? ORDER BY shrunk DESC`
  ).all(minN) as ArtistPremium[];
}

export function getFilterOptions() {
  const d = db();
  return {
    sets: d.prepare(
      `SELECT s.set_id, s.lang, s.name, s.release_date,
              (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.set_id AND c.lang = s.lang) n
       FROM sets s WHERE s.is_digital = 0 ORDER BY s.release_date DESC`
    ).all() as Array<{ set_id: string; lang: string; name: string; release_date: string; n: number }>,
    rarities: d.prepare(
      `SELECT rarity, COUNT(*) n FROM cards WHERE rarity IS NOT NULL AND is_digital = 0
       GROUP BY rarity ORDER BY n DESC`
    ).all() as Array<{ rarity: string; n: number }>,
    artists: d.prepare(
      `SELECT illustrator, COUNT(*) n FROM cards WHERE illustrator IS NOT NULL AND is_digital = 0
       GROUP BY illustrator ORDER BY n DESC`
    ).all() as Array<{ illustrator: string; n: number }>,
  };
}

/** Cifras de portada. Se muestran tal cual, incluidas las incomodas. */
export function getMarketStats() {
  const d = db();
  const one = (q: string, ...a: unknown[]) => (d.prepare(q).get(...a) as { v: number }).v;
  const asOf = latestAsOf();
  return {
    asOf,
    cards: one("SELECT COUNT(*) v FROM cards WHERE is_digital = 0"),
    instruments: one(`SELECT COUNT(*) v FROM instruments i WHERE ${CLEAN}`),
    priced: one(`SELECT COUNT(DISTINCT p.instrument_id) v FROM price_obs p
                 JOIN instruments i ON i.instrument_id = p.instrument_id WHERE ${CLEAN}`),
    investable: one(
      "SELECT COUNT(*) v FROM signals WHERE signal='roundtrip_cost' AND value <= 0.25 AND as_of = ?", asOf),
    days: one("SELECT COUNT(DISTINCT obs_date) v FROM price_obs"),
    firstDay: (d.prepare("SELECT MIN(obs_date) v FROM price_obs").get() as { v: string }).v,
    sets: one("SELECT COUNT(*) v FROM sets WHERE is_digital = 0"),
    jpEnPairs: one("SELECT COUNT(*) v FROM signals WHERE signal='jp_en_ratio' AND as_of = ?", asOf),
    arbs: one("SELECT COUNT(*) v FROM signals WHERE signal='eu_us_arb' AND as_of = ?", asOf),
  };
}
