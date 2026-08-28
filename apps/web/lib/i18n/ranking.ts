import type { Dict } from "./index";

/**
 * Texto de la pagina de ranking y de su desglose de barras.
 *
 * Dos convenciones:
 *
 * 1. Todo lo que lleva datos dentro es una FUNCION, no una plantilla con
 *    marcadores. Asi cada idioma decide donde cae cada dato: el japones pone el
 *    numero antes del sustantivo y el verbo al final, y con una plantilla comun
 *    eso no se puede escribir.
 *
 * 2. Los parrafos que llevan negrita o cifras en tipografia tabular devuelven
 *    una lista de fragmentos en vez de una cadena. El componente <Rich> de la
 *    pagina los pinta. De nuevo, para que el orden lo mande la traduccion y no
 *    el JSX: partir la frase en tres literales fijos obligaria a los tres
 *    idiomas a compartir la sintaxis del espanol.
 */

/** Trozo de parrafo: texto plano, o texto con negrita (b) y/o cifra tabular (n). */
export type Frag = string | { t: string; b?: boolean; n?: boolean };

/**
 * Tipo de caso de inversion: que clase de argumento sostiene esa fila.
 *
 * Un unico numero mezcla cosas de naturaleza distinta. Un arbitraje entre
 * Cardmarket y TCGplayer se puede comprobar hoy mismo abriendo las dos tiendas;
 * una prima de ilustrador es una regularidad historica lenta e indirecta. Las
 * dos pueden dar el mismo 2,4 de puntuacion y no son la misma cosa.
 *
 * Las claves se quedan en espanol porque son ademas el valor del querystring, es
 * decir, la URL publica de la pagina. Traducirlas romperia los enlaces
 * compartidos sin decirle nada nuevo a nadie.
 */
export type CaseKey = "arbitraje" | "cohorte" | "japon" | "ilustrador";

/**
 * Las clausulas de la frase llana se escriben SIEMPRE en minuscula, para poder
 * encadenarlas en cualquier orden. Solo la que acaba siendo la primera se
 * capitaliza, y de eso se encarga aqui `one`/`join`. Ninguna clausula empieza
 * por nombre propio, asi que la mayuscula automatica nunca destroza un nombre.
 */
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface RankingDict {
  title: string;
  /** Bajada. `asOf` es la fecha de calculo de las senales, ya formateada. */
  intro: (asOf: string) => string;

  stat: {
    cards: string;
    cardsCtx: string;
    instruments: string;
    instrumentsCtx: string;
    priced: string;
    pricedCtx: (share: string) => string;
    investable: string;
    investableCtx: (share: string) => string;
    days: string;
    daysCtx: (firstDay: string) => string;
    sets: string;
    setsCtx: string;
    pairs: string;
    pairsCtx: string;
    arbs: string;
    arbsCtx: string;
  };

  /**
   * El parrafo incomodo: cuantos instrumentos sobreviven al coste de ida y
   * vuelta y cuantos se quedan sin puntuar. `unscored` es null cuando no queda
   * ninguno fuera, y entonces la frase termina antes.
   */
  reality: (p: {
    priced: string;
    investable: string;
    scored: string;
    unscored: string | null;
  }) => string;

  /** Que mide la puntuacion y, sobre todo, que no mide. */
  method: (p: { days: string; firstDay: string }) => Frag[];

  filters: {
    lang: string;
    langAll: string;
    langOnly: (name: string) => string;
    minPrice: string;
    minNone: string;
    minChip: (amount: string) => string;
    minHelp: (price: string) => string;
    rarity: string;
    rarityAll: string;
    rarityHelp: (n: string, rarity: string) => string;
    /**
     * Variante para la rareza "None". El nombre de la rareza es dato de origen y
     * viaja crudo, pero "None" es la unica que si se traduce (rarityNone), y
     * meterla en la frase de arriba daria "rareza Sin rareza". Frase propia.
     */
    rarityNoneHelp: (n: string) => string;
    clearAll: string;
  };

  /** Unica etiqueta de rareza que se traduce: el resto son datos de origen. */
  rarityNone: string;

  /**
   * La frase en lenguaje llano de cada fila.
   *
   * Se arma con las dos senales de mayor peso de esa carta y sus cifras reales,
   * sacadas del detalle de cada senal (no de los z-scores, que no significan
   * nada fuera de la tabla). Cada clausula se escribe en minuscula y sin punto
   * para poder encadenarla; `one` y `join` ponen la mayuscula y el punto.
   *
   * Ninguna de estas frases dice que el precio vaya a subir: describen donde
   * esta hoy respecto a algo comparable, que es lo unico medido.
   */
  plain: {
    title: string;
    help: string;
    /** Una sola clausula fuerte. */
    one: (a: string) => string;
    /** Las dos clausulas de mayor peso, encadenadas. */
    join: (a: string, b: string) => string;
    /** Senal fuerte que juega EN CONTRA y no cabe en la frase principal. */
    against: (a: string) => string;

    cohort: (p: {
      share: string;
      n: string;
      set: string | null;
      rarity: string | null;
      cheap: boolean;
    }) => string;
    /** Extremo de la cohorte: decir "mas barata que el 100%" seria absurdo. */
    cohortEdge: (p: {
      n: string;
      set: string | null;
      rarity: string | null;
      cheap: boolean;
    }) => string;
    artist: (p: { artist: string; points: string; n: string; above: boolean }) => string;
    jp: (p: { pct: string; ja: string; en: string; higher: boolean }) => string;
    arb: (p: { gross: string; net: string; buyEu: boolean }) => string;
  };

  /** Filtro por tipo de caso: que clase de argumento sostiene la fila. */
  cases: {
    label: string;
    all: string;
    allHelp: string;
    /** La linea que evita el malentendido: son clases distintas, no confianzas distintas. */
    note: string;
    name: Record<CaseKey, string>;
    /** Version corta para la etiqueta que lleva cada fila. */
    short: Record<CaseKey, string>;
    help: Record<CaseKey, string>;
    tag: (name: string) => string;
    /** Cuando el filtro de caso deja la seleccion vacia. */
    none: string;
  };

  /**
   * Columna de deriva reciente. Es INFORMACION, no senal: no entra en la
   * puntuacion, y el texto tiene que decirlo.
   */
  drift: {
    col: string;
    colHelp: string;
    cell: (p: {
      pct: string;
      price: string;
      avg: string;
      above: boolean;
      short: string | null;
    }) => string;
    none: string;
    note: Frag[];
    sortDesc: string;
    sortAsc: string;
    sortOff: string;
    byScore: string;
    orderedBy: (desc: boolean) => string;
  };

  table: {
    caption: (p: { shown: string; total: string; filtered: boolean }) => Frag[];
    cheapest: (p: { price: string; roundtrip: string | null }) => Frag[];
    noPrices: string;
    empty: string;
    clear: string;
    col: {
      card: string;
      illustrator: string;
      lang: string;
      price: string;
      priceHelp: string;
      roundtrip: string;
      score: string;
      breakdown: (clip: number) => string;
    };
  };

  row: {
    imageAlt: (p: { name: string; set: string; variant: string }) => string;
    /** La ilustracion es la de la edicion en otro idioma. Hay que decirlo. */
    imageFallback: (lang: string) => string;
    unnamed: string;
    unknownSet: string;
    cardLink: string;
    variantOwn: string;
    variantShared: string;
    finishesChip: (extra: number) => string;
    finishesHelp: (total: number) => string;
    illustratorLink: (name: string) => string;
    noIllustrator: string;
    langTag: (name: string) => string;
    noTcg: string;
    tcgHelp: string;
    scoreClipped: (clip: number) => string;
    componentsHelp: (used: number, total: number) => string;
  };

  legend: {
    title: string;
    body: (signals: number) => Frag[];
    /** Aviso sobre las filas que se sostienen en solo dos senales. */
    thin: (p: { two: string; rows: string }) => Frag[];
    clip: (p: { clip: string; clipped: string }) => Frag[];
    /** Matices medidos que se anaden a la ayuda de ciertas senales. */
    extra: Record<string, string>;
    noHelp: string;
  };

  /** Tooltips de <ScoreBar>: cabecera y cada barra. */
  bars: {
    headerTitle: (p: { label: string; help: string }) => string;
    noData: (label: string) => string;
    value: (p: { label: string; z: string; clipped: boolean; help: string }) => string;
  };

  footer: string;
}

