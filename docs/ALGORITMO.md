# El algoritmo — casuísticas reales del mercado y cómo predecir

> Documento núcleo del proyecto. Fecha: 2026-08-25

---

# PARTE 1 — Cómo lo hace Alt, y cómo lo replicamos gratis

## 1.1. Qué hace Alt realmente

Alt Value, según su propia documentación:

- **~20 millones de transacciones** analizadas.
- Cuando hay **datos abundantes** para una carta → el valor se acerca a la **media de transacciones recientes**.
- Cuando hay **datos escasos** → usa **transacciones comparables como anclas**, "como haría un experto del hobby".
- Un modelo de ML aplica **ajustes que compensan las diferencias** entre la carta valorada y cada comparable, para hacer una comparación equivalente.
- **Ajusta los comparables antiguos** por la tendencia de mercado ocurrida desde entonces.
- Se actualiza **a diario** y **muestra los comparables usados**.

Traducido a lo que es técnicamente: **regresión hedónica + vecinos más cercanos con ajuste temporal**. Es el Zestimate de Zillow, aplicado a cartas.

## 1.2. La distinción crítica que nos da la oportunidad

> ### Alt Value responde **"¿cuánto vale esta carta HOY?"**
> ### Nosotros queremos responder **"¿va a subir o bajar MAÑANA?"**
>
> **Son dos problemas distintos. Alt solo resuelve el primero.**

Necesitamos los dos, en este orden:

| Capa | Pregunta | Equivalente |
|---|---|---|
| **Valoración** | ¿Cuánto vale hoy? | Alt Value / Zestimate |
| **Predicción** | ¿Cómo se moverá? | **Nuestra diferenciación** |

Sin la capa de valoración la predicción no tiene sobre qué operar. Con solo la valoración, tienes Alt.

## 1.3. Nuestro "Alt Value" gratis

Alt tiene 20M de transacciones porque es un marketplace: ve sus propias ventas. Nosotros no. Nuestras transacciones vienen del **motor de inferencia por ciclo de vida de listing** (ver `PLAN.md` §5). Menos volumen, con ruido, pero suficiente si el modelo lo tiene en cuenta.

```
V(i,t) = Σ_c  w(c) · P(c) · ajuste_temporal(c,t) · ajuste_features(c,i)
         ───────────────────────────────────────────────────────────
                              Σ_c w(c)

w(c) = decaimiento_recencia(c) × similitud(c,i) × confianza_venta(c)
```

- **`similitud(c,i)`** — distancia en espacio de features: mismo Pokémon > mismo set > misma rareza > mismo artista > misma era > mismo grado.
- **`ajuste_temporal`** — un comp de hace 3 meses se corrige por lo que hizo el **índice de mercado** de su segmento desde entonces. Esto es exactamente lo que dice hacer Alt.
- **`ajuste_features`** — modelo hedónico (LightGBM sobre `log(precio)`) que cuantifica cuánto vale cada diferencia: "PSA 9 → PSA 10 en esta cohorte multiplica ×3,4".
- **`confianza_venta`** — nuestro score de inferencia. Las ventas dudosas pesan menos. Alt no necesita esto; nosotros sí, y es lo que hace el sistema honesto.

**Salida:** valor + intervalo de confianza + los comparables usados, visibles. La transparencia no es cosmética: es lo que hace auditable un modelo entrenado sobre datos inferidos.

---

# PARTE 2 — Catálogo de casuísticas reales del mercado

Cada casuística: **mecanismo → señal observable en nuestros datos → dirección → plazo → fiabilidad.**

Esto es la materia prima del algoritmo. Cada fila se convierte en un factor numérico.

## A. Ciclo de vida del set

