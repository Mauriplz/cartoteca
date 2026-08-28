# ESPECIFICACIÓN DEFINITIVA DEL ALGORITMO

**Pokémon Card Price Intelligence — v3**
Fecha: 2026-08-25 · Sustituye a `docs/ALGORITMO.md` v1
Estado: especificación normativa. Lo que no está aquí, no se implementa.

---

## 0. Resumen ejecutivo: qué cambia respecto a la v1

Cinco revisiones expertas independientes (quant, valoración, microestructura, dominio de mercado, fiabilidad) atacaron adversarialmente el documento v1 y sus propias propuestas de mejora. Este documento incorpora **solo lo que sobrevivió al ataque, o su versión corregida**. Doce de las cincuenta y nueve mejoras propuestas fueron descartadas por sus propios autores tras el ataque.

### 0.1. Hechos medidos sobre nuestra propia captura (`data/prices/*/prices_2026-08-25.jsonl.gz`)

Estos números no son estimaciones. Los he medido sobre el fichero capturado. Corrigen afirmaciones del `PLAN.md` y de las cinco lentes.

| Hecho | Valor medido | Qué corrige |
|---|---|---|
| Cartas EN capturadas | 23.545 (214 sets) | — |
| Cartas JA capturadas | **12.781** (116 sets) | PLAN §3.1 dice 18.031 |
| EN con bloque Cardmarket | 84,2 % | PLAN dice 91 % |
| JA con bloque Cardmarket | 81,0 % | — |
| **JA con bloque TCGplayer** | **0,0 %** | El japonés cotiza solo en Cardmarket (EUR) |
| **Campos de `cardmarket`** | `avg, low, trend, avg1, avg7, avg30` (+ `-holo`), `idProduct`, `unit`, `updated` | **No existe recuento de listings. No existe `low-price-ex-plus`.** |
| `updated`: valores distintos | **7**, todos en el mismo segundo | Es el sello del batch de TCGdex, **no** una fecha "as-of" por carta |
| Mediana de `avg30` EN | **0,59 EUR** (p25 0,12 · p75 3,97 · p90 18,36) | — |
| Mediana de `avg30` JA | **0,24 EUR** | — |
| `trend` ≥ 15 EUR | **3.180 instrumentos** (2.353 EN + 827 JA) | — |
| `trend` ≥ 30 EUR | **1.908** | — |
| `trend` ≥ 50 EUR | **1.230** | — |
| `trend` ≥ 100 EUR | **654** | — |
| Mediana de `low / trend` | **0,286** (p10 0,061) | Usar `low` como precio raw infla el margen de gradeo ~3,5× en la carta mediana |
| `idProduct` compartido por >1 carta (EN) | 940 productos → **1.986 cartas (10,0 % de las que tienen precio)** | PLAN §2 dice "a veces" |
| `avg1` no nulo | 19.815 / 19.818 | **`avg1` se arrastra**: no significa "hubo venta ayer" |
| `avg7 == avg30` exacto | 13,5 % del catálogo; 3,8 % en el subconjunto ≥15 EUR | Proxy de silencio en la fuente |
| TCGplayer con `highPrice/lowPrice > 100×` | **43,6 %** de las variantes | El "tape" de TCGplayer llega con basura estructural |

### 0.2. Lo que muere

| Componente v1 | Por qué |
|---|---|
| `V = Σ w·P·ajustes / Σ w` en niveles, con `w = recencia × similitud × confianza` | Sesgo de Jensen; los tres factores no tienen unidades; no produce intervalo |
| Beta rodante de 180 días (§3.2) | Sesgada a cero por asincronía y suavizado; el error entra íntegro en el target |
| Los tres modos `w_A/w_B/w_C` (§3.5) | No son fuentes independientes; consumen el mismo vector de 8 factores |
| Motor de análogos históricos como predictor (§3.4) | Necesita 24-36 meses de histórico propio para cumplir sus propias restricciones de diversidad |
| Grafo de contagio con pesos aprendidos de correlaciones (§5.2) | Con N≫T la matriz muestral es basura; la correlación bruta es el factor común, ya eliminado |
| Clasificador de régimen (§5.4) | Un HMM de 2 estados necesita 5-10 transiciones observadas = 5-10 años, no "12 meses+" |
| Modelo estructural de hazard de venta (todas sus variantes) | `theta` no identificado; la cuota de eBay no da; "desaparecer de mi consulta" ≠ "terminó" |
| Deconvolución por filtro de Kalman de las medias móviles | Los inputs no existen (`low-price-ex-plus`); el RMSE no bate a usar `avg7` tal cual |
| Índice por ventas repetidas (BMN/Case-Shiller) | Aplicado a clases fungibles no elimina el sesgo de composición; se reestima entero → lookahead |
| Optimizador media-varianza de cartera | Cuatro insumos que no existen; con estos errores es un maximizador de error |
| Predicción conforme con cobertura publicada por grupo | Sin solapamiento de soporte: solo tendríamos verdad de campo donde Alt es mejor que nosotros |
| Umbrales `pop10 > 5.000` / `> 10.000`, `>20 %/mes`, `gem_rate < 15 %`, `spread > 40 %`, `días < 45` | Todos refutados con contraejemplo o inejecutables |

### 0.3. Lo que se sostiene, y es el producto

1. **Transparencia de coste de ida y vuelta y precio de indiferencia.** Verificable por el usuario con su calculadora el primer día. Ningún competidor con incentivo de marketplace puede permitírselo.
2. **Valoración con incertidumbre honesta y etiqueta de evidencia**, cubriendo raw en 14 idiomas y japonés, que es donde la competencia es peor.
3. **Ratios identificados por contraste dentro de la misma carta** (escalera de grados, raw→graded, idioma, acabado, gradeadora). Es la única ventaja estructural real que tenemos frente a Alt.
4. **Señal adelantada JP→EN**, con el adelanto real medido y publicado, y con la lista explícita de dónde NO funciona.
5. **Vetos de reprint y dilución por población**, condicionados a fecha de conocimiento.
6. **Track record sellado criptográficamente** con n efectivo, intervalo de confianza y veredicto explícito, incluido "aún no distinguible de cero".

---

## 1. Principios de diseño

**P1 — La primitiva no es "el precio".** Es la terna `(estimación de valor, incertidumbre que crece con el silencio, coste de ida y vuelta)`. Un número sin las otras dos partes no se publica.

**P2 — Nada se calcula en frecuencia diaria sobre una media móvil.** `avg7` y `avg30` son filtros FIR. Sobre un paseo aleatorio puro, los retornos diarios de `avg30` tienen autocorrelación de orden 1 igual a 29/30 = 0,967 y los de `avg7`, 6/7 = 0,857 (verificado por simulación por dos lentes independientes). Un factor de momentum entrenado ahí encuentra señal espectacular en un mercado impredecible, y el Sharpe sale inflado por √k: 2,65× con `avg7`, 5,48× con `avg30`.

**P3 — Ningún número se publica sin su n efectivo y su intervalo.** Una precisión direccional del 61,3 % con n_eff = 200 tiene un IC95 % de [54,5 %, 68,1 %]. Publicar el punto sin el intervalo es el pecado del que acusamos a PokéPredict.

**P4 — Valoramos 36.000 instrumentos, rankeamos ~1.900.** El envío es un coste fijo, así que el coste porcentual explota a la baja en el precio. La mediana del catálogo cotiza a 0,59 EUR. Decirlo en voz alta es un argumento de honestidad, no una limitación vergonzante.

**P5 — El prior es explícito, versionado y publicado.** Los datos lo desplazan según su precisión, nunca según el calendario. No hay "día del lanzamiento del ML".

**P6 — Todo hecho tiene dos relojes:** cuándo ocurrió y a partir de cuándo lo supimos. Los joins de features son siempre sobre el segundo.

**P7 — Cero grados de libertad hasta que haya observaciones para gastarlos.** Con T_eff ≈ 12 cortes independientes al año a h=30, seleccionar 8 factores entre 40 candidatos consume más grados de libertad de los que hay observaciones. El sistema del año 1 es equiponderado con signos congelados.

**P8 — Se publica lo que no funciona.** El anti-patrón y el rechazo ("esta carta no es vehículo de inversión a ningún horizonte", "no gradees esto") son más valiosos y más creíbles que una señal alcista más.

**P9 — El grafo de dependencias es acíclico.** Ninguna capa consume la salida de una capa que la consume a ella. Este principio mata por sí solo media docena de propuestas elegantes. Es innegociable: un sistema circular converge, sí, pero converge a su propia lógica de relleno.

---

## 2. Capa 0 — La capa de medición

Esta capa no existía en la v1 y es la raíz de la que cuelga todo. Se especifica antes que la valoración porque sin ella la valoración mide su propio filtro.

### 2.1. Qué nos da realmente la fuente

Cardmarket, vía TCGdex, publica **medias sobre transacciones ocurridas en una ventana**, no precios diarios. El número de transacciones de la ventana es variable y **no se publica**. Consecuencias que hay que aceptar:

- La ventana efectiva en días varía por carta: una carta con 20 ventas/día tiene ventana de 30 días; una con 0,7 ventas/día tiene ventana efectiva de meses. **Las cartas ilíquidas van retrasadas respecto a las líquidas.**
- No hay ninguna deconvolución que recupere el precio latente diario. Simulado con el proceso generador real (ventas Poisson, ruido de venta 15-30 %), un filtro de estado con 0,7 ventas/día alcanza correlación 0,047 entre el retorno "deconvolucionado" y el verdadero, y su varianza declarada subestima el error real un 37-66 %.

**Decisión.** No se deconvoluciona. Se define el producto sobre horizontes que la fuente sí identifica.

### 2.2. Marcas canónicas

```
MARCA DE VISUALIZACIÓN Y VALORACIÓN   M_v(i,t) = trend(i,t)      [fallback: avg30]
MARCA DE LIQUIDACIÓN DEL TRACK RECORD M_s(i,t) = avg30(i,t)

Numerario único: EUR, a tipo BCE point-in-time del día de nuestra captura,
aplicado ANTES de calcular cualquier retorno, índice o factor.

PROHIBIDO como precio:  low   (mediana low/trend = 0,286: son copias jugadas)
PROHIBIDO como precio:  avg1  (no nulo en 19.815/19.818: se arrastra)
avg1 se conserva ÚNICAMENTE como medida de dispersión y de actividad.
```

`trend` para la ficha porque reacciona antes. `avg30` para liquidar porque su definición está declarada y **un tercero puede reproducirla contra Cardmarket**, lo que hace el track record auditable desde fuera. Ambas se almacenan siempre.

### 2.3. Retornos: lo único exactamente identificado

Bajo ventana uniforme se cumple exactamente:

```
30 · (avg30_t − avg30_{t−1})  =  x_t − x_{t−30}
 7 · ( avg7_t −  avg7_{t−1})  =  x_t − x_{t−7}
```

Es decir: **lo que la fuente nos regala honestamente es un retorno a 7 y a 30 días, no un precio diario.** El producto se define sobre eso.

```
r_h(i,t) = log( M_s(i,t) ) − log( M_s(i, t−h) ) ,   h ∈ {30, 90, 180}

h = 7   PROHIBIDO salvo arbitraje simultáneo (D2), donde el coste ya está dentro
h = 30  solo dentro del subuniverso con dispersión baja (ver §6)
h = 90  horizonte principal
h = 180 horizonte de las señales estructurales (F_supply, F_lifecycle, F_demand)
```

### 2.4. Detector de silencio (sustituye a `pricing.updated`)

**`pricing.updated` no sirve.** Medido: 7 valores distintos en 19.818 cartas, todos dentro del mismo segundo. Es el sello del batch de sincronización de TCGdex. La afirmación de `PLAN.md` §3.1 ("es oro para la corrección point-in-time") es falsa y hay que retirarla.

La staleness real de la agregación de Cardmarket es **inobservable**. Lo único observable es el silencio en la fuente, y hay que construirlo con nuestro propio histórico:

```python
# vector de precios del día
v(i,t) = sha256(canonical([low, trend, avg1, avg7, avg30, *variantes_holo]))

dias_sin_cambio(i,t) = t − max{ u ≤ t : v(i,u) != v(i,u−1) }

# banda de incertidumbre por silencio, prior por tier de liquidez (NO medido, v1)
sd_silencio(i,t) = sigma_tier(i) * sqrt( max(1, dias_sin_cambio(i,t)) / 365 )
   sigma_tier:  T1 (trend ≥ 100 EUR y cambio en >70% de los días)  = 0,35 anual
                T2 (trend ≥  15 EUR)                               = 0,50 anual
                T3 (resto)                                          = 0,70 anual
```

`dias_sin_cambio` se publica en la ficha. Es honesto, es gratis desde el día 1 y es exactamente lo que ningún competidor muestra.

### 2.5. Identidad e instrumento

El modelo de `PLAN.md` §7.1 no puede representar una parte cara del mercado. **Migración obligatoria en fase 0** — es barata hoy y carísima con seis meses de series colgando:

```
instrumento = (card_id, idioma, region, acabado, patron, sello,
               grado, gradeadora, subgrado_especial)

sello  ∈ {none, prerelease, staff, judge, worlds_YYYY, regional, league,
          pokemon_center, champions_league, corocoro, gym, winner, jumbo}
patron ∈ {none, poke_ball, master_ball, reverse_std, cosmos, ...}
subgrado_especial ∈ {none, bgs_black_label, cgc_pristine, psa_qualifier}
```

`BGS 10 Black Label` y `CGC Pristine 10` son **instrumentos distintos**, no el mismo grado con otra etiqueta: sus curvas de precio son otras.

**Restricción de inyectividad, obligatoria y verificada como necesaria:**

```sql
instrument_price_source(instrument_id, source, external_product_id, valid_from, valid_to)
UNIQUE (source, external_product_id, valid_from)
```

Medido: 940 `idProduct` de Cardmarket están compartidos por más de una carta, afectando a 1.986 cartas EN (10,0 % de las que tienen precio). Verificado a mano: en `base1-4`, las variantes `shadowless` y `shadowless + 1st-edition` comparten `idProduct 660224` y devuelven precios idénticos. **TCGdex mapea la carta, no el instrumento.** Cuando dos instrumentos resuelven al mismo `external_product_id`, se **fusionan** en un instrumento marcado `no_separable_en_la_fuente`, visible en la UI. El detector de colisiones del PLAN §8 pasa de ser el mecanismo principal a ser una red de seguridad.