const es: RankingDict = {
  title: "Ranking de inversión",
  intro: (asOf) =>
    `Los instrumentos cuyo precio más se sale hoy del patrón de sus pares, ordenados por desajuste. Señales calculadas el ${asOf}. Cada fila es un instrumento —carta × variante × idioma—, no una carta: la misma ilustración puede aparecer varias veces en normal, holo y reverse, y son mercados distintos.`,

  stat: {
    cards: "Cartas",
    cardsCtx: "catálogo físico, sin TCG Pocket",
    instruments: "Instrumentos",
    instrumentsCtx: "carta × variante × idioma",
    priced: "Con precio",
    pricedCtx: (share) => `${share} de los instrumentos`,
    investable: "Invertibles",
    investableCtx: (share) => `ida y vuelta ≤ 25% · solo ${share} de los que cotizan`,
    days: "Días de archivo",
    daysCtx: (firstDay) => `desde el ${firstDay} · sin serie histórica`,
    sets: "Ediciones",
    setsCtx: "inglesas y japonesas",
    pairs: "Pares JP/EN",
    pairsCtx: "misma carta en los dos idiomas",
    arbs: "Arbitrajes",
    arbsCtx: "con precio en Europa y EE. UU.",
  },

  reality: ({ priced, investable, scored, unscored }) =>
    `La cifra incómoda es la cuarta: de los ${priced} instrumentos con precio, solo ${investable} se pueden comprar y revender con un coste de ida y vuelta del 25% o menos. Los portes y la comisión son un coste fijo, así que se comen entero el margen de las cartas baratas —y la mediana del catálogo ronda los 0,29 €—. Por eso este ranking no contiene cartas de un euro: no es un sesgo de selección, es el mercado. Y de esos ${investable} invertibles, aquí se puntúan ${scored}` +
    (unscored
      ? `: los ${unscored} restantes tienen una sola señal o ninguna, y con una sola no hay nada con lo que contrastarla.`
      : "."),

  method: ({ days, firstDay }) => [
    "La puntuación combina en z-scores hasta cuatro señales de desajuste ",
    { t: "observable hoy", b: true },
    " —dónde cotiza la carta dentro de su cohorte de set y rareza, la prima histórica de su ilustrador, lo que pide su gemela japonesa y el diferencial entre Cardmarket y TCGplayer— promediadas con pesos iguales sobre las señales que existen para cada carta. ",
    { t: "No es una previsión validada:", b: true },
    ` el archivo propio tiene ${days} días, empezó el ${firstDay} y todavía no hay ningún resultado contra el que contrastarla, así que mide dónde el precio se sale de su patrón, no cuánto va a subir.`,
  ],

  filters: {
    lang: "Idioma",
    langAll: "Ambos",
    langOnly: (name) => `Solo la edición en ${name.toLowerCase()}`,
    minPrice: "Precio mín.",
    minNone: "Sin mínimo",
    minChip: (amount) => `≥ ${amount} €`,
    minHelp: (price) => `Solo instrumentos que cotizan a ${price} o más`,
    rarity: "Rareza",
    rarityAll: "Todas",
    rarityHelp: (n, rarity) => `${n} instrumentos con rareza ${rarity} en el ranking actual`,
    rarityNoneHelp: (n) => `${n} instrumentos sin rareza en el ranking actual`,
    clearAll: "Quitar todos los filtros",
  },

  rarityNone: "Sin rareza",

  plain: {
    title: "Qué dice la frase de cada fila",
    help:
      "Bajo cada instrumento hay una frase construida con las dos señales de mayor peso de esa carta y con sus cifras reales, no con los z-scores. Describe un desajuste observable hoy: dónde está el precio respecto a algo comparable —sus pares de cohorte, su gemela japonesa, el otro continente, el historial de su ilustrador—. Cuando la cifra real de una señal no apunta en el mismo sentido que su contribución, cosa que pasa en cohortes pequeñas, esa señal se calla en vez de decir lo contrario de lo que aporta. Dos precisiones sobre las cifras: el porcentaje de cohorte está tomado sobre las mismas cartas que nombra la frase, contando cuántas de ellas cotizan por encima o por debajo; y la prima del ilustrador es una estimación contraída hacia el nivel neutro según el tamaño de la muestra, no la media cruda de sus cartas, porque con pocas cartas esa media cruda habla más del azar que del autor. Y ninguna de estas frases dice que el precio vaya a subir, porque eso no lo sabemos: el archivo propio tiene pocos días y no hay ni un solo resultado con el que contrastar nada.",
    one: (a) => `${cap(a)}.`,
    join: (a, b) => `${cap(a)}, y ${b}.`,
    against: (a) => `En contra: ${a}.`,

    cohort: ({ share, n, set, rarity, cheap }) => {
      const grupo = set
        ? rarity
          ? `las ${n} cartas ${rarity} de ${set}`
          : `las ${n} cartas de su misma rareza en ${set}`
        : rarity
          ? `las ${n} cartas ${rarity} de su edición`
          : `las ${n} cartas de su cohorte`;
      return cheap
        ? `cotiza más barata que el ${share} de ${grupo}`
        : `cotiza más cara que el ${share} de ${grupo}`;
    },
    cohortEdge: ({ n, set, rarity, cheap }) => {
      const grupo = set
        ? rarity
          ? `las ${n} cartas ${rarity} de ${set}`
          : `las ${n} cartas de su misma rareza en ${set}`
        : rarity
          ? `las ${n} cartas ${rarity} de su edición`
          : `las ${n} cartas de su cohorte`;
      return cheap ? `es la más barata de ${grupo}` : `es la más cara de ${grupo}`;
    },
    artist: ({ artist, points, n, above }) =>
      above
        ? `las cartas de ${artist} tienden a situarse por encima del nivel neutro de sus cohortes, con una prima estimada de ${points} puntos de percentil sobre una muestra de ${n} cartas`
        : `las cartas de ${artist} tienden a situarse por debajo del nivel neutro de sus cohortes, con un descuento estimado de ${points} puntos de percentil sobre una muestra de ${n} cartas`,
    jp: ({ pct, ja, en, higher }) =>
      higher
        ? `su equivalente japonesa cotiza un ${pct} más alto (${ja} frente a ${en})`
        : `su equivalente japonesa cotiza un ${pct} más barata (${ja} frente a ${en})`,
    arb: ({ gross, net, buyEu }) =>
      buyEu
        ? `se compra en Europa y se vende en Estados Unidos con un diferencial bruto del ${gross}, del que sobrevive un ${net} tras el cambio, los portes y las comisiones`
        : `se compra en Estados Unidos y se vende en Europa con un diferencial bruto del ${gross}, del que sobrevive un ${net} tras el cambio, los portes y las comisiones`,
  },

  cases: {
    label: "Tipo de caso",
    all: "Todos",
    allHelp: "Los cuatro tipos de caso a la vez, más las filas sin señal dominante",
    note: "Cada grupo es una clase de argumento distinta, no un nivel de confianza distinto: cambia el dato que sostiene el caso, no la calidad de la puntuación. Una fila entra en el grupo de la señal que más pesa en su puntuación.",
    name: {
      arbitraje: "Arbitraje entre mercados",
      cohorte: "Barata en su cohorte",
      japon: "Japón va por delante",
      ilustrador: "Ilustrador con prima",
    },
    short: {
      arbitraje: "Arbitraje",
      cohorte: "Cohorte",
      japon: "Japón",
      ilustrador: "Ilustrador",
    },
    help: {
      arbitraje:
        "El precio europeo y el estadounidense de la misma carta se separan más de lo que cuesta cruzarlos, tipo de cambio y coste de ida y vuelta incluidos. Es el argumento más accionable y el más cercano a determinista: se puede comprobar hoy mismo abriendo Cardmarket y TCGplayer.",
      cohorte:
        "El precio queda por debajo del de las cartas de su misma edición y rareza. Es un argumento de comparación, no de ejecución: nada garantiza que la cohorte sea el punto de referencia correcto para esa carta en concreto.",
      japon:
        "La misma carta cotiza más alto en su edición japonesa. En lo medido, el mercado japonés se adelanta 56 días de mediana, pero un adelanto medido es una regularidad, no una promesa.",
      ilustrador:
        "Las cartas de este ilustrador se sitúan de media por encima del nivel neutro de sus cohortes. Es la señal más lenta y la más indirecta de las cuatro: habla del autor, no de esta carta.",
    },
    tag: (name) => `Caso dominante: ${name}. Ver solo este tipo de caso.`,
    none: "Ningún instrumento puntuado tiene este tipo de caso con los filtros actuales.",
  },

  drift: {
    col: "Deriva 30 d",
    colHelp:
      "Dónde está hoy la tendencia de Cardmarket —el mismo número de la columna de precio— respecto a la media de 30 días que publica la propia Cardmarket. Es la comparación entre dos agregados de la fuente, NO un retorno medido por nosotros, y no entra en la puntuación.",
    cell: ({ pct, price, avg, above, short }) =>
      `La tendencia de hoy (${price}) está un ${pct} ${above ? "por encima" : "por debajo"} de la media de 30 días que publica Cardmarket (${avg}).` +
      (short ? ` Frente a la media de 7 días: ${short}.` : "") +
      " Son dos agregados de la misma fuente, no un retorno que hayamos medido, y no entra en la puntuación.",
    none: "Cardmarket no publica media de 30 días para este instrumento.",
    note: [
      "La columna de deriva es ",
      { t: "información, no señal", b: true },
      ". Las medias de Cardmarket no son puntos de una serie temporal: avg30 es la media de los últimos 30 días y avg7 la de los últimos 7, calculadas hacia atrás desde hoy y con las ventanas solapadas. Unirlas con una línea inventaría un histórico que no tenemos, y calcular retornos diarios sobre ellas produce una autocorrelación altísima por pura construcción del filtro. Lo que sí se puede decir con verdad es dónde está la tendencia de hoy respecto a esas medias, y eso es lo que muestra la columna. Por eso se puede ordenar por ella, ",
      { t: "pero no entra en la puntuación", b: true },
      ": construir una señal sobre medias móviles es exactamente la trampa que este proyecto se niega a pisar.",
    ],
    sortDesc: "Ordenar por deriva de 30 días, de mayor a menor",
    sortAsc: "Ordenar por deriva de 30 días, de menor a mayor",
    sortOff: "Volver al orden por puntuación",
    byScore: "Ordenado por puntuación de inversión, de mayor a menor",
    orderedBy: (desc) =>
      `Ordenado por deriva de 30 días, de ${desc ? "mayor a menor" : "menor a mayor"}. La puntuación sigue siendo el criterio del ranking; la deriva solo reordena lo que ya estaba puntuado.`,
  },

  table: {
    caption: ({ shown, total, filtered }) => [
      { t: shown, b: true, n: true },
      " de ",
      { t: total, n: true },
      ` instrumentos puntuados${filtered ? " con los filtros actuales" : ""}. Posición dentro de esta selección.`,
    ],
    cheapest: ({ price, roundtrip }) => [
      "El más barato del ranking cotiza a ",
      { t: price, n: true },
      ...(roundtrip
        ? [" · coste de ida y vuelta mediano ", { t: roundtrip, n: true } as Frag]
        : []),
    ],
    noPrices: "Sin precios en la selección",
    empty: "Ningún instrumento puntuado cumple estos filtros.",
    clear: "Quitar los filtros",
    col: {
      card: "Carta",
      illustrator: "Ilustrador",
      lang: "Idioma",
      price: "Precio",
      priceHelp:
        "Tendencia de Cardmarket en euros. Debajo, precio de mercado de TCGplayer en dólares, sin convertir.",
      roundtrip: "Ida y vuelta",
      score: "Puntuación",
      breakdown: (clip) => `Desglose (z, −${clip} a +${clip})`,
    },
  },

  row: {
    imageAlt: ({ name, set, variant }) => `${name} — ${set} ${variant}`,
    imageFallback: (lang) =>
      `La ilustración es la de la edición en ${lang.toLowerCase()}: TCGdex no publica la de esta carta. Mismo arte, distinto marco y distinto texto.`,
    unnamed: "Sin nombre",
    unknownSet: "Edición desconocida",
    cardLink: "Ficha de este instrumento: precio, señales y variantes hermanas",
    variantOwn:
      "Variante del instrumento: este acabado cotiza como producto propio en Cardmarket.",
    variantShared:
      "Cardmarket publica un único precio para varios acabados de esta carta, así que el precio europeo no distingue entre ellos.",
    finishesChip: (extra) => `+${extra} acabado${extra > 1 ? "s" : ""}`,
    finishesHelp: (total) =>
      `Cardmarket agrupa ${total} acabados de esta carta bajo un mismo producto y un mismo precio. Se muestran como una sola fila: son la misma oportunidad, no ${total}.`,
    illustratorLink: (name) => `Ver todas las cartas ilustradas por ${name}`,
    noIllustrator: "Sin acreditar",
    langTag: (name) => `Edición en ${name.toLowerCase()}`,
    noTcg: "Sin precio en TCGplayer",
    tcgHelp: "Precio de mercado en TCGplayer, en dólares y sin convertir.",
    scoreClipped: (clip) => `Puntuación topada en el recorte de ±${clip} desviaciones típicas.`,
    componentsHelp: (used, total) =>
      `Se han promediado ${used} de las ${total} señales; para el resto no hay dato en esta carta.`,
  },

  legend: {
    title: "Cómo se lee el desglose",
    body: (signals) => [
      `Cada barra es un z-score con el signo ya orientado: a la derecha y en verde empuja la puntuación hacia arriba, a la izquierda y en rojo la frena. El centro de la caja es el cero. Un punto en lugar de barra significa que esa señal no existe para esa carta —no que valga cero—, y por eso bajo cada puntuación se indica sobre cuántas de las ${signals} señales se ha promediado. `,
    ],
    thin: ({ two, rows }) => [
      "Conviene mirar ese cociente antes que la puntuación: hoy ",
      { t: two, b: true, n: true },
      " de las ",
      { t: rows, n: true },
      " filas visibles se apoyan en solo dos señales, y la misma cifra sostenida por dos descansa en menos evidencia que sostenida por cuatro. ",
    ],
    clip: ({ clip, clipped }) => [
      `Tanto los componentes como la puntuación llegan recortados a ±${clip}: un ${clipped} está topado.`,
    ],
    extra: {
      artist_premium: " Fiabilidad medida del 80,6% en la descomposición de varianza.",
      jp_en_ratio:
        " El adelanto medido del mercado japonés es de 56 días de mediana (p25 49, p75 83).",
    },
    noHelp: "Señal sin descripción.",
  },

  bars: {
    headerTitle: ({ label, help }) => `${label}. ${help}`,
    noData: (label) => `${label}: sin dato para esta carta, no entra en el promedio.`,
    value: ({ label, z, clipped, help }) =>
      `${label}: ${z} z${clipped ? " (recortado)" : ""}. ${help}`,
  },

  footer:
    "Precios de Cardmarket (tendencia, EUR) y TCGplayer (mercado, USD), catálogo de TCGdex. Quedan fuera de todo el sitio las cartas digitales de TCG Pocket y los instrumentos cuyo producto de Cardmarket está compartido por varias cartas, porque su precio no es atribuible. Ni esta página ni ninguna otra de Cartoteca son asesoramiento de inversión.",
};

