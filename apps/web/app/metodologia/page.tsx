import type { Metadata } from "next";
import Link from "next/link";
import { getCardSignals, getMarketStats, getScreener } from "@/lib/queries";
import { eur } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Metodología — Cartoteca",
  description:
    "Fuentes, unidad de análisis, fórmula y umbral de cada señal, y las limitaciones medidas del sistema.",
};

const FX = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 4 });
const DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC", // la fecha del almacen es un dia natural, no un instante
});

/** Fecha ISO del almacen, en prosa. En las tablas de trazabilidad se deja en ISO. */
function fecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

/* Formato numerico espanol. `eur()` de lib/format ya usa es-ES, pero `pct()` de lib emite
   punto decimal ("80.6%"), que en una pagina en espanol se lee como un fallo junto a
   "0,500" y "46.068". Estos ayudantes son locales a la pagina: no tocan el contrato. */

function group(s: string): string {
  const [i, d] = s.split(",");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d ? `${g},${d}` : g;
}

/** Entero con separador de millares, tambien en los de cuatro digitos. */
function num(v: number): string {
  return group(Math.round(v).toString());
}

/** Porcentaje con coma decimal y espacio antes del signo. */
function pctEs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "\u2014";
  return `${group((v * 100).toFixed(digits).replace(".", ","))} %`;
}

// Modelo de coste publicado. Son las tres constantes del motor de senales, escritas
// aqui para que el lector pueda rehacer la cuenta con su propia comision y sus portes.
const FEE_SELL = 0.05;
const SHIP_IN = 3.5;
const SHIP_OUT = 3.5;
const COST_CEILING = 0.25;

const roundtrip = (p: number) => (FEE_SELL * p + SHIP_IN + SHIP_OUT) / p;
/** Precio al que el coste de ida y vuelta baja justo hasta el techo publicado. */
const MIN_INVESTABLE = (SHIP_IN + SHIP_OUT) / (COST_CEILING - FEE_SELL);

const SECTIONS = [
  ["fuentes", "Fuentes y atribución"],
  ["instrumento", "La unidad es el instrumento"],
  ["marcas", "Qué precio usamos"],
  ["coste", "Coste de ida y vuelta"],
  ["senales", "Las señales, una a una"],
  ["compuesto", "La puntuación compuesta"],
  ["limites", "Limitaciones medidas"],
  ["no-hacemos", "Lo que no hacemos"],
  ["comprobar", "Cómo comprobarlo"],
] as const;

