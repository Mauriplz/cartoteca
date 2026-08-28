-- Esquema del almacen analitico.
--
-- SQLite ahora (cero infraestructura, funciona hoy), pero escrito para migrar a
-- Postgres sin reescribir: sin tipos exoticos, sin AUTOINCREMENT, fechas en TEXT ISO.
--
-- Decisiones que vienen de haber MEDIDO los datos, no de suponerlos:
--
--  1. La unidad con precio no es la carta, es la VARIANTE. `variants_detailed` trae
--     pricing propio por variante con su idProduct; el bloque `pricing` de nivel
--     superior solo devuelve la primera y pierde el resto.
--  2. `subtype` distingue 1st Edition de Unlimited. Es una diferencia de precio
--     enorme y se perderia si la carta fuese la unidad.
--  3. 1.681 cartas EN son de TCG Pocket: digitales, sin mercado fisico. Se marcan
--     y se excluyen aguas abajo, nunca se borran.
--  4. El 10,6% de las cartas EN comparten idProduct de Cardmarket: el precio esta
--     atribuido a la carta equivocada. Se marca y no entra en modelos.
--  5. `low` NO es precio de mercado (mediana low/trend = 0,200: son copias danadas).
--     Se archiva, pero jamas se usa como marca.
--  6. `source_updated` NO es un sello as-of por carta: solo 7 valores distintos en
--     19.818 cartas, todos en el mismo segundo. Es la marca del batch de TCGdex.
--     El unico reloj de conocimiento valido es `fetched_at`.

PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sets (
  set_id              TEXT NOT NULL,
  lang                TEXT NOT NULL,
  name                TEXT,
  serie_id            TEXT,
  serie_name          TEXT,
  release_date        TEXT,          -- solo existe en /sets/{id}, no en la carta
  card_count_total    INTEGER,
  card_count_official INTEGER,
  card_count_holo     INTEGER,
  card_count_reverse  INTEGER,
  card_count_first_ed INTEGER,
  legal_standard      INTEGER,
  legal_expanded      INTEGER,
  is_digital          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, lang)
);

CREATE TABLE IF NOT EXISTS cards (
  card_id         TEXT NOT NULL,
  lang            TEXT NOT NULL,
  set_id          TEXT,
  local_id        TEXT,
  name            TEXT,
  illustrator     TEXT,
  rarity          TEXT,
  category        TEXT,
  stage           TEXT,
  evolve_from     TEXT,
  hp              INTEGER,
  types           TEXT,              -- JSON array
  dex_id          TEXT,              -- JSON array
  regulation_mark TEXT,
  image           TEXT,
  is_digital      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, lang)
);
CREATE INDEX IF NOT EXISTS idx_cards_illustrator ON cards(illustrator);
CREATE INDEX IF NOT EXISTS idx_cards_set         ON cards(set_id, lang);
CREATE INDEX IF NOT EXISTS idx_cards_name        ON cards(name);

-- La unidad negociable. Una fila por (carta, idioma, variante).
CREATE TABLE IF NOT EXISTS instruments (
  instrument_id   TEXT PRIMARY KEY,  -- <lang>:<card_id>:<type>:<subtype>
  card_id         TEXT NOT NULL,
  lang            TEXT NOT NULL,
  variant_type    TEXT,              -- holo | normal | reverse | firstEdition | wPromo
  variant_subtype TEXT,              -- unlimited | 1stEdition | shadowless | ...
  variant_size    TEXT,
  tcgdex_variant_id TEXT,
  cm_id_product   INTEGER,
  tcg_product_id  INTEGER,
  is_digital      INTEGER NOT NULL DEFAULT 0,
  -- Marcas de calidad: se calculan en carga y filtran aguas abajo.
  cm_collision    INTEGER NOT NULL DEFAULT 0,  -- idProduct compartido con OTRA CARTA
  -- idProduct compartido con otra VARIANTE de la misma carta. Medido: TCGdex
  -- adjunta el producto entero de Cardmarket a todas las variantes, asi que el
  -- precio europeo no distingue reverse de normal aunque el americano si. Comparar
  -- los dos mercados en estos instrumentos es comparar objetos distintos.
  cm_variant_ambiguous INTEGER NOT NULL DEFAULT 0,
  first_seen      TEXT,
  last_seen       TEXT
);
CREATE INDEX IF NOT EXISTS idx_inst_card ON instruments(card_id, lang);
CREATE INDEX IF NOT EXISTS idx_inst_prod ON instruments(cm_id_product);

-- El archivo. Una fila por instrumento y dia observado.
CREATE TABLE IF NOT EXISTS price_obs (
  instrument_id  TEXT NOT NULL,
  obs_date       TEXT NOT NULL,      -- dia UTC de NUESTRA captura
  fetched_at     TEXT NOT NULL,      -- reloj de conocimiento: el unico valido
  source_updated TEXT,               -- sello del batch de TCGdex (NO es as-of por carta)
  cm_trend       REAL,               -- marca de referencia para raw
  cm_avg         REAL,
  cm_low         REAL,               -- NO usar como precio: copias danadas
  cm_avg1        REAL,               -- se arrastra; util solo como senal de volatilidad
  cm_avg7        REAL,
  cm_avg30       REAL,
  tcg_market     REAL,
  tcg_low        REAL,
  tcg_mid        REAL,
  tcg_high       REAL,
  tcg_direct_low REAL,
  PRIMARY KEY (instrument_id, obs_date)
);
CREATE INDEX IF NOT EXISTS idx_px_date ON price_obs(obs_date);

-- Registro de cargas, para auditar el archivo.
CREATE TABLE IF NOT EXISTS etl_runs (
  run_at      TEXT NOT NULL,
  obs_date    TEXT NOT NULL,
  lang        TEXT NOT NULL,
  rows_in     INTEGER,
  instruments INTEGER,
  prices      INTEGER,
  notes       TEXT
);
