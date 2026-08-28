# Pokémon Card Price Intelligence — Plan técnico (v2)

> Documento de propuesta para revisión. Nada implementado todavía.
> Fecha: 2026-08-25 · Revisión 2, tras decisiones de alcance

## Decisiones tomadas

| Decisión | Valor | Consecuencia |
|---|---|---|
| Presupuesto de datos | **0 €** | Solo fuentes abiertas. Histórico se construye desde cero. |
| Alcance | **Todo denso desde el día 1** | Raw: sí, viable. Graded: por niveles (ver §3.3). |
| Producto | **Público, con usuarios** | Las licencias de datos importan. Auth, ToS, disclaimers. |
| Credenciales | **Ninguna** | Hay 2 cuentas gratuitas que abren mucho (§4.4). |
| Objetivo declarado | **"Hacer nuestro propio Alt"** | Construimos la base de datos de ventas graded nosotros (§5). |

---

## 1. Lo que he entendido

Una aplicación web pública que:

1. Catalogue **todas las cartas de todas las ediciones** (EN + JP + resto), con imágenes y metadatos.
2. Ingiera precios y ventas de múltiples mercados (Cardmarket EU, TCGplayer US, eBay graded).
3. Construya un **histórico temporal propio**.
4. Encuentre patrones por: edición, tipo, Pokémon, **artista/ilustrador**, rareza, antigüedad, población gradeada, estacionalidad, meta, eventos.
5. Prediga qué cartas subirán y cuáles bajarán, con horizonte y explicación.

El **artista/ilustrador** entra como feature de primer nivel, más una feature derivada de **premium histórico medio por artista**, que es aún más predictiva.

---

## 2. La noticia buena: Cardmarket sí es viable, gratis y legalmente limpio

La API oficial de Cardmarket está cerrada a nuevos solicitantes, sí. Pero:

> ### **TCGdex** resuelve el problema entero.
> - **Licencia MIT, código abierto**, sin API key, sin límite de rate publicado.
> - Incluye **precios de Cardmarket (EUR) y TCGplayer (USD)** en cada respuesta de carta, sin endpoint aparte.
> - Incluye **ilustrador**, imágenes, 14 idiomas, y los sets japoneses que otras APIs cubren mal.
> - REST + GraphQL.

Esto significa que **el snapshot diario de precios raw de todo el catálogo es gratis, legal y apto para un producto público comercial** desde el día 1. Es la pieza que hace que el proyecto sea viable con 0 €.

### Aviso legal importante

**pokemontcg.io es de uso NO comercial en su tier gratuito** (ahora forma parte de Scrydex). Como esto va a ser un producto público:

- **TCGdex = fuente primaria en producción.** MIT, sin restricción comercial.
- **pokemontcg.io = solo verificación cruzada en desarrollo.** No se sirve en producción ni se monetiza sobre ella.

Esta distinción está bien marcada en el código: adaptadores separados, y el de pokemontcg.io con un flag que impide usarlo en producción.

### Limitación conocida de TCGdex

Su matching contra Cardmarket/TCGplayer se hace por ID de carta, y a veces dos impresiones distintas del mismo Pokémon acaban apuntando al mismo listing → precios idénticos donde no deberían serlo. Cartas antiguas EX/Full Art pueden no tener precio.

**Mitigación:** nuestra propia capa de resolución de identidad (§6) detecta y marca estos casos. Los instrumentos con precio sospechosamente idéntico se marcan `confidence: low` y **no entran al modelo**.

---

## 3. Alcance real con 0 €

### 3.1. Raw (sin gradear) — denso al 100% desde el día 1 ✅

**Verificado contra la API real el 2026-08-25**, no estimado:

| Hecho medido | Valor |
|---|---|
| Cartas en inglés | **23.546** (218 sets) |
| Cartas en japonés | **18.031** (184 sets) |
| **Total EN + JA** | **41.577** |
| Cobertura de precio Cardmarket | **91 %** de las cartas |
| Cobertura de precio TCGplayer | **85 %** |
| Cobertura de ilustrador | **96 %** |
| Rendimiento medido | **53 req/s** con 12 hilos, 120/120 sin error |
| **Coste del snapshot diario completo** | **~13 minutos/día** |