const en: RankingDict = {
  title: "Investment ranking",
  intro: (asOf) =>
    `The instruments whose price strays furthest today from the pattern of their peers, sorted by mispricing. Signals computed on ${asOf}. Each row is an instrument — card × variant × language — not a card: the same artwork can appear several times as normal, holo and reverse, and those are different markets.`,

  stat: {
    cards: "Cards",
    cardsCtx: "physical catalogue, TCG Pocket excluded",
    instruments: "Instruments",
    instrumentsCtx: "card × variant × language",
    priced: "With a price",
    pricedCtx: (share) => `${share} of all instruments`,
    investable: "Investable",
    investableCtx: (share) => `round trip ≤ 25% · only ${share} of those with a price`,
    days: "Days of archive",
    daysCtx: (firstDay) => `since ${firstDay} · no historical series`,
    sets: "Sets",
    setsCtx: "English and Japanese",
    pairs: "JP/EN pairs",
    pairsCtx: "same card in both languages",
    arbs: "Arbitrages",
    arbsCtx: "priced in both Europe and the US",
  },

  reality: ({ priced, investable, scored, unscored }) =>
    `The uncomfortable number is the fourth one: of the ${priced} instruments with a price, only ${investable} can be bought and sold again at a round-trip cost of 25% or less. Shipping and fees are a fixed cost, so they swallow the entire margin on cheap cards — and the median of the catalogue sits at about €0.29. That is why this ranking holds no one-euro cards: it is not selection bias, it is the market. And of those ${investable} investable instruments, ${scored} are scored here` +
    (unscored
      ? `: the remaining ${unscored} have one signal or none, and with a single signal there is nothing to check it against.`
      : "."),

  method: ({ days, firstDay }) => [
    "The score combines as z-scores up to four signals of mispricing that is ",
    { t: "observable today", b: true },
    " — where the card trades inside its set-and-rarity cohort, the historical premium of its illustrator, what its Japanese twin is asking, and the gap between Cardmarket and TCGplayer — averaged with equal weights over whichever signals exist for each card. ",
    { t: "It is not a validated forecast:", b: true },
    ` our own archive is ${days} days deep, it started on ${firstDay}, and there is still no outcome to check the score against, so it measures where a price departs from its pattern, not how much it will rise.`,
  ],

  filters: {
    lang: "Language",
    langAll: "Both",
    langOnly: (name) => `${name} edition only`,
    minPrice: "Min. price",
    minNone: "No minimum",
    minChip: (amount) => `≥ €${amount}`,
    minHelp: (price) => `Only instruments trading at ${price} or more`,
    rarity: "Rarity",
    rarityAll: "All",
    rarityHelp: (n, rarity) => `${n} instruments of rarity ${rarity} in the current ranking`,
    rarityNoneHelp: (n) => `${n} instruments with no rarity in the current ranking`,
    clearAll: "Clear every filter",
  },

  rarityNone: "No rarity",

  plain: {
    title: "What the sentence under each row says",
    help:
      "Under every instrument there is a sentence built from that card's two heaviest signals and their real figures, not from the z-scores. It describes mispricing observable today: where the price sits relative to something comparable — its cohort peers, its Japanese twin, the other continent, its illustrator's record. When a signal's real figure does not point the same way as its contribution, which happens in small cohorts, that signal stays quiet rather than saying the opposite of what it adds. Two notes on the figures: the cohort percentage is taken over exactly the cards the sentence names, by counting how many of them trade above or below it; and the illustrator premium is an estimate shrunk towards the neutral level according to sample size, not the raw mean of that artist's cards, because with few cards the raw mean says more about chance than about the author. And none of these sentences claims the price will rise, because we do not know that: our own archive is a few days old and there is not a single outcome to check anything against.",
    one: (a) => `${cap(a)}.`,
    join: (a, b) => `${cap(a)}, and ${b}.`,
    against: (a) => `Against it: ${a}.`,

    cohort: ({ share, n, set, rarity, cheap }) => {
      const group = set
        ? rarity
          ? `the ${n} ${rarity} cards in ${set}`
          : `the ${n} cards of its rarity in ${set}`
        : rarity
          ? `the ${n} ${rarity} cards of its set`
          : `the ${n} cards in its cohort`;
      return cheap
        ? `it trades cheaper than ${share} of ${group}`
        : `it trades dearer than ${share} of ${group}`;
    },
    cohortEdge: ({ n, set, rarity, cheap }) => {
      const group = set
        ? rarity
          ? `the ${n} ${rarity} cards in ${set}`
          : `the ${n} cards of its rarity in ${set}`
        : rarity
          ? `the ${n} ${rarity} cards of its set`
          : `the ${n} cards in its cohort`;
      return cheap ? `it is the cheapest of ${group}` : `it is the dearest of ${group}`;
    },
    artist: ({ artist, points, n, above }) =>
      above
        ? `cards by ${artist} tend to sit above the neutral level of their cohorts, with an estimated premium of ${points} percentile points over a sample of ${n} cards`
        : `cards by ${artist} tend to sit below the neutral level of their cohorts, with an estimated discount of ${points} percentile points over a sample of ${n} cards`,
    jp: ({ pct, ja, en, higher }) =>
      higher
        ? `its Japanese counterpart trades ${pct} higher (${ja} against ${en})`
        : `its Japanese counterpart trades ${pct} cheaper (${ja} against ${en})`,
    arb: ({ gross, net, buyEu }) =>
      buyEu
        ? `it can be bought in Europe and sold in the United States on a gross spread of ${gross}, of which ${net} survives the exchange rate, shipping and fees`
        : `it can be bought in the United States and sold in Europe on a gross spread of ${gross}, of which ${net} survives the exchange rate, shipping and fees`,
  },

  cases: {
    label: "Kind of case",
    all: "All",
    allHelp: "All four kinds of case at once, plus the rows with no dominant signal",
    note: "Each group is a different class of argument, not a different level of confidence: what changes is the evidence holding the case up, not the quality of the score. A row falls into the group of whichever signal weighs most in its score.",
    name: {
      arbitraje: "Cross-market arbitrage",
      cohorte: "Cheap within its cohort",
      japon: "Japan is ahead",
      ilustrador: "Illustrator premium",
    },
    short: {
      arbitraje: "Arbitrage",
      cohorte: "Cohort",
      japon: "Japan",
      ilustrador: "Illustrator",
    },
    help: {
      arbitraje:
        "The European and the American price of the same card diverge by more than it costs to cross between them, exchange rate and round-trip cost included. It is the most actionable argument and the closest to deterministic: you can check it today by opening Cardmarket and TCGplayer side by side.",
      cohorte:
        "The price sits below that of the cards in its own set and rarity. It is an argument by comparison, not by execution: nothing guarantees the cohort is the right benchmark for this particular card.",
      japon:
        "The same card trades higher in its Japanese edition. In what we measured, the Japanese market leads by a median of 56 days, but a measured lead is a regularity, not a promise.",
      ilustrador:
        "This illustrator's cards sit on average above the neutral level of their cohorts. It is the slowest and most indirect of the four signals: it speaks about the author, not about this card.",
    },
    tag: (name) => `Dominant case: ${name}. Show only this kind of case.`,
    none: "No scored instrument has this kind of case under the current filters.",
  },

  drift: {
    col: "30-day drift",
    colHelp:
      "Where Cardmarket's trend price sits today — the same number as in the price column — relative to the 30-day average Cardmarket itself publishes. It is a comparison between two aggregates from the source, NOT a return we measured, and it does not enter the score.",
    cell: ({ pct, price, avg, above, short }) =>
      `Today's trend price (${price}) is ${pct} ${above ? "above" : "below"} the 30-day average Cardmarket publishes (${avg}).` +
      (short ? ` Against the 7-day average: ${short}.` : "") +
      " They are two aggregates from the same source, not a return we measured, and it does not enter the score.",
    none: "Cardmarket publishes no 30-day average for this instrument.",
    note: [
      "The drift column is ",
      { t: "information, not a signal", b: true },
      ". Cardmarket's averages are not points on a time series: avg30 is the mean of the last 30 days and avg7 the mean of the last 7, both computed backwards from today with overlapping windows. Joining them with a line would invent a history we do not have, and computing daily returns on them yields enormous autocorrelation by sheer construction of the filter. What can truthfully be said is where today's trend price sits relative to those averages, and that is what the column shows. Which is why you can sort by it ",
      { t: "but it does not enter the score", b: true },
      ": building a signal on moving averages is precisely the trap this project refuses to walk into.",
    ],
    sortDesc: "Sort by 30-day drift, highest first",
    sortAsc: "Sort by 30-day drift, lowest first",
    sortOff: "Back to sorting by score",
    byScore: "Sorted by investment score, highest first",
    orderedBy: (desc) =>
      `Sorted by 30-day drift, ${desc ? "highest" : "lowest"} first. The score remains the ranking criterion; drift only reorders what was already scored.`,
  },

  table: {
    caption: ({ shown, total, filtered }) => [
      { t: shown, b: true, n: true },
      " of ",
      { t: total, n: true },
      ` scored instruments${filtered ? " under the current filters" : ""}. Position within this selection.`,
    ],
    cheapest: ({ price, roundtrip }) => [
      "The cheapest in the ranking trades at ",
      { t: price, n: true },
      ...(roundtrip
        ? [" · median round-trip cost ", { t: roundtrip, n: true } as Frag]
        : []),
    ],
    noPrices: "No prices in this selection",
    empty: "No scored instrument matches these filters.",
    clear: "Clear the filters",
    col: {
      card: "Card",
      illustrator: "Illustrator",
      lang: "Language",
      price: "Price",
      priceHelp:
        "Cardmarket trend in euros. Below it, the TCGplayer market price in dollars, unconverted.",
      roundtrip: "Round trip",
      score: "Score",
      breakdown: (clip) => `Breakdown (z, −${clip} to +${clip})`,
    },
  },

  row: {
    imageAlt: ({ name, set, variant }) => `${name} — ${set} ${variant}`,
    imageFallback: (lang) =>
      `The artwork shown is the ${lang} edition's: TCGdex publishes none for this card. Same art, different frame and different text.`,
    unnamed: "Unnamed",
    unknownSet: "Unknown set",
    cardLink: "This instrument's page: price, signals and sibling variants",
    variantOwn:
      "The instrument's variant: this finish trades as a product of its own on Cardmarket.",
    variantShared:
      "Cardmarket publishes a single price for several finishes of this card, so the European price does not tell them apart.",
    finishesChip: (extra) => `+${extra} finish${extra > 1 ? "es" : ""}`,
    finishesHelp: (total) =>
      `Cardmarket groups ${total} finishes of this card under one product and one price. They are shown as a single row: they are the same opportunity, not ${total}.`,
    illustratorLink: (name) => `See every card illustrated by ${name}`,
    noIllustrator: "Uncredited",
    langTag: (name) => `${name} edition`,
    noTcg: "No price on TCGplayer",
    tcgHelp: "TCGplayer market price, in dollars and unconverted.",
    scoreClipped: (clip) => `Score capped by the ±${clip} standard-deviation clip.`,
    componentsHelp: (used, total) =>
      `Averaged over ${used} of the ${total} signals; the rest have no data for this card.`,
  },

  legend: {
    title: "How to read the breakdown",
    body: (signals) => [
      `Every bar is a z-score with its sign already oriented: to the right and green pushes the score up, to the left and red holds it down. The centre of the box is zero. A dot instead of a bar means that signal does not exist for that card — not that it equals zero — which is why under each score you can see how many of the ${signals} signals went into the average. `,
    ],
    thin: ({ two, rows }) => [
      "That ratio deserves a look before the score itself: today ",
      { t: two, b: true, n: true },
      " of the ",
      { t: rows, n: true },
      " visible rows rest on just two signals, and the same number backed by two signals rests on less evidence than the same number backed by four. ",
    ],
    clip: ({ clip, clipped }) => [
      `Both the components and the score arrive clipped at ±${clip}: a ${clipped} is capped, not exact.`,
    ],
    extra: {
      artist_premium: " Measured reliability of 80.6% in the variance decomposition.",
      jp_en_ratio:
        " The measured lead of the Japanese market is a median of 56 days (p25 49, p75 83).",
    },
    noHelp: "Signal with no description.",
  },

  bars: {
    headerTitle: ({ label, help }) => `${label}. ${help}`,
    noData: (label) => `${label}: no data for this card, it does not enter the average.`,
    value: ({ label, z, clipped, help }) =>
      `${label}: ${z} z${clipped ? " (clipped)" : ""}. ${help}`,
  },

  footer:
    "Prices from Cardmarket (trend, EUR) and TCGplayer (market, USD); catalogue from TCGdex. The whole site leaves out TCG Pocket's digital cards and any instrument whose Cardmarket product is shared by several cards, because its price cannot be attributed. Neither this page nor any other page of Cartoteca is investment advice.",
};