| # | Casuística | Mecanismo | Señal observable | Dir. | Plazo | Fiab. |
|---|---|---|---|---|---|---|
| A1 | **Hype de preventa** | Preventa sin oferta real, precios anclados en expectativas | Precio pre-release vs media histórica de preventas | ⬆️ | −30 a 0 d | Media |
| A2 | **Inundación post-release** | Apertura masiva de sobres las primeras semanas | Días desde release < 60 + listings creciendo rápido | ⬇️⬇️ | 0 a 60 d | **Alta** |
| A3 | **Suelo post-release** | La apertura cae, se absorbe el exceso | Listings se estabilizan, mes 2–4 | ➡️ | 60–120 d | Alta |
| A4 | **Descatalogación (OOP)** | El set deja de imprimirse, la oferta se seca | Fin de impresión + listings decreciendo mes a mes | ⬆️ | 12–36 m | **Alta** |
| A5 | **Maduración vintage** | Escasez estructural + nostalgia acumulada | Edad > 10 años + pop estable | ⬆️ | Años | Alta |

> **A2 es la casuística más rentable y la más ignorada.** Comprar en preventa es casi siempre mala idea; el suelo llega semanas después. Un producto que solo dijera "espera 6 semanas" ya aportaría valor.

## B. Oferta y escasez

| # | Casuística | Mecanismo | Señal observable | Dir. | Plazo | Fiab. |
|---|---|---|---|---|---|---|
| B1 | **Dilución por población** | Más slabs = menos escasez | Pop PSA10 creciendo **>20 %/mes** | ⬇️⬇️ | 1–6 m | **Muy alta** |
| B2 | **Saturación de población** | Por encima de cierto umbral la prima desaparece | Pop10 > 5.000 → prima comprimida; > 10.000 → sin prima | ⬇️ | Estructural | **Muy alta** |
| B3 | **Población estable** | Oferta sellada | Crecimiento < 1 %/mes | ⬆️ | Sostenido | Alta |
| B4 | **Reprint anunciado** | Oferta futura garantizada | Anuncio oficial en el calendario | ⬇️⬇️⬇️ | Inmediato | **Muy alta** |
| B5 | **Reprint en producto especial** | Celebrations, UPC, 151, sets de aniversario | La carta aparece en un set nuevo | ⬇️⬇️ | 0–90 d | **Muy alta** |
| B6 | **Gem rate bajo** | Difícil de sacar 10 → PSA10 escaso de forma permanente | pop10 / pop_total < 15 % | ⬆️ | Estructural | Alta |
| B7 | **Oleada de gradeo** | Promo de PSA o bajada de precio → avalancha de slabs 3–6 meses después | Anuncio de promo de gradeo | ⬇️ | +3 a +6 m | Media-alta |

> **B1 + B2 juntas son la señal bajista más fiable de todo el mercado.** Casi determinista y casi nadie la vigila sistemáticamente.

## C. Demanda

| # | Casuística | Mecanismo | Señal observable | Dir. | Plazo | Fiab. |
|---|---|---|---|---|---|---|
| C1 | **Prima de Pokémon** | Charizard, Pikachu, Umbreon, Mewtwo, Lugia, Rayquaza, Gengar, Eeveelutions | Especie + prima histórica medida de esa especie | ⬆️ | Estructural | **Alta** |
| C2 | **Prima de artista** | Arita, sowsow, Yuka Morii, AKIRA EGAWA… | Campo `artist` + prima histórica media del artista | ⬆️ | Estructural | Alta |
| C3 | **Estilo de arte** | Alt art / SIR / SAR > full art > regular | Rareza + patrón de arte | ⬆️ | Estructural | **Alta** |
| C4 | **Jugabilidad competitiva** | Carta en decks ganadores → demanda de jugadores | Apariciones en decklists de Limitless, tendencia | ⬆️ | 0–60 d | Media-alta |
| C5 | **Rotación** | La carta deja de ser legal en torneo | Fecha de rotación del calendario | ⬇️⬇️ | Inmediato | **Alta** |
| C6 | **Arte sobrevive, juego no** | Tras rotar, las cartas de arte se recuperan; las de juego no | Interacción C3 × C5 | mixto | 3–12 m | Alta |
| C7 | **Nostalgia / aniversario** | Sets de aniversario, efemérides | Calendario | ⬆️ | Estacional | Media |
| C8 | **Aparición en anime/juego/película** | Un Pokémon se vuelve visible | Calendario de eventos + anuncios | ⬆️ | 0–30 d | Media |
| C9 | **Influencer / viral** | Pico rápido por atención | Salto anómalo de volumen sin cambio de oferta | ⬆️ luego ⬇️ | 0–14 d, revierte | **Baja-media** |