En japonés el problema es residual (3 productos, 7 cartas), pero en japonés hay otro: **el campo `rarity` es inconsistente entre sets**. Antes de construir cualquier cohorte japonesa hay que construir y versionar una **tabla propia de taxonomía de rarezas JP** (SAR/AR/CHR/CSR/UR) derivada de `localId` y del rango de numeración. Presupuestar 1-2 días. No es un campo disponible.

### 2.6. Higiene del libro de eBay

Es la primera pieza que entra en producción del módulo graded, antes que cualquier modelo. Sin ella el suelo del libro lo mueve un solo vendedor.

```python
# CAPA 1 — elegibilidad (duro, pre-modelo). Listas POR IDIOMA, no solo inglés.
EXCLUIR si titulo casa (con frontera de palabra):
  EN: proxy|custom|orica|repro|fake|replica|lot|bundle|joblot|x[2-9]\b|playset|
      you pick|choose|damaged|read desc|sticker|coin|sleeve|binder|display|
      miscut|off.?cent|error|crimp|test print
  DE: konvolut|sammlung|fälschung     FR: ensemble|lot     ES: lote
LISTA BLANCA previa (protege el segmento caro): alt art, art card, full art,
      special art rare, illustration rare
EXCLUIR si aspecto Grade ≠ grado del instrumento, o Professional Grader ≠ gradeadora
CUARENTENA si p < 0,25·Q25(libro) o p > 4·Q75(libro)

# CAPA 2 — concentración de vendedor (desde sellerId, gratis, sin cert ni OCR)
HHI(i,t) = Σ_s share_s²        top1(i,t) = max_s share_s

# CAPA 3 — estadístico de la cola inferior. NUNCA min(ask).
```

**Por qué nunca `min(ask)`:** el mínimo de una muestra es un estadístico de orden. `E[min de n] ≈ F⁻¹(1/(n+1))`, decreciente en n. Verificado: pasar de 38 a 22 listings **sube el mínimo esperado un 8,6 % (σ=0,35) o un 12,7 % (σ=0,5) con el mercado completamente estático**. El ejemplo insignia de `ALGORITMO.md` §5.1 (38 listings a 410 EUR → 22 a 520 EUR) es en parte considerable ese artefacto.

```python
def suelo_libro(asks, n, tier):
    a = [log(p) for p in asks if p <= 5*M_v and feedback(p) >= 20
                              and dias_sin_cambio_precio(p) <= 60]
    a = deduplicar(a, por=(vendedor, titulo_normalizado, precio))  # captura relistados
    if len(a) < 12: return None, 'cobertura_insuficiente'
    # ajuste de máxima verosimilitud lognormal sobre el CUARTIL INFERIOR
    # tratado como muestra truncada: consistente en n POR CONSTRUCCIÓN,
    # sin estimar ninguna corrección y sin absorber la respuesta de la oferta.
    return mle_truncada(a, cuartil=0.25), 'ok'
```

Se descarta residualizar contra `log(n)`: `n` y el precio son endógenos y esa regresión absorbe la respuesta conductual de la oferta, que es justo la señal buscada.

**No se publica ningún flag de manipulación ni sobre vendedor ni sobre instrumento.** En un instrumento ilíquido con vendedor dominante identificable, marcar el instrumento es señalar a la persona. Lo que sí se publica es un dato neutro: *"el 78 % del libro de este instrumento pertenece a un solo vendedor"*.

### 2.7. Verdad de campo: las subastas

**Este es el rescate más importante de toda la revisión y no estaba en la v1.**

eBay Browse devuelve `bidCount` y precio. Una subasta que termina **con pujas** es una venta con precio y fecha conocidos, **sin inferencia, sin emparejamiento, sin Terapeak, sin problema legal ni de licencia**. Una subasta que termina **sin pujas** es un no-vendido confirmado a precio conocido: es la observación más informativa que existe sobre el techo de la demanda, y `PLAN.md` §5 ordenaba descartarla, que es introducir el sesgo de supervivencia que el propio documento dice evitar.

```
Etiqueta y = 1  ⟸  subasta con bidCount ≥ 1
                   Y el item NO reaparece del mismo vendedor en 21 días
                   Y (si hay cert extraíble) el cert no reaparece en 21 días
                   peso × (1 − shill_score(vendedor))
Etiqueta y = 0  ⟸  subasta con bidCount = 0 al terminar
                   → observación CENSURADA POR LA DERECHA EN PRECIO:
                     aporta  log P(no vender en τ | p = precio de salida)
```

Es el único conjunto de entrenamiento limpio, gratuito y autoetiquetado del proyecto. Todo lo que se calibre en el año 1 se calibra aquí y se transfiere a Buy-It-Now con un término de segmento, **declarando el supuesto de transferencia y midiéndolo**.

### 2.8. Verificación de muerte de listing (obligatoria, no negociable)

`PLAN.md` §5 confunde "el listing salió de eBay" con "el listing salió de mi consulta". La Browse API reordena, repagina y reclasifica; un ítem sale del conjunto de resultados por revisión de título, cambio de categoría o caída del corte de relevancia, sin haber terminado.

```
Paso 0, antes de emitir CUALQUIER evento:
  GET /buy/browse/v1/item/?item_ids=  (20 itemIds por llamada)
  Si devuelve el ítem  -> drift de la consulta. NO es evento. Descartar.
  Si ITEM_NOT_FOUND    -> muerte confirmada, con intervalo de censura acotado.

PRIMER EXPERIMENTO DEL PROYECTO (semana 1, coste: horas):
  sondear la misma consulta dos veces con una hora de diferencia y contar
  desapariciones. Ese número decide el presupuesto de cuota.
  Si el drift supera el 10 %, la verificación pasa a ser el 60 % del presupuesto
  y la señal de "caída de listings" de §5.1 es mayoritariamente artefacto.
```

**La regla del "14 días sin reaparecer = venta" queda derogada.** Producía tres errores encadenados: confundía drift con evento, usaba el último ask como precio de transacción, y —lo peor— calculaba el `score de confianza` a partir del resultado realizado (¿reapareció?), es decir, **la etiqueta disfrazada de feature**.

### 2.9. Presupuesto de cuota de eBay (restricción dura, como los 0 EUR)

5.000 llamadas/día. La aritmética de `PLAN.md` §3.2 ya se pasa antes de empezar: T1 (2.000 diarios) + T2 (10.000 cada 3 días = 3.333/día) = 5.333, sin contar paginación, reintentos, OAuth ni verificación de muerte.

```
Reparto v1, un solo marketplace (eBay.com):
  2.200  barrido diario del universo rankeable graded
    900  verificación de muerte (getItems, 20 ids/llamada = 18.000 ítems/día)
    900  subastas (verdad de campo: prioridad máxima)
    600  enriquecimiento de aspectos/cert en listings nuevos de alto valor
    400  reserva y reintentos

DOS NIVELES DE FRECUENCIA, NO TRES. Diario para el universo rankeable,
semanal para el resto. Instrumentos medidos a frecuencias distintas NO son
comparables en un z-score cross-seccional.

ESTRATO ALEATORIO PERMANENTE: 500 instrumentos con D fijo = 3 días, elegidos
una vez y congelados. Es el único conjunto sobre el que se pueden calcular
estadísticos insesgados, y la referencia contra la que se mide el sesgo que
induce el muestreo adaptativo en todo lo demás.
```

Multi-marketplace (DE/UK/FR) **no cabe** en el año 1. Se declara.

---

## 3. Motor de valoración — precio justo con intervalo honesto

### 3.1. La fórmula, corregida

`ALGORITMO.md` §1.3 promedia en **niveles**. Los precios de cartas son aproximadamente lognormales, así que la media aritmética está sesgada al alza respecto a la mediana en `exp(σ²/2)`: con σ=0,35 eso es +6,3 % sistemático, y está dominada por el comparable más caro, que en un mercado con lotes es el menos fiable.

```
log V(i,t) = [ Σ_c w_c · ( log P_c + D_mkt(seg_c, t_c→t) + D_hed(x_c → x_i) ) ] / Σ_c w_c

V_mediana = exp( log V )                      <- ES LO QUE SE MUESTRA
V_media   = exp( log V + σ²/2 )               <- SOLO para agregados de cartera

w_c = 1 / v_c        (ponderación por PRECISIÓN, no por heurística)

v_c = s²_precio(c)   ruido de medición del precio observado
    + s²_infer(c)    ruido por venta inferida  (§3.2)
    + s²_mkt(seg,Δt) error del ajuste temporal; crece con Δt
    + s²_hed(x_c,x_i) incertidumbre del ajuste hedónico  (§3.4)
    + s²_idio(i)     dispersión irreducible del instrumento. SUELO 0,30 en log.
```

**Corrección por correlación entre comparables.** Veinte comparables del mismo vendedor con ρ=0,5 tienen n_efectivo = 20/(1+19·0,5) = 1,90: el intervalo ingenuo es **3,24 veces más estrecho de lo real**. Es la causa nº1 de intervalos deshonestos en sistemas de comparables.

```
Σ[c,c'] = sqrt(v_c · v_c') · ρ_cc'
ρ_cc' = 0,60 · 1[mismo vendedor]
      + 0,50 · 1[observaciones de ventanas solapadas: avg7 vs avg7 contiguos]
      + 0,40 · exp(−|t_c − t_c'| / 7)
      + 0,25 · 1[mismo set + rareza]
  (ρ conservadores y FIJOS en v1: un ρ demasiado alto ensancha el intervalo,
   y ese error va en la dirección segura. No se estiman con 40 filas.)

Σ se regulariza con ridge diagonal; se RECHAZA cualquier solución con pesos negativos.
w = Σ⁻¹·1 ;  log V = (1'Σ⁻¹μ)/(1'Σ⁻¹1) ;  Var(log V) = 1/(1'Σ⁻¹1)
n_eff = (Σw)² / Σw²        <- SE PUBLICA EN LA FICHA
```

**Prohibido:** que dos campos solapados de Cardmarket (`avg7` de hoy y de ayer) entren como observaciones independientes.

### 3.2. Ventas inferidas: modelo de mezcla, no peso lineal

`confianza_venta` como multiplicador lineal es estadísticamente incorrecto **y el error va en la peor dirección posible**: subestima el ruido e infla el valor. Una venta con confianza 0,6 no es 0,6 observaciones limpias: su error es una mezcla.

```
Con probabilidad π :  fue venta,      t = y + log(1 − d),  d = descuento Best Offer
Con probabilidad 1−π: NO fue venta.   ENTONCES y es una COTA SUPERIOR CENSURADA:
                                       verosimilitud de cola  P(θ < y − margen)

  <- La rama de no-venta NO es una gaussiana centrada. Modelarla así tira de θ
     HACIA ARRIBA cuando el ask es aspiracional, que es el caso típico.
     Es el error técnico más grave que se detectó en las once propuestas de valoración.

E[t | y]  = y − π·δ_v − (1−π)·δ_w
Var_eff   = π·σ_v² + (1−π)·σ_w² + π(1−π)(δ_v − δ_w)²
                                  ^^^^^^^^^^^^^^^^^^^
                                  término de SEPARACIÓN que el peso lineal ignora

Rama de venta: Student-t(ν=4) en logs -> los outliers (lotes, shill) se
autodesponderan sin recortar ni sesgar la cola.
```

**Los parámetros no se inventan.** Hasta que existan ≥2.000 desenlaces observados vía subastas (§2.7), se fijan valores **conservadores** (π bajo, σ_w alto) que ensanchan el intervalo y sesgan a la baja. El error conservador es aceptable; el optimista destruye el producto.

Y se declara por escrito: *"el tratamiento lineal de la confianza subestima el ruido y sesga el valor al alza; ambos efectos son de signo conocido y magnitud desconocida hasta calibrar."* No se publica ninguna cifra derivada de parámetros no medidos.

### 3.3. Pooling parcial jerárquico — la omisión mayor de la v1

En un mercado donde el instrumento mediano tiene 0-2 ventas en 90 días, el pooling parcial no es una técnica más: **es LA técnica**. La v1 no la menciona ni una vez.

```
Jerarquía:  instrumento → carta → (set × rareza × acabado) → era

FORMA CERRADA (una línea de código, auditable, sin filtro de estado):
  peso_datos = n / ( n + R/τ² )
  θ̂ = peso_datos · media(observaciones) + (1 − peso_datos) · h(x_i)

  con τ = 0,35 (dispersión residual del cohorte, en logs) y R = 0,25²:
     1 venta  -> peso 0,66
     2 ventas -> peso 0,80
     5 ventas -> peso 0,91

LECTURA: quien valora con "último precio de venta" SOBREAJUSTA UN 34 %
frente al óptimo bayesiano. Ese 34 % es una ventaja medible sobre cualquier
herramienta que muestre "last sale".
```

τ² por nivel se estima sobre los instrumentos densos y se aplica a los vacíos. Los pocos datos densos pagan por los muchos huecos. **No se usa filtro de Kalman**: el drift a cero rompe la circularidad con el índice y no cuesta casi nada en precisión.

### 3.4. Hedónico contrastivo — la única ventaja estructural frente a Alt

Nuestra desventaja frente a Alt está en los **niveles**, no en los **ratios**.

Los multiplicadores (escalera de grados, JP/EN, raw→graded, acabado, prima entre gradeadoras) se identifican con contrastes **dentro de la MISMA carta**, donde la deseabilidad idiosincrática se cancela exactamente. El factor de eficiencia muestral es `(sd deseabilidad / sd escalón dentro de cohorte)²`, del orden de **6-12×**, no de 100× como se afirmó inicialmente. Sigue siendo la mejor idea del proyecto.