⚠️ **Corrección respecto a la v1 de este documento.** Había estimado "~100 peticiones/día" asumiendo
que los precios venían en los endpoints masivos. **No es así:**

- `/v2/en/cards` devuelve 23.546 cartas en **una** petición (2,3 MB, 0,5 s) pero **solo `id`, `localId` y `name`**.
- `/v2/en/sets/{id}` tampoco trae precios.
- **GraphQL no expone el campo `pricing` en absoluto** (verificado por introspección del esquema).
- Los precios existen **únicamente** en el endpoint REST por carta: `/v2/{lang}/cards/{id}`.

**Conclusión: son ~41.600 peticiones/día, no ~100.** La buena noticia es que sigue siendo perfectamente
viable: **13 minutos diarios** a un ritmo comedido. Pero cambia el diseño del worker (concurrencia,
reintentos, backoff) y obliga a ser buen ciudadano de una API abierta y gratuita: nos autolimitamos
a ~50 req/s, mandamos User-Agent identificable y usamos `If-None-Match` con los ETags que devuelve.

**Datos que obtenemos por carta:** `illustrator`, `rarity`, `variants` (firstEdition, holo, normal,
reverse, wPromo), `dexId`, `hp`, `stage`, `evolveFrom`, `types`, `legal`, imagen, y el bloque `pricing`:

- **Cardmarket (EUR):** `avg`, `low`, `trend`, `avg1`, `avg7`, `avg30` + las mismas en variante `-holo`, con `updated` en ISO-8601.
- **TCGplayer (USD):** por variante (`holofoil`, `normal`, `reverseHolofoil`…) con `lowPrice`, `midPrice`, `highPrice`, `marketPrice`, `directLowPrice`.

> **Aviso de calidad de dato encontrado en la verificación.** En Charizard de Base Set: `avg1` = 1.552 €
> frente a `avg30` = 445 € y `low` = 102 €. **`avg1` es ruido puro** (una o dos ventas, sin filtrar
> outliers) y **`low` corresponde a copias dañadas**, no al valor de mercado. Ninguno de los dos
> sirve como precio de referencia. El sistema debe usar `trend` y `avg7`/`avg30`, y tratar `avg1`
> como señal de volatilidad, jamás como precio.

> **El campo `pricing.updated` es oro para la corrección point-in-time**: nos da el instante exacto
> en que ese precio era conocido. Es exactamente lo que necesita el feature store para no cometer
> fuga de información.

### 3.2. Graded — por niveles, y aquí está el trabajo de verdad

Denso total sería `20.000 cartas × 4 gradeadoras × 10 grados × idiomas` = **millones de instrumentos**. Con la cuota gratuita de eBay Browse (5.000 llamadas/día) eso es imposible.

**Con 0 € no se puede hacer graded denso desde el día 1. Es la única parte de tu petición que no puedo entregar tal cual, y prefiero decirlo claro.**

Lo que sí entrego, priorizado por valor:

| Nivel | Qué incluye | Frecuencia |
|---|---|---|
| **T1** | ~2.000 instrumentos de alto valor (vintage holos, alt-arts modernas, PSA 9/10) | Diaria |
| **T2** | ~10.000 instrumentos de valor medio | Cada 3 días |
| **T3** | Resto del catálogo | Semanal / bajo demanda |

Promoción y degradación **automáticas** según volumen y valor observados. La cobertura crece sola con el tiempo. Y la cuota de eBay se puede ampliar gratis solicitándolo, lo que sube todos los niveles.

### 3.3. Consecuencia honesta

El producto que sale de esto es **excelente en raw desde el mes 1** y **bueno en graded creciendo mes a mes**. No hay atajo con 0 €. La alternativa sería 100-200 €/mes en un proveedor, que es exactamente lo que has descartado — decisión perfectamente razonable, solo dejo claro el trade-off.

---

## 4. Fuentes de datos (todas gratuitas)