> **C9 es una trampa.** Los picos por atención revierten. Un modelo ingenuo de momentum compra justo en el máximo. Nuestro sistema debe **detectar y penalizar** el pico de atención, no perseguirlo.

## D. Estructura de mercado y arbitraje

| # | Casuística | Mecanismo | Señal observable | Dir. | Plazo | Fiab. |
|---|---|---|---|---|---|---|
| D1 | **Arbitraje raw→graded** | `P(PSA10) − P(raw) − coste_gradeo` > 0 y gem rate decente | Ambos precios + coste + gem rate | Acción | 45–90 d | **Muy alta** |
| D2 | **Arbitraje EU↔US** | Cardmarket EUR vs TCGplayer USD tras FX y comisiones | Ambos precios + FX + fees | Acción | Días | **Muy alta** |
| D3 | **Escalera de grados** | El múltiplo PSA9→PSA10 anómalo señala mal precio | Ratio vs. la mediana de su cohorte | mixto | Semanas | Alta |
| D4 | **Spread e iliquidez** | Spread ancho = precio poco fiable | (ask_min − venta_media) / venta_media | Filtro | — | Alta |
| D5 | **JP adelanta a EN** ⭐ | Japón publica los sets **meses antes**. Si las SR japonesas se venden bien, las inglesas también lo harán | Precio y tendencia del equivalente japonés | ⬆️/⬇️ | **1–6 meses de antelación** | **Alta** |
| D6 | **Prima entre gradeadoras** | PSA > CGC ≈ BGS en Pokémon | Mismo grado, distinta gradeadora | Arb. | Semanas | Alta |
| D7 | **Prima estructural JP** | Cartas japonesas +15–40 % sobre inglesas en alta rareza | Idioma + rareza | ⬆️ | Estructural | Alta |

> ### D5 es la mejor señal gratuita que existe.
> Los sets japoneses salen meses antes que los ingleses. **El futuro del mercado inglés ya es observable en el japonés.** Y TCGdex cubre los sets japoneses gratis. Esto es, con diferencia, el mayor alpha disponible a coste cero.

## E. Macro y mercado

| # | Casuística | Mecanismo | Señal observable | Dir. | Plazo | Fiab. |
|---|---|---|---|---|---|---|
| E1 | **Beta de mercado** | La mayor parte del movimiento es del hobby entero | Índice de mercado por segmento | — | — | **Crítica** |
| E2 | **Ciclo de hype** | Subida → FOMO → pico → pánico → sobreoferta → suelo → recuperan las fuertes, mueren las débiles | Fase del índice + volatilidad + volumen | Ciclo | Meses | Media-alta |
| E3 | **Estacionalidad navideña** | Nov–Dic **+10–20 %** por regalo; Ene–Feb **−15–25 %** por reventa | Mes del año | ⬆️/⬇️ | Anual | **Alta** |
| E4 | **Divisa** | Cardmarket en EUR, eBay en USD, Japón en JPY | Tipos de cambio del BCE | — | — | Alta |
| E5 | **Precedente histórico** | Boom COVID 2020-21; corrección 2022-23 de **−40 a −70 %** | Régimen del índice | — | Años | Contexto |

> **E1 no es una señal, es una corrección obligatoria.** Si no separamos beta de alpha, el modelo aprende a decir "todo sube" en un mercado alcista y se derrumba al girar. Todo lo que predecimos es **alpha**.

## F. Idiosincrásicas

| # | Casuística | Señal | Dir. | Fiab. |
|---|---|---|---|---|
| F1 | **Errores de impresión / miscuts** | Fuera de catálogo, sube por título de listing | ⬆️ | Baja (raro) |
| F2 | **Sellos de torneo, promos, staff** | Metadatos de variante | ⬆️ | Media |
| F3 | **Récord de subasta** | Una venta récord reancla todo el segmento | ⬆️ | Media |
| F4 | **Cambio de política de gradeadora** | Nuevos criterios → cambia el gem rate | mixto | Media |

---

# PARTE 3 — El algoritmo

## 3.1. Arquitectura en cinco capas

```
   ┌──────────────────────────────────────────────────────┐
   │ CAPA 1 · VALORACIÓN         ¿cuánto vale hoy?        │
   │          comps + hedónico + ajuste temporal          │
   └───────────────────────┬──────────────────────────────┘
   ┌───────────────────────┴──────────────────────────────┐
   │ CAPA 2 · DESCOMPOSICIÓN     separar beta de alpha    │
   │          r = α + β·r_índice + ε                      │
   └───────────────────────┬──────────────────────────────┘
   ┌───────────────────────┴──────────────────────────────┐
   │ CAPA 3 · FACTORES           casuísticas → números    │
   │          8 familias, z-scores cross-sectional        │
   └───────────────────────┬──────────────────────────────┘
   ┌───────────────────────┴──────────────────────────────┐
   │ CAPA 4 · COMBINACIÓN        score + análogos + vetos │
   └───────────────────────┬──────────────────────────────┘
   ┌───────────────────────┴──────────────────────────────┐
   │ CAPA 5 · CALIBRACIÓN        probabilidad honesta     │
   │          + explicación SHAP                          │
   └──────────────────────────────────────────────────────┘
```

## 3.2. Capa 2 — Separar beta de alpha

```
r(i,t) = α(i,t) + β(i) · r_índice(segmento(i), t) + ε
```

`β(i)` por regresión móvil de 180 días contra el índice de su segmento (vintage / moderno / graded / sellado / japonés).

**Predecimos α, nunca r.** Este es el punto que separa un sistema serio de un juguete.

## 3.3. Capa 3 — Las ocho familias de factores

Cada casuística de la Parte 2 se convierte en un número, normalizado como **z-score cross-sectional** (frente al resto de cartas ese mismo día). Así "subir" siempre significa "subir más que las demás".

| Familia | Contenido | Casuísticas |
|---|---|---|
| `F_supply` | Velocidad de población, saturación, gem rate, riesgo de reprint, estado OOP | B1–B7 |
| `F_demand` | Prima de Pokémon, prima de artista, estilo de arte, meta competitivo | C1–C4 |
| `F_lifecycle` | Posición en la curva de vida del set | A1–A5 |
| `F_lead` ⭐ | **Señal adelantada Japón → Inglés** | D5, D7 |
| `F_arb` | Raw→graded, EU↔US, escalera de grados, entre gradeadoras | D1–D3, D6 |
| `F_momentum` | Retornos multi-horizonte, volatilidad, drawdown, **penalización de pico de atención** | C9, técnicos |
| `F_value` | Precio vs. valor justo (Capa 1), precio vs. cohorte | Reversión |
| `F_calendar` | Estacionalidad, rotación, eventos, aniversarios | C5, C7, C8, E3 |

## 3.4. Capa 4 — El motor de análogos históricos ⭐

> Pediste explícitamente predecir **"en base al resto de casos"**. Esto es exactamente eso, y es una pieza de primer nivel, no un extra.

En lugar de preguntar solo *"¿qué dice el modelo?"*, preguntamos:

> *"Esta carta está en el mes 3 tras el release, con población creciendo al 15 %/mes, artista de prima alta, Pokémon popular, sin reprint anunciado, en fase alcista del mercado.
> **¿Qué hicieron todas las cartas que estuvieron históricamente en esa misma situación?**"*

**Cómo funciona:**

1. Cada par `(carta, día)` histórico es un **caso**, descrito por su vector de factores.
2. Para la carta a predecir, buscamos los **k casos más parecidos** del pasado (kNN sobre el vector de factores, no sobre la identidad de la carta).
3. Miramos qué pasó **después** en esos casos.
4. La salida es una **distribución empírica**, no un solo número.