```python
# ENTRENAR SOLO SOBRE PARES DE LA MISMA CARTA. Los pares cruzando cartas
# reintroducen exactamente el sesgo de deseabilidad que se dice eliminar.
pares = [(a,b) : card_id_a == card_id_b, |t_a − t_b| ≤ 14d, mismo numerario EUR]
y_ab  = log P_a − log P_b
Dx_ab = one-hot de la TRANSICIÓN (grade_b→grade_a, lang_b→lang_a,
                                  grader_b→grader_a, finish_b→finish_a)
        + decil de precio del COHORTE  (NO log P_b: reinyectaría la identidad)

model = LGBM(objective='huber',
             monotone_constraints={delta_grade: +1, delta_log_pop: −1})

ANTISIMETRÍA FORZADA:  D_hed(a→b) = 0,5·( f(Dx_ab) − f(Dx_ba) )

REGLAS INNEGOCIABLES:
  - n efectivo = número de OBSERVACIONES subyacentes (m), NUNCA número de pares
    (con m observaciones hay m(m−1)/2 pares pero solo m−1 contrastes independientes)
  - validación cruzada AGRUPADA POR CARTA, con test en CI que falla si se desagrupa
  - pares cross-idioma EXCLUIDOS mientras el detector de colisiones no los haya
    limpiado; excluir siempre cualquier par con precios idénticos
```

Se descarta HodgeRank: sobre el espacio de features cualquier `g(x)` ajustado es un campo gradiente por construcción y el "curl" se convierte en el residuo de ajuste, no en una medida de incoherencia del mercado.

### 3.5. Cobertura graded del catálogo sin observar graded

No necesitamos observar el precio graded de cada carta: necesitamos el **multiplicador**, que es una función suave de features y converge con 1.000-2.000 observaciones.

```
ρ(i) = log P_graded − log P_raw_NM

features = [ log P_raw, rareza, era, edad, acabado, log(pop_total), log(pop_grade),
             gem_rate, idioma, grader, grade (ordinal), dias_desde_release,
             trend/low y avg30/low  ← PROXY DE MEZCLA DE CONDICIÓN, imprescindible ]

FORMA EN U sobre log P_raw, NO monotonía decreciente:
  - cola baja: multiplicador alto por el coste fijo de gradeo
  - cola alta: multiplicador alto otra vez, porque en vintage de altísimo valor
    el grado deja de ser un certificado y pasa a ser una lotería sobre la condición
  Imponer monotonía negativa global garantiza infravalorar el alto vintage.

USO: ρ alimenta el PRIOR del pooling parcial (§3.3), nunca es el valor final.
     s²_graded = s²_raw + ((ρ_q90 − ρ_q10)/2,563)²
     Fuera del rango [p5,p95] de log P_raw del entrenamiento: marcar EXTRAPOLACIÓN
     y ensanchar el intervalo ×2.
```

`P_raw` es `trend`. **Nunca `low`**: medido, la mediana de `low/trend` es 0,286, así que usar `low` infla el margen aparente de gradeo por un factor ~3,5 en la carta mediana. Es el error clásico que hace que toda operación de gradeo parezca rentable.

### 3.6. Escalera de grados y coherencia

```
# MONOTONÍA POR PARAMETRIZACIÓN, no por restricción:
L(k) = Σ_{j≤k} exp(δ_j)        -> estrictamente creciente sea cual sea el ajuste

# UN FACTOR POR COHORTE con shrinkage (da escalera sensata con 1-2 observaciones):
log m_c(k) = λ_c · L(k) + μ_c(k)
λ̂_c = ( n_c·λ_MLE + κ·λ_pred(x_c) ) / (n_c + κ),   κ = 20
λ_pred = LGBM(gem_rate, era, log precio medio del cohorte, log pop, acabado, idioma)
  ...con LEAVE-ONE-OUT en las features de cohorte (si no, es circular)

# EFECTO FIJO DE GRADEADORA, NO escala latente de calidad común.
# Una escala latente única implicaría PSA 9 < CGC 9,5 siempre, y el mercado
# dice lo contrario (D6): la prima de PSA es prima de MARCA y de liquidez del
# slab, no una posición en un eje de calidad. Con efecto fijo se representa; con
# escala latente única, no. Se reconsidera si algún día hay >500 contrastes
# de misma carta cruzando gradeadora.

# VETO DE COHERENCIA EN SERVICIO
assert V[k+1] >= V[k] * 1,02        excepto si pop10 > 8.000: entonces V[k+1] >= V[k]
```

**Proyección de coherencia por carta**, QP ponderado por precisión, con **todas las restricciones blandas** (holgura penalizada; la monotonía en grado con penalización muy alta se comporta como dura en el 99 % de los casos y deja que los datos ganen en el 1 % donde el mercado se sale del guion):

```
min_v  Σ_j (v_j − v̂_j)² / s²_j  + Σ penalización de holgura

  A. monotonía en grado dentro de gradeadora            (penalización muy alta)
  B. orden entre gradeadoras vía efecto fijo            (blanda)
  C. v[raw_NM] ≤ v[PSA,8]   SOLO EN VINTAGE.            En moderno hay que permitir
     explícitamente v[raw_NM] > v[PSA,8]: un PSA 8 moderno certifica un defecto.
  D. banda de idioma por cohorte                         (blanda)
  E. banda de acabado por cohorte                        (blanda)

NO SE IMPONE:  v[raw] ≥ log(Σ_k p_k·e^{v[k]}) − C_gradeo
  No es no-arbitraje a coste cero: cuesta ~25-80 EUR, 2,5-8 meses y asume riesgo.
  Su violación ES la señal D1. Imponerla borraría la señal.

INCERTIDUMBRE POST-QP (sin esto el intervalo publicado no corresponde al valor
servido): sortear 200 vectores v̂ ~ N(v̂, diag(s²)), proyectar cada uno, y tomar
la dispersión de las proyecciones. 200 QP de ≤60 variables por carta: segundos.

SANEAR ANTES DE PROYECTAR: excluir cualquier nodo marcado por el detector de
colisiones. El nodo con la varianza nominal más baja (el precio suave de
Cardmarket) puede ser el más sesgado, y el QP lo trataría como ancla inamovible.
```

### 3.7. Salida de valoración

Se elimina el campo `"confianza": 0.71` de `ALGORITMO.md` §3.8: es un número sin definición ni unidades, exactamente el pecado que el propio documento denuncia en §4.1. Y se corrige el intervalo del ejemplo: ±7,6 % es implausible para un valor derivado de ventas inferidas.

```json
{
  "instrumento": "sv4pt5-231 · EN · alt-art · PSA 10",
  "valor_referencia_mediana": 412.50,
  "intervalo_80": [318, 534],
  "nivel_de_evidencia": "MODELADO",
  "n_eff_comparables": 2.4,
  "dias_sin_cambio_en_la_fuente": 6,
  "comprar_hoy_aprox": 438,
  "coste_ida_y_vuelta_pct": 0.24,
  "precio_de_indiferencia_180d": 470,
  "comparables_usados": [ ... ],
  "comparables_descartados": [
    {"id": "...", "motivo": "lote"}, {"id": "...", "motivo": "cert repetido <7d"}
  ],
  "aviso": "En este segmento no observamos precios de transacción.
            No podemos verificar nuestra cobertura."
}
```

**Anchuras esperadas, declaradas en la metodología:**

| Nivel | Criterio | IC 80 % típico |
|---|---|---|
| MEDIDO | ≥5 desenlaces observados en 90 días | ±12-18 % |
| MODELADO | 1-4 desenlaces, dominado por prior jerárquico | ±25-35 % |
| INFERIDO | 0 desenlaces, valor derivado del ratio/hedónico | ±40-60 % |

**Regla de veto separada por capa** (la v1 las confundía):
- **Valoración: NUNCA se rehúsa un valor.** Con el prior jerárquico siempre hay uno; lo que varía es la anchura y la etiqueta. Si decimos "datos insuficientes" en el 60 % de las fichas, perdemos contra Alt, que siempre enseña un número.
- **Predicción: veto si `sd(log V) > 0,30`.** No "si comps < 3": contar comparables es el criterio equivocado; la varianza posterior es comparable entre instrumentos y contar no lo es.

### 3.8. Precio a dos caras — solo la cara que se sostiene

```
COMPRAR HOY (se envía el día 1; observación directa, sin modelo):
  P_compra = percentil 15 de los asks activos viables + envío + IVA/aduana
  con n < 5 listings: mostrar RANGO, no percentil
  con n < 3 listings: no mostrar

VENDER (se APLAZA): la curva precio/tiempo-hasta-vender depende de un modelo
de hazard cuyo θ no está identificado. Mientras tanto se publica algo observable:
  "de los listings de este instrumento que seguimos, la mitad desapareció en
   menos de N días" + "descuento medio por comisiones y envío: X %"

CARTERA: línea a línea la MEDIANA (responde a "cuánto me darán por ésta");
         total con la MEDIA neta (única cantidad aditiva). Sumar medianas está mal.
```

---

## 4. Motor de predicción — ranking de inversión

### 4.1. Qué es alpha, y por qué no es lo que decía la v1

`r = α + β·r_índice + ε` con beta rodante de 180 días **hace lo contrario de lo que promete**. Con precios stale y asíncronos la beta OLS está sesgada hacia cero (Scholes-Williams/Dimson), el error de estimación entra íntegro en el residuo —que es precisamente el target—, y en un ranking cross-seccional el retorno del mercado es una constante ese día que se cancela en el orden. La implementación ingenua mete más ruido del que quita, y lo mete sesgado hacia las cartas más ilíquidas, que son las de beta peor estimada.

**Sustitución: demedianado cross-seccional.** Cero histórico, cero parámetros, inmune al error de estimación de beta.

```python
def alpha(marca, t, h):
    r = log(M_s[t+h]) − log(M_s[t])

    # LA COHORTE DEBE CONTROLAR LA LIQUIDEZ. Es el punto crítico:
    # la ventana efectiva k varía por carta (Cardmarket promedia por transacción),
    # así que las ilíquidas van RETRASADAS respecto a las líquidas dentro de la
    # misma cohorte, y demedianar convierte ese retraso en "alpha". Sin esta
    # dimensión, el ranking ordena por clase de liquidez, que es exactamente el
    # sesgo que reprochamos a la beta OLS, por otro mecanismo.
    cohorte = ( bucket_frecuencia_de_cambio_de_avg30,
                bucket_de_precio,
                idioma,
                graded_flag )
    # segundo nivel, solo si n ≥ 30:  × era × estilo_rareza

    med = r.groupby([t, cohorte]).median()
    mad = 1,4826 · MAD_por_grupo
    n   = tamaño del grupo
    return ((r − med) / clip(mad, min=0,02)).where(n >= 30)
```

Desde el mes 6, con ≥26 cortes semanales, se sube a una **regresión cross-seccional WLS sobre exposiciones OBSERVABLES** (no estimadas), que es el mismo objeto generalizado:

```
r(i,t) = Σ_k b(i,k)·f(k,t) + u(i,t)      corte SEMANAL, no diario

b(i,·) = [ intercepto, era(4 dummies), estilo_rareza(4), idioma(2: EN/JA),
           log_precio, meses_desde_release (spline 3 nudos) ]
         10-12 exposiciones, NO 25. Grado y gradeadora van en un modelo SEPARADO
         ajustado solo sobre el universo eBay, y NUNCA se mezclan con el raw.

pesos WLS = 1 / (1 + dias_sin_cambio)
Bloquear el corte si n < 300 -> el índice de esa semana se interpola y SE MARCA.
Publicar cada semana n y R².
```

**Índice de mercado.** Encadenado, con constituyentes point-in-time definidos por **regla, no por lista**, equiponderado **dentro de segmento y con suelo de precio**:

```
I(t) = I(t−1) · ( 1 + Σ_{i ∈ U(t−1)} w_i(t−1) · r_i(t) )
  U(t−1) determinado SOLO con datos conocidos en t−1
  Suelo: trend ≥ 15 EUR. Con mediana del catálogo en 0,59 EUR, un índice
  equiponderado sobre el universo completo es ruido de redondeo.
  Se llama "índice de cartas negociables", NO "índice del mercado", y se publica
  su cobertura: ~11,5 % de las cartas EN con precio.

4 segmentos, no 7: raw-EN-vintage, raw-EN-moderno, raw-JA, graded-eBay.
Añadir segmentos solo cuando cada uno tenga ≥200 instrumentos por periodo.

EL ÍNDICE ES INMUTABLE UNA VEZ PUBLICADO. Se versiona (index_v1 del 2026-09-01)
y las revisiones crean una serie NUEVA. Sin esto, todo el alpha del sistema
tiene lookahead, porque un índice que se reestima entero reescribe el pasado.
```

Se publican **tres** cifras, no dos: **alpha** (métrica de habilidad), **retorno bruto** (lo que ve el usuario, porque no hay posición corta en cartas y el usuario cobra r, no α) y **retorno neto de fricción por bucket de precio** (lo que el usuario se lleva). En un mercado donde el 88 % del catálogo cotiza bajo 15 EUR, la tercera es la única que importa.

### 4.2. Pipeline de normalización de factores

`ALGORITMO.md` §3.3 dice "z-score cross-sectional frente al resto de cartas ese mismo día". Tal cual, eso compara un Charizard PSA10 de Base Set con un common de bulk, no winsoriza nada, y deja que una carta que pasa de 3 a 900 slabs domine el z-score de `F_supply` de todo el mercado ese día.