export default async function MetodologiaPage() {
  const s = getMarketStats();
  const { fx, reliability } = readEngineFacts();
  const investablePct = s.priced > 0 ? s.investable / s.priced : null;
  const pricedPct = s.instruments > 0 ? s.priced / s.instruments : null;

  return (
    <>
      <h1>Metodología</h1>
      <p className="sub">
        De qué están hechos estos números: qué fuente, qué unidad, qué fórmula, qué umbral, y qué
        no se puede concluir de ellos. Todas las cifras de esta página están medidas sobre los
        datos propios, no estimadas. Señales calculadas el {fecha(s.asOf)}.
      </p>

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="stat">
          <div className="v">{num(s.instruments)}</div>
          <div className="k">Instrumentos limpios</div>
        </div>
        <div className="stat">
          <div className="v">{num(s.priced)}</div>
          <div className="k">Con precio</div>
        </div>
        <div className="stat">
          <div className="v pos">{num(s.investable)}</div>
          <div className="k">
            Invertibles {investablePct === null ? "" : `(${pctEs(investablePct, 1)})`}
          </div>
        </div>
        <div className="stat">
          <div className="v">{s.days}</div>
          <div className="k">Días de archivo</div>
        </div>
        <div className="stat">
          <div className="v">{num(s.jpEnPairs)}</div>
          <div className="k">Pares JP/EN</div>
        </div>
        <div className="stat">
          <div className="v">{num(s.arbs)}</div>
          <div className="k">Arbitrajes vivos</div>
        </div>
      </div>

      <nav
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}
        aria-label="Índice"
      >
        {SECTIONS.map(([id, label], i) => (
          <a key={id} href={`#${id}`} className="tag">
            <span className="faint num">{i + 1}</span> {label}
          </a>
        ))}
      </nav>

      {/* ------------------------------------------------------------------ */}
      <Section id="fuentes" n={1} title="Fuentes y atribución">
        <P>
          Todo el catálogo y todos los precios proceden de{" "}
          <B>
            <a href="https://tcgdex.dev" style={{ color: "var(--accent)" }}>
              TCGdex
            </a>
          </B>
          , una base de datos abierta de cartas Pokémon publicada bajo licencia MIT. TCGdex aporta
          cartas, sets, fechas de lanzamiento, ilustradores, rarezas e imágenes, y redistribuye un
          bloque de precios de dos mercados. Cartoteca no publica los ficheros de precio en bruto:
          solo derivados y agregados.
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>Fuente</th>
                <th>Qué aporta</th>
                <th>Moneda</th>
                <th>Cobertura medida, con su denominador</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <B>TCGdex</B> <span className="faint">licencia MIT</span>
                </td>
                <td>Catálogo, variantes, imágenes y el bloque de precios</td>
                <td className="dim">—</td>
                <td className="num dim">
                  {num(s.cards)} cartas · {num(s.sets)} sets
                </td>
              </tr>
              <tr>
                <td>
                  <B>Cardmarket</B> <span className="faint">vía TCGdex</span>
                </td>
                <td>
                  Mercado europeo. Campos <F>avg</F> <F>low</F> <F>trend</F> <F>avg1</F> <F>avg7</F>{" "}
                  <F>avg30</F>, más el <F>idProduct</F>
                </td>
                <td className="num">EUR</td>
                <td className="dim">
                  <span className="num">
                    {pricedPct === null ? "—" : pctEs(pricedPct, 1)}
                  </span>{" "}
                  de los <span className="num">{num(s.instruments)}</span> instrumentos limpios
                  llegan con precio
                  <div className="faint" style={{ fontSize: 11 }}>
                    Sobre la captura original del 25/08/2026, medido por carta: 84,2 % EN · 81,0 %
                    JA traían bloque de Cardmarket
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <B>TCGplayer</B> <span className="faint">vía TCGdex</span>
                </td>
                <td>
                  Mercado estadounidense. Se usa únicamente <F>market</F>
                </td>
                <td className="num">USD</td>
                <td className="dim">
                  <span className="num">93,5 %</span> de los instrumentos ingleses con precio ·{" "}
                  <span className="neg num">0 %</span> de los japoneses
                  <div className="faint" style={{ fontSize: 11 }}>
                    Medido sobre la última captura del archivo
                  </div>
                </td>
              </tr>
              <tr>
                <td>
                  <B>Banco Central Europeo</B>
                </td>
                <td>
                  Referencia diaria EUR/USD, aplicada antes de calcular ningún diferencial
                  {fx ? (
                    <>
                      {" "}
                      · último tipo usado <F>{FX.format(fx.rate)}</F> del {fecha(fx.date)}
                    </>
                  ) : null}
                </td>
                <td className="num">EUR/USD</td>
                <td className="dim">Diaria</td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <P>
          El japonés no cotiza en TCGplayer: cero cartas japonesas traen bloque estadounidense. Todo
          el análisis del mercado japonés se hace en euros contra Cardmarket. Si el tipo de cambio
          del BCE no está disponible el día del cálculo, la señal de arbitraje Europa / EE. UU. no
          se publica ese día. No se sustituye por un tipo inventado ni por el del día anterior.
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="instrumento" n={2} title="La unidad de análisis es el instrumento, no la carta">
        <P>
          Una misma ilustración se vende en acabados distintos, y sus precios no se parecen. La
          unidad de todo el sistema es el <B>instrumento</B>:
        </P>
        <Formula block>instrumento = (carta, idioma, variante)</Formula>
        <P>
          Las {num(s.cards)} cartas no digitales del catálogo generan{" "}
          {num(s.instruments)} instrumentos limpios: 24.818 normales, 9.808 holo, 8.792
          reverse, 2.639 sin variante declarada y una cola de lenticulares y metálicas. Modelar la
          carta y no el instrumento obligaría a promediar precios que no son del mismo producto, y
          ese promedio no es el precio de nada que se pueda comprar.
        </P>
        <P>
          <B>Consecuencia visible en la interfaz:</B> una misma carta puede aparecer varias veces en
          un ranking con variantes distintas. No es un fallo de duplicados. Por eso cada fila
          muestra siempre su variante.
        </P>
        <P className="faint">
          El modelo de identidad reserva además ejes para sello (promo, prerelease, staff, worlds),
          patrón, grado y gradeadora. Hoy están vacíos porque no hay fuente que los pueble: se
          declaran ahora porque añadirlos con seis meses de series colgando sería carísimo.
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="marcas" n={3} title="Qué precio usamos, y cuál está prohibido">
        <P>
          Cardmarket no publica un precio diario: publica medias sobre las transacciones ocurridas
          en una ventana, y el número de transacciones de esa ventana no se publica. Eso obliga a
          elegir marca con cuidado y a prohibir dos campos que casi todas las aplicaciones del
          mercado usan como si fueran precio.
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Qué es realmente</th>
                <th>Uso en Cartoteca</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <F>trend</F>
                </td>
                <td>Estimación de tendencia de Cardmarket. Reacciona antes que las medias</td>
                <td>
                  <span className="tag pos">Marca de visualización y valoración</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>avg30</F>
                </td>
                <td>
                  Media de 30 días. Su definición está declarada y un tercero puede reproducirla
                  contra Cardmarket
                </td>
                <td>
                  <span className="tag pos">Marca de liquidación del futuro track record</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>avg7</F>
                </td>
                <td>Media de 7 días. Es un filtro, no una observación</td>
                <td>
                  <span className="tag">Se almacena. Prohibido derivar retornos diarios</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>low</F>
                </td>
                <td>
                  El listado más barato. Mediana <F>low/trend</F> = 0,286 y p10 = 0,05 sobre las
                  cartas EN limpias: en la práctica son copias jugadas o dañadas
                </td>
                <td>
                  <span className="tag neg">Prohibido como precio</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>avg1</F>
                </td>
                <td>
                  Presentado como media del último día, pero se arrastra: viene informado en 28.444
                  de 29.522 observaciones. Un valor aquí no significa que hubiera venta ayer
                </td>
                <td>
                  <span className="tag neg">Prohibido como precio</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>pricing.updated</F>
                </td>
                <td>
                  No es una fecha por carta: en la captura inicial toma 7 valores distintos en todo
                  el fichero, los siete dentro del mismo segundo. Es el sello del lote de
                  sincronización de TCGdex
                </td>
                <td>
                  <span className="tag neg">No se usa como fecha de referencia</span>
                </td>
              </tr>
              <tr>
                <td>
                  <F>tcg_market</F>
                </td>
                <td>Precio de referencia de TCGplayer en dólares</td>
                <td>
                  <span className="tag">Solo para el diferencial EU/US, convertido al tipo BCE</span>
                </td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <div className="note">
          Usar <F>low</F> como precio es el error más extendido del sector y no es inocuo: infla
          mecánicamente cualquier margen calculado sobre él, porque compara el estado de una copia
          dañada con el valor de una sana. La mediana del catálogo tiene su <F>low</F> a poco más de
          la cuarta parte de su <F>trend</F>.
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="coste" n={4} title="El coste de ida y vuelta, y por qué casi nada es invertible">
        <P>
          Antes de preguntarse si una carta va a subir hay que preguntarse cuánto cuesta comprarla y
          volver a venderla. El envío es un coste <B>fijo</B>, así que el coste porcentual explota a
          la baja en el precio. Ese único hecho descarta la mayor parte del catálogo.
        </P>
        <Formula block>
          coste = ( {pctEs(FEE_SELL, 0)} × precio + {eur(SHIP_IN)} de portes de entrada +{" "}
          {eur(SHIP_OUT)} de portes de salida ) / precio
        </Formula>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th className="r">Precio</th>
                <th className="r">Coste de ida y vuelta</th>
                <th className="r">Pérdida si revendes al mismo precio</th>
                <th>Universo</th>
              </tr>
            </thead>
            <tbody>
              {[0.59, 1, 5, 10, 20, 35, 50, 100, 500].map((p) => {
                const c = roundtrip(p);
                const ok = c <= COST_CEILING;
                return (
                  <tr key={p}>
                    <td className="r num">{eur(p)}</td>
                    <td className={`r num ${ok ? "pos" : "neg"}`}>{pctEs(c, c > 1 ? 0 : 1)}</td>
                    <td className="r num dim">{eur(FEE_SELL * p + SHIP_IN + SHIP_OUT)}</td>
                    <td>
                      <span className={ok ? "tag pos" : "tag neg"}>
                        {ok ? "Invertible" : "Fuera del universo"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Grid>
        <P>
          El techo publicado es <B>{pctEs(COST_CEILING, 0)}</B>. Con las tres constantes de arriba
          eso significa que ningún instrumento por debajo de <B>{eur(MIN_INVESTABLE)}</B> puede
          entrar en el ranking, y el instrumento invertible más barato del universo actual cotiza,
          en efecto, a exactamente {eur(MIN_INVESTABLE)}. No es un criterio de gusto: es aritmética
          de los portes.
        </P>
        <P>
          Resultado medido hoy: <B>{num(s.investable)}</B> instrumentos invertibles de{" "}
          {num(s.priced)} con precio
          {investablePct === null ? "" : `, el ${pctEs(investablePct, 1)}`}. La mediana del catálogo
          inglés cotiza a 0,59 € por carta (mediana de <F>avg30</F>, p25 0,12 · p75 3,97 · p90
          18,36, medido sobre la captura completa del 25 de agosto de 2026, antes de aplicar las
          exclusiones de la sección 7): la mitad del catálogo no cubre ni uno de los dos portes.
          Decir esto en voz alta es el argumento, no la limitación vergonzante.
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="senales" n={5} title="Las señales, una a una">
        <P>
          Son las señales que funcionan <B>sin histórico</B>, que es la única clase honesta con dos
          días de archivo. Ninguna predice: todas miden un desajuste que ya existe hoy y que se
          puede comprobar en el momento.
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Señal</th>
                <th style={{ minWidth: 220 }}>Qué mide</th>
                <th style={{ minWidth: 240 }}>Fórmula conceptual</th>
                <th style={{ minWidth: 260 }}>Umbral y exclusiones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <B>Coste de ida y vuelta</B>
                  <div className="faint">roundtrip_cost</div>
                </td>
                <td>Fracción del precio que se pierde al comprar y volver a vender</td>
                <td>
                  <F>(0,05·P + 7,00) / P</F>
                </td>
                <td>
                  Invertible si ≤ {pctEs(COST_CEILING, 0)}. Se calcula para todo instrumento con
                  precio positivo
                </td>
              </tr>
              <tr>
                <td>
                  <B>Posición en su cohorte</B>
                  <div className="faint">cohort_pct</div>
                </td>
                <td>
                  Dónde cae el precio dentro de su propio grupo de idioma, set y rareza. Bajo =
                  barata respecto a sus pares directos
                </td>
                <td>
                  <F>rango(precio) / (n − 1)</F> dentro de (idioma, set, rareza)
                </td>
                <td>Se descartan las cohortes con menos de 4 instrumentos</td>
              </tr>
              <tr>
                <td>
                  <B>Prima del ilustrador</B>
                  <div className="faint">artist_premium</div>
                </td>
                <td>
                  Posición media que alcanzan las cartas del ilustrador dentro de sus cohortes. 0,500
                  es neutro
                </td>
                <td>
                  <F>0,500 + w·(media − 0,500)</F>, con w = var_señal / (var_señal + var/n)
                </td>
                <td>
                  Mínimo 30 instrumentos por ilustrador. Fiabilidad medida de la señal:{" "}
                  {reliability === null ? "no disponible" : pctEs(reliability, 1)}.{" "}
                  <Link href="/ilustradores" style={{ color: "var(--accent)" }}>
                    Ranking completo →
                  </Link>
                </td>
              </tr>
              <tr>
                <td>
                  <B>Ratio Japón / Inglés</B>
                  <div className="faint">jp_en_ratio</div>
                </td>
                <td>
                  Cuánto cotiza la gemela japonesa respecto a la inglesa. El mercado japonés se
                  adelanta al inglés una mediana de 56 días (p25 49 · p75 83, medido sobre{" "}
                  {num(s.jpEnPairs)} pares)
                </td>
                <td>
                  <F>precio_JA / precio_EN</F> de la misma ilustración
                </td>
                <td>
                  Emparejamiento por (número de Pokédex, ilustrador) exigiendo correspondencia 1 a 1
                  en ambos sentidos. Adelanto entre lanzamientos admitido entre −30 y 730 días
                </td>
              </tr>
              <tr>
                <td>
                  <B>Arbitraje Europa / EE. UU.</B>
                  <div className="faint">eu_us_arb</div>
                </td>
                <td>
                  Diferencial entre Cardmarket y TCGplayer que sobrevive al tipo de cambio y a los
                  costes. Vivos hoy: {num(s.arbs)}
                </td>
                <td>
                  <F>|(USD/FX − EUR)/EUR| − coste</F>
                </td>
                <td>
                  Solo se publica si el neto es positivo y el coste ≤ {pctEs(COST_CEILING, 0)}. Un 15 %
                  de diferencial en una carta de 8 € no es una oportunidad: son los portes
                </td>
              </tr>
              <tr>
                <td>
                  <B>Puntuación de inversión</B>
                  <div className="faint">invest_score</div>
                </td>
                <td>Compuesto de las cuatro anteriores. Mide desajuste, no previsión</td>
                <td>
                  <F>media de ± z(componentes)</F>
                </td>
                <td>Ver la sección siguiente</td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <P className="faint">
          Sobre el emparejamiento japonés: deliberadamente <B>no</B> se exige que coincida la
          rareza. Medido sobre el catálogo, los vocabularios de rareza inglés y japonés solo solapan
          en 19 de 43 valores, así que exigirla descartaría pares perfectamente válidos por una
          diferencia de nomenclatura y no de producto. Lo que sí se exige es la correspondencia 1 a
          1: con varias candidatas a cada lado, adivinar no produce una señal débil, produce una
          señal falsa.
        </P>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="compuesto" n={6} title="La puntuación compuesta">
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>Componente</th>
                <th className="r">Signo</th>
                <th>Por qué ese signo</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Posición en su cohorte",
                  "−",
                  "Barata respecto a sus pares de set y rareza es la parte que puede corregir al alza",
                ],
                [
                  "Prima del ilustrador",
                  "+",
                  "Demanda estructural sostenida por la firma, no por la rareza",
                ],
                [
                  "Ratio Japón / Inglés",
                  "+",
                  "Su gemela japonesa cotiza más alto y el japonés adelanta unos 56 días",
                ],
                [
                  "Arbitraje Europa / EE. UU.",
                  "+",
                  "Diferencial entre mercados que sobrevive al tipo de cambio y a los costes",
                ],
              ].map(([label, sign, why]) => (
                <tr key={label}>
                  <td>
                    <B>{label}</B>
                  </td>
                  <td className="r num" style={{ fontSize: 15 }}>
                    <span className={sign === "+" ? "pos" : "neg"}>{sign}</span>
                  </td>
                  <td className="dim">{why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Grid>
        <P>
          Cada componente se normaliza en z-score transversal <B>solo dentro del universo
          invertible</B>: normalizar contra los {num(s.priced - s.investable)} instrumentos restantes, que cotizan
          en su mayoría en céntimos,
          distorsionaría toda la escala. Los z se recortan a ±3 para que un valor extremo no domine
          el compuesto. La puntuación es la <B>media</B> de las componentes presentes, no la suma,
          para que una carta con cuatro señales no gane automáticamente a una con dos; y se exige un
          mínimo de dos componentes.
        </P>
        <P>
          Los pesos son <B>iguales y los signos están congelados</B>. No es pereza: con dos días de
          archivo no hay observaciones independientes con las que estimar pesos, y cualquier peso
          &ldquo;óptimo&rdquo; ajustado hoy estaría ajustado al ruido. Se revisarán cuando haya
          histórico suficiente para medirlo, no antes.
        </P>
        <div className="note">
          <B>Qué significa una puntuación alta:</B> este instrumento presenta un desajuste
          observable hoy respecto a sus pares, a su gemela japonesa o al otro mercado.{" "}
          <B>Qué no significa:</B> que vaya a subir. No existe todavía ninguna comprobación contra
          retornos futuros, porque no hay retornos futuros que comprobar. Cualquier frase del tipo
          &ldquo;esta carta subirá un X %&rdquo; sería deshonesta y no la vas a encontrar aquí.
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="limites" n={7} title="Limitaciones medidas">
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th style={{ minWidth: 200 }}>Limitación</th>
                <th style={{ minWidth: 200 }}>Cifra medida</th>
                <th style={{ minWidth: 280 }}>Consecuencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <B>El archivo propio es nuevo</B>
                </td>
                <td className="num">
                  {s.days} {s.days === 1 ? "día" : "días"}, desde el {fecha(s.firstDay)}
                </td>
                <td className="dim">
                  No hay histórico, no hay retornos, no hay track record. No verás gráficos de
                  tendencia ni variaciones a 30 días en esta aplicación
                </td>
              </tr>
              <tr>
                <td>
                  <B>El catálogo cotiza en céntimos</B>
                </td>
                <td className="num">
                  Mediana de <F>avg30</F> = 0,59 € por carta (EN, captura del 25/08/2026)
                </td>
                <td className="dim">
                  La mitad del catálogo no cubre ni un porte. El precio no es el problema: el coste
                  fijo lo es
                </td>
              </tr>
              <tr>
                <td>
                  <B>Universo invertible pequeño</B>
                </td>
                <td className="num">
                  {num(s.investable)} de {num(s.priced)}
                  {investablePct === null ? "" : ` (${pctEs(investablePct, 1)})`}
                </td>
                <td className="dim">
                  El resto no es vehículo de inversión a ningún horizonte. Se sigue mostrando su
                  precio, pero no se puntúa
                </td>
              </tr>
              <tr>
                <td>
                  <B>Colisión de idProduct en Cardmarket</B>
                </td>
                <td className="num">
                  956 productos compartidos → 2.041 cartas EN, el 10,3 % de las 19.818 cartas
                  inglesas con precio
                </td>
                <td className="dim">
                  TCGdex mapea la carta, no el instrumento: variantes distintas devuelven precios
                  idénticos. Excluidas de todas las consultas
                </td>
              </tr>
              <tr>
                <td>
                  <B>Cartas digitales</B>
                </td>
                <td className="num">1.681 cartas de TCG Pocket</td>
                <td className="dim">Sin mercado físico y sin coste de envío. Excluidas</td>
              </tr>
              <tr>
                <td>
                  <B>
                    El campo <F>low</F> no es un precio
                  </B>
                </td>
                <td className="num">Mediana low/trend = 0,286 · p10 = 0,05</td>
                <td className="dim">
                  Son copias jugadas o dañadas. No se usa como precio, pese a que casi todas las
                  aplicaciones del sector lo muestran como el precio desde el que se compra
                </td>
              </tr>
              <tr>
                <td>
                  <B>
                    El campo <F>avg1</F> se arrastra
                  </B>
                </td>
                <td className="num">Informado en 28.444 de 29.522 observaciones</td>
                <td className="dim">
                  Un valor en avg1 no significa que hubiera venta ayer. Se conserva solo como medida
                  de dispersión y actividad
                </td>
              </tr>
              <tr>
                <td>
                  <B>Silencio en la fuente</B>
                </td>
                <td className="num">avg7 idéntico a avg30 en el 17,7 % del catálogo</td>
                <td className="dim">
                  Señal de que esa carta lleva tiempo sin transacciones. La antigüedad real de la
                  agregación de Cardmarket es inobservable
                </td>
              </tr>
              <tr>
                <td>
                  <B>El libro de TCGplayer llega sucio</B>
                </td>
                <td className="num">
                  51,9 % de las variantes con máximo más de 100 veces el mínimo
                </td>
                <td className="dim">
                  Por eso solo se usa <F>market</F>, y nunca los extremos del libro
                </td>
              </tr>
              <tr>
                <td>
                  <B>Japón no cotiza en dólares</B>
                </td>
                <td className="num">0 % de cobertura TCGplayer en japonés</td>
                <td className="dim">
                  El arbitraje Europa / EE. UU. no existe para cartas japonesas. Todo el análisis
                  japonés es en euros
                </td>
              </tr>
              <tr>
                <td>
                  <B>Cartas gradeadas fuera de alcance</B>
                </td>
                <td className="num">0 instrumentos PSA / BGS / CGC</td>
                <td className="dim">
                  Requiere el libro de eBay y una capa de limpieza de listados que todavía no está
                  en producción
                </td>
              </tr>
              <tr>
                <td>
                  <B>Rarezas japonesas inconsistentes</B>
                </td>
                <td className="num">Solapan 19 de 43 valores con las inglesas</td>
                <td className="dim">
                  Las cohortes japonesas se construyen sobre el vocabulario tal cual viene, y el
                  emparejamiento JP/EN no exige que la rareza coincida
                </td>
              </tr>
            </tbody>
          </table>
        </Grid>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="no-hacemos" n={8} title="Lo que no hacemos, y por qué">
        <div style={{ display: "grid", gap: 12 }}>
          <Why title="No hay ninguna señal de momentum">
            Es la omisión más importante del sistema y la más fácil de malinterpretar como un olvido.
            Con <F>avg7</F> y <F>avg30</F> se puede construir hoy mismo un factor de momentum
            espectacular, y sería falso por construcción: son filtros de media móvil, no
            observaciones. Sobre un paseo aleatorio puro, los retornos diarios de <F>avg30</F> tienen
            autocorrelación de orden 1 igual a 29/30 = 0,967, y los de <F>avg7</F>, 6/7 = 0,857. El
            Sharpe resultante sale inflado por √k: 2,65 veces con avg7 y 5,48 veces con avg30. Un
            backtest sobre eso encuentra oro en un mercado impredecible. Por eso no existe.
          </Why>
          <Why title="No predecimos precios con aprendizaje automático">
            Con {s.days} días de archivo, cualquier modelo estaría ajustado al ruido. Y el problema
            no se arregla esperando poco: a un horizonte de 30 días hay del orden de 12 cortes
            temporales independientes al año, así que seleccionar ocho factores entre cuarenta
            candidatos consumiría más grados de libertad de los que hay observaciones. El sistema del
            primer año es equiponderado y con signos congelados a propósito.
          </Why>
          <Why title="No mostramos gráficos de tendencia ni variaciones a 30 días">
            No hay serie que graficar. Donde se muestra histórico, se dice cuántos días hay.
          </Why>
          <Why title="No publicamos precio objetivo ni probabilidad de subida">
            Serían números sin nada detrás. El lenguaje correcto, y el que se usa en toda la
            aplicación, es que una carta <em>presenta desajuste</em>, <em>cotiza barata respecto a su
            cohorte</em> o <em>su gemela japonesa cotiza más alto</em>.
          </Why>
          <Why title="No cubrimos cartas gradeadas todavía">
            PSA, BGS y CGC son instrumentos distintos con curvas de precio propias, y su precio vive
            en eBay, no en Cardmarket. Entrar ahí sin higiene del libro de listados (proxies, lotes,
            reimpresiones, grados mal declarados, concentración de vendedor) daría un suelo de precio
            que mueve un solo vendedor. Está especificado; no está en producción.
          </Why>
          <Why title="No usamos el mínimo del libro como precio de referencia">
            El mínimo de una muestra es un estadístico de orden: baja según crece el número de
            listados. Verificado en simulación, pasar de 38 a 22 listados sube el mínimo esperado
            entre un 8,6 % y un 12,7 % con el mercado completamente parado. Buena parte de los
            &ldquo;despegues de precio&rdquo; que se publican por ahí son ese artefacto.
          </Why>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      <Section id="comprobar" n={9} title="Cómo comprobarlo">
        <P>
          Nada de lo anterior pide confianza. Los umbrales son tres constantes y un techo, están
          escritos en la sección 4, y se pueden rehacer con la comisión y los portes de cada uno. La
          ficha de cada carta publica el detalle de cada señal que la afecta: la cohorte concreta y
          su tamaño, la carta japonesa con la que se ha emparejado y el adelanto en días de su set,
          el tipo de cambio usado en el arbitraje y su fecha.
        </P>
        <Grid>
          <table className="grid">
            <thead>
              <tr>
                <th>Dato de trazabilidad</th>
                <th className="r">Valor actual</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fecha de cálculo de las señales</td>
                <td className="r num">{s.asOf}</td>
              </tr>
              <tr>
                <td>Primer día del archivo propio</td>
                <td className="r num">{s.firstDay}</td>
              </tr>
              <tr>
                <td>Días de precio almacenados</td>
                <td className="r num">{s.days}</td>
              </tr>
              <tr>
                <td>Tipo EUR/USD del último cálculo de arbitraje</td>
                <td className="r num">{fx ? `${FX.format(fx.rate)} · ${fx.date}` : "no disponible"}</td>
              </tr>
            </tbody>
          </table>
        </Grid>
        <div className="note">
          Cuando exista track record se publicará con su n efectivo y su intervalo de confianza, e
          incluirá el veredicto explícito cuando el resultado sea <em>todavía no distinguible de
          cero</em>. Publicar el punto sin el intervalo es exactamente lo que hace que estas
          herramientas no se puedan creer.
        </div>
      </Section>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ marginBottom: 28, scrollMarginTop: 72 }}>
      <h2 style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="num faint" style={{ fontSize: 13 }}>
          {n}
        </span>
        {title}
      </h2>
      <div className="card pad" style={{ display: "grid", gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={className} style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
      {children}
    </p>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 600 }}>{children}</strong>;
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="scroll-x">{children}</div>;
}

function Why({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderLeft: "2px solid var(--border-strong)",
        paddingLeft: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{title}</div>
      <div className="dim" style={{ fontSize: 13, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

/** Fragmento de codigo o de formula, en linea. */
function F({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0 4px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Formula({ children, block }: { children: React.ReactNode; block?: boolean }) {
  return (
    <div
      className="scroll-x"
      style={{
        fontFamily: "var(--mono)",
        fontSize: 12.5,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: block ? "10px 12px" : "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Hechos que el motor publica dentro del detalle de sus propias senales. Se leen en
 * vivo, de una sola pasada por el ranking, para que esta pagina no repita a mano una
 * cifra que el motor ya haya recalculado: el tipo de cambio realmente aplicado y la
 * fiabilidad medida de la prima del ilustrador.
 */
function readEngineFacts(): {
  fx: { rate: number; date: string } | null;
  reliability: number | null;
} {
  const top = getScreener({ limit: 100 });

  let fx: { rate: number; date: string } | null = null;
  const arb = top.find((c) => c.components.eu_us_arb !== undefined);
  if (arb) {
    const sig = getCardSignals(arb.instrument_id).find((x) => x.signal === "eu_us_arb");
    const rate = sig?.detail["fx_eurusd"];
    const date = sig?.detail["fx_date"];
    if (typeof rate === "number") fx = { rate, date: typeof date === "string" ? date : "—" };
  }

  let reliability: number | null = null;
  const art = top.find((c) => c.components.artist_premium !== undefined);
  if (art) {
    const sig = getCardSignals(art.instrument_id).find((x) => x.signal === "artist_premium");
    const v = sig?.detail["reliability_global"];
    if (typeof v === "number") reliability = v;
  }

  return { fx, reliability };
}