| Fuente | Aporta | Licencia / límite | Uso |
|---|---|---|---|
| **TCGdex** | Catálogo, imágenes, **ilustrador**, 14 idiomas, **precios Cardmarket + TCGplayer** | MIT, sin key | **Primaria, producción** |
| **eBay Browse API** | Listings graded activos: asks, oferta, spread | Gratis, OAuth, ~5k/día | Primaria, producción |
| **PSA Pop Report** | Población por grado, gem rate | Público, acceso respetuoso | Secundaria |
| **Limitless TCG** | Decklists de torneos → señal de meta | Público | Secundaria |
| **BCE / ECB** | FX EUR/USD/JPY | Público | Soporte |
| **Calendario de sets** | Releases, rotaciones, reprints | Construido por nosotros | Soporte |
| **pokemontcg.io** | Verificación cruzada | ⚠️ **No comercial** | **Solo desarrollo** |

### 4.4. Dos cuentas gratuitas que deberías crear (10 minutos, cambian mucho)

1. **Cuenta de desarrollador eBay** — gratis. Desbloquea la Browse API, que es la base de todo el módulo graded. **Sin esto, no hay "Alt propio".**
2. **Cuenta de vendedor eBay** — gratis. Desbloquea **Terapeak**, que da **~3 años de histórico de ventas cerradas**. Es la única forma gratuita de tener pasado en graded, y además es lo que usaremos para **calibrar y validar** el estimador de §5. Export manual, pero de altísimo valor.

> Es la acción de mayor retorno por esfuerzo de todo el proyecto: 0 €, 10 minutos, y resuelve el problema del arranque en frío del histórico graded.

---

## 5. Cómo construimos nuestro propio Alt con 0 €

Alt agrega ventas de eBay, MySlabs y subastas. eBay cerró su API de ventas cerradas en 2026. Scrapear resultados vendidos de eBay va contra sus ToS, y siendo un producto público no lo voy a hacer.

**La solución: inferencia por ciclo de vida de listing.** No necesitamos la API de ventas — la derivamos observando los listings activos día a día.

```
Día N   → Browse API: listing #123, PSA 10 Charizard, 4.200 $, vendedor X
Día N+1 → listing #123 ya no está
          ¿vendido? ¿retirado? ¿relistado?
```

**Motor de desambiguación:**

| Señal | Interpretación |
|---|---|
| Desaparece y no reaparece del mismo vendedor en 14 días | **Venta probable** ≈ último ask |
| Reaparece: mismo vendedor + título similar + precio parecido | **Relistado**, no venta |
| Subasta que termina sin pujas | **No vendido**, descartar |
| Subasta con pujas | **Venta confirmada** al precio final |
| Baja de precio progresiva y luego desaparece | Venta con **Best Offer** → estimar ask × factor de descuento observado |
| Caída del contador de cantidad en listing múltiple | **Venta confirmada** parcial |

Cada evento inferido lleva un **score de confianza**. Los de baja confianza no entran al modelo.

**Calibración contra verdad de campo:** exportamos una muestra real de Terapeak y ajustamos el estimador contra ella (¿qué % de desapariciones son ventas reales? ¿qué descuento medio aplica Best Offer?). Sin este paso el estimador es una suposición; con él, es un instrumento medido, con error conocido y publicable.

**Esto es lo que nos convierte en un Alt propio**, y es defendible: no scrapeamos nada prohibido, solo observamos datos públicos que la API oficial nos entrega, a lo largo del tiempo.

---