```python
for factor f, for fecha t:

  1. CELDA (dos niveles medidos, no cuatro postulados):
     nivel A = idioma × grado_binario(raw/graded)
     nivel B, dentro de A = era × estilo_rareza, colapsando hasta n ≥ 40
     Si tras colapsar todo n < 40 -> el factor no se calcula, va a is_missing.
     VERIFICAR el tamaño real de cada celda contra el catálogo ANTES de codificar:
     con ~1.900 instrumentos rankeables, el universo solo soporta 3-6 celdas.

  2. RECORTE ROBUSTO dentro de celda (MAD, no percentiles: con n=40 el p1 no existe)
     med = median(x_c);  mad = 1,4826·median(|x_c − med|)
     x <- clip(x, med − 5·mad, med + 5·mad)

  3. RANK-NORMAL (van der Waerden), no z bruto:
     z = Φ⁻¹( (rank(x_c) − 0,5) / n_c )
     Inmune a colas, escala comparable entre factores, invariante a cambios en la
     distribución marginal (que es donde vive la mayor parte de la no estacionariedad).

  4. LIMPIEZA DE NUISANCE  <- EL PASO QUE FALTABA
     z_clean = residual de:  z ~ log(V̂) + dummies_celda   [SIEMPRE]
                                + log(1+L) + staleness    [SOLO en universo eBay]
     Sin este paso los ocho factores acaban siendo secretamente la misma apuesta
     -"cartas baratas e ilíquidas"- y el decil superior se llena de cartas de 8 EUR.
     Documentar que el factor limpio del raw y el del graded NO son comparables.

  5. AUSENTES: z_clean <- 0 (neutral respecto a su celda, no "malo")
     ADEMÁS crear el factor  is_missing_f  y dejar que el sistema aprenda su signo.
     ("no tiene equivalente japonés" es informativo sobre exclusividad)

  6. EWMA con half-life PROPIO por factor, marcado como PRIOR v1 NO MEDIDO,
     con fecha de recalibración por estudio de eventos y versionado:
       F_arb 5d · F_momentum 20d · F_value 30d · F_lead 45d
       F_supply 60d · F_lifecycle 90d · F_demand 180d · F_calendar 0d (nunca)
     Aplicado SOBRE datos point-in-time, jamás sobre la serie reconstruida hoy.

  7. AUDITORÍA DIARIA, con amortiguador CONTINUO (no interruptor binario:
     un factor que oscile alrededor del umbral entraría y saldría de la cartera
     generando costes del 25 % cada vez):
       mult = max(0, 1 − (|corr(z_clean, log V̂)| − 0,10) / 0,10)
     Se publica la correlación diaria. Es un argumento de credibilidad barato.
```

**`F_size` se extrae como noveno factor** desde el principio. Si "las cartas caras suben más" es un hecho real, residualizar contra `log(precio)` lo mata; lo que no se puede permitir es que viaje escondido dentro de los otros ocho.

### 4.3. Combinación

Los tres modos de §3.5 se eliminan: no son fuentes independientes, los tres consumen el mismo vector de factores, y mezclarlos es un re-peso opaco disfrazado de ensemble que además impide medir qué funciona.

```python
# (a) ORTOGONALIZACIÓN SECUENCIAL, orden CONGELADO Y VERSIONADO en v1
orden = [F_calendar, F_supply, F_lead, F_arb, F_size,
         F_value, F_demand, F_lifecycle, F_momentum]
# El momentum va ÚLTIMO porque es el más contaminado por precios stale y por
# picos de atención (C9): que se quede con el residuo.
z_orto[f] = residual( z_clean[f] ~ z_orto[ya colocados] );  reescalar a sd 1

# (b) AÑO 1 — EL SISTEMA ES ESTO Y NADA MÁS:
score(i,t) = (1/J) · Σ_f s_f · z_orto[f](i,t)

  s_f = signo a priori, tomado de la columna "Dir." de la Parte 2 del v1,
        CONGELADO POR ESCRITO Y HASHEADO antes de mirar un solo resultado.
  CERO grados de libertad. Por debajo de varios miles de observaciones efectivas,
  1/N bate consistentemente a los pesos "optimizados" fuera de muestra.

# (c) EVOLUCIÓN — una fórmula, no una decisión de calendario:
IC_post[f] = ( (n/σ_IC²)·IC_muestral[f] + (1/τ²)·IC_prior[f] )
           / (  n/σ_IC²                 +  1/τ²  )
  n = número de cortes con solapamiento NULO YA VENCIDOS  (a h=90: ~4 al año)
  IC_prior por etiqueta de fiabilidad, escala REDUCIDA porque no está medida:
    'Muy alta' 0,030 | 'Alta' 0,020 | 'Media-alta' 0,012 | 'Media' 0,008 | 'Baja' 0,003
  τ = 0,020 ;  σ_IC medido, no asumido, en cuanto haya 15 cortes.

DECLARACIÓN OBLIGATORIA EN LA METODOLOGÍA:
  con n≈4/año, el sistema será MAYORITARIAMENTE PRIOR durante años. La transición
  al modelo aprendido existe como fórmula, pero no ocurrirá en el horizonte del
  plan. Presentarla como "una transición continua y medida en curso" sería falso.
  Junto a cada peso se muestra: "peso basado en N observaciones y un prior".

# (d) SIN CONVERSIÓN A EUROS hasta tener σ_alpha medida. Hasta entonces la salida
# es un PERCENTIL, y la regla de publicación (§6) se ejecuta sobre el percentil
# calibrado a un coste, no sobre un alpha en % construido con parámetros inventados.
```

### 4.4. Vetos

Se sustituyen los siete cortes duros de §3.6, que creaban acantilados de rotación, por **un veto duro y seis amortiguadores continuos**, con umbrales fijados como cuantiles observados y recalibrados trimestralmente.

```
VETO DURO (único):
  SI reprint_anunciado(carta) Y known_at ≤ t Y artwork_hash idéntico
     Y sin marca distintiva Y pull_rate_nuevo > pull_rate_original
     -> BAJISTA, ignorar todo lo demás.
  (B4a, reimpresión de SET, aplica sobre todo al SELLADO. B4b, reaparición de
   carta, solo es bajista fuerte con las TRES condiciones: una reimpresión
   DISTINGUIBLE -Celebrations, 151, UPC- es frecuentemente neutra o positiva
   para el original, porque le da visibilidad.)

VETO DE COSTE (el que faltaba, y es el más importante):
  SI alpha_percentil(i,h) NO supera el umbral calibrado al coste c(i)
     -> no emitir señal.

AMORTIGUADORES CONTINUOS (multiplican el score, no lo anulan):
  dispersión del libro alta          -> factor decreciente, umbral en p90 observado
  crecimiento de población           -> ver F_supply, §5
  rotación                           -> solo dentro del subconjunto jugable, T−120d a T−15d
  pico de atención                   -> ver C9, §5
  fase temprana de impresión         -> ver F_lifecycle, §5
  concentración de vendedor          -> ver §2.6

VETOS DE COBERTURA (duros, no negociables):
  pop10 < 20                 -> el precio del PSA 10 es ruido, no emitir
  n_unidades_activas < 5     -> no emitir nowcast
  top1_seller_share > 0,50   -> no emitir señal de retirada de oferta
  colisión de idProduct      -> excluir del modelo
  sin par JP↔EN validado     -> no emitir F_lead
  sd(log V) > 0,30           -> no emitir predicción
```

Se elimina el veto `pico_volumen > 5σ`: **no observamos volumen**, solo listings activos. Es inejecutable y contradice la premisa central del proyecto. Se sustituye por:

```
Δ(listings_nuevos/día) > 4σ  O  Δ(ask_mediano) > 3σ,  ambos con n_listings ≥ 10
```

---

## 5. Los factores, uno a uno, con fórmula y umbral

Notación: **[M]** medido por nosotros · **[P]** prior de dominio no medido, versionado · **[L]** aportado por una lente y **no verificado por nosotros** (se marca como tal en la web).

### F_supply — oferta y escasez

| Sub | Fórmula | Umbral | Estado |
|---|---|---|---|
| Dilución | `MOI = pop10 / ventas_mensuales_inferidas_del_pop10` | `MOI > 24` sobreoferta efectiva; `MOI < 6` escasez efectiva | [P] |
| Velocidad | `Δpop / (pop + k)`, k ∈ [200, 500] | carta >24 meses: `adds/mes > 3 % del pop` = dilución severa. Carta <12 meses: solo si supera el **percentil 80 de su cohorte de set** | [P] |
| Gem rate | `z-score de pop10/pop_total dentro de (era × idioma × acabado)` | Nunca un umbral absoluto | [P] |
| Reprint | ver veto duro §4.4 | `known_at` obligatorio | — |

**B2 queda derogado.** `pop10 > 5.000 → prima comprimida` es factualmente falso: el contraejemplo es la carta moderna más famosa del mercado, Umbreon VMAX 215/203 de Evolving Skies, con población PSA total ~28.100 y ~19.900 en PSA 10, y sigue siendo de las modernas más caras que existen [L]. Simultáneamente hay miles de cartas con pop10 < 300 que valen 5 EUR. **La población es OFERTA: sin demanda no dice nada.** Es la creencia falsa nº1 del hobby y la v1 la codificaba con fiabilidad "Muy alta".

**B6 queda normalizado.** El umbral fijo del 15 % es de una sola era: vintage EN gemea al 3-10 %, full arts SWSH/SV al 30-50 %, SAR japonesas al 60-80 % [L]. Y el pop report **no es una gem rate**: las submissions vienen preseleccionadas, existe pre-grading comercial, y el crack-and-resub añade al pop10 sin decrementar el pop9.

```
Haircut de selección, obligatorio en cualquier decisión de gradeo:
  P(10 | raw comprado en marketplace) = 0,50-0,70 × gem_rate_pop_report   [P]
  P(10 | raw de sobre abierto por uno mismo) = 0,85-1,00 × gem_rate       [P]

Bandera cualitativa (NO una fórmula de corrección inventada):
  si P(PSA10)/P(PSA9) > 4  ->  "la gem rate del pop report está probablemente inflada"
```

> **ADVERTENCIA BLOQUEANTE.** El pop report de PSA no tiene API pública y sus términos prohíben la recolección automatizada. `PLAN.md` dice "acceso respetuoso", que no es una licencia, y la restricción dura del proyecto es "solo fuentes legalmente aptas para producto comercial". **Toda la familia `F_supply` —que la v1 declara la señal bajista más fiable del mercado— descansa sobre una fuente cuyo estatus legal no está resuelto.** Hay que resolverlo antes de escribir código, y diseñar un plan B: proxy de velocidad de aparición de slabs en los propios listings de eBay, que sí es dato que la API nos entrega.

### F_lead — señal adelantada Japón → Inglés

**La corrección más importante del catálogo de dominio.** El v1 dice "1-6 meses de antelación" y "el mayor alpha disponible a coste cero". El adelanto real es mucho menor y **se está comprimiendo por decisión del fabricante**.

```
Gaps JP -> EN medidos [L]:
  Era Escarlata/Púrpura, ~34 emparejamientos: media ~52 días
  Era Mega Evolución, los siete gaps: 49, 77, 56, 56, 56, 61, 51
    (cuatro exactamente 56)
  Outlier largo conocido: 98 días. Es la excepción.

Con 56 días de gap y ~30 días de curva JP necesarios para que la señal sea
informativa, el adelanto ACCIONABLE sobre la preventa inglesa es de 3-4 semanas.

  CONTRADICCIÓN RESUELTA: la corrección de A1 prohíbe emitir señal antes del
  release (los asks de preventa tienen volumen y fill rate prácticamente cero).
  Por tanto F_lead NO se emite sobre preventa. Su valor es de FORMA DE CURVA,
  no de timing de compra: la curva JP a τ=45 informa sobre la curva EN en τ=0..45.

lead_days = release_en − release_jp,  POR PAR DE SETS, nunca constante.
Monitorizar d(lead_days)/dt y AVISAR PÚBLICAMENTE cuando deje de ser explotable.
```

**Lo transferible es el RANGO, no el nivel.** La ilustración es idéntica, así que el orden de deseabilidad dentro del set es casi invariante al idioma; el nivel no lo es, porque los pull rates y las tiradas difieren.

```python
# JOIN: determinístico primero. pHash SOLO como auditoría.
match = (par_de_sets_manual) × (localId) × (dexId) × (illustrator)
# El join determinístico resuelve la gran mayoría. Los casos que no resuelve
# (sets EN que funden dos JP, cartas sin contraparte, escaleras de rareza
# distintas) son exactamente los casos donde pHash tampoco puede resolver nada,
# porque no hay contraparte. pHash aporta VALIDACIÓN, no cobertura.
pHash sobre el crop de ilustración, hamming < 8, con tasa de acuerdo publicada.

# SEÑAL
rank_jp(c,τ) = percentil de P(c) entre las cartas de su clase de rareza en su
               set JP, a τ días del release JP
F_lead(c_en) = rank_jp(c_jp, τ=45) − rank_jp(c_jp, τ=7)
  > +15 pp -> ALCISTA vs su cohorte EN      < −15 pp -> BAJISTA
  Exigir tamaño de cohorte ≥ 8 e intervalo bootstrap sobre el rango.
```

**Dónde funciona y dónde no** (esta tabla se publica; es la parte más valiosa del factor):

| Régimen | ρ de Spearman esperado [P] |
|---|---|
| Rarezas de ARTE sin relevancia competitiva (SAR→SIR, AR→IR, CHR, CSR) | 0,70-0,85 — **funciona** |
| Full arts de Pokémon jugables | 0,2-0,4 — funciona a medias |
| Entrenadores/supporters y gold/hyper rares | ~0 — **no funciona** (meta y rotación distintos) |
| Tratamientos exclusivos EN (promos de ETB/UPC, Trainer Gallery) y promos JP exclusivas (Champions League, CoroCoro, Gym, loterías) | **no existe canal** |
| Vintage | **canal invertido**: manda EN y JP sigue |

> **Limitación honesta que hay que declarar.** Los precios japoneses que observamos vienen de **Cardmarket, que es un mercado europeo**: es la reventa europea de importaciones japonesas, no la demanda doméstica japonesa (Mercari, Yahoo Auctions). Comparten base compradora con las inglesas. **Antes de emitir nada hay que medir el signo del lead**: regresar `r_en(t)` sobre `r_jp(t−k)` para k ∈ {−30..+90} y comprobar que el máximo está en k>0. Si el pico está en k≤0, el canal está invertido y se apaga. Cuesta 3 meses de captura y 0 EUR.
>
> **Punto a favor, verificado por nosotros:** las cartas japonesas cotizan en EUR en Cardmarket (0 % de cobertura TCGplayer en JA). Ambas patas de D5 están en el mismo numerario, así que **el EUR/JPY no contamina la señal**, contra lo que sugería una de las lentes.

**D7 queda invertido y sacado de `F_lead`.** "Cartas japonesas +15-40 % sobre inglesas" es falso en moderno: el pull rate japonés es mejor, las cajas JP son más baratas por sobre, Japón reimprime de forma continua, y el dinero marginal del hobby paga por inglés. El ratio EN/JP para chase moderno está en **[1,5, 4,0]** [L]; medido sobre el par emblemático en el mismo mercado y misma divisa, ~2,5× [L]. Se publica como **estadística descriptiva**, no como factor. El caso JP > EN existe pero es estrecho y hay que enumerarlo: promos japonesas exclusivas, algunos e-Card, cartas sin equivalente inglés.