const ja: RankingDict = {
  title: "投資ランキング",
  intro: (asOf) =>
    `同種のカードが描く価格の型から、今日いちばん外れている銘柄。ずれの大きい順に並べています。シグナルの算出日は${asOf}。各行は1枚のカードではなく1銘柄（カード×バリエーション×言語）です。同じイラストがノーマル・ホロ・リバースで何度も並ぶことがありますが、それぞれ別の市場です。`,

  stat: {
    cards: "カード",
    cardsCtx: "実物カードのみ、TCG Pocket は除外",
    instruments: "銘柄",
    instrumentsCtx: "カード×バリエーション×言語",
    priced: "価格あり",
    pricedCtx: (share) => `全銘柄の${share}`,
    investable: "投資対象",
    investableCtx: (share) => `往復コスト25%以下 · 価格のある銘柄のうち${share}のみ`,
    days: "アーカイブ日数",
    daysCtx: (firstDay) => `${firstDay}から · 過去の時系列データなし`,
    sets: "エディション",
    setsCtx: "英語版と日本語版",
    pairs: "日英ペア",
    pairsCtx: "同じカードの2言語版",
    arbs: "裁定機会",
    arbsCtx: "欧州と米国の両方に価格あり",
  },

  reality: ({ priced, investable, scored, unscored }) =>
    `居心地の悪い数字は4つめです。価格のある${priced}銘柄のうち、往復コスト25%以下で買って売り直せるのは${investable}銘柄しかありません。送料と手数料は固定費なので、安いカードでは利幅をまるごと食いつぶします（カタログ全体の価格の中央値は0.29ユーロ前後です）。このランキングに1ユーロのカードが載らないのはそのためで、選び方の偏りではなく市場の実態です。そして投資対象となる${investable}銘柄のうち、ここで採点しているのは${scored}銘柄です` +
    (unscored
      ? `。残る${unscored}銘柄はシグナルが1本以下で、1本だけでは突き合わせる相手がありません。`
      : "。"),

  method: ({ days, firstDay }) => [
    "スコアは、",
    { t: "今日この時点で観測できる", b: true },
    `価格のずれを表すシグナルを最大4本、標準化して合成した値です（セットとレアリティで区切った同群内での位置、イラストレーターの過去のプレミアム、日本語版の言い値、Cardmarket と TCGplayer の価格差）。平均はカードごとに存在するシグナルだけを等ウェイトで取ります。`,
    { t: "検証済みの予測ではありません。", b: true },
    `自前のアーカイブは${days}日分、${firstDay}に取り始めたばかりで、スコアを突き合わせられる結果はまだ1つもありません。測っているのは価格が自分の型からどれだけ外れているかであって、これからいくら上がるかではありません。`,
  ],

  filters: {
    lang: "言語",
    langAll: "両方",
    langOnly: (name) => `${name}版のみ`,
    minPrice: "最低価格",
    minNone: "下限なし",
    minChip: (amount) => `€${amount} 以上`,
    minHelp: (price) => `${price}以上で取引されている銘柄のみ`,
    rarity: "レアリティ",
    rarityAll: "すべて",
    rarityHelp: (n, rarity) => `現在のランキングでレアリティ ${rarity} の銘柄は${n}件`,
    rarityNoneHelp: (n) => `現在のランキングでレアリティのない銘柄は${n}件`,
    clearAll: "絞り込みをすべて解除",
  },

  rarityNone: "レアリティなし",

  plain: {
    title: "各行の一文が語っていること",
    help:
      "各銘柄の下には、そのカードでいちばん効いているシグナル2本を、z スコアではなく実際の数字で言い直した一文を添えています。述べているのは今日この時点で観測できる価格のずれ、つまり比較できる相手（同群のカード、日本語版、もう一方の大陸、イラストレーターの実績）に対して価格がどこにあるかです。実際の数字がそのシグナルの寄与と逆を向いている場合（群が小さいときに起こります）、そのシグナルは寄与と反対のことを述べる代わりに黙ります。数字について2点。同群の割合は、文中で挙げているその枚数を母数として、そのうち何枚が上か下かを数えた値です。イラストレーターのプレミアムは、標本サイズに応じて中立水準へ収縮させた推定値であって、そのイラストレーターのカードの単純平均ではありません。枚数が少ないと、単純平均は作家の傾向よりも偶然を映してしまうからです。そしてどの一文も「これから上がる」とは言いません。自前のアーカイブはまだ数日分しかなく、突き合わせられる結果が1つもないからです。",
    one: (a) => `${a}。`,
    join: (a, b) => `${a}。${b}。`,
    against: (a) => `一方で、${a}。`,

    cohort: ({ share, n, set, rarity, cheap }) => {
      const group = set
        ? rarity
          ? `${set}のレアリティ ${rarity} ${n}枚`
          : `${set}の同レアリティ${n}枚`
        : rarity
          ? `同じエディションのレアリティ ${rarity} ${n}枚`
          : `同じ群の${n}枚`;
      return cheap
        ? `${group}のうち${share}より安く取引されています`
        : `${group}のうち${share}より高く取引されています`;
    },
    cohortEdge: ({ n, set, rarity, cheap }) => {
      const group = set
        ? rarity
          ? `${set}のレアリティ ${rarity} ${n}枚`
          : `${set}の同レアリティ${n}枚`
        : rarity
          ? `同じエディションのレアリティ ${rarity} ${n}枚`
          : `同じ群の${n}枚`;
      return cheap ? `${group}の中で最も安い1枚です` : `${group}の中で最も高い1枚です`;
    },
    artist: ({ artist, points, n, above }) =>
      above
        ? `${artist} のカードは同群の中立水準より上に位置する傾向があり、推定プレミアムは${points}パーセンタイル・ポイントです（標本${n}枚）`
        : `${artist} のカードは同群の中立水準より下に位置する傾向があり、推定ディスカウントは${points}パーセンタイル・ポイントです（標本${n}枚）`,
    jp: ({ pct, ja, en, higher }) =>
      higher
        ? `日本語版は${pct}高く取引されています（日本語版${ja}に対し英語版${en}）`
        : `日本語版は${pct}安く取引されています（日本語版${ja}に対し英語版${en}）`,
    arb: ({ gross, net, buyEu }) =>
      buyEu
        ? `欧州で買って米国で売る形になり、手数料控除前の価格差は${gross}、為替・送料・手数料を差し引いても${net}が残ります`
        : `米国で買って欧州で売る形になり、手数料控除前の価格差は${gross}、為替・送料・手数料を差し引いても${net}が残ります`,
  },

  cases: {
    label: "根拠の種類",
    all: "すべて",
    allHelp: "4種類の根拠すべて。支配的なシグナルがない銘柄も含みます",
    note: "各グループは根拠の「種類」の違いであって、信頼度の違いではありません。変わるのは案件を支えているデータであって、スコアの質ではありません。各行は、そのスコアでいちばん重く効いているシグナルのグループに入ります。",
    name: {
      arbitraje: "市場間の裁定",
      cohorte: "同群内で割安",
      japon: "日本市場が先行",
      ilustrador: "イラストレーターのプレミアム",
    },
    short: {
      arbitraje: "裁定",
      cohorte: "同群",
      japon: "日本先行",
      ilustrador: "作家",
    },
    help: {
      arbitraje:
        "同じカードの欧州価格と米国価格が、為替と往復コストを差し引いてもなお開いている状態です。4種類のうち最も行動に移しやすく、最も決定論に近い根拠で、Cardmarket と TCGplayer を今日並べて開けば確認できます。",
      cohorte:
        "同じエディション・同じレアリティのカードより価格が下にある状態です。比較による根拠であって、執行による根拠ではありません。その群がこのカードの正しい基準である保証はありません。",
      japon:
        "同じカードの日本語版のほうが高く取引されています。実測では日本市場が中央値で56日先行していますが、実測された先行は規則性であって約束ではありません。",
      ilustrador:
        "このイラストレーターのカードは、平均すると同群の中立水準より上に位置します。4本のうち最も遅く、最も間接的なシグナルです。語っているのは作家についてであって、このカードについてではありません。",
    },
    tag: (name) => `支配的な根拠：${name}。この種類だけを表示します。`,
    none: "現在の絞り込み条件では、この種類の根拠を持つ採点済み銘柄はありません。",
  },

  drift: {
    col: "30日乖離",
    colHelp:
      "今日の Cardmarket のトレンド価格（価格列と同じ数値）が、Cardmarket 自身の公開する30日移動平均に対してどこにあるか。情報源が出す2つの集計値どうしの比較であって、当サイトが測定したリターンではありません。スコアには入りません。",
    cell: ({ pct, price, avg, above, short }) =>
      `今日のトレンド価格（${price}）は、Cardmarket が公開する30日平均（${avg}）を${pct}${above ? "上回って" : "下回って"}います。` +
      (short ? `7日平均に対しては ${short} です。` : "") +
      "いずれも同じ情報源の集計値であって、当サイトが測定したリターンではありません。スコアには入りません。",
    none: "この銘柄について Cardmarket は30日平均を公開していません。",
    note: [
      "乖離の列は",
      { t: "情報であって、シグナルではありません", b: true },
      "。Cardmarket の平均値は時系列の点ではありません。avg30 は直近30日、avg7 は直近7日の平均で、いずれも今日から遡って計算され、期間は重なっています。これを線で結べば、持っていない履歴を捏造することになりますし、これらの上で日次リターンを計算すればフィルタの構成そのものによって極めて高い自己相関が生まれます。真実として言えるのは、今日のトレンド価格がそれらの平均に対してどこにあるかだけで、この列が示しているのはそれです。だから並べ替えはできますが、",
      { t: "スコアには入れていません", b: true },
      "。移動平均の上にシグナルを組み立てることは、本プロジェクトが踏むまいとしている罠そのものだからです。",
    ],
    sortDesc: "30日乖離の大きい順に並べ替え",
    sortAsc: "30日乖離の小さい順に並べ替え",
    sortOff: "スコア順に戻す",
    byScore: "投資スコアの高い順に並んでいます",
    orderedBy: (desc) =>
      `30日乖離の${desc ? "大きい" : "小さい"}順に並べています。ランキングの基準はあくまでスコアで、乖離は採点済みの銘柄を並べ替えているだけです。`,
  },

  table: {
    caption: ({ shown, total, filtered }) => [
      "採点済み",
      { t: total, n: true },
      "銘柄のうち",
      { t: shown, b: true, n: true },
      `銘柄を表示${filtered ? "（現在の絞り込み条件）" : ""}。順位はこの選択範囲内での位置です。`,
    ],
    cheapest: ({ price, roundtrip }) => [
      "ランキング内で最も安い銘柄は ",
      { t: price, n: true },
      ...(roundtrip
        ? [" · 往復コストの中央値は ", { t: roundtrip, n: true } as Frag]
        : []),
    ],
    noPrices: "この選択範囲に価格データがありません",
    empty: "この条件に合う採点済みの銘柄はありません。",
    clear: "絞り込みを解除",
    col: {
      card: "カード",
      illustrator: "イラストレーター",
      lang: "言語",
      price: "価格",
      priceHelp:
        "Cardmarket のトレンド価格（ユーロ）。下段は TCGplayer のマーケット価格（ドル、換算なし）。",
      roundtrip: "往復コスト",
      score: "スコア",
      breakdown: (clip) => `内訳（z、−${clip}〜+${clip}）`,
    },
  },

  row: {
    imageAlt: ({ name, set, variant }) => `${name}（${set} ${variant}）`,
    imageFallback: (lang) =>
      `表示しているイラストは${lang}版のものです。TCGdex はこのカードの画像を公開していません。絵柄は同じですが、枠と文字は異なります。`,
    unnamed: "名称不明",
    unknownSet: "エディション不明",
    cardLink: "この銘柄の詳細ページ：価格・シグナル・同じカードの他バリエーション",
    variantOwn:
      "この銘柄のバリエーション。この仕様は Cardmarket で独立した商品として取引されています。",
    variantShared:
      "Cardmarket はこのカードの複数の仕様に単一の価格しか公開していないため、欧州価格は仕様を区別していません。",
    finishesChip: (extra) => `+${extra} 仕様`,
    finishesHelp: (total) =>
      `Cardmarket はこのカードの${total}種類の仕様を1つの商品・1つの価格にまとめています。ここでも1行として表示します。機会は1つであって、${total}つあるわけではありません。`,
    illustratorLink: (name) => `${name} が手がけたカードをすべて見る`,
    noIllustrator: "クレジットなし",
    langTag: (name) => `${name}版`,
    noTcg: "TCGplayer に価格なし",
    tcgHelp: "TCGplayer のマーケット価格。ドル建て、換算なし。",
    scoreClipped: (clip) => `標準偏差±${clip}で打ち切られた上限値です。`,
    componentsHelp: (used, total) =>
      `${total}本のシグナルのうち${used}本を平均しています。残りはこのカードにデータがありません。`,
  },

  legend: {
    title: "内訳の読み方",
    body: (signals) => [
      `各バーは符号をそろえた z スコアです。右向きの緑はスコアを押し上げ、左向きの赤は押し下げます。枠の中央がゼロです。バーではなく点になっているのは、そのカードにそのシグナルが存在しないという意味であって、値がゼロなのではありません。だからこそ各スコアの下に、${signals}本のうち何本を平均したかを添えています。`,
    ],
    thin: ({ two, rows }) => [
      "スコアそのものより先に、この比を見るほうが賢明です。今日は表示中の",
      { t: rows, n: true },
      "行のうち",
      { t: two, b: true, n: true },
      "行がシグナル2本だけに支えられています。同じ数字でも、2本に支えられた値は4本に支えられた値より根拠が薄いということです。",
    ],
    clip: ({ clip, clipped }) => [
      `内訳も総合スコアも±${clip}で打ち切られた値で届きます。${clipped}と出ていれば、それは上限に張り付いた値で、正確な値ではありません。`,
    ],
    extra: {
      artist_premium: "（分散分解で測定した信頼性は80.6%）",
      jp_en_ratio: "（日本市場の先行幅は実測で中央値56日、p25は49日、p75は83日）",
    },
    noHelp: "説明のないシグナル。",
  },

  bars: {
    headerTitle: ({ label, help }) => `${label}。${help}`,
    noData: (label) => `${label}：このカードにはデータがなく、平均に入りません。`,
    value: ({ label, z, clipped, help }) =>
      `${label}：${z} z${clipped ? "（上限で打ち切り）" : ""}。${help}`,
  },

  footer:
    "価格は Cardmarket（トレンド、EUR）と TCGplayer（マーケット、USD）、カタログは TCGdex。TCG Pocket のデジタルカードと、Cardmarket の商品が複数のカードで共有されている銘柄は、価格を割り当てられないためサイト全体から除外しています。本ページを含め、Cartoteca のいかなるページも投資助言ではありません。",
};

export const ranking: Dict<RankingDict> = { es, en, ja };
