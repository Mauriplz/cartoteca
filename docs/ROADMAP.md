# Cartoteca — Plan para ser la mejor aplicación del mercado (v2)

> Documento de planificación. No implica cambios de código hasta su aprobación.
> Fecha: 2026-08-28 · v2, tras ataque adversarial de 3 revisores (viabilidad, honestidad, producto).
> La v1 tenía una fase inconstruible y dos cifras mal presentadas en su propia tabla de criterios;
> esta versión corrige lo que los revisores cazaron y anota qué cambió.

---

## 0. Qué significa "la mejor", en criterios medibles y verificables

| Criterio | Medida (definición incluida) | Hoy | Objetivo |
|---|---|---|---|
| **Cobertura** | Instrumentos con precio ÷ catálogo declarado por TCGdex, **con los 72 sets vacíos en el denominador**: 67 %. Excluyéndolos: 78 %. Ambas se publican por set | 67 % / 78 % | subir y publicar ambas |
| | % de cartas con ilustración (4 vías) | ~90 % | >95 % |
| | Cartas japonesas con bloque de precio | 81 % (116 sets) | mantener y medir contra competidores con muestra fija y fecha |
| **Frescura** | % de días con captura verificada, ventana móvil de 30 días | **2/4 días desde el arranque; huecos 26-27/08 declarados** | ≥99 % con dos patas redundantes |
| **Honestidad verificable** | Metodología escrita y versionada | ✅ (pública cuando se despliegue) | + sello diario anclado externamente |
| | Calibración publicada | — (no hay histórico) | en cuanto haya n suficiente, con IC |
| **Diferenciales** | Desfase de lanzamiento JA→EN: mediana 56 días (**hecho de catálogo**; el adelanto de **precios** está SIN medir — medición programada, y la señal se apaga si no existe) | construido | medir el adelanto de precios |
| | Prima de ilustrador: 80,6 % de la varianza entre artistas **no atribuible a ruido muestral** (corte transversal de un día; **no es acierto predictivo**) | construido | re-medir con archivo |
| | Coste de ida y vuelta explícito · curva de vida por año · divergencia entre mercados | construidos | — |
| **Solidez** | Copia externa del archivo | ❌ **CERO** | diaria, verificada, restaurable |
| | Tests + CI | ❌ | invariantes que rechazan regresiones |
| **Profesional** | URL pública, móvil, 3 idiomas | ❌ (localhost) | desplegada, Lighthouse móvil ≥90, PWA |

Contra quién: **Alt** (solo valora; ni raw ni JP), **Card Ladder / Market Movers** (deportivas, EE. UU., de pago, sin explicación causal), **PokéPredict y similares** (previsiones sin track record). Nuestro terreno — **raw + japonés + explicación de cada número + honestidad auditable** — sigue vacío.

---

## 1. Estado real hoy

**Funciona:** captura diaria automatizada + sonda de cadencia (refresco de TCGdex ~15:00 UTC — **hipótesis con 3 días de sonda, no constante**; el diseño no dependerá de la hora sino de detectar el cambio de sello del lote). Archivo: días 25 y 28/08 (26-27 perdidos por el fallo de permisos, resuelto). Almacén con 36.327 cartas · 50.185 instrumentos · 5 señales + compuesto · web es/en/ja con 5 pantallas · búsqueda por sinónimos · 3 documentos de arquitectura.

**Cojea, por gravedad:** (1) el archivo no tiene copia; (2) la captura depende de un portátil encendido; (3) sin tests; (4) en localhost; (5) 13,9 % del catálogo declarado por TCGdex está vacío; (6) sin índice, movers, watchlist ni alertas; (7) gradeadas esperando las cuentas de eBay.

---

## 2. Fase A — Blindar el activo  `2-4 sesiones`

*Todo lo demás se reconstruye desde el código. El archivo no.*