### F_arb — arbitraje

**D1, raw→graded.** La fórmula del v1 (`P(PSA10) − P(raw) − coste_gradeo > 0`) está incompleta en cinco frentes y usa turnarounds de hace tres años.

```
Estado real de PSA a agosto de 2026 [L, VERIFICAR CONTRA psacard.com ANTES DE CODIFICAR]:
  Tier Value PAUSADO desde el 2 de junio de 2026
  Value Bulk  $24,99  ->  140-160 días HÁBILES  (~7-8 meses de calendario)
  Value       $32,99  ->  pausado
  Value Plus  $49,99
  Value Max   $64,99
  Regular     $79,99  ->  40-50 días hábiles

EV_grado(i,t) =
    Σ_g P(g | i, origen_raw) · P_g(t) · (1 − fee_venta − fee_pago) − envío_venta
  − P_raw_ask · (1 + fee_compra) − coste_grado − envío_ida_vuelta_asegurado / N_lote

  P(g | raw) se especifica como MATRIZ DE TRANSICIÓN explícita desde la
  distribución del pop report, con la masa desplazada del 10 hacia 9 y 8 en
  proporciones DECLARADAS. Multiplicar una distribución por un escalar no da
  una distribución. El haircut se expone en la UI con deslizador.

  drift = 0 (o drift del índice del segmento). NUNCA el alpha del propio modelo:
  8 meses está fuera del horizonte validado y correlaciona la señal de gradeo
  con la de precio, de modo que un error se comete dos veces en la misma dirección.

REGLA DE EMISIÓN:
  EV_grado / coste_total − 1  >  0,25 + 1,5 · σ_TAT(i)
     σ_TAT = vol_anualizada(i) · sqrt(TAT_días / 365)
  Y ADEMÁS dispersión del libro raw aceptable:
     trend/low dentro de banda  Y  avg7 vs avg30 no divergen más de un 25 %
     (la condición original "≥5 asks NM dentro del +15 % del mínimo" es
      INEJECUTABLE: no tenemos libro de órdenes de Cardmarket)
  Y ADEMÁS P_raw = trend.  NUNCA low.
```

**Consecuencia que hay que mostrar, no esconder:** con TAT de 7-8 meses a $25, o 2,5 meses a $80, **la mayoría de cartas modernas por debajo de ~120 EUR raw son −EV de gradear** [L]. Decir "NO gradees esto, y aquí está el número" es más valioso y muchísimo más creíble que otra señal alcista. D1 baja de fiabilidad "Muy alta" a **"Alta condicionada a ejecución"**.

**D2, arbitraje EU↔US.** No es un arbitraje: es un **spread estructural** que lleva años sin cerrarse porque los costes de fricción lo impiden. El v1 ignora la frontera, que es lo que mata la operación.

```
spread_neto = (P_US − P_EU)
            − envío internacional asegurado (15-40 EUR)
            − IVA de importación (19-27 % según país de la UE, desde el primer euro)
            − aranceles y gastos de gestión del transportista (8-20 EUR)
            − comisiones de AMBOS lados
            − conversión y cobro FX real (~2 %, NO el spot del BCE)

Emitir SOLO si spread_neto > 12 %.
Y ADEMÁS flag vendedor_envía_internacional (deducible de los datos de envío).
Mostrar el DESGLOSE COMPLETO en la señal, nunca solo el resultado.
D2 baja de "Muy alta" a "Media, condicionada al modelo de costes".
```

**D3, escalera de grados:** desviación respecto a `λ_c` (§3.6), no respecto a una mediana ruidosa. Y con la advertencia de que si `λ_c` se estima con 20 observaciones y κ=20, la mitad de `λ_c` es el prior, así que D3 mediría desviación respecto a nuestra propia suposición.

**D6, prima entre gradeadoras:** no es una jerarquía constante. `ratio_gradeadora(cohorte, grado)` se estima **por cohorte** (era × idioma × banda de precio), actualización mensual. Priors: CGC 10 ≈ 50-70 % de PSA 10 en moderno; BGS 9,5 < PSA 10; BGS 10 Black Label y CGC Pristine 10 en otra curva; prima de PSA mayor en vintage que en moderno [L].

### F_lifecycle — ciclo de vida

**A2/A3 quedan derogados como reglas de calendario.** "Inundación 0-60 días, suelo 60-120" describe la era 2019-2021. La variable causal no es el calendario, es el **estado de impresión**.

```
Máquina de estados, SUSTITUYE a dias_desde_release:
  {preventa, print_inicial, reimpresión_activa, última_tirada, OOP}

Transición inferida SOLO de señales point-in-time y auditables:
  - densidad semanal de listings sellados nuevos
  - anuncios públicos fechados
Cada transición se registra con la fecha en que se INFIRIÓ, no con la fecha en
que se cree que ocurrió. Sin esa disciplina la máquina de estados es una máquina
de fuga: inferir "OOP" hacia atrás usando lo que sabemos hoy es trivial de hacer
sin darse cuenta.

EL SUELO llega tras la transición reimpresión_activa -> OOP, no en el día 90.
Prior actualizado para sets EN modernos: MES 8-16, no mes 2-4  [P]

A1 (preventa): marcar dias_desde_release < 0 como confidence:low y NO emitir señal.
A5 (maduración vintage): DEROGADO como factor. Es sesgo de supervivencia
   presentado como mecanismo. Se sustituye por CERTEZA DE OFERTA:
     OOP_confirmado × 1/(1 + crecimiento_pop_12m) × z(log pop dentro de cohorte)
   más MOMENTUM RELATIVO DE COHORTE DE ERA contra el índice de vintage.
   El "reloj de nostalgia" con retardo L≈22 años se publica, si acaso, como
   ARTÍCULO editorial etiquetado como hipótesis con n=2, fuera del motor.

REGLA DURA JAPONESA: no aplicar la curva OOP inglesa al sellado japonés, salvo
los "high class" descatalogados. Japón reimprime de forma continua.
```

### F_demand — demanda

| Sub | Fórmula | Notas |
|---|---|---|
| Prima de especie | `species_premium(species, as_of)` con fecha | **Nunca** una columna mutable |
| Prima de artista | `artist_premium(artist_id, as_of, premium, n_obs)` | Sustituye a `artists.avg_premium`, que es lookahead directo |
| Estilo de arte | rareza + patrón | Estructural |
| Meta competitivo | `meta_share` de Limitless | Solo dentro del subconjunto jugable |
| Saturación de especie | **No se emite como factor** | El signo es desconocido: un chase nuevo puede reactivar la atención sobre la especie entera. Se publica como **divulgación contextual**: *"esta especie ha recibido 3 nuevos chase de rareza ≥ en los últimos 24 meses"*, con la lista y las fechas, dejando la interpretación al usuario |

**C5, rotación:** condicionar a `meta_share > 0`. La rotación afecta a cartas jugables de 1-25 EUR; las alt art y SIR son demanda de coleccionista en un 90 %. Y se anuncia con ~6 meses de antelación: **la caída va de T−120 d a T−15 d**, no "inmediato". Fiabilidad: Alta dentro del subconjunto jugable, **nula** fuera.

**C8, anime/película:** baja a fiabilidad **Baja** y se renombra "catalizadores programados". Lo que mueve precios son anuncios de PRODUCTO con fecha, no episodios. Se mide como estudio de eventos sobre alpha (CAR en ventanas [−21,−1], [0,+7], [+8,+30]) exigiendo `|CAR| > 2·EE` en al menos 3 ocurrencias, con corrección de multiplicidad. Con 3-5 ocurrencias limpias, eso significa que **no se emitirá nada por calendario en el año 1**, y eso es la respuesta correcta.

**C9, pico de atención:** se conserva como amortiguador con la definición observable (`Δ listings_nuevos > 4σ` o `Δ ask_mediano > 3σ`).

### F_calendar — estacionalidad

**E3 queda segmentado.** Las magnitudes del v1 (+10-20 % nov-dic, −15-25 % ene-feb aplicadas a todo el mercado) están infladas y el signo es dudoso en el segmento que más factura.

```
Priors segmentados [P], a estimar desde datos, no fijados:
  Sellado:              +8 a +15 %  oct-dic
  Graded de gama alta:  PLANO o NEGATIVO en diciembre
                        +5 a +10 %  feb-abr (devoluciones de impuestos en EE.UU.)

Features (no factores con signo a priori):
  dias_a_próxima_release_EN, dias_a_próxima_release_JP,
  dias_a_Pokémon_Presents, dias_a_Worlds, fase_del_ciclo_de_release

Con UN solo diciembre observado en el año 1, hay cero grados de libertad.
No se emite estacionalidad hasta tener 3 años.
```

### F_value y F_momentum

```
F_value     = −z( log M_v(i,t) − log V̂(i,t) )     precio vs valor justo (Capa 1)
              + z( valor relativo vs cohorte )
F_momentum  = rank-normal de r_30 y r_90 sobre la MARCA DE LIQUIDACIÓN,
              ortogonalizado el ÚLTIMO. Nunca sobre retornos diarios de una media móvil.
```

### F1-F4 y los anti-patrones

**F1, errores de impresión: sale del catálogo de señales y pasa a HIGIENE DE DATOS.** En Pokémon moderno no hay prima por miscut (1-2×, no 10×) [L], pero un miscut PSA 10 listado a 3× envenena el ask mínimo y los comparables, y por tanto todo el nowcasting. Regex de exclusión en §2.6. Se mantiene un catálogo aparte de errores con nombre propio, con instrumentos propios.

**F3, récord de subasta: se invierte el uso.** Es un anti-patrón, no una señal: perseguir un récord es la forma más rápida de comprar el máximo. Se winsoriza al percentil 95 y **se exige corroboración**: un récord solo cuenta si en los 14 días siguientes el percentil 25 de la distribución de asks del instrumento sube ≥8 %. Sin corroboración: "evento no confirmado", sin señal.

**F2, promos y sellos con oferta cierta.** El esquema ya los representa (§2.5). Se cubren en el catálogo y se valoran, pero **no se emite señal**: `n_listings` suele ser <5 y el veto de cobertura los apaga. La prima staff/judge (prior 3-10× la de competidor [L]; si <2×, infravalorado) se muestra como dato, no como arbitraje: hay riesgo de falsificación y no hay ejecución.

**Sección obligatoria de anti-patrones**, publicada. Es contenido de alto valor y refuerza el mismo foso que el track record: somos los únicos que decimos lo que NO funciona.

1. "Poca población = valiosa" — falso sin demanda.
2. "El sellado siempre sube" — falso mientras siga en imprenta.
3. "Las japonesas son mejor inversión" — falso en moderno: son sistemáticamente más baratas y se reimprimen más.
4. "El PSA 10 es donde está el dinero" — falso por debajo de ~120 EUR raw con los TAT actuales.
5. "La gem rate del pop report son tus probabilidades" — falso: preselección + crack-and-resub.
6. "Compra en preventa" — el peor punto de entrada sistemáticamente.
7. "Los errores y miscuts valen mucho" — falso en moderno.
8. "Un récord de subasta marca un suelo nuevo" — falso.
9. "La rotación hunde los precios" — falso fuera del subconjunto jugable.
10. "Compra Charizard, siempre sube" — Charizard es la especie con **mayor** riesgo de saturación.
11. "El anime mueve precios" — no medible; lo que mueve son los anuncios de producto.

### §5.1 — Nowcasting desde la oferta: reclasificado

`ALGORITMO.md` §5.1 se vende como "nuestra mayor ventaja competitiva". **Baja a hipótesis sin validar**, por tres razones que se acumulan:

1. **No es computable sobre la fuente primaria.** TCGdex no expone recuento de listings de Cardmarket (verificado sobre nuestra captura). El ejemplo del v1 está en euros, es decir Cardmarket: ese motor **no existe** ahí. Solo existe sobre los ~2.000 instrumentos graded de eBay.
2. **La señal no está identificada.** "Caen los listings y sube el ask" es igualmente compatible con demanda absorbiendo oferta (alcista) que con vendedores retirando producto ante un mercado que cae (bajista). La corrección de 2022-23 fue exactamente el segundo caso.
3. **Parte de la señal es artefacto de muestreo** (§2.6).

```
MATRIZ DE RÉGIMEN, SOLO CON OBSERVABLES (sin necesitar el reparto venta/retirada):
  EJE 1, dirección: re-precio de los MISMOS listings a 7 días (repeat-ask)
  EJE 2, absorción: (salidas VERIFICADAS por getItems / stock)
                    − (tasa de REAPARICIÓN en 21 días)

                   absorción SUBE            absorción BAJA
  precio SUBE  |  DEMANDA REAL (alcista)  |  RALLY FALSO (marcaje sin transacciones)
  precio BAJA  |  CAPITULACIÓN            |  DESERCIÓN (el mercado se apaga)

Los umbrales se PRE-REGISTRAN antes de mirar los datos.
Ninguna señal basada en caída de listings se emite sin verificación item-level.
```

**Dos experimentos de falsación, semana 4, coste ~1 día cada uno:**

```
(1) RATIO DE ARTEFACTO: simular un mercado de precios FIJOS con la serie REAL
    de recuentos de listings. Toda señal que emita el motor es 100 % artefacto.
      ratio_artefacto = var(señal simulada) / var(señal real)
    Si > 0,30, la señal es mayoritariamente ruido de muestreo. Publicar el ratio.

(2) ADELANTO REAL: correlación cruzada entre Δ(suelo del libro) en t y
    Δ(avg7 de Cardmarket) en t+k, k = 0..10, con el factor común de segmento
    eliminado. Si el máximo está en k ≤ 0, NO HAY ADELANTO y hay que reescribir
    la propuesta de valor. Mejor descubrirlo en la semana 4 que en el mes 8.
```

Se elimina de la Parte 4.3 la afirmación "detectamos el movimiento en el día 1-2; Card Ladder y Alt lo ven el día 3-5" hasta que el experimento (2) la respalde con un número y su intervalo.

---

## 6. Coste de transacción y universo invertible

**Este es el componente de mayor valor por unidad de esfuerzo de todo el proyecto, y se envía primero.** No depende de ningún modelo, no depende de histórico, y es la única cosa verificable por el usuario con su propia calculadora el primer día.

