# Índice Cartoteca — metodología index_v1 (CONGELADA)

Congelada el 2026-08-28, antes de publicar el primer valor. Cualquier cambio será index_v2,
con changelog y ambas series publicadas en paralelo durante la transición.

## Definición

- **Índice encadenado**: I(t) = I(t−1) × (1 + r̄(t)), con I(base) = 100 en la primera fecha
  con constituyentes (2026-08-25).
- **r̄(t)** = media equiponderada de r_i = trend_i(t) / trend_i(t_prev) − 1 sobre los
  constituyentes, donde t_prev es la observación propia anterior (el intervalo real se
  publica con cada valor; con huecos de captura NO se anualiza ni se interpola).
- **Constituyentes de t, decididos con datos de t_prev** (point-in-time, sin sesgo de
  selección por el resultado): instrumento no digital, sin colisión de idProduct,
  con trend ≥ 15 EUR en t_prev, y con observación en t y en t_prev.
- **Equiponderado DENTRO de cada segmento.** Ponderar por precio dejaría el índice en manos
  de ~20 cartas; equiponderar sin suelo lo dejaría en manos del ruido de céntimos.
- **Winsorización de protección**: r_i se recorta a ±50 % por periodo. No es cosmética:
  protege de remapeos de idProduct de la fuente, que producen saltos ficticios de 10×.
  Los recortes se cuentan y se publican (n_clipped).
- **Segmentos** (cada uno es un índice independiente):
  `EN-vintage` (edición < 2011) · `EN-moderno` (≥ 2011) · `JA` · `TOTAL` (unión).
  El límite 2011 separa la era Black&White en adelante (impresiones masivas) del resto.

- **Exclusión de artefactos de marca** *(enmienda del 2026-08-28, el mismo día del
  congelado y ANTES de publicar ningún valor — por eso sigue siendo index_v1)*:
  se excluye del índice y de los movers toda observación donde |r| > 25 % y el vector
  completo de medias de la fuente (avg1, avg7, avg30) quedó idéntico entre las dos
  fechas. Si hubiera habido transacciones reales, alguna media se habría movido; una
  marca que salta un 3.000 % con las tres medias congeladas (caso real: ex7-99,
  161 € → 5.201 €) es la fuente recalculando o remapeando, no el mercado. Los casos
  excluidos se cuentan y se publican como anomalías de datos.

## Limitaciones declaradas

- La marca subyacente (trend de Cardmarket) es un agregado suavizado de la fuente: los
  movimientos llegan amortiguados y con retardo. El índice mide la evolución de ESA marca.
- Marcas sin cambio entran como retorno 0: la staleness sesga el índice hacia la calma.
- Con huecos de captura, un valor cubre varios días: interval_days lo declara siempre.