| # | Acción | Cómo, con 0 € — con los fallos conocidos de cada pieza contemplados |
|---|---|---|
| A1 | **Copia externa diaria** | Primaria en objeto: **Backblaze B2 (10 GB gratis, sin tarjeta)** o R2. En git solo manifiestos + SHA-256. *Por qué no "un repo con los datos": crecemos ~1,2 GB/año de gzip que git no delta-comprime; GitHub recomienda <1 GB, LFS gratis no cubre ni el año 1, y sus ToS desaconsejan repos-backup. Alternativa si B2 no convence: repos particionados por año con checkout superficial* |
| A2 | **Segunda pata de captura, sin portátil** | GitHub Actions en **repo público** (minutos ilimitados; el privado tiene 2.000/mes que a rps de cortesía se superan), empujando al archivo con token. **Varios crons redundantes el mismo día** (los schedules de Actions se retrasan horas y se saltan en silencio) con reanudación idempotente —`capture.py` ya la soporta—. **Guarda de frescura: no se confía en la hora; se compara el sello del lote con el del día anterior y se reintenta hasta que cambie.** Ritmo reducido (15-20 rps) y detección de challenges de Cloudflare (HTML donde se espera JSON → "fuente bloqueada", no "error de carta"). Keepalive contra la desactivación a los 60 días de inactividad. El portátil queda como pata B |
| A3 | **Vigilante fuera de la infraestructura vigilada** | **Healthchecks.io (gratis): dead-man's switch.** La captura hace ping al terminar; si no llega antes de la hora límite, el email sale de SU infraestructura. *Por qué no solo un cron de Actions comprobando: si Actions salta el schedule —su fallo más común— ni captura ni comprueba, y GitHub solo avisa de workflows que fallan, no de los que nunca corren.* Segunda pata: un job que FALLA ruidosamente si falta el fichero |
| A4 | **Validación de integridad diaria** | Conteos mínimos (≥20.000 EN, ≥10.000 JA), esquema, tamaño, checksum. Fichero raro → no se carga, se alerta |
| A5 | **Reconciliación de las dos patas** | Regla explícita: canónica = primera captura del día que pase A4 tras detectarse el refresco; la otra, verificación con checksum. Divergencia anómala → alerta y decisión humana, jamás sobrescritura silenciosa |
| A6 | **Tests de invariantes + CI** | 0 digitales en señales, 0 colisiones en modelos, deduplicación efectiva, point-in-time, aritmética de las frases en llano (la sonda que cazó el error del percentil, automatizada). Un push que rompa un invariante no entra |
| A7 | **Arrancan en paralelo, aunque nada se vea:** el **índice** (C1) y el **sello diario** (E1) empiezan a acumular historia desde ya. Ninguno de los dos se puede fabricar hacia atrás | — |

---

## 3. Fase B — Salir a internet YA  `3-4 sesiones`  ⬅ *reordenada: antes iba quinta*

*El ataque de producto lo dijo sin anestesia: "la mejor app que nadie usa". Cada semana en localhost es una semana sin envejecimiento del dominio, sin usuarios que digan qué construir, y con el sello acumulando historia que nadie puede ver. Se despliegan las 5 pantallas que YA existen; lo nuevo llega después, en público.*

**B0 — Comprar el dominio hoy** (~10 €/año, único gasto del proyecto): su antigüedad también es un activo que no se compra después.

**B1 — Arquitectura de despliegue.** La v1 de este plan proponía "generación estática diaria" y era **inconstruible**: 36.327 fichas × 3 idiomas ≈ 109.000 páginas contra el **límite duro de 20.000 ficheros por despliegue de Cloudflare Pages**, más horas de build diarias. Arquitectura corregida, a 0 €:

- **Estático:** las páginas calientes (~5.000-15.000: universo invertible, portadas, sets, ilustradores, metodología, por idioma).
- **Cloudflare Worker + D1** (gratis: 100k peticiones/día, 5 GB — `pcp.db` son 31 MB): sirve la cola larga de fichas bajo demanda con caché en el borde. La base se sube a D1 tras cada captura.
- La negociación de idioma se muda del middleware de Next al Worker (el middleware no existe en un sitio estático; la v1 afirmaba "la app ya está construida para esto" y era falso en dos puntos: middleware y better-sqlite3).
- Vercel Hobby descartado explícitamente: prohíbe uso comercial.

**B2 — Móvil de verdad** *(omisión más flagrante de la v1: la palabra "móvil" no aparecía)*: tablas que colapsan a tarjetas, **Lighthouse móvil ≥ 90** en portada/ficha/screener como criterio de hecho, y **PWA instalable** (manifest + service worker): icono en el teléfono, watchlist offline, y el terreno preparado (HTTPS + cámara) para la búsqueda por foto futura.

**B3 — Distribución** *(la v1 no tenía ninguna)*: sitemap segmentado + hreflang es/en/ja + JSON-LD por carta + imagen OG por carta; páginas de aterrizaje por set y por ilustrador (ya existen como pantallas); un post semanal con un hallazgo medido y su gráfica; webhook gratuito publicando "Mercado hoy" en un Discord propio; widget embebible de la gráfica de trayectoria. Las ~36.000 fichas en 3 idiomas —nadie posiciona el japonés— son la mina SEO del proyecto.