```
c(i, P, perfil_usuario) =
      fee_venta          0,05 (Cardmarket) ... 0,13 (eBay + gestor de pagos)
    + fee_pago_FX        ~0,02 (conversión real, NO el spot del BCE)
    + 2·E / P            E = 6-14 EUR por trayecto asegurado con seguimiento
                              <- COSTE FIJO: por eso el % explota a la baja
    + 0,5 · dispersión(i)
    + [si cruza aduana]  IVA de importación (19-27 %) + gestión (8-20 EUR)
    + [si es D1]         gradeo (25-80 EUR) + envío ida/vuelta + 1-2 % daño/pérdida
                         + carry de 2,5-8 meses + riesgo de grado
```

### 6.1. La tabla que va en la ficha

| P (EUR) | dispersión [P] | Coste ida y vuelta | Veredicto |
|---|---|---|---|
| 20 | 0,35 | **~106 %** | Ininvertible, punto |
| 50 | 0,32 | ~67 % | Ininvertible |
| 100 | 0,30 | ~40 % | Solo con alpha muy fuerte y h ≥ 180 d |
| 400 | 0,25 | ~25 % | — |
| 1.500 | 0,18 | ~19 % | Suelo práctico del mercado |

Se publica como **calculadora transparente parametrizada por el usuario** (país, plataforma, envío, seguro, IVA de importación, comisión del gestor, FX real), no como constantes. Que el usuario vea la fórmula y cambie los supuestos es el 90 % del valor y cuesta un día de trabajo.

### 6.2. Universo invertible, derivado y no fijo

```
Un instrumento es RANKEABLE a horizonte h si:
   c(i, P) < alpha_máximo_creíble(h)     con alpha_máximo_creíble(180d) = 25 %  [P]
   Y  M_v(i) ≥ 30 EUR         <- DERIVADO de la tabla, no elegido
   Y  cambio en el vector de precios en > 60 % de los últimos 30 días
   Y  idProduct no compartido con otro instrumento
   Y  no excluido con detectable_desde ≤ t
   Y  [si graded] n_listings ≥ 5 Y top1_seller_share ≤ 0,50

MEDIDO SOBRE NUESTRA CAPTURA:
   trend ≥ 30 EUR  ->  1.908 instrumentos raw  (1.401 EN + 507 JA)
   más el subconjunto graded que la cuota de eBay cubra (~2.000 T1)

  ==> VALORAMOS ~36.000 INSTRUMENTOS. RANKEAMOS ~1.900-3.900.
      Y SE DICE EN LA PORTADA DEL PRODUCTO.
```

### 6.3. El campo de UI más valioso del producto

Para todo instrumento **no** rankeable, en vez de un score:

> *"Coste de ida y vuelta: 67 %. Esta carta no es un vehículo de inversión a ningún horizonte."*

Y para los rankeables, el **precio de indiferencia**, calculable con solo la fórmula de coste:

> *"A 470 EUR, esta compra necesita un +28 % en 180 días solo para cubrir costes."*

Ninguna herramienta dice esto nunca. Alt es un marketplace y Card Ladder vive del tráfico: **ninguno tiene incentivo para decirle a un usuario que su carta no es invertible**. Nosotros sí, porque no cobramos por transacción. Es una asimetría estructural, no una feature.

### 6.4. Capacidad y huella propia

```
Proxy de capacidad (declarado como PROXY, no como capacidad):
  capacidad(i) = min( 3 unidades × V̂(i),  0,05 × presupuesto )
  y en el subconjunto con panel eBay, además: 0,25 × listings_activos × V̂(i)

REGLA DE PRODUCTO, declarada en la metodología ANTES de tener usuarios:
  - nunca publicar recomendación de compra sobre un instrumento con < 5 listings activos
  - publicar siempre listas AMPLIAS (top-40), nunca un top-10 escaso
  - registrar el drift a 7 y 30 días de todo lo publicado y publicarlo tal cual,
    con la advertencia explícita de que parte de ese drift puede ser NUESTRO

Se DESCARTA el cuasi-experimento publicados-vs-control: sin aleatorización real
no hay experimento, y con aleatorización real hay un problema ético que habría
que declarar antes. La medición pasiva es más barata, es cierta y es más creíble.

TURNOVER como restricción de PRIMERA línea, por delante del alpha:
  turnover = 0,5 · Σ|w(i,t) − w(i,t−1)|;  objetivo < 50 % por trimestre.
  Con c ≈ 25 %, un turnover del 200 %/año se come 50 puntos de retorno.

BANDA DE NO NEGOCIACIÓN, sin ningún parámetro discrecional:
  no cambiar una recomendación mientras el cambio de score no supere el
  coste de ida y vuelta del instrumento.
```

---

## 7. Cómo funciona sin histórico, y cómo evoluciona

### Mes 0 — el día 1, con cero filas de serie temporal

**Funciona:** catálogo completo en 14 idiomas con imágenes, ilustrador y precios; valoración con pooling parcial sobre el prior de cohorte para el 100 % del catálogo, con intervalo ancho y honesto y etiqueta de evidencia; **comparables cross-seccionales de valoración** (*"estas 12 cartas comparten set, rareza, estilo y rango de precio; su distribución de precios hoy es ésta; tu carta está en el percentil X"* — cross-seccional, sin ningún histórico, auditable, y ataca directamente la queja documentada nº3); ratio raw→graded desde el hedónico contrastivo; escalera de grados monótona; **calculadora de coste de ida y vuelta y precio de indiferencia en TODAS las fichas**; vetos de reprint y de coste; score de ranking equiponderado con signos congelados, etiquetado **"no validado, n_eff = 0"** con contador visible; `dias_sin_cambio` en cada ficha.

**Se pone en marcha y no se puede recuperar después:** el cron de captura diario (13 min/día); el snapshot mensual point-in-time de tarifas y TAT de PSA; el calendario de eventos versionado en git con `known_at`; la cadena de hashes del track record; el estrato aleatorio de 500 instrumentos con D fijo; el detector de colisiones por `idProduct` compartido (gratis y hoy: 940 productos, 1.986 cartas).

**No funciona:** nada que requiera una serie temporal propia.

### Mes 3

Aparece la primera serie de 90 días. Se activan: índice de mercado por 4 segmentos con constituyentes point-in-time; alpha por demedianado cross-seccional; `F_momentum` sobre `r_30` real; velocidad de población con 3 lecturas; nowcasting de eBay **si y solo si** el experimento de ratio de artefacto salió por debajo de 0,30; primeras subastas cerradas como verdad de campo (~cientos de desenlaces limpios). Primeras predicciones a 30 días vencidas: n_eff ≈ 3-8. Se publica el track record con veredicto **"aún no distinguible de cero"**.

### Mes 6

`F_lead` entra en producción si la correlación cruzada JP→EN tiene su máximo en k>0. Regresión cross-seccional WLS semanal con ~26 cortes. Hedónico contrastivo con ~2.000 pares de misma carta. Cobertura empírica de los **intervalos de valoración** publicada (converge rápido: los residuos de valoración son mayoritariamente idiosincrásicos, así que su n_eff es de miles, a diferencia del n_eff direccional). Track record a 90 días con n_eff ≈ 8-15: sigue sin ser distinguible de cero, y se dice.

### Año 1

Un ciclo estacional completo (un diciembre: cero grados de libertad para estacionalidad). Suficientes subastas para calibrar π y δ del modelo de mezcla. Primer walk-forward con **dos pliegues** — no CPCV: con 365 días, purga 40 y embargo 150, la mediana de días de entrenamiento por camino es **32**, y solo 3 de 15 caminos superan 100 días. CPCV **no arranca hasta el mes 24**, y se dice.

### Año 2+

CPCV con 6 bloques sobre ≥730 días (mediana 214 días de entrenamiento por camino, 14/15 caminos viables) y PBO. Matriz de covarianzas de factores con ≥90 cortes. Primera posibilidad real de que `IC_post` se despegue del prior. Motor de análogos, si acaso, con la restricción temporal obligatoria: *para un caso en t, solo son elegibles análogos cuyo desenlace a `t_análogo + h` ya hubiera vencido antes de t*.

### Nunca, con 0 EUR

Detección de régimen (necesita 5-10 transiciones = 5-10 años). Histórico anterior a hoy para raw: **TCGdex no expone series de precios**, y raspar los gráficos de Cardmarket viola sus ToS. Ventas cerradas de eBay. Resultados de Goldin/PWCC/Heritage, que fijan el precio del extremo alto.

---

## 8. Validación, fugas prohibidas y calibración

### 8.1. Lista completa de fugas prohibidas

Cada una tiene un test automático en CI. La lista se publica.

**A. Fugas de medición (el filtro se mide a sí mismo)**

1. Calcular features y etiqueta sobre la **misma serie suavizada** (`avg30` contra `avg30`) en frecuencia diaria: fabrica autocorrelación de 0,967 y momentum espectacular inexistente.
2. Usar el **suavizador completo** `x̂(t|T)` (RTS) para "limpiar" series históricas: es lookahead puro disfrazado de calidad de datos. Solo se admite un suavizador de retardo fijo `x̂(t|t+L)` con L pre-registrado, y L entra en el cálculo de purga.
3. Usar `pricing.updated` como fecha de evento: es un sello de batch (7 valores distintos en 19.818 cartas). Produce una staleness fantasma que el modelo explotará.

**B. Fugas de conocimiento (sabíamos algo antes de poder saberlo)**

4. **Pop report:** usar la cifra vigente hoy para una fecha pasada. PSA **revisa hacia atrás** (crackeados, auditorías) y el gem rate **no es estacionario** (las primeras remesas son cherry-picked y el gem rate decae). Servir siempre la última lectura cuya **fecha de publicación** sea ≤ t, no la última cuya fecha de referencia lo sea.
5. **Venta inferida por regla de 14 días:** evento en N, conocimiento en N+14. Es 14 días de lookahead en todo el módulo graded.
6. **`confianza_venta` calculada a partir del resultado realizado** (¿reapareció?): es la etiqueta disfrazada de feature. Dos columnas separadas: `p_sold_provisional` (información hasta N, única que ven features y producción) y `p_sold_final` (solo para entrenar el propio modelo).
7. **`known_at` de reprints = fecha del anuncio oficial.** El mercado lo supo cuando se filtró la lista japonesa, semanas antes. Sin `known_at` datable, el veto B4 parecerá espectacular y será lookahead.
8. **Tarifas y TAT de PSA de hoy aplicadas a operaciones pasadas.** Invierte conclusiones: con TAT de 2,5 meses y con TAT de 8 meses las respuestas son opuestas.

**C. Fugas de esquema (columnas mutables sin fecha)**

9. `artists.avg_premium` calculada sobre la carrera completa del artista.
10. `species_premium` / popularidad de especie con la tabla de hoy.
11. **`instruments.liquidity_tier` mutable con promoción automática.** Es la peor de todas: backtestear sobre el T1 de hoy selecciona cartas que **llegaron a ser** valiosas, y el criterio de selección es literalmente la variable objetivo. Sustituir por `instrument_tier_history(instrument_id, tier, valid_from, valid_to)`.
12. **Reescribir `price_snapshots` al corregir un mapeo.** La cola de revisión procesa "caras primero" y "las que más se movieron", así que la calidad histórica mejoraría de forma correlacionada con el resultado futuro. Se versiona el mapeo y se conserva la serie antigua.
13. **Índice de mercado revisado retroactivamente.** Un índice que se reestima entero invalida todos los alphas pasados. Es inmutable y versionado.

**D. Fugas de selección (elegimos la muestra mirando el resultado)**

14. **Detector de colisiones aplicado desde el primer día de la ventana de N días:** elimina datos malos antes de que fuera posible saber que eran malos. `exclusions(instrument_id, motivo, detectable_desde, spec_version)` donde `detectable_desde` es el día en que la ventana se **completa**.
15. **Cola de revisión "caras primero"** sin una muestra aleatoria fija por semana: sin ella no se puede medir la tasa de error de mapeo sin sesgo.
16. **Universo evaluable definido con datos de hoy:** la pertenencia al universo es point-in-time y se congela en el momento de la predicción.
17. **Predicciones no liquidables descartadas.** Las cartas que dejan de negociarse son desproporcionadamente las que colapsaron: descartarlas infla la precisión sistemáticamente.
18. **Subastas sin pujas descartadas** (`PLAN.md` §5). Es la observación más informativa sobre el techo de la demanda; descartarla es la misma censura que sufre Alt.
19. **Ponderar el entrenamiento por `observabilidad(t+h)`:** es una variable post-tratamiento correlacionada con el resultado. Se **estratifica en t**, no se pondera por t+h.
20. **Motor de análogos sin restricción temporal:** vecinos cuyo desenlace es posterior a t.
21. **Ponderaciones de capacidad/ADV de hoy aplicadas a métricas pasadas.**

**E. Fugas de proceso (nos evaluamos con lo que ya usamos)**

22. **IC muestral usado para pesar factores y después publicado como track record:** es in-sample por construcción. Los pesos de hoy usan solo IC hasta `t − h − embargo`, y se dice.
23. **Conjunto de calibración compartido con el conjunto de ajuste.** Terapeak se partiría en cuatro usos (calibración de mezcla, entrenamiento de ρ, ajuste de correlaciones, auditoría) y todas las garantías caen a la vez. **Partición sellada, cerrada bajo llave, no consultable durante el desarrollo.**
24. **Calibrador ajustado sin purga ni embargo** entre train-modelo y train-calibración: el calibrador es un parámetro del modelo y hereda todas sus restricciones temporales.
25. **EWMA de features aplicado sobre la serie reconstruida hoy** en lugar de point-in-time. Es muy fácil de cometer con Polars/DuckDB y muy difícil de detectar después.
26. **Umbrales afinados mirando el resultado sin contarlos como ensayo.**
27. **SHAP recalculado hoy** y presentado como explicación de una predicción de hace tres meses.
28. **Reflexividad:** nuestras publicaciones mueven el precio contra el que nos puntuamos. Se mide con un diseño de discontinuidad en la regresión alrededor del umbral de publicación, **desde el año 1**, y se declara.

### 8.2. El test que sí detecta fuga