```
Análogos encontrados: 47 casos
  Retorno mediano a 90 d:  +12,4 %
  Subieron:                68 % (32 de 47)
  Percentil 10:            −8,1 %
  Percentil 90:            +41,2 %
  Análogos más cercanos:   Umbreon VMAX Alt Art (mes 3, 2022)
                           Rayquaza VMAX Alt Art (mes 3, 2021)
                           ...
```

**Por qué esta pieza importa tanto en nuestro caso concreto:**

| Ventaja | Explicación |
|---|---|
| **Resuelve el arranque en frío** | Una carta recién salida no tiene histórico propio, pero **otras cartas sí vivieron su misma situación**. Predecimos desde el día 1. |
| **Interpretable de forma natural** | "47 cartas en tu situación, 68 % subieron" convence más que "score 0,73". |
| **Da incertidumbre real** | Devuelve una distribución, no un punto. |
| **Necesita menos datos que un modelo global** | Justo lo que tenemos con 0 € de presupuesto. |
| **Es auditable** | Puedes mirar los análogos uno a uno y juzgar si tienen sentido. |

## 3.5. Capa 4 — Combinación, y cómo funciona desde el día 1

El problema con 0 € es que **no tenemos histórico al arrancar**. Solución: el algoritmo tiene **tres modos** y transiciona solo.

| Modo | Cuándo | Cómo combina |
|---|---|---|
| **A · Reglas** | Semanas 1–12 | Pesos **a priori** por dominio (las fiabilidades de la Parte 2). Sin ML. **Funciona el día 1.** |
| **B · Análogos** | Mes 3+ | kNN sobre casos históricos propios + los que reconstruyamos |
| **C · Modelo** | Mes 6+ | LightGBM LambdaRank aprende los pesos, walk-forward |

```
score = w_A(t)·score_reglas + w_B(t)·score_análogos + w_C(t)·score_modelo
```

donde `w` depende de **cuánto histórico validado tenemos**, no del calendario. El sistema **empieza siendo un sistema experto y se convierte en un modelo aprendido** conforme acumula datos. No hay un "día del lanzamiento del ML": hay una transición continua y medida.

> Esto es lo que hace compatible "0 € de presupuesto" con "producto útil desde el principio".

## 3.6. Capa 4 — Reglas de veto

Algunas casuísticas son tan dominantes que **anulan el score**, pase lo que pase:

```
SI reprint_anunciado(carta)              → BAJISTA. Ignorar todo lo demás.        (B4)
SI dias_desde_release < 45               → No emitir señal alcista.               (A2)
SI pop10_crecimiento > 20 %/mes          → Tope al score alcista.                 (B1)
SI rotacion_en < 30 días Y no_es_arte    → BAJISTA.                               (C5,C6)
SI spread > 40 %                         → No emitir señal (precio no fiable).    (D4)
SI comps < 3 O confianza_media < 0,5     → No emitir señal (datos insuficientes). (§1.3)
SI pico_volumen > 5σ sin cambio_oferta   → Marcar "pico de atención", no perseguir.(C9)
```

Los vetos evitan el fallo típico: un modelo estadísticamente correcto que recomienda comprar una carta que se reimprime la semana que viene.

## 3.7. Capa 5 — Calibración honesta

**Si decimos "70 % de probabilidad de subir", debe subir el 70 % de las veces.** Se mide con diagramas de fiabilidad y se corrige con calibración isotónica.

Métricas que publicamos, no solo internas:
- **Precisión direccional** por horizonte y por segmento
- **IC (information coefficient)** — correlación de rango entre predicción y resultado
- **Retorno del decil superior vs. inferior** — el test real de si el ranking sirve
- **Error de calibración**
- **Todo lo anterior, después de costes reales**

## 3.8. Salida final