---

## 4. Fase C — "La bolsa": mercado en movimiento  `3-5 sesiones`

**C1 — Índice Cartoteca.** No se publica un solo valor hasta **congelar y versionar la metodología (`index_v1`)**, que ya está especificada en ALGORITMO-v3 §4.1: índice encadenado, **equiponderado dentro de segmento** (equiponderar 34.000 instrumentos con mediana 0,29 € = ruido de céntimos; ponderar por precio = 20 cartas mandan), **suelo de inclusión trend ≥ 15 €** evaluado con datos de t−1, constituyentes point-in-time, 4 segmentos (EN-vintage, EN-moderno, JA; graded cuando exista). Base 100 = 25-08-2026. El job arranca con la Fase A.

**C2 — Movers, con las tres protecciones que faltaban:**
- **Cada mover declara sus dos fechas y el intervalo real** («25-08 → 28-08, 3 días»). El titular dice «desde nuestra última captura», nunca «del día» si el intervalo es >1 día. Prohibido anualizar. *(La v1 decía "2+ días consecutivos (ya casi)" cuando nuestros dos días ni siquiera son consecutivos.)*
- **Son variación de una marca suavizada de la fuente**: información etiquetada en pantalla; **jamás insumo** de señales, compuesto ni track record — la autocorrelación del filtro fabrica persistencia (una carta reaparecería como "mover" días seguidos sin información nueva).
- **Filtro día 1** (la fuente no publica recuento de listings, así que el "umbral de liquidez" prometido en v1 no existía): suelo de precio ≥15 € + exclusión de instrumentos cuyo vector de precios no cambió entre capturas y de los que despiertan tras silencio (avg7==avg30 previo). El umbral de liquidez real —frecuencia de cambio en 30 días— se activa cuando el archivo alcance 30 días, con fecha anotada. Desde entonces, ranking por z-score contra la dispersión propia de cada instrumento, no por % bruto.

**C3 — "Mercado hoy", con el usuario dentro** *(la v1 tenía 5 elementos de mercado y ninguno del usuario)*: (1) **"Tus cartas hoy"** — la watchlist localStorage arriba del todo (se adelanta aquí desde la antigua fase de oportunidades: es la mitad de la razón de volver y no necesita backend); (2) índice con su gráfica de puntos y el contador «día N del índice» — la honestidad como gancho; (3) movers con su explicación de una frase; (4) carta del día con contexto medido; (5) curva de vida por año como módulo (degradada de pantalla propia: es contenido de una visita, no de retorno diario).

**C4 — Serie propia cuando la haya** *(la v1 decía "velas" y era fabricar microestructura: una vela exige OHLC intradía y tenemos UNA observación diaria de una marca agregada)*: gráfica de **puntos/escalones de nuestras observaciones fechadas, con los huecos visibles** (no interpolados), banda de incertidumbre por silencio. Prohibido OHLC.

---

## 5. Fase D — Oportunidades profesionales  `3-4 sesiones`

| # | Pieza | Nota |
|---|---|---|
| D1 | Screener con filtros por URL + export CSV | tipos de caso ya construidos |
| D2 | **Alertas v1 sin registro** | el resumen "tu watchlist hoy" se calcula **en cliente** al abrir (los datos del día ya están servidos) + **Web Push opcional vía Worker+KV** — la suscripción push ES el identificador; sin cuentas, sin email. *(La v1 prometía "email con el cron, sin infraestructura nueva", que era falso: exigía cuentas + watchlist en servidor + proveedor de envío.)* Email diario = v2, en la fase de cuentas, con proveedor nombrado (Brevo, 300/día gratis) |
| D3 | **Portfolio con tres columnas obligatorias** | (1) coste de compra; (2) valor a la marca de la fuente, etiquetado «no es una venta real»; (3) **valor neto de liquidación = marca − coste de ida y vuelta**, que es **la cifra destacada**. El P&L de cabecera es el neto. *(La v1 mostraba el bruto con una etiqueta: invitaba a leer +34 % como embolsable.)* |
| D4 | **Divisa de visualización** EUR/USD/JPY según idioma | «≈ $132, tipo BCE del 28-08». El numerario de cálculo sigue siendo EUR |
| D5 | Análogos de cohorte en la ficha | «las 12 más parecidas cotizan entre X e Y» — sin prometer predicción |
| — | ~~Comparador standalone~~ | **recortado** (lo menos usado en las herramientas de referencia); queda un "añadir a comparación" ligero en el screener. Libera sesiones que van a B3 |