El "canario" ingenuo (inyectar `feature_placebo(i,t) = retorno(i,t+h)` con `knowledge_time = t`) **no funciona**: un pipeline con as-of join correcto la acepta, porque la fuga está en el valor, no en el join.

```python
# SHIFT-TEST DE REPRODUCIBILIDAD, en cada PR:
# para 200 pares (instrumento, fecha) al azar, recalcular TODAS las features
# con el panel truncado en t y exigir igualdad BIT A BIT contra el feature store.
# Esto sí falla ante fuga real.
```

Y a nivel de infraestructura:

```sql
REVOKE UPDATE, DELETE ON price_snapshots, population, inferred_sales,
                          predictions, market_index, features FROM app_role;
-- Más un job diario que verifica la cadena de hashes contra la base: el REVOKE
-- por sí solo es una valla con la puerta de las migraciones abierta detrás.
```

### 8.3. Purga, embargo y potencia estadística

```
PURGA   = h + L_liquidación              (h=30, L=10 -> 40 días)
EMBARGO = L_max                          (pop report 60 -> 60 días)
  NO W_max + L_max: la ventana de lookback W_f se trata PURGANDO bilateralmente
  las observaciones cuya ventana solapa el test. Sumarla al embargo descuenta el
  mismo día dos veces y es parte de por qué el año 1 se queda sin pliegues.

CAPS DUROS PUBLICADOS EN EL AÑO 1:  W_f ≤ 90 días,  L_f ≤ 60 días
Metadato (W_f, L_f) obligatorio por feature, validado en CI.

BURN-IN CONGELADO: los primeros 6 meses son CALIBRACIÓN Y NADA MÁS. Nunca se
puntúan, nunca entran en test, nunca aparecen en el track record. Las features de
ventana expansiva (primas de artista y especie) tienen lookback infinito y por
tanto embargo infinito: se estiman ahí, se congelan, y luego se actualizan as-of.
```

**La aritmética incómoda.** La unidad de observación no es `(carta, día)` sino el **IC cross-seccional diario**: un número por día.

```
N_eff = N / (1 + (N−1)·ρ)     converge a 1/ρ INDEPENDIENTEMENTE de N
  ρ sobre RETORNOS BRUTOS ≈ 0,15  ->  N_eff ≈ 6,7 (con 2.000 o con 20.000 cartas)
  ρ sobre ALPHAS RESIDUALIZADOS ≈ 0,02-0,05  ->  N_eff ≈ 20-50   <- el correcto
  ρ SE MIDE, no se asume. Y sd(IC diario) ≈ 1/sqrt(N_eff − 1): los dos números
  deben ser coherentes entre sí. Asumir sd(IC)=0,10 implica N_eff ≈ 100.

T_eff = T / h
t = mean(IC_t) / se_NW(IC_t),  Newey-West con lag h−1 (etiquetas solapadas)

DÍAS NECESARIOS PARA t = 3 (con sd(IC) = 0,10):
  IC verdadero 0,02  ->  4,3 años a h=7   |  18,5 años a h=30
  IC verdadero 0,03  ->  1,9 años a h=7   |   8,2 años a h=30
  IC verdadero 0,05  ->  0,7 años a h=7   |   3,0 años a h=30
  IC verdadero 0,08  ->  4 meses a h=7    |   1,2 años a h=30

CONCLUSIÓN, QUE VA EN LA PORTADA DEL DOCUMENTO Y EN LA WEB:
  En el año 1 es MATEMÁTICAMENTE IMPOSIBLE validar un alpha sutil de ML.
  Solo se pueden validar señales fuertes (IC ≥ 0,08), que son las de coste
  y las de oferta cierta. El LightGBM del mes 10 NO se podrá validar ni publicar.
```

Y la corrección que la lente de fiabilidad casi escribe y hay que escribir entera: en un mercado **long-only**, con topes de concentración, capacidad minúscula y bandas de no negociación, el **coeficiente de transferencia** realista está en 0,3-0,5.

```
Amplitud efectiva:  BR_eff = N/(1 + (N−1)·ρ_residual)
  con N ≈ 1.900 y ρ_residual = 0,05  ->  BR_eff ≈ 20
  (calcular también con los AUTOVALORES de la matriz de correlación residual,
   porque la fórmula supone equicorrelación, y publicar ambos)

IR_anual = TC · IC · sqrt(BR_eff · periodos)
  TC=0,4 · IC=0,05 · sqrt(20 · 4)  ->  IR ≈ 0,18

  Con costes de ida y vuelta del 20-40 %, un IR de 0,18 es modesto. LA CIFRA SE
  PUBLICA EN LA PÁGINA DE METODOLOGÍA DESDE EL DÍA 1. Es la cifra más importante
  del proyecto y es la que decide si el producto de ranking merece existir.

CONSECUENCIA ESTRATÉGICA: d(IR)/d(ρ) es del mismo orden que d(IR)/d(IC).
  Invertir en NEUTRALIZACIÓN (mejor definición de cohorte, más segmentos, más
  idiomas independientes) rinde tanto como inventar factores nuevos, y es más
  barato y más rápido. El v1 está orientado íntegramente a subir el IC y no
  dedica una línea a bajar ρ.
```

### 8.4. Registro de ensayos y pre-registro

```python
@registrar_ensayo                      # instrumentado en el evaluador, NO manual
def evaluar(spec, datos):
    REGISTRO.log(trial_id, sha256(canonical(spec)), autor, timestamp, git_sha,
                 purga, embargo, universe_rule_id, semilla,
                 fase='exploracion'|'validacion')
# N_ensayos SE PUBLICA junto a cada métrica.
```

**Por qué importa, verificado por simulación** (máximo de |t| bajo el nulo):

| Ensayos | E[max\|t\|] | p95 |
|---|---|---|
| 10 | 1,88 | 2,80 |
| 40 | 2,43 | 3,22 |
| 100 | 2,75 | 3,48 |
| 200 | 2,97 | 3,66 |
| 1.000 | 3,44 | 4,04 |

Con ~40 casuísticas, 9 familias y ~10 umbrales ajustables, el espacio de ensayos efectivo llega a las centenas. **El umbral clásico de 1,96 garantiza que el "mejor factor" sea ruido.**

```
UMBRAL DE PUBLICACIÓN:  t > 3,0 con ≤40 ensayos · t > 3,5 con ≤200 · t > 4,0 por encima
  (los ensayos son DEPENDIENTES entre sí -todos derivan del mismo panel-, así que
   estos umbrales son conservadores en la dirección buena; se declara)

FDR con Benjamini-YEKUTIELI (no BH: los p-valores comparten panel). Con m=40,
c(m)=4,28: el umbral efectivo es 4,28× más estricto que BH.
  SE DECLARA POR ESCRITO AHORA que el resultado esperado en el año 1 es CERO
  RECHAZOS, para que no se lea como fracaso en el mes 12.

SE DESCARTA el Deflated Sharpe Ratio: es un estadístico sobre la serie de
retornos de una estrategia, y con T_eff = 12 el umbral DSR > 0,95 es inalcanzable
para cualquier SR realista, independientemente de la calidad de la señal. El
estadístico natural aquí es el IC deflactado por el número de ensayos.

PRE-REGISTRO: vetos_v1.yaml sellado por hash ANTES de mirar nada, con campo
'origen: prior_dominio' y fecha de congelación. Cambiar un umbral abre una versión
nueva y EL TRACK ANTERIOR SIGUE PUBLICADO.
```

### 8.5. Calibración

```
ELECCIÓN DEL CALIBRADOR POR n_eff (no por n):
  n_eff < 500      -> temperature scaling (1 parámetro)
  500 ≤ n_eff <2000-> beta-calibración (3 params: contiene a Platt y a la identidad)
  n_eff ≥ 2000     -> isotónica con bagging bootstrap

  En el año 1 la respuesta es SIEMPRE temperature scaling. La escalera se
  documenta como plan, no como decisión pendiente.

ANIDADO dentro de cada pliegue, con la MISMA purga y el MISMO embargo entre
train-modelo y train-calibración.

MÉTRICAS, todas con IC bootstrap POR BLOQUES DE FECHA:
  ECE con bins de igual masa · Z de Spiegelhalter
  DESCOMPOSICIÓN DE MURPHY DEL BRIER, obligatoria y publicada desagregada:
     BS = FIABILIDAD − RESOLUCIÓN + INCERTIDUMBRE
     Un modelo que siempre predice la tasa base está PERFECTAMENTE calibrado y
     es completamente inútil (resolución = 0). Publicar solo la fiabilidad sería
     un engaño técnicamente cierto.
```

**Qué se calibra públicamente en el año 1 y qué no.** La calibración direccional **no** converge más rápido que la discriminación: comparte el mismo n_eff. Lo que **sí** converge en 6-8 semanas es la **cobertura de los intervalos de valoración**, porque los residuos de valoración son mayoritariamente idiosincrásicos y su ρ es bajo.

```
AÑO 1, SE PUBLICA: histograma PIT de la valoración, cobertura empírica del
  intervalo al 80 % con IC binomial, mediana del |error log| por bucket de
  liquidez, CRPS. Y SOLO donde hay verdad de campo: subastas cerradas y la
  partición sellada de Terapeak.

AÑO 1, NO SE PUBLICA: ningún diagrama de fiabilidad de probabilidades
  direccionales. Se calcula, se guarda, y en la UI la etiqueta es
  "en validación, n_eff actual = X, se publicará al alcanzar n_eff = 500",
  con contador visible. Es más creíble que un diagrama con 13 observaciones.

DONDE NO HAY VERDAD DE CAMPO (el 90 % del catálogo: raw, JP, sets pequeños)
  no se publica cobertura. Se publica esta frase, que es más honesta y no se
  puede desmentir:
    "En este segmento no observamos precios de transacción, así que no podemos
     verificar nuestra cobertura."
```

---

## 9. Métricas y track record público

### 9.1. Métricas que se publican

- **IC de rango cross-seccional diario:** media, EE de Newey-West(h−1), t, **T_eff**, **N_eff**, y ρ medido.
- **Curva de decaimiento del IC** por horizonte (1, 3, 7, 14, 30, 60, 90): revela el horizonte real y fija la frecuencia de rebalanceo.
- **ICIR** con IC bootstrap por bloques de fecha.
- **Retorno del decil superior vs. el ÍNDICE DE SU SEGMENTO**, neto de costes, **ponderado por capacidad** y también equiponderado. Siempre las dos versiones: la ponderada suele ser 2-4× menor, y publicar solo la equiponderada es mentir por omisión.
- **Turnover y coste anual de rotación**, delante del alpha.
- **Alpha de equilibrio:** cuánto alpha se come el coste.
- **Calibración de la valoración:** PIT, cobertura al 80 %, mediana del |error log| por bucket, CRPS.
- **Sesgo firmado por decil de liquidez:** *"en cartas ilíquidas estamos un 12 % caros"*. Es el dato más útil y más diferenciador de toda la revisión y ninguna herramienta lo da.
- **Cobertura de consulta** (`ventas que inferimos / ventas reales del mismo segmento`): dice cuánto del mercado vemos realmente. Nadie del sector lo publica.
- **Salud de datos:** staleness mediana, % de instrumentos sin cambio, cobertura de precio, tasa de colisiones, tasa de attrition, tasa de emparejamiento de identidad, ratio de artefacto del nowcast.
- **N_ensayos registrados** y el umbral de t correspondiente.
- **% de predicciones no liquidables** + banda de sensibilidad.
- **IR con coeficiente de transferencia incluido.**

### 9.2. Métricas prohibidas, y por qué

1. **Precisión direccional a secas.** Con deriva de mercado, "siempre sube" saca 55-60 %. Solo se publica contra la **tasa base del mismo periodo** y con IC. Verificado: con n_eff=100 el IC95 % de 61,3 % es [51,8 %, 70,8 %] — indistinguible del azar.
2. **MAPE en valoración.** Dominado por cartas baratas (1 EUR de error en una carta de 2 EUR = 50 %). Se usa la mediana del |error log|.
3. **Sharpe sobre precios suavizados.** Inflado 2,65× con `avg7` y 5,48× con `avg30`. Si se publica, se publica desinflado (`SR_real = SR_obs / sqrt(k)`) o no se publica.
4. **Retornos sin costes.** La ida y vuelta en una carta de 50 EUR es del 25-35 %.
5. **Decil superior vs. inferior.** Es una métrica long-short y **no hay posición corta en cartas**. El decil inferior se monetiza de otra forma: alertas de VENTA sobre el Portfolio del usuario y filtro de "no comprar" sobre su Watchlist — que es además lo que convierte el módulo Portfolio de contable en prescriptivo.
6. **"N predicciones" como tamaño muestral.** Siempre n_eff. El mock del v1 dice 1.847; si vienen de 60 días × 30 cartas con ρ=0,15, n_eff ≈ 13.
7. **Cualquier métrica del burn-in de 6 meses.**
8. **Curvas de la mejor configuración sin la distribución de los caminos.**
9. **Probabilidades con dos decimales** (`prob_alpha_neto_positivo: 0.61`) derivadas de un IC no medido. Hasta tener 200 predicciones vencidas: tres niveles cualitativos.

### 9.3. Diseño del track record sellado