```json
{
  "instrumento": "sv4pt5-231 · EN · alt-art · PSA 10",
  "valor_justo": 412.50,
  "intervalo": [385.00, 448.00],
  "alpha_esperado_90d": "+8.2%",
  "confianza": 0.71,
  "direccion": "SUBE",
  "drivers": [
    { "factor": "F_lead",   "aporte": "+5.4", "texto": "El equivalente japonés subió un 22% en 60 días" },
    { "factor": "F_supply", "aporte": "-2.1", "texto": "Población PSA10 creciendo un 12%/mes" },
    { "factor": "F_demand", "aporte": "+3.0", "texto": "Artista con prima histórica del +34%" },
    { "factor": "F_value",  "aporte": "+1.9", "texto": "Cotiza un 11% por debajo de su cohorte" }
  ],
  "analogos": { "n": 47, "subieron_pct": 68, "mediana_90d": "+12.4%" },
  "vetos_activos": []
}
```

---

# PARTE 4 — Qué existe hoy y por qué lo vamos a superar

## 4.1. El panorama competitivo real

| Herramienta | Qué hace | Precio | Debilidad |
|---|---|---|---|
| **Alt** | Valoración de graded por comps | Gratis / marketplace | **Solo valora, no predice** |
| **Card Ladder** | Portfolio + índices, ventas de 14 marketplaces, histórico desde 2000 | 15 $/mes | Enfocado a deportivas; no predice |
| **Market Movers** | Watchlists, feed de movimientos, niveles de alerta | 10 $/mes | Deportivas; alertas por umbral, no predicción |
| **PriceCharting / 130point** | Base de datos y comps | Gratis | Solo datos, cero análisis |
| **PokéPredict / PokeForecast / CARDPREDICT / TCG Collector Tools** | Previsiones a 7/30/90 d con "confidence score" | Varios | **Cajas negras sin track record verificable** |

## 4.2. Las quejas documentadas de los usuarios

Estas son las críticas que aparecen de forma consistente en los foros de coleccionistas sobre las herramientas actuales:

1. **Lag de precios** — los valores van días por detrás del mercado real **justo durante los picos**, que es cuando importa.
2. **Cobertura pobre de sets japoneses y pequeños.**
3. **"Las herramientas de tracking son flojas diciéndote cuánto vale algo ahora mismo."**
4. Errores de identificación de carta en vintage.
5. Previsiones con "confianza" pero **sin ningún historial de aciertos publicado**.

> Cada una de esas cinco quejas es una oportunidad concreta. Y las tres primeras las ataca directamente nuestra arquitectura, no por casualidad, sino porque nacen de la misma decisión de diseño.

## 4.3. Dónde ganamos, punto por punto

| Debilidad del mercado | Nuestra respuesta | Por qué podemos |
|---|---|---|
| **Lag durante los picos** | **Nowcasting desde la oferta**, no desde las ventas (§5.1) | Observamos listings activos a diario; el precio se mueve en el ask antes de que haya ventas confirmadas |
| **Cobertura japonesa pobre** | **14 idiomas incluido JP** vía TCGdex | Y además lo convertimos en **señal adelantada** (D5): su hueco es nuestro alpha |
| **"No sé cuánto vale ahora"** | Valoración por comps + intervalo + comps visibles | Capa 1 |
| **Cajas negras sin historial** | **Publicamos calibración y track record en vivo** (§5.5) | Nadie lo hace porque da miedo. Es el mayor foso de confianza disponible |
| **Predicen precio absoluto** | Predecimos **alpha vs índice** | Capa 2. Un modelo que dice "todo sube" no es un modelo |
| **Solo valoran (Alt) o solo trackean (Card Ladder)** | Valoración **+** predicción **+** arbitraje accionable | Las tres capas juntas |
| **Alertas por umbral de precio** | Alertas por **señal causal** | "Sube porque su gemelo japonés subió un 22 %", no "cruzó los 400 €" |

---

# PARTE 5 — Los cinco motores que nos hacen mejores

Más allá de las casuísticas de la Parte 2, estas son las piezas técnicas que no tiene nadie más.

