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
         c.image_alt, c.image_alt_lang, c.image_ext, c.image_ext_src, c.types,
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
             c.image_alt, c.image_alt_lang, c.image_ext, c.image_ext_src, c.types,
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
  /** Etiqueta de edicion especial: collab:*, exclusive:*, event:*, anniversary:*, promo... */
  tag?: string;
  lang?: string;
  set?: string;
  rarity?: string;
  artist?: string;
  minPrice?: number;
  sort?: "price_desc" | "price_asc" | "name" | "release_desc";
  limit?: number;
  offset?: number;
}

/**
 * Explorador de cartas.
 *
 * Deduplica por producto de Cardmarket, igual que el ranking. Medido: sin ello el
 * 48% de las filas son la misma carta al mismo precio repetida una vez por cada
 * variante que TCGdex declara. Charizard a 4.526,87 EUR aparecia como holo y como
 * reverse porque Cardmarket publica un unico producto para ambas: no son dos
 * mercados, es el mismo precio dos veces.
 *
 * Cuando las variantes SI tienen producto propio en Cardmarket (y por tanto precio
 * propio), siguen apareciendo por separado, que es lo correcto.
 */
export function getCards(o: CardsOpts = {}): { rows: CardRow[]; total: number } {
  const w: string[] = [CLEAN];
  const a: unknown[] = [];
  if (o.q) {
    // La busqueda no puede mirar solo el nombre de la carta. El Pikachu del Museo
    // Van Gogh se llama oficialmente "Pikachu with Grey Felt Hat" y la exclusiva de
    // Pokemon Center se llama "Special Delivery Pikachu": quien busca "van gogh" o
    // "pokemon center" no encontraria ninguna de las dos. Se busca ademas por
    // ilustrador, por edicion, por numero de carta y por sinonimo curado.
    w.push(`(c.name LIKE ? OR c.illustrator LIKE ? OR s.name LIKE ? OR c.card_id LIKE ?
             OR EXISTS (SELECT 1 FROM card_aliases al
                        WHERE al.card_id = c.card_id AND al.lang = c.lang
                          AND al.alias LIKE ?))`);
    const like = `%${o.q}%`;
    a.push(like, like, like, like, `%${o.q.toLowerCase()}%`);
  }
  if (o.tag) {
    w.push(`EXISTS (SELECT 1 FROM card_tags t
                    WHERE t.card_id = c.card_id AND t.lang = c.lang AND t.tag = ?)`);
    a.push(o.tag);
  }
  if (o.lang) { w.push("i.lang = ?"); a.push(o.lang); }
  if (o.set) { w.push("c.set_id = ?"); a.push(o.set); }
  if (o.rarity) { w.push("c.rarity = ?"); a.push(o.rarity); }
  if (o.artist) { w.push("c.illustrator = ?"); a.push(o.artist); }
  if (o.minPrice != null) { w.push("p.cm_trend >= ?"); a.push(o.minPrice); }

  const order = {
    price_desc: "price_eur DESC NULLS LAST",
    price_asc: "price_eur ASC NULLS LAST",
    name: "name ASC",
    release_desc: "release_date DESC NULLS LAST",
  }[o.sort ?? "price_desc"];

  const where = `WHERE ${w.join(" AND ")}`;
  const dedupe = "COALESCE('p' || i.cm_id_product, i.instrument_id)";

  const rows = db().prepare(`
    WITH base AS (
      SELECT i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
             i.cm_variant_ambiguous,
             c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image,
             c.image_alt, c.image_alt_lang, c.image_ext, c.image_ext_src, c.types,
             s.name AS set_name, s.release_date,
             p.cm_trend AS price_eur, p.tcg_market, p.obs_date,
             ${dedupe} AS dedupe_key
      FROM instruments i
      JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
      LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
      LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
           AND p.obs_date = (SELECT MAX(obs_date) FROM price_obs WHERE instrument_id = i.instrument_id)
      ${where}
    ),
    ranked AS (
      SELECT *,
             -- Se conserva la variante mas representativa: la que tenga precio, y a
             -- igualdad, la primera por nombre de acabado, para que el orden sea estable.
             ROW_NUMBER() OVER (PARTITION BY dedupe_key
                                ORDER BY (price_eur IS NULL), variant_type) AS rn,
             COUNT(*)     OVER (PARTITION BY dedupe_key) AS variant_count
      FROM base
    )
    SELECT * FROM ranked WHERE rn = 1 ORDER BY ${order} LIMIT ? OFFSET ?
  `).all(...a, o.limit ?? 60, o.offset ?? 0) as CardRow[];

  const total = (db().prepare(`
    SELECT COUNT(DISTINCT ${dedupe}) n
    FROM instruments i
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

/**
 * Trayectoria de precio de un instrumento.
 *
 * Devuelve dos cosas que NO deben mezclarse en el mismo trazo:
 *
 *  - `observations`: nuestras propias observaciones diarias. Son mediciones puntuales
 *    en fechas concretas. El archivo empezo el 25/08/2026, asi que hoy son pocas.
 *
 *  - `aggregates`: las medias que publica Cardmarket. NO son puntos de una serie:
 *    avg30 es la media de los ultimos 30 dias y avg7 la de los ultimos 7, con las
 *    ventanas solapadas. Se exponen con su ventana declarada para que quien pinte
 *    las situe en el centroide de su periodo y no las una con una linea como si
 *    fueran cotizaciones sucesivas. Dicen la DIRECCION del movimiento reciente, que
 *    es informacion real y util, pero no una serie temporal.
 */
export function getPriceTrajectory(instrumentId: string) {
  const observations = db().prepare(
    `SELECT obs_date, cm_trend, tcg_market FROM price_obs
     WHERE instrument_id = ? ORDER BY obs_date`
  ).all(instrumentId) as Array<{ obs_date: string; cm_trend: number | null; tcg_market: number | null }>;

  const last = db().prepare(
    `SELECT obs_date, cm_trend, cm_avg, cm_avg1, cm_avg7, cm_avg30, cm_low, tcg_market
     FROM price_obs WHERE instrument_id = ? ORDER BY obs_date DESC LIMIT 1`
  ).get(instrumentId) as {
    obs_date: string; cm_trend: number | null; cm_avg: number | null;
    cm_avg1: number | null; cm_avg7: number | null; cm_avg30: number | null;
    cm_low: number | null; tcg_market: number | null;
  } | undefined;

  const aggregates = last
    ? ([
        { key: "avg30", windowDays: 30, value: last.cm_avg30 },
        { key: "avg7", windowDays: 7, value: last.cm_avg7 },
        { key: "trend", windowDays: 0, value: last.cm_trend },
      ] as const).filter((a) => a.value != null).map((a) => ({ ...a, value: a.value as number }))
    : [];

  // Direccion reciente: donde esta la tendencia frente a la media de 30 dias.
  // Es la lectura honesta que se puede dar hoy sin historico propio.
  const drift =
    last?.cm_trend != null && last.cm_avg30 != null && last.cm_avg30 > 0
      ? last.cm_trend / last.cm_avg30 - 1
      : null;

  return { observations, aggregates, drift, asOf: last?.obs_date ?? null };
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

/** Etiquetas de edicion especial disponibles, con cuantas cartas tienen precio. */
export function getSpecialTags() {
  return db().prepare(`
    SELECT t.tag, COUNT(DISTINCT t.card_id || t.lang) n,
           MAX(p.cm_trend) max_price
    FROM card_tags t
    JOIN cards c ON c.card_id = t.card_id AND c.lang = t.lang AND c.is_digital = 0
    LEFT JOIN instruments i ON i.card_id = c.card_id AND i.lang = c.lang
    LEFT JOIN price_obs p ON p.instrument_id = i.instrument_id
    GROUP BY t.tag ORDER BY max_price DESC NULLS LAST
  `).all() as Array<{ tag: string; n: number; max_price: number | null }>;
}

/** Etiquetas de una carta concreta. */
export function getCardTags(cardId: string, lang: string): string[] {
  return (db().prepare(
    "SELECT tag FROM card_tags WHERE card_id = ? AND lang = ? ORDER BY tag"
  ).all(cardId, lang) as Array<{ tag: string }>).map((r) => r.tag);
}

/**
 * Completitud del catalogo por edicion. TCGdex declara cuantas cartas tiene cada set
 * y a veces no publica ninguna: 72 sets estan anunciados y vacios, entre ellos alguno
 * japones importante. Se mide y se enseña en vez de dejar que el usuario descubra el
 * hueco buscando una carta que deberia estar.
 */
export function getCatalogCompleteness() {
  const r = db().prepare(`
    SELECT SUM(s.card_count_total) declared,
           SUM((SELECT COUNT(*) FROM cards c WHERE c.set_id = s.set_id AND c.lang = s.lang)) present,
           SUM(CASE WHEN (SELECT COUNT(*) FROM cards c
                          WHERE c.set_id = s.set_id AND c.lang = s.lang) = 0 THEN 1 ELSE 0 END) empty_sets
    FROM sets s WHERE s.is_digital = 0 AND s.card_count_total > 0
  `).get() as { declared: number; present: number; empty_sets: number };
  return { ...r, missing: r.declared - r.present };
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
    arbs: one("SELECT COUNT(*) v FROM signals WHERE signal='market_divergence' AND as_of = ?", asOf),
  };
}

/**
 * Serie del Indice Cartoteca (metodologia index_v1, congelada en
 * services/index/methodology.md ANTES del primer valor publicado).
 * Cada punto lleva su intervalo real: con huecos de captura un valor cubre
 * varios dias y la interfaz debe decirlo, no disimularlo.
 */
export function getIndexSeries() {
  return db().prepare(`
    SELECT as_of, segment, value, mean_return, n_constituents, n_clipped,
           prev_date, interval_days
    FROM market_index WHERE methodology = 'index_v1'
    ORDER BY as_of, segment
  `).all() as Array<{
    as_of: string; segment: string; value: number; mean_return: number | null;
    n_constituents: number | null; n_clipped: number | null;
    prev_date: string | null; interval_days: number | null;
  }>;
}

/**
 * Movers entre nuestras dos ultimas observaciones.
 *
 * Reglas de honestidad, no negociables:
 *  - cada fila declara sus DOS fechas y el intervalo real; con >1 dia el titular
 *    es "desde nuestra ultima captura", jamas "del dia";
 *  - es la variacion de una marca SUAVIZADA de la fuente: informacion etiquetada,
 *    nunca insumo de senales ni del track record;
 *  - solo instrumentos con trend >= 15 EUR en la observacion previa (point-in-time)
 *    y sin los que despiertan tras silencio (avg7==avg30 previo);
 *  - sin artefactos de marca (|cambio|>25% con las tres medias de la fuente
 *    congeladas: la fuente remapeando, no el mercado — caso real: 161->5.201 EUR).
 */
export function getMovers(opts: { limit?: number; direction?: "up" | "down" } = {}) {
  const order = opts.direction === "down" ? "ASC" : "DESC";
  return db().prepare(`
    SELECT m.as_of, m.prev_date, m.interval_days, m.prev_trend, m.curr_trend, m.pct_change,
           i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
           c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image,
           c.image_alt, c.image_alt_lang, c.image_ext, c.image_ext_src, c.types,
           s.name AS set_name, s.release_date
    FROM movers m
    JOIN instruments i ON i.instrument_id = m.instrument_id
    JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
    LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
    JOIN price_obs prev ON prev.instrument_id = m.instrument_id AND prev.obs_date = m.prev_date
    WHERE m.as_of = (SELECT MAX(as_of) FROM movers)
      AND ${"i.is_digital = 0 AND i.cm_collision = 0"}
      AND NOT (prev.cm_avg7 IS NOT NULL AND prev.cm_avg7 = prev.cm_avg30)
      AND m.is_artifact = 0
    ORDER BY m.pct_change ${order}
    LIMIT ?
  `).all(opts.limit ?? 15) as Array<
    CardRow & {
      as_of: string; prev_date: string; interval_days: number;
      prev_trend: number; curr_trend: number; pct_change: number;
    }
  >;
}

/**
 * Panel de calidad de datos: las costuras, en publico. Nadie del sector las
 * enseña; enseñarlas es lo que hace creible todo lo demas.
 */
export function getDataQuality() {
  const d = db();
  const completeness = d.prepare(`
    SELECT s.set_id, s.lang, s.name, s.release_date, s.card_count_total AS declared,
           (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.set_id AND c.lang = s.lang) AS present
    FROM sets s WHERE s.is_digital = 0 AND s.card_count_total > 0
    ORDER BY (s.card_count_total - (SELECT COUNT(*) FROM cards c WHERE c.set_id = s.set_id AND c.lang = s.lang)) DESC
  `).all() as Array<{ set_id: string; lang: string; name: string; release_date: string | null; declared: number; present: number }>;

  const captureDays = d.prepare(
    "SELECT DISTINCT obs_date FROM price_obs ORDER BY obs_date"
  ).all() as Array<{ obs_date: string }>;

  const seals = d.prepare(
    "SELECT COUNT(*) n FROM sqlite_master WHERE type='table'"
  ).get() as { n: number }; // los sellos viven en fichero, no en la base

  return { completeness, captureDays: captureDays.map((r) => r.obs_date), tables: seals.n };
}

/** Tipos de cambio del dia (BCE, base EUR), persistidos por el pipeline. */
export function getFxRates(): Record<string, { rate: number; fx_date: string | null }> {
  const rows = db().prepare(
    "SELECT quote, rate, fx_date FROM fx_rates WHERE as_of = (SELECT MAX(as_of) FROM fx_rates)"
  ).all() as Array<{ quote: string; rate: number; fx_date: string | null }>;
  return Object.fromEntries(rows.map((r) => [r.quote, { rate: r.rate, fx_date: r.fx_date }]));
}