```
SELLADO DIARIO
  fila_canónica(p) = json_canónico({instrument_id, model_version, universe_rule_id,
      settlement_spec_id, horizonte, p_sube, alpha_percentil, intervalo_80,
      emitida_en_utc, features_hash, vetos_activos})
  hojas   = [sha256(fila) for p in sorted(lote)]
  raiz_d  = merkle_root(hojas)
  cadena_d = sha256(cadena_{d−1} || raiz_d)

  ANCLAJE: OpenTimestamps (gratis, sin cuenta) es LA fuente de datación.
  Git es solo DISTRIBUCIÓN: force-push reescribe la historia y la fecha del commit
  la fija el autor. Decirlo en la metodología.

  ENDPOINT PÚBLICO: /api/verificar?instrument=...&fecha=...
    devuelve fila_canónica + prueba_merkle + raiz + cadena + prueba .ots
    -> cualquiera verifica UNA predicción sin que publiquemos el lote entero.

REGLA DE UNIVERSO, NO LISTA (si es lista, se puede cherry-pickear por omisión).
  Predicado SQL determinista sellado por hash, evaluable SOLO con campos que
  existen (nada de listings_activos en raw: no lo tenemos).

SPEC DE LIQUIDACIÓN CONGELADA EN EL MOMENTO DE PREDECIR
  settlement_spec_v1 = { fuente: 'avg30 de Cardmarket tal como lo capturamos',
                         formula: 'log(avg30[t+h]) − log(avg30[t])',
                         si_no_liquidable: 'estado UNSETTLED, se cuenta, no se descarta' }
  Está exactamente identificada, es reproducible por un tercero contra Cardmarket,
  y no necesita ni deconvolución ni suavizador. Sin congelarla se puede "mejorar"
  la marca a posteriori de forma interesada, que es la trampa más difícil de
  detectar porque parece un avance técnico.

CONTINUIDAD ENTRE VERSIONES: un cambio de modelo abre un track nuevo pero
  EL VIEJO SIGUE VISIBLE PARA SIEMPRE. Prohibido reiniciar el contador. Se publica
  además el track agregado "lo que un usuario habría experimentado siguiendo
  siempre la versión vigente", que es el único honesto.
```

**Formato obligatorio del informe público:**

```
Horizonte 30d · modelo v3 · regla u1 · liquidación s1
  Predicciones emitidas ............ 4.120
  Liquidadas ....................... 3.702
  NO LIQUIDABLES ................... 418  (10,1 %)      <- SIEMPRE VISIBLE
  n_eff (ρ medido = 0,04, h=30) .... 187
  Precisión direccional ............ 61,3 %   IC95 % [54,5 %, 68,1 %]
  Tasa base del periodo ............ 56,8 %
  Banda de no liquidables .......... peor caso 57,2 %  ·  mejor caso 64,8 %
  IC de rango (Newey-West) ......... 0,081   t = 2,9   (umbral de publicación: 3,5)
  Ensayos registrados .............. 63
  Decil sup. vs índice, neto, pond. por capacidad ... +3,1 %  [−6 %, +12 %]
  Turnover trimestral .............. 38 %
  VEREDICTO: PROMETEDOR, AÚN NO PROBADO.
```

**El foso no es el 61,3 %. Es la línea del veredicto.** Publicar "aún no distinguible de cero" durante 18-24 meses es contraintuitivo comercialmente y es el movimiento correcto: es la única forma de que el número sea creíble el día que deje de serlo. Y es imposible de imitar para un competidor sin destruir su propio marketing.

### 9.4. Kill-switch y protocolo de fallo

```
AÑO 1: EL CUSUM VIGILA SALUD DE DATOS, NO EL IC.
  No hay mu_ref validado en el año 1. Un kill-switch calibrado contra un valor
  de referencia inventado y publicado en vivo es teatro de control, no control.
  Se vigilan: staleness mediana, % sin cambio, cobertura, tasa de colisiones,
  attrition, cobertura de consulta, ratio de artefacto. Umbrales calibrados por
  bootstrap por bloques sobre NUESTRA propia serie.

AÑO 2+: CUSUM SOBRE EL IC, con parámetros calibrados por SIMULACIÓN sobre la
  serie de IC observada, nunca con tablas iid.
  VERIFICADO: con k=0,5 y H=5 el ARL0 bajo iid es ~919 días, pero cae a
  81-127 días cuando el IC diario está autocorrelado por etiquetas solapadas
  de 30 días. Fijar el ARL0 objetivo EN DÍAS y despejar H por simulación.
  Publicar la regla, k, H, el ARL0 y la serie en vivo ANTES de que salte.

POST-MORTEM MENSUAL PÚBLICO: los 5 peores errores MÁS 5 aleatorios (seleccionar
  solo los 5 peores es selección sobre la variable dependiente), con SHAP
  CONGELADO en el momento de emitir —nunca recalculado— y clasificación de causa:
  {dato_malo | régimen | factor_muerto | mala_suerte_esperada}.

COMUNICACIÓN, desde la primera pantalla: PROMETEMOS UNA DISTRIBUCIÓN, NO UN PUNTO.
  Si decimos 70 % y falla el 30 % de las veces, eso es ÉXITO. Toda la comunicación
  se ancla en calibración, nunca en aciertos, o el primer fallo visible parecerá
  una traición.

No se publica ninguna comparación nominal con competidores concretos. El rigor se
demuestra publicando lo propio.
```

---

## 10. Límites honestos: lo que este sistema NO puede hacer

**1. En raw no podemos ser más exactos que Cardmarket sobre el precio de Cardmarket.** Para el 84 % del catálogo con precio, nuestro "valor justo" es una transformación de un número que Cardmarket ya calculó. No tenemos ni una sola observación de transacción propia en ese universo. Somos Cardmarket más ruido. Lo que sí podemos añadir, y nadie añade, es: **incertidumbre honesta, contexto cross-seccional, coste de ida y vuelta, ratios identificados por contraste, y japonés**.

**2. No ganamos a Alt en precisión puntual sobre graded líquido EN/US.** Ellos ven transacciones reales de su propio marketplace; nosotros vemos asks más desapariciones inferidas. Y nunca veremos los resultados de Goldin, PWCC ni Heritage, que fijan el precio del extremo alto. Prometerlo sería el mismo error que criticamos.

**3. La cobertura verificada solo existirá donde hay verdad de campo.** Es decir, en subastas de eBay y en la partición de Terapeak: graded, EE.UU., líquido — **exactamente el segmento donde Alt es mejor**. En el 90 % del catálogo que reclamamos como ventaja, no podremos verificar nada nunca.

**4. El módulo graded cubre el 5-10 % del catálogo.** La cuota de 5.000 llamadas/día da sondeo diario a ~2.000 instrumentos, US-céntrico. Multi-marketplace no cabe en el año 1.

**5. El ranking de inversión no será estadísticamente distinguible de cero en 18-30 meses.** Con IR ≈ 0,18 tras el coeficiente de transferencia y costes del 20-40 %, es un producto modesto. Puede resultar que no sea rentable. Hay que decidir si se construye igualmente, sabiéndolo.

**6. No se puede reconstruir histórico anterior a hoy para raw.** TCGdex no expone series. El reloj empieza el día del cron.

**7. `avg1` y `low` no son precios.** Y `avg7`/`avg30` no son precios diarios: son medias sobre transacciones con recuento desconocido. La granularidad diaria del producto es interpolación, y se dice.

**8. Cuatro dependencias no están aseguradas y deben verificarse ANTES de escribir código.** Es la acción de mayor retorno del proyecto y cuesta leer cuatro documentos:
   - **eBay API License Agreement**, retención y uso derivado. Construir un panel plurianual listing×día y publicar de él un índice y un feed de ventas inferidas es, funcionalmente, reconstruir la Marketplace Insights API que eBay cerró.
   - **Terapeak**: licenciado al vendedor para su propia operativa, no como corpus de calibración de un producto comercial de terceros. Y su ventana de 3 años **rueda**: cada semana de retraso destruye histórico irrecuperable.
   - **PSA pop report**: sin API pública, con términos que prohíben la recolección automatizada. Sostiene toda la familia `F_supply`.
   - **Vercel Hobby** no permite uso comercial (ya identificado en `PLAN.md` §14).

**9. Reflexividad.** Si el producto funciona, publicar "esta carta va a subir" hace que suba: la señal se autovalida a corto plazo, inflando el track record, y se destruye a medio. Con un mercado de este tamaño, unos pocos miles de usuarios bastan.

**10. El objetivo declarado hay que reescribirlo.** "LA MEJOR del mercado para determinar el precio justo, y ganarle a Alt" es inalcanzable en raw por razones de **dato**, no de algoritmo, y en graded está limitado por 5.000 llamadas/día. El producto defendible es otro, y es mejor:

> **El único que te dice cuánto NO sabe, cuánto te va a costar la ida y vuelta, y qué cartas no deberías comprar nunca.**

---

## 11. Orden de construcción

Ordenado por **(valor entregado × probabilidad de ser cierto) ÷ dependencia de histórico**.

### Semana 0 — Bloqueantes. Antes de una línea de código.

| # | Acción | Coste |
|---|---|---|
| 0.1 | Leer el eBay API License Agreement y los términos de Terapeak. **Interruptor general** de cinco componentes. | 2 h |
| 0.2 | Resolver el acceso al pop report de PSA de forma compatible con ToS. Si no hay vía, `F_supply` se cae y hay que replanificar, no parchear. | 2 h |
| 0.3 | Medir el **drift de consulta** de eBay Browse (misma query, una hora de diferencia). Decide el presupuesto de cuota y si §5.1 existe. | 3 h |
| 0.4 | Comprobar con 5 ventas propias si Terapeak expone el precio pactado de Best Offer. De ese hecho cuelga todo el módulo de descuento. | 30 min |
| 0.5 | Verificar contra `psacard.com` las tarifas y TAT actuales. De ellas depende el umbral de ~120 EUR y el signo de D1. | 1 h |
| 0.6 | Medir el fill rate de los aspectos `Grade` / `Professional Grader` y del cert en títulos. Decide si el universo graded es enumerable. | 3 h |

### Fase 0 — Irrecuperable si se retrasa (semana 1)

| # | Componente | Nota |
|---|---|---|
| 1 | **Cron de captura diario de TCGdex** | 13 min/día. Es el arranque del reloj del foso. |
| 2 | **Migración de esquema bitemporal** (§2.5, §8.1) | Barata hoy, carísima en seis meses. `REVOKE UPDATE, DELETE`. |
| 3 | **Restricción de inyectividad + fusión de instrumentos no separables** | 940 productos, 1.986 cartas afectadas. Detectable gratis HOY. |
| 4 | **Export estratificado y sellado de Terapeak** (si es legal) | La ventana rueda. Estratificar por gradeadora × grado × bucket de precio × era, cuota fija, hash, versionado, **partición de auditoría cerrada bajo llave**. |
| 5 | **Snapshot mensual point-in-time de tarifas y TAT de PSA** | Minutos. Irrecuperable. |
| 6 | **Calendario de eventos versionado en git con `known_at`** | Con `known_at_source` y `known_at_uncertainty_days`. |
| 7 | **Cadena de hashes + OpenTimestamps del track record** | Empieza vacío. Su valor es puro tiempo acumulado. |
| 8 | **Estrato aleatorio de 500 instrumentos con D fijo** | Única referencia insesgada del proyecto. |
| 9 | **Registro de ensayos + `vetos_v1.yaml` sellado** | 30 líneas de código. Decisivo. |

### Fase 1 — Producto sin ninguna predicción (semanas 2-5)

| # | Componente | Valor |
|---|---|---|
| 10 | **Calculadora de coste de ida y vuelta y precio de indiferencia en TODAS las fichas** | El único elemento verificable por el usuario el primer día y que ningún competidor con incentivo de marketplace puede copiar |
| 11 | Explorador + ficha con `dias_sin_cambio` y etiqueta de evidencia | Ataca la queja nº3 |
| 12 | **Comparables cross-seccionales de valoración** | Sin histórico. Sustituye al motor de análogos |
| 13 | Valoración en logs con pooling parcial jerárquico | La omisión mayor del v1 |
| 14 | Higiene del libro de eBay + verificación de muerte + subastas como verdad de campo | Primera pieza del módulo graded |
| 15 | Sección pública de **anti-patrones** y de metodología | Foso barato |

### Fase 2 — Ratios y señales deterministas (semanas 6-10)

| # | Componente |
|---|---|
| 16 | Hedónico contrastivo sobre pares de la misma carta |
| 17 | Ratio raw→graded + escalera de grados monótona + QP de coherencia blando |
| 18 | Motor de decisión de gradeo honesto (D1), publicando los **rechazos** |
| 19 | Arbitraje EU↔US con IVA, aduana y FX real (D2) |
| 20 | Vetos de reprint con `known_at` |
| 21 | Track record de la **valoración** (converge rápido) |

### Fase 3 — Alpha (meses 3-6)

| # | Componente |
|---|---|
| 22 | Índice de cartas negociables, 4 segmentos, inmutable y versionado |
| 23 | Alpha por demedianado cross-seccional con cohortes que controlan la liquidez |
| 24 | Pipeline de normalización de los 9 factores |
| 25 | Score equiponderado con signos congelados, etiquetado "no validado" |
| 26 | Dilución por población (si PSA es viable legalmente) |
| 27 | **Experimentos de falsación del nowcast** (ratio de artefacto + adelanto) |
| 28 | **Medición del signo del lead JP→EN.** Si el pico está en k≤0, se apaga `F_lead` |

### Fase 4 — Consolidación (meses 6-12)

Regresión cross-seccional WLS semanal · calibración con subastas · encogimiento jerárquico del IC · cuadro de salud con CUSUM sobre datos · primer walk-forward de dos pliegues.

### Fase 5 — Solo si los datos lo permiten (año 2+)

CPCV con PBO · matriz de covarianzas de factores · modelo aprendido, y solo si bate al equiponderado con `t > 3` bajo el umbral ajustado por número de ensayos · motor de análogos con restricción temporal.

---

## 12. Cierre

Cinco expertos independientes atacaron este diseño y sus propias propuestas. El patrón del resultado es inequívoco y conviene decirlo en voz alta: **las propuestas que sobrevivieron mejor no son modelos. Son higiene estadística, contabilidad de costes y honestidad en la evaluación.** Las que cayeron son precisamente las que prometían el producto de inversión sofisticado.

Eso no es un fracaso del diseño: es la información más valiosa que produjo la revisión. Con 0 EUR, sin histórico y sin un feed de transacciones cerradas, el sistema que se puede construir de verdad es más pequeño que el del `ALGORITMO.md` v1 y muchísimo más defendible.

El mayor activo del proyecto no es ninguna de las nueve familias de factores. Es la disposición a publicar lo que **no** funciona: los once anti-patrones, la lista de dónde el canal japonés no transmite, la frase "la mayoría de cartas por debajo de 120 EUR son −EV de gradear", el campo "coste de ida y vuelta: 67 %, esta carta no es un vehículo de inversión", y el veredicto "aún no distinguible de cero" mantenido durante dos años.

Todo eso es cierto sin necesidad de histórico, es verificable por el usuario, y es imposible de copiar para cualquiera cuyo modelo de negocio dependa de que el usuario opere.