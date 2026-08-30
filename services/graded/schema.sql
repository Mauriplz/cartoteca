-- Esquema del modulo de GRADEADAS (eBay Browse API).
--
-- Mismo criterio que services/etl/schema.sql: SQLite hoy (cero infraestructura),
-- escrito para migrar a Postgres sin reescribir: sin tipos exoticos, sin
-- AUTOINCREMENT, fechas en TEXT ISO (YYYY-MM-DD o timestamp ISO-8601 UTC).
--
-- Decisiones, y por que:
--
--  1. eBay cerro su API de ventas cerradas (2026) y scrapear "sold" viola sus ToS.
--     Lo unico observable legitimamente son LISTINGS ACTIVOS via Browse API.
--     Por eso el modelo NO tiene tabla de "ventas": tiene ciclo de vida de listing
--     (snapshot + observaciones diarias) y ventas INFERIDAS aparte, con su
--     confianza y su evidencia. La venta aqui es una conclusion, no un dato.
--  2. Snapshot (graded_listings) y trayectoria (listing_observations) van separados
--     porque sirven a consumidores distintos: el nowcasting (ALGORITMO.md 5.1)
--     necesita la serie diaria (n de listings, ask minimo, velocidad de
--     desaparicion) y el motor de inferencia (PLAN.md seccion 5) necesita
--     reconstruir el ciclo de vida completo de cada listing. Un snapshot solo
--     perderia ambas cosas; una tabla unica denormalizada repetiria el titulo
--     y el vendedor cada dia sin necesidad.
--  3. inferred_sales lleva method + confidence + detail JSON porque el estimador
--     esta SIN CALIBRAR hasta tener la muestra de Terapeak (PLAN.md seccion 5,
--     "calibracion contra verdad de campo"). Guardar la evidencia con la fila
--     permite re-puntuar o descartar ventas inferidas a posteriori, cuando exista
--     la calibracion, sin re-observar nada.
--  4. grader/grade salen del titulo libre con un parser CONSERVADOR
--     (ebay_source.parse_title): NULL significa "no determinable sin ambiguedad".
--     Jamas se adivina; un NULL honesto filtra aguas abajo, un valor inventado
--     contamina la serie de PSA 10 con lotes mixtos y slabs de imitacion.
--  5. instrument_key referencia instruments.instrument_id del almacen raw MAS el
--     par gradeadora/grado (p.ej. 'en:swsh3-20:holo:unlimited|PSA|10'). Es TEXT
--     libre y NULLable: la resolucion titulo->instrumento es un subproyecto
--     (PLAN.md seccion 9) y la clave llega de la consulta que genero la busqueda,
--     no del titulo. Sin FK dura: este almacen puede vivir en otro fichero .db.
--  6. currency se guarda SIEMPRE junto al precio. eBay US cotiza en USD y el
--     almacen raw en EUR; mezclarlos sin FX es el error E4 del catalogo de
--     casuisticas. Ninguna vista debe agregar precios sin agrupar por currency.
--  7. price en graded_listings es el ULTIMO precio visto (para subastas, la puja
--     mas alta observada). La historia completa vive en listing_observations;
--     duplicar aqui el ultimo valor evita un JOIN en el 90% de las consultas
--     de snapshot ("que hay activo ahora y a cuanto").

PRAGMA journal_mode = WAL;