## 6. Stack tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│  WEB  ·  Next.js 15 (App Router) + TypeScript + Tailwind    │
│         shadcn/ui · TanStack Query · visx                   │
│         Clerk (auth, free hasta 10k MAU)                    │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────┴─────────────────────────────────┐
│  API  ·  Next.js Route Handlers  +  FastAPI (scoring)       │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────┴─────────────────────────────────┐
│  DATOS                                                       │
│  Neon Postgres + pgvector  → catálogo, series, usuarios      │
│  Parquet en R2 + DuckDB    → data lake, backtesting          │
│  Upstash Redis             → caché, rate limiting, colas     │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────┴─────────────────────────────────┐
│  INGESTA (Python) · httpx + Pydantic + Polars                │
│  Workers en Fly.io · cron en GitHub Actions                  │
└───────────────────────────┬─────────────────────────────────┘
┌───────────────────────────┴─────────────────────────────────┐
│  ML · Polars · LightGBM · scikit-learn · MLflow · SHAP       │
│       CLIP (embeddings de arte) · Optuna                     │
└─────────────────────────────────────────────────────────────┘
```

### Decisiones y por qué

**Monorepo** pnpm + Turborepo: `apps/web`, `packages/db`, `services/ingest`, `services/ml`.

**Dos lenguajes, cada uno en su zona de fuerza.** TypeScript para web y API de servicio. Python para ingesta y ML — Polars + LightGBM + MLflow no tienen equivalente serio en Node. Contrato entre ambos: **el esquema de base de datos**, del que se generan tipos para los dos lados desde la misma migración.

**Neon Postgres** como fuente de verdad. ~40.000 instrumentos × diario × 5 años ≈ 73M filas: Postgres particionado por mes lo lleva sobrado. El branching de Neon permite probar migraciones sobre datos reales, que a este volumen vale oro. *Escape hatch:* si algún día vamos a granularidad horaria, la capa de series está aislada y se migra a ClickHouse sin tocar el resto.

**Parquet en R2 + DuckDB** para research. Backtestear años × cientos de features contra Postgres es lento y caro; contra Parquet columnar con DuckDB es instantáneo y gratis. Patrón estándar en quant: Postgres para servir, Parquet para investigar.

**pgvector** para embeddings CLIP del arte → "cartas visualmente similares" y features de estilo artístico.

**Gradient boosting, no deep learning.** Con este tamaño de dataset LightGBM sobre features tabulares gana casi siempre. El DL se reserva para embeddings de imagen.

**Sin Kubernetes, sin Kafka, sin Airflow.** Sobreingeniería a este volumen. Cron + colas Redis + workers Fly.io.

---

## 7. Modelo de datos

### 7.1. El concepto clave: **instrumento**

Una carta no tiene un precio. Lo que tiene precio es un instrumento:

```
instrumento = (card_id, idioma, acabado, estado/grado, gradeadora)
```

- `sv4pt5-231 · EN · alt-art · raw-NM · —`
- `sv4pt5-231 · EN · alt-art · 10 · PSA`
- `base1-004 · EN · holo-1st-edition · 9 · BGS`

### 7.2. Esquema

```sql
-- CATÁLOGO
sets(id, code, name, series, release_date, card_count, language, is_reprint_set)
cards(id, set_id, number, name, rarity, supertype, subtypes[], pokemon_species,
      generation, hp, types[], evolution_stage, artist, artwork_style,
      image_small, image_large, image_embedding vector(512), national_dex_no)
artists(id, name, card_count, debut_date, avg_premium)

-- IDENTIDAD ENTRE FUENTES
source_product_map(source, source_id, card_id, variant, confidence, method, verified_at)

-- INSTRUMENTOS Y SERIES
instruments(id, card_id, language, finish, grade, grader, liquidity_tier)
price_snapshots(instrument_id, source, ts, low, avg, trend, avg7, avg30,
                listings_count, currency)              -- PARTICIONADA POR MES
listings(id, instrument_id, source, source_listing_id, seller, price,
         first_seen, last_seen, is_auction, bid_count, quantity)
inferred_sales(instrument_id, sold_at, price, confidence, method, listing_id)
population(card_id, grader, grade, count, as_of)