## 5.1. Nowcasting desde la oferta ⭐⭐

**El problema de todos:** las herramientas actuales calculan precio a partir de **ventas cerradas**. Una venta se confirma días después de ocurrir. Durante un pico, van ciegas exactamente cuando más importa.

**Nuestra ventaja involuntaria:** como no tenemos API de ventas cerradas, observamos **listings activos a diario**. Y resulta que la oferta se mueve **antes** que las ventas confirmadas.

```
Día 0:  38 listings activos, ask mínimo 410 €
Día 1:  31 listings, ask mínimo 445 €     ← la oferta se está retirando
Día 2:  22 listings, ask mínimo 520 €     ← los vendedores retiran y repostean más caro
Día 3:  las ventas confirmadas empiezan a reflejar 500 €+
```

Detectamos el movimiento **en el día 1–2**. Card Ladder y Alt lo ven el día 3–5.

**Señales de nowcasting:**

| Señal | Interpretación |
|---|---|
| Caída rápida del nº de listings sin ventas visibles | Retirada de oferta → subida inminente |
| Subida del ask mínimo con listings estables | Los vendedores suben precio → subida confirmándose |
| Salto en listings nuevos sin subida de precio | Distribución → presión bajista |
| Reposteo masivo del mismo vendedor a precio superior | Convicción del lado vendedor |
| Compresión del spread por arriba | Los compradores aceptan asks más altos |

> **Lo que parecía nuestra mayor limitación (no tener datos de ventas) resulta ser nuestra mayor ventaja competitiva.** Vemos el presente; ellos ven el pasado.

## 5.2. Grafo de contagio entre cartas ⭐⭐

**Nadie modela esto, y es de lo más predictivo que hay.** Las cartas no son independientes: la demanda **fluye** entre ellas.

```
Umbreon VMAX Alt Art se dispara a 1.500 €
        │
        ├─► el comprador medio queda fuera de precio
        │
        ├─► la demanda se desplaza a sustitutos:
        │     • Umbreon V Alt Art          (mismo Pokémon, más barato)
        │     • Espeon VMAX Alt Art        (misma familia Eevee)
        │     • Otras alt-arts del mismo set
        │     • Otras cartas del mismo artista
        │
        └─► y a complementos:
              • Producto sellado de ese set
              • La versión japonesa
```

**Construimos un grafo** donde las aristas son: mismo Pokémon · misma familia evolutiva · mismo artista · mismo set · misma rareza/estilo · mismo arquetipo competitivo · versión en otro idioma · raw ↔ graded del mismo instrumento.

Los pesos de las aristas se **aprenden de correlaciones históricas de retornos**, no se fijan a mano.

Cuando una carta se mueve, **propagamos el shock por el grafo** y predecimos qué vecinos se moverán después, y con cuánto retardo. Esto convierte un evento observado en decenas de predicciones accionables.

**Por qué importa tanto:** el movimiento de la carta cara ya te lo has perdido. **Los movimientos de sus vecinos aún no han ocurrido.** Ahí está el dinero.

## 5.3. Predicción de la población antes de que se publique ⭐

La dilución por población (B1/B2) es la señal bajista más fiable del mercado. Pero todos reaccionan **después** de que PSA publique la cifra.

**Nosotros la anticipamos.** Las oleadas de gradeo son predecibles:

```
P(pop crece fuerte en 3-6 meses) = f(
    subida reciente del precio raw,          ← más gente decide gradear
    spread raw→graded actual,                ← el incentivo de arbitraje
    promociones de PSA anunciadas,           ← lotes baratos
    tiempos de turnaround publicados,        ← cuándo aterrizan
    velocidad de pop en cartas del mismo set ← señal de cohorte
)
```

Cuando el spread raw→graded se abre mucho, **está garantizado** que mucha gente va a gradear esa carta, y que la oferta de PSA 10 subirá en 3–6 meses. **Vender antes de esa ola es alpha puro.** Y es de las poquísimas cosas casi deterministas en este mercado.