---

## 6. Fase E — Confianza institucional  `continua`

**E1 — Sello diario verificable de verdad.** La v1 tenía una contradicción (archivo privado en A1, "repositorio público" en D1) y un sello débil (una cadena de hashes en git se reescribe con un force-push). Corregido: **dos repositorios** — archivo privado (datos) y **repo público solo de sellos**: fecha + SHA-256 de las señales del día (encadenado con el sello anterior y el commit del código) + **anclaje OpenTimestamps** (gratis, verificable contra Bitcoin por cualquiera, sin confiar en nosotros). Nunca se publican los datos de precios de la fuente, solo los hashes. Ya estaba especificado en ALGORITMO-v3; el plan ahora lo referencia en vez de reinventarlo mal.

**E2 — Panel público de calidad de datos:** completitud por edición (con el 13,9 % vacío de TCGdex a la vista), frescura de cada fuente, huecos declarados. **E3 — Metodología versionada** (changelog de señales; arbitraje→divergencia ya dio el ejemplo). **E4 — Contribuir a TCGdex los sets vacíos** (su base es de código abierto; arregla nuestro hueco, mejora el común, y de paso preguntarles por un volcado masivo de precios que convertiría 41.600 peticiones/día en una). **E5 — Sentry (gratis) + revisión semanal.**

---

## 7. Fase F — Gradeadas  `desbloquea con tus 2 cuentas de eBay`

Como ALGORITMO-v3: Browse API → observación diaria de listings (nowcasting desde la oferta) · Terapeak → ~3 años de ventas reales para bootstrap y calibración · escalera de grados por contraste dentro de la misma carta. **La fase de mayor valor por sesión, y la única bloqueada por algo externo: 10 minutos tuyos.** Incluye enlaces de afiliado del eBay Partner Network en fichas graded (0 €, honesto si se declara, primera vía de ingresos).

---

## 8. Lo que NO haremos · y el futuro que dejamos preparado

**No:** ML sin baseline batido en walk-forward · divergencia vendida como arbitraje · momentum sobre medias de la fuente · velas OHLC fabricadas · scraping contra ToS · pagar por datos.

**Futuro preparado (no construido):** búsqueda por foto v1 a 0 € — hashes perceptuales de las ~36k imágenes precalculados en build + matching en el navegador con la cámara. Es la función de adquisición nº1 de CollX/Cards AI y exige la PWA de B2: por eso se decide ahora aunque se construya después.

## 9. Monetización futura: decisiones que se toman hoy

Para no erosionar el foso poniendo mañana un muro sobre lo que la gente ya usaba: **gratis para siempre** (se declara ya): catálogo, fichas, índice, metodología, track record. **Candidatos a pro** (nacen marcados): alertas por email, export CSV, API, analítica de portfolio. Afiliados eBay en Fase F.

## 10. Riesgos

| Riesgo | Plan |
|---|---|
| TCGdex cae o cambia | MIT: fork + archivo propio ya independiente. La Fase A lo convierte de catástrofe en molestia |
| Actions/IP bloqueada por Cloudflare | detección de challenges + pata portátil + hablar con TCGdex (E4) |
| El 13,9 % vacío no mejora | contribuir (E4) + medirlo en público (E2); si crece, segunda fuente gratuita solo para catálogo |
| Cambio de esquema silencioso de la fuente | A4/A6 lo detectan el día que ocurre |
| Dependencia de una persona | todo en el repositorio; archivo replicado; crons reproducibles |

## 11. Orden final y qué verás al acabar cada fase

```
A  Blindaje       2-4 sesiones   nada visible; el proyecto deja de poder morir. Índice y sello arrancan en silencio
B  Internet YA    3-4 sesiones   URL pública con las 5 pantallas actuales, móvil/PWA, SEO, dominio comprado
C  La bolsa       3-5 sesiones   "Mercado hoy" con tu watchlist, índice, movers honestos, serie propia creciendo
D  Oportunidades  3-4 sesiones   alertas push sin registro, portfolio a valor neto, divisa local, screener exportable
E  Confianza      continua       sellos verificables por terceros, panel de calidad, changelog
F  Gradeadas      tras tus cuentas  el módulo donde está el dinero del hobby
```

*La v1 de este plan tenía el orden A→bolsa→oportunidades→confianza→internet. El ataque de producto lo tumbó con una frase: «construye el producto antes que la audiencia». Internet va segunda.*