-- DERIVADO
market_index(ts, segment, value)
features(instrument_id, ts, feature_name, value)        -- POINT-IN-TIME
signals(instrument_id, ts, signal_type, score, horizon_days, explanation jsonb)
predictions(instrument_id, ts, horizon_days, expected_return, confidence, model_version)
```

> **Regla innegociable: `features` y `predictions` son point-in-time.**
> Cada fila lleva el timestamp en que ese dato **era conocido**, no al que se refiere.
> Sin esto el backtest miente, el modelo parece genial en test y falla en producción.
> Es el error nº1 en este tipo de proyectos.

---

## 8. Resolución de identidad

Cruzar TCGdex ↔ Cardmarket ↔ TCGplayer ↔ títulos libres de eBay es **un subproyecto**, no un detalle. Un título de eBay real: `"Charizard VMAX 020/189 Alt Art PSA 10 GEM MINT Darkness Ablaze"`.

1. **Determinista** — `set_code + collector_number + language`. ~85%.
2. **Fuzzy + reglas** — normalización de nombres, regex de variantes (holo/reverse/1st/shadowless/stamped), embeddings de texto. ~12%.
3. **Cola de revisión manual** — UI interna, cartas caras primero. ~3%. Cada decisión alimenta las reglas.

Más un **detector de colisiones** para el problema conocido de TCGdex: si dos instrumentos distintos muestran precios idénticos durante N días, se marcan y quedan fuera del modelo.

---

## 9. Features

**Intrínsecas** — edición, serie, fecha de release, antigüedad, rareza, supertipo, especie de Pokémon, generación, etapa evolutiva, HP, tipos, **artista**, estilo de arte (full art / alt art / secret / rainbow / gold / texturizada), idioma, era de impresión, 1st edition / shadowless / unlimited, promo vs set, número fuera de set, embedding CLIP del arte.

**Demanda** — índice de popularidad del Pokémon (el premium Charizard/Umbreon/Pikachu es medible), jugabilidad competitiva (Limitless), eventos y anuncios, **premium histórico medio del artista**.

**Oferta** — población PSA/CGC/BGS por grado, **velocidad de población** (slabs nuevos/mes → dilución), gem rate, en imprenta vs descatalogado, **riesgo de reprint**.

**Microestructura** — nº de listings activos, spread (ask mínimo vs venta reciente), velocidad de aparición/desaparición, sell-through, días hasta venta, dispersión, **arbitraje EU↔US ajustado por FX y comisiones**, **spread raw→graded**, pendiente de la escalera de grados (múltiplo PSA9→PSA10).

**Temporales** — retornos 7/30/90/180/365d, momentum, volatilidad, cruces de medias, drawdown desde máximo, estacionalidad, tendencia de volumen.

**Transversales** — valor relativo vs. su cohorte (mismo set + rareza), vs. el mismo Pokémon en otros sets, vs. el mismo artista en otras cartas, vs. el índice de mercado.

### El punto que casi todos se saltan

> La mayor parte del movimiento de precio de una carta es **beta del mercado**, no algo específico de esa carta. Un modelo que predice "todo sube" no vale nada.

Construimos un **índice de mercado Pokémon** por segmentos (vintage, moderno, sellado, graded) y modelamos el **retorno relativo al índice (alpha)**. Esto separa un producto útil de un gráfico bonito.

---

## 10. Modelado

**Objetivo:** log-retorno futuro a horizonte h ∈ {7, 30, 90} días, **residualizado contra el índice de mercado**.

**Formulación:** ranking cross-sectional. Cada día, ordenar todos los instrumentos por retorno esperado. Es el marco de factores en renta variable cuantitativa, y encaja mucho mejor que la regresión pura.

- **Modelo:** LightGBM (LambdaRank para ranking, regresión para magnitud). Variante de clasificación: `P(retorno > +5% en 30d)`.
- **Validación:** walk-forward con **purga y embargo**. Nunca k-fold aleatorio: filtra futuro.
- **Explicabilidad:** SHAP en cada predicción. La UI **siempre** dice por qué: *"población PSA10 creciendo 12%/mes + reimpresa en set reciente → bajista"*. Sin explicación nadie confía en el número.
- **Backtest con costes reales:** comisiones (~5%), envío, spread, iliquidez, coste y tiempo de gradeo. Una señal que muere tras costes no es una señal.
- **Baseline obligatorio:** momentum + velocidad de población. **Si el ML no lo bate en walk-forward, no se publica el ML.**

### Orden de fiabilidad de lo que vamos a vender

| Señal | Tipo | Fiabilidad |
|---|---|---|
| Arbitraje raw→graded | Determinista | Alta |
| Arbitraje EU↔US (FX + fees) | Determinista | Alta |
| Dilución por población | Casi determinista | Alta |
| Riesgo de reprint | Reglas + calendario | Media-alta |
| Momentum / reversión a la media | Estadístico | Media |
| Estacionalidad | Estadístico | Media |
| Predicción pura de retorno a 30d con ML | Modelo | Baja-media |

**Enviamos primero las deterministas.** Ya son un producto útil sin ML.

---

## 11. Producto

1. **Explorador** — todas las cartas, todas las ediciones, imágenes hi-res. Filtros por set, rareza, tipo, **artista**, Pokémon, idioma, precio.
2. **Ficha de carta** — imagen grande, metadatos, gráfico multi-mercado y multi-grado, población, ventas recientes, señales con explicación.
3. **Screener** — la pantalla estrella. Ordenar el mercado entero por señal.
4. **Comparador** — carta vs carta, artista vs artista, set vs set.
5. **Índices de mercado** — el "S&P" del hobby por segmentos.
6. **Watchlist + alertas** — email/push al dispararse una señal.
7. **Portfolio** — qué tienes, cuánto vale, cómo evoluciona.
8. **Backtest visual** — *"¿qué habría pasado si hubiera seguido esta señal el último año?"* Genera más confianza que cualquier métrica.

---

## 12. Fases

### Fase 0 — Fundamentos + captura (semana 1) 🔴 URGENTE
- Monorepo, CI, Neon, migraciones.
- Ingesta completa de TCGdex: todas las cartas, todos los sets, imágenes, **artista**, precios Cardmarket + TCGplayer.
- **Snapshot diario en producción.** Aunque no haya UI.
- *Cada día de retraso es un día de histórico perdido para siempre.*

### Fase 1 — Graded + identidad (semanas 2–4)
- Cuentas eBay (dev + vendedor). Adaptador Browse API.
- **Motor de inferencia por ciclo de vida de listing** (§5).
- Calibración contra muestra de Terapeak.
- Resolución de identidad + detector de colisiones + cola de revisión.
- *Entregable: base de datos propia de ventas graded. El "Alt propio".*

### Fase 2 — Producto visible (semanas 5–6)
- Explorador + ficha + gráficos. Clerk. ToS y disclaimers.
- *Entregable: app pública usable, sin predicciones todavía. Ya tiene valor.*

### Fase 3 — Señales deterministas (semanas 7–9)
- Índice de mercado. Feature store point-in-time.
- Arbitraje raw→graded, EU↔US, dilución, riesgo de reprint, estacionalidad.
- Screener + alertas.
- *Entregable: el producto que de verdad da dinero al usuario, sin ML.*

### Fase 4 — ML (semanas 10–14)
- Data lake Parquet, research con DuckDB.
- Baseline → LightGBM → walk-forward → backtest con costes → SHAP.
- Publicación **solo si bate al baseline**.

### Fase 5 — Escala
- Más idiomas y sets JP, sellado, API pública, móvil, ampliación de cuota eBay.

---

## 13. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Sin histórico al arrancar** | Alto | Captura desde día 1 + Terapeak para bootstrap graded + Fase 3 no necesita histórico largo |
| **TCGdex cambia licencia o cae** | Alto | Es MIT y open source: podemos hacer fork de la base de datos. Capa de adaptadores. |
| **Colisiones de precio en TCGdex** | Medio | Detector de colisiones + exclusión del modelo |
| **Estimador de ventas graded sesgado** | Alto | Calibración contra Terapeak + score de confianza + publicar el error |
| **Lookahead bias → modelo falso** | Crítico | Features point-in-time + walk-forward con purga |
| **Cuota eBay insuficiente** | Medio | Niveles de liquidez + solicitar ampliación (gratis) |
| **Legal (producto público)** | Medio | Solo fuentes MIT/abiertas. pokemontcg.io fuera de producción. Atribución. Disclaimer: no es asesoramiento financiero. |
| **ML no supera al baseline** | Medio | Previsto: se envían las deterministas, que sí funcionan |

---

## 14. Coste

| Concepto | Fase de desarrollo | Producto público |
|---|---|---|
| Datos | **0 €** | **0 €** |
| Neon | 0 € | 0–25 € |
| Vercel | 0 € (Hobby) | ⚠️ 20 € (Hobby no permite uso comercial) |
| Fly.io workers | 0–5 € | 5–20 € |
| Cloudflare R2 | 0 € | ~1 € |
| Upstash Redis | 0 € | 0–10 € |
| Clerk | 0 € | 0 € hasta 10k MAU |
| **Total** | **~0 €** | **~25–75 €/mes** |

Los datos salen gratis. El coste aparece solo al abrir al público, y es modesto.

---

## 15. Lo único que necesito de ti

Crear dos cuentas gratuitas de eBay (**desarrollador** y **vendedor**). 10 minutos, 0 €, y son lo que hace posible el módulo graded y el arranque en frío del histórico. Todo lo demás lo puedo montar sin credenciales.