-- Snapshot acumulado: una fila por listing observado alguna vez.
-- first_seen/last_seen delimitan el ciclo de vida; last_status dice como acabo
-- (o 'active' si sigue vivo). El motor de inferencia clasifica al desaparecer.
CREATE TABLE IF NOT EXISTS graded_listings (
  listing_id     TEXT NOT NULL,      -- itemId de eBay (formato 'v1|...|0') o id del fixture
  source         TEXT NOT NULL,      -- 'ebay' (Browse API real) | 'fixture' (modo simulado)
  instrument_key TEXT,               -- ver decision 5; NULL = aun sin resolver
  title          TEXT,               -- titulo libre tal cual; NUNCA se normaliza in situ
  grader         TEXT,               -- PSA | BGS | CGC | SGC; NULL = parser no seguro (decision 4)
  grade          REAL,               -- 1..10 en pasos de 0.5; NULL junto a grader NULL
  price          REAL,               -- ultimo precio visto (decision 7)
  currency       TEXT,               -- ISO-4217; obligatoria de facto junto a price (decision 6)
  is_auction     INTEGER NOT NULL DEFAULT 0,  -- 1 = AUCTION en buyingOptions
  bid_count      INTEGER,            -- ultimo contador de pujas (solo subastas)
  quantity       INTEGER,            -- ultima cantidad disponible (listings multiples)
  seller         TEXT,               -- username del vendedor: clave para detectar relistados
  first_seen     TEXT NOT NULL,      -- primer dia observado (nuestro reloj, no el de eBay)
  last_seen      TEXT NOT NULL,      -- ultimo dia observado
  last_status    TEXT NOT NULL,      -- 'active' | 'ended' | lo que declare la fuente
  PRIMARY KEY (listing_id, source)   -- el mismo id sintetico de fixture no debe chocar con eBay
);
CREATE INDEX IF NOT EXISTS idx_gl_instrument ON graded_listings(instrument_key);
CREATE INDEX IF NOT EXISTS idx_gl_seller     ON graded_listings(seller);

-- El archivo: una fila por listing y dia observado. Solo lo que CAMBIA con el
-- tiempo (precio, pujas, cantidad, estado); lo estable vive en graded_listings.
CREATE TABLE IF NOT EXISTS listing_observations (
  listing_id  TEXT NOT NULL,
  observed_at TEXT NOT NULL,         -- dia UTC de NUESTRA captura: el unico reloj valido
  price       REAL,                  -- ask del dia; en subastas, puja mas alta del dia
  bid_count   INTEGER,
  quantity    INTEGER,               -- el decremento entre dias = venta parcial confirmada
  status      TEXT NOT NULL,         -- 'active' | 'ended'
  PRIMARY KEY (listing_id, observed_at)  -- una observacion por dia; recargar es idempotente
);
CREATE INDEX IF NOT EXISTS idx_lo_date ON listing_observations(observed_at);

-- Ventas INFERIDAS por el motor de ciclo de vida (services/graded/infer.py).
-- No son hechos: son conclusiones con evidencia adjunta (decision 3).
CREATE TABLE IF NOT EXISTS inferred_sales (
  listing_id     TEXT NOT NULL,
  instrument_key TEXT,               -- copiado del listing al inferir: las consultas de
                                     -- precio por instrumento no deben necesitar JOIN
  inferred_at    TEXT NOT NULL,      -- cuando corrio el motor (as_of): auditable y reproducible
  sale_date_est  TEXT,               -- estimacion puntual; el intervalo real va en detail
  price_est      REAL,               -- precio estimado en la divisa del listing
  method         TEXT NOT NULL,      -- auction_confirmed | fixed_disappeared |
                                     -- best_offer_estimated | quantity_decrement
  confidence     REAL NOT NULL,      -- [0,1]; ORDINAL hasta calibrar con Terapeak, no
                                     -- probabilidad medida. Umbral de entrada al modelo
                                     -- se decide aguas abajo, aqui se guarda todo.
  detail         TEXT,               -- JSON con la evidencia completa: trayectoria de
                                     -- precios, pujas, ventana de relistado comprobada,
                                     -- factor de descuento aplicado, etc.
  -- Un listing multiple genera varias ventas parciales en dias distintos, y ademas
  -- puede cerrar con una venta final por otro metodo: por eso la PK lleva los tres.
  PRIMARY KEY (listing_id, sale_date_est, method)
);
CREATE INDEX IF NOT EXISTS idx_is_instrument ON inferred_sales(instrument_key, sale_date_est);