## 5.4. Cambio de régimen

Los factores no funcionan igual en todos los mercados:

| Régimen | Qué funciona | Qué falla |
|---|---|---|
| **Alcista / boom** | Momentum, hype, oferta escasa | Reversión a la media |
| **Corrección** | Calidad, escasez estructural, valor | Momentum (se da la vuelta) |
| **Lateral** | Reversión a la media, arbitraje | Momentum |

Un clasificador de régimen sobre el índice de mercado (volatilidad, amplitud, volumen, drawdown) **cambia los pesos de los factores** según el régimen detectado.

El precedente lo justifica: el boom COVID 2020-21 y la corrección 2022-23 de **−40 a −70 %** fueron regímenes completamente distintos. Un modelo con pesos fijos entrenado en 2021 habría sido destruido en 2022.

## 5.5. Track record público verificable ⭐⭐

No es una técnica, es **el foso**.

> Cada predicción se sella con timestamp, se guarda inmutable, y **se puntúa públicamente cuando vence.**

```
Track record en vivo · horizonte 30 días
──────────────────────────────────────────
Predicciones cerradas:        1.847
Precisión direccional:        61,3 %
IC (correlación de rango):    0,081
Decil superior vs inferior:   +14,2 % anualizado
Error de calibración:         0,034
Todo lo anterior, neto de comisiones y envío.
```

Ninguna herramienta actual publica esto. Publican "confidence scores" sin decir jamás si aciertan.

**Consecuencias:**
- Es lo único que convierte "otra app de predicciones" en una herramienta creíble.
- Nos obliga a ser honestos: si el modelo no funciona, se ve, y lo arreglamos.
- Es **imposible de copiar rápido**: un track record necesita tiempo real transcurrido. Si empezamos hoy, un competidor que arranque en un año va un año por detrás **para siempre**.

> Por eso el cron de captura de la semana 1 no es solo ingeniería de datos: **es el arranque del reloj del foso competitivo.**

---

# PARTE 6 — Orden de construcción

Ordenado por **valor entregado ÷ dependencia de histórico**:

| # | Componente | Necesita histórico | Valor | Ref. |
|---|---|---|---|---|
| 1 | **Arbitraje raw→graded y EU↔US** | **Ninguno** | Muy alto | D1, D2 |
| 2 | **Vetos por reprint** | Ninguno | Muy alto | B4, B5 |
| 3 | **Señal adelantada JP → EN** ⭐ | Ninguno | **Muy alto** | D5 |
| 4 | **Nowcasting desde la oferta** ⭐⭐ | ~2 semanas | **Muy alto** | 5.1 |
| 5 | **Track record público** ⭐⭐ | Empieza vacío | **Foso** | 5.5 |
| 6 | **Dilución por población** | 1–2 meses | Muy alto | B1, B2 |
| 7 | **Índice de mercado** | 1 mes | Crítico | E1 |
| 8 | **Curva de ciclo de vida del set** | Reconstruible | Alto | A1–A4 |
| 9 | **Valoración por comps** | 2–3 meses | Alto | Capa 1 |
| 10 | **Predicción de población** ⭐ | 3 meses | Muy alto | 5.3 |
| 11 | **Grafo de contagio** ⭐⭐ | 3–6 meses | **Muy alto** | 5.2 |
| 12 | **Motor de análogos históricos** ⭐ | 3–6 meses | Muy alto | 3.4 |
| 13 | **Detección de régimen** | 12 meses+ | Medio | 5.4 |
| 14 | **Modelo LightGBM completo** | 6–12 meses | Medio | Modo C |

## Lo importante de esta tabla

**Los cinco primeros no necesitan histórico y ya superan a todo lo que existe:**

- Nadie explota bien la señal japonesa, porque nadie cubre bien Japón.
- Nadie hace nowcasting desde la oferta, porque todos tienen API de ventas y no la necesitaron nunca.
- Nadie publica su track record.

Y el nº 5 es el único que hay que empezar **hoy**, porque su valor es puro tiempo acumulado.
