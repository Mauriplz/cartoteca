import type { Dict } from "./index";

/**
 * Pagina de metodologia.
 *
 * Criterio editorial de esta pagina, que conviene tener presente antes de anadir
 * nada: la transparencia sobre la FIABILIDAD se publica entera, porque es lo que
 * hace creible el producto y lo que ningun marketplace puede permitirse decir. Las
 * CONSTANTES OPERATIVAS —umbrales exactos, minimos de muestra, ventanas admitidas,
 * ratios de calidad de dato, formulas reproducibles— no se publican: son meses de
 * limpieza de datos y regalarlas es entregar el producto como lista de comprobacion.
 * De ahi la seccion "parametros", que explica esa asimetria en voz alta en vez de
 * dejar el hueco sin justificar.
 *
 * El espanol es la referencia de tipos; ingles y japones se tipan contra el.
 * Todo texto con dato dentro es una funcion, nunca una plantilla con marcadores.
 */

/** Fragmento con enfasis opcional; deja que cada idioma decida donde cae la negrita. */
export type Chunk = string | { b: string } | { em: string };
/** Un parrafo: cadena suelta cuando no lleva marcas, lista de fragmentos cuando si. */
export type Text = string | readonly Chunk[];

interface Item {
  title: string;
  body: Text;
}

export interface MethodologyDict {
  meta: { title: string; description: string };
  h1: string;
  sub: (asOf: string) => string;
  navLabel: string;

  stats: {
    cards: string;
    instruments: string;
    priced: string;
    days: string;
    jpEn: string;
    arbs: string;
  };

  sections: {
    sources: string;
    instrument: string;
    marks: string;
    signals: string;
    composite: string;
    limits: string;
    notDoing: string;
    parameters: string;
    audit: string;
  };

  sources: {
    intro: Text;
    th: { source: string; provides: string; currency: string; note: string };
    tcgdex: { name: string; tag: string; provides: string; note: (cards: string, sets: string) => string };
    cardmarket: { name: string; tag: string; provides: string; note: string };
    tcgplayer: { name: string; tag: string; provides: string; note: string };
    ecb: { name: string; provides: string; note: string; rate: (rate: string, date: string) => string };
    outro: string;
  };

  instrument: {
    lead: Text;
    formula: string;
    scale: (cards: string, instruments: string) => string;
    ui: Text;
    reserved: string;
  };

  marks: {
    lead: string;
    trend: Item;
    settle: Item;
    low: Item;
    lastDay: Item;
    stamp: Item;
  };

  signals: {
    lead: Text;
    cost: Text;
    th: { signal: string; measures: string; bounds: string };
    roundtrip: { measures: string; bounds: string };
    cohort: { measures: string; bounds: string };
    artist: { measures: string; bounds: string; link: string };
    jpEn: { measures: string; bounds: string };
    arb: { measures: (arbs: string) => string; bounds: string };
    score: { measures: string; bounds: string };
    pairing: Text;
  };

  composite: {
    th: { component: string; sign: string; why: string };
    why: { cohort: string; artist: string; jpEn: string; arb: string };
    universe: Text;
    weights: Text;
    note: Text;
  };

  limits: {
    archive: { title: string; body: (days: string, date: string) => string };
    stale: Item;
    universe: Item;
    ambiguous: Item;
    digital: Item;
    jpUsd: Item;
    rarity: Item;
    graded: Item;
  };

  notDoing: {
    momentum: Item;
    ml: Item;
    charts: Item;
    targets: Item;
    graded: Item;
    minBook: Item;
  };

  parameters: { p1: Text; p2: Text };

  audit: {
    lead: string;
    th: { fact: string; value: string };
    asOf: string;
    firstDay: string;
    days: string;
    fx: string;
    noFx: string;
    note: Text;
  };

  /** "2 dias" / "2 days" / "2日": recuento ya formateado mas su unidad. */
  days: (n: number, text: string) => string;

  /**
   * El tipo EUR/USD se publica con cuatro decimales: es un dato de trazabilidad y
   * makeFormatters redondea a tres. El separador decimal si depende del idioma.
   */
  fmt: { rate: (v: number) => string };
}

function rateFor(tag: string): MethodologyDict["fmt"] {
  const f = new Intl.NumberFormat(tag, { maximumFractionDigits: 4 });
  return { rate: (v) => f.format(v) };
}

const es: MethodologyDict = {
  meta: {
    title: "Metodología — Cartoteca",
    description:
      "Fuentes, unidad de análisis, qué mide cada señal y qué limitaciones tiene el sistema. Las limitaciones, enteras y sin suavizar.",
  },
  h1: "Metodología",
  sub: (asOf) =>
    `De qué están hechos estos números: qué fuente, qué unidad, qué mide cada señal y qué no se puede concluir de ellos. Señales calculadas el ${asOf}.`,
  navLabel: "Índice",

  stats: {
    cards: "Cartas del catálogo",
    instruments: "Instrumentos limpios",
    priced: "Con precio",
    days: "Días de archivo",
    jpEn: "Pares JP/EN",
    arbs: "Arbitrajes vivos",
  },

  sections: {
    sources: "Fuentes y atribución",
    instrument: "La unidad es el instrumento",
    marks: "Qué precio usamos",
    signals: "Las señales, una a una",
    composite: "La puntuación compuesta",
    limits: "Limitaciones",
    notDoing: "Lo que no hacemos",
    parameters: "Por qué no publicamos los parámetros",
    audit: "Trazabilidad y compromiso",
  },

  sources: {
    intro: [
      "Todo el catálogo y todos los precios proceden de ",
      { b: "TCGdex" },
      ", una base de datos abierta de cartas Pokémon publicada bajo licencia MIT. TCGdex aporta cartas, sets, fechas de lanzamiento, ilustradores, rarezas e imágenes, y redistribuye el bloque de precios de dos mercados. Cartoteca no publica los ficheros de precio en bruto: solo derivados y agregados.",
    ],
    th: { source: "Fuente", provides: "Qué aporta", currency: "Moneda", note: "Nota" },
    tcgdex: {
      name: "TCGdex",
      tag: "licencia MIT",
      provides: "Catálogo, variantes, imágenes y el bloque de precios",
      note: (cards, sets) => `${cards} cartas · ${sets} sets`,
    },
    cardmarket: {
      name: "Cardmarket",
      tag: "vía TCGdex",
      provides: "Mercado europeo. Es la referencia de precio de toda la aplicación",
      note: "Cubre la mayor parte del catálogo, tanto en inglés como en japonés",
    },
    tcgplayer: {
      name: "TCGplayer",
      tag: "vía TCGdex",
      provides: "Mercado estadounidense. Se usa solo como contraparte del diferencial entre mercados",
      note: "Ninguna carta japonesa trae precio estadounidense",
    },
    ecb: {
      name: "Banco Central Europeo",
      provides: "Referencia diaria EUR/USD, aplicada antes de calcular ningún diferencial",
      note: "Diaria",
      rate: (rate, date) => `último tipo usado ${rate} del ${date}`,
    },
    outro:
      "El japonés no cotiza en el mercado estadounidense, así que todo el análisis japonés se hace en euros contra el mercado europeo. Y si el tipo de cambio del BCE no está disponible el día del cálculo, la señal de arbitraje no se publica ese día: no se sustituye por un tipo inventado ni por el de la víspera.",
  },

  instrument: {
    lead: [
      "Una misma ilustración se vende en acabados distintos, y sus precios no se parecen entre sí. La unidad de todo el sistema no es la carta, es el ",
      { b: "instrumento" },
      ":",
    ],
    formula: "instrumento = (carta, idioma, variante)",
    scale: (cards, instruments) =>
      `Las ${cards} cartas no digitales del catálogo generan ${instruments} instrumentos limpios. Modelar la carta y no el instrumento obligaría a promediar precios que no son del mismo producto, y ese promedio no es el precio de nada que se pueda comprar.`,
    ui: [
      { b: "Consecuencia visible en la interfaz:" },
      " una misma carta puede aparecer varias veces en un ranking con variantes distintas. No es un fallo de duplicados. Por eso cada fila muestra siempre su variante.",
    ],
    reserved:
      "El modelo de identidad reserva además ejes para sello, patrón, grado y gradeadora. Hoy están vacíos porque no hay fuente que los pueble: se declaran ahora porque añadirlos con seis meses de series colgando sería carísimo.",
  },

  marks: {
    lead: "El mercado europeo no publica un precio diario: publica medias sobre las transacciones ocurridas en una ventana, y el número de transacciones de esa ventana no se publica. Eso obliga a elegir con cuidado qué campo se trata como precio, y a descartar otros que buena parte del sector muestra como si lo fueran.",
    trend: {
      title: "La marca de valoración es una estimación de tendencia del propio mercado",
      body: "Es lo que se muestra en la ficha y lo que entra en las señales. Reacciona antes que las medias largas y arrastra menos días muertos.",
    },
    settle: {
      title: "La marca de liquidación será una media larga con definición declarada",
      body: "Es la que medirá el track record cuando exista, precisamente porque un tercero puede reproducirla contra la fuente y comprobar el resultado.",
    },
    low: {
      title: "El precio mínimo del listado no es un precio",
      body: "En su mayor parte corresponde a copias jugadas o dañadas. Tomarlo por precio infla mecánicamente cualquier margen calculado sobre él, porque compara el estado de una copia deteriorada con el valor de una sana. Es el error más extendido del sector y aquí está prohibido.",
    },
    lastDay: {
      title: "El campo del último día se arrastra",
      body: "Viene informado casi siempre, también cuando no hubo ninguna venta. Un valor ahí no significa que ayer se vendiera nada, así que no se usa como observación diaria.",
    },
    stamp: {
      title: "La marca temporal de la fuente es un sello de lote",
      body: "No es una fecha por carta, sino el momento en que la fuente sincronizó el fichero entero. La única fecha que vale es la del archivo propio.",
    },
  },

  signals: {
    lead: [
      "Son las señales que funcionan ",
      { b: "sin histórico" },
      ", que es la única clase honesta con un archivo tan joven. Ninguna predice: todas miden un desajuste que ya existe hoy y que se puede comprobar en el momento.",
    ],
    cost: [
      "La primera no es una oportunidad, es un filtro. El envío es un coste ",
      { b: "fijo" },
      ", así que el porcentaje que cuesta comprar una carta y volver a venderla se dispara según baja el precio: en una carta de céntimos, los portes valen múltiplos de la carta. Ese solo hecho deja fuera a la mayor parte del catálogo antes de mirar ninguna otra cosa.",
    ],
    th: { signal: "Señal", measures: "Qué mide", bounds: "Qué la acota" },
    roundtrip: {
      measures: "Fracción del precio que se pierde al comprar y volver a vender, con comisión y portes incluidos",
      bounds:
        "Se calcula para todo instrumento con precio positivo. Por debajo de cierto precio no hay operación posible: el coste se come el margen antes de empezar",
    },
    cohort: {
      measures:
        "Dónde cae el precio dentro de su propio grupo de idioma, set y rareza. Bajo significa barata respecto a sus pares directos",
      bounds: "Se descartan las cohortes demasiado pequeñas para que un percentil signifique algo",
    },
    artist: {
      measures:
        "Posición media que alcanzan las cartas del ilustrador dentro de sus cohortes, corregida por el tamaño de la muestra para que una obra corta no se confunda con una prima alta",
      bounds: "Solo entran ilustradores con obra medida suficiente.",
      link: "Ranking completo →",
    },
    jpEn: {
      measures:
        "Cuánto cotiza la gemela japonesa respecto a la inglesa. El mercado japonés se adelanta al inglés una mediana de unos 56 días",
      bounds:
        "Solo se emparejan cartas con correspondencia uno a uno en ambos sentidos, y con una diferencia de lanzamiento verosímil",
    },
    arb: {
      measures: (arbs) =>
        `Diferencial entre el mercado europeo y el estadounidense que sobrevive al tipo de cambio y a los costes. Vivos hoy: ${arbs}`,
      bounds:
        "Solo se publica si queda algo después de descontar el cambio y el coste de ida y vuelta. Un diferencial bruto llamativo en una carta barata no es una oportunidad: son los portes",
    },
    score: {
      measures: "Compuesto de las cuatro anteriores. Mide desajuste, no previsión",
      bounds: "Ver la sección siguiente",
    },
    pairing: [
      "Sobre el emparejamiento japonés: deliberadamente ",
      { b: "no" },
      " se exige que coincida la rareza. Los vocabularios de rareza inglés y japonés solo solapan a medias, así que exigirla descartaría pares perfectamente válidos por una diferencia de nomenclatura y no de producto. Lo que sí se exige es la correspondencia uno a uno: con varias candidatas a cada lado, adivinar no produce una señal débil, produce una señal falsa.",
    ],
  },

  composite: {
    th: { component: "Componente", sign: "Signo", why: "Por qué ese signo" },
    why: {
      cohort: "Barata respecto a sus pares de set y rareza es la parte que puede corregir al alza",
      artist: "Demanda estructural sostenida por la firma, no por la rareza",
      jpEn: "Su gemela japonesa cotiza más alto, y el japonés se adelanta",
      arb: "Diferencial entre mercados que sobrevive al tipo de cambio y a los costes",
    },
    universe: [
      "Las componentes se normalizan ",
      { b: "solo dentro del universo invertible" },
      ": normalizar contra el resto del catálogo, que cotiza en su mayoría en céntimos, distorsionaría toda la escala. La puntuación es una ",
      { b: "media" },
      " de las componentes presentes, no una suma, para que una carta con cuatro señales no gane automáticamente a una con dos; y no se puntúa a nadie con una sola componente.",
    ],
    weights: [
      "Los pesos son ",
      { b: "iguales y los signos están congelados" },
      ". No es pereza: con un archivo de días no hay observaciones independientes con las que estimar pesos, y cualquier peso «óptimo» ajustado hoy estaría ajustado al ruido. Se revisarán cuando haya histórico suficiente para medirlo, no antes.",
    ],
    note: [
      { b: "Qué significa una puntuación alta:" },
      " este instrumento presenta un desajuste observable hoy respecto a sus pares, a su gemela japonesa o al otro mercado. ",
      { b: "Qué no significa:" },
      " que vaya a subir. No existe todavía ninguna comprobación contra retornos futuros, porque no hay retornos futuros que comprobar. Cualquier frase del tipo «esta carta subirá un X %» sería deshonesta, y no la vas a encontrar aquí.",
    ],
  },

  limits: {
    archive: {
      title: "El archivo propio acaba de empezar",
      body: (days, date) =>
        `Acumula ${days} desde el ${date}. No hay histórico, no hay retornos y no hay track record: nada de lo que se publica aquí ha sido comprobado contra lo que hicieron después los precios.`,
    },
    stale: {
      title: "El precio que ves puede llevar tiempo sin una transacción detrás",
      body: "La fuente sigue publicando su media aunque la carta lleve mucho sin venderse, y no dice cuántas transacciones hay debajo. Para buena parte del catálogo eso significa que la marca es vieja, y su antigüedad real es inobservable: no hay forma de saber de cuándo es el último precio de verdad.",
    },
    universe: {
      title: "La mayor parte del catálogo no es invertible",
      body: "La mediana del catálogo cotiza por debajo de lo que cuesta un solo envío. Para esas cartas el precio no es el problema: el coste fijo lo es. No son vehículo de inversión a ningún horizonte. Se sigue mostrando su precio, pero no se puntúan.",
    },
    ambiguous: {
      title: "Excluimos las cartas cuyo precio no se puede atribuir",
      body: "Cuando la fuente europea devuelve el mismo precio para acabados distintos de la misma carta, ese precio no es el de ningún producto concreto. Esas cartas quedan fuera de todas las consultas, aunque vengan con precio publicado.",
    },
    digital: {
      title: "Excluimos las cartas digitales",
      body: "No tienen mercado físico ni coste de envío, así que ni el coste de ida y vuelta ni el arbitraje significan nada para ellas.",
    },
    jpUsd: {
      title: "El mercado japonés no cotiza en dólares",
      body: "El arbitraje Europa / EE. UU. no existe para cartas japonesas: todo su análisis es en euros.",
    },
    rarity: {
      title: "Las rarezas japonesas e inglesas no son el mismo vocabulario",
      body: "Las cohortes japonesas se construyen sobre el vocabulario tal cual viene, y el emparejamiento entre idiomas no exige que la rareza coincida.",
    },
    graded: {
      title: "Todavía no cubrimos cartas gradeadas",
      body: "PSA, BGS y CGC son instrumentos distintos, con su propia curva de precio, y ese precio vive fuera de nuestras fuentes.",
    },
  },

  notDoing: {
    momentum: {
      title: "No hay ninguna señal de momentum",
      body: "Es la omisión más importante del sistema y la más fácil de confundir con un olvido. Con las medias móviles que publica la fuente se puede construir hoy mismo un factor de momentum espectacular, y sería falso por construcción: una media móvil no es una observación, arrastra su propio pasado, y los retornos que se derivan de ella heredan una memoria que el mercado no tiene. Un backtest sobre eso encuentra oro en un mercado impredecible. Por eso no existe.",
    },
    ml: {
      title: "No predecimos precios con aprendizaje automático",
      body: "Con un archivo de días, cualquier modelo estaría ajustado al ruido. Y el problema no se arregla esperando un poco: a horizontes de semanas, un año entero deja un puñado de cortes temporales independientes, así que elegir unos cuantos factores entre docenas de candidatos consumiría más grados de libertad de los que hay observaciones. El sistema del primer año es equiponderado y con signos congelados a propósito.",
    },
    charts: {
      title: "No mostramos gráficos de tendencia ni variaciones a 30 días",
      body: "No hay serie que graficar. Donde se muestra histórico, se dice cuántos días hay.",
    },
    targets: {
      title: "No publicamos precio objetivo ni probabilidad de subida",
      body: [
        "Serían números sin nada detrás. El lenguaje correcto, y el que se usa en toda la aplicación, es que una carta ",
        { em: "presenta desajuste" },
        ", ",
        { em: "cotiza barata respecto a su cohorte" },
        " o ",
        { em: "su gemela japonesa cotiza más alto" },
        ".",
      ],
    },
    graded: {
      title: "No cubrimos cartas gradeadas todavía",
      body: "PSA, BGS y CGC son instrumentos distintos con curvas de precio propias, y su precio vive en un mercado de subastas, no en Cardmarket. Entrar ahí sin higiene del libro de listados (proxies, lotes, reimpresiones, grados mal declarados, concentración de vendedor) daría un suelo de precio que mueve un solo vendedor. Está especificado; no está en producción.",
    },
    minBook: {
      title: "No usamos el mínimo del libro como precio de referencia",
      body: "El mínimo de una muestra es un estadístico de orden: baja cuando crece el número de listados y sube cuando los listados se agotan, sin que el mercado se haya movido un céntimo. Buena parte de los «despegues de precio» que se publican por ahí son ese artefacto.",
    },
  },

  parameters: {
    p1: "Hasta aquí está dicho qué mide cada señal, de dónde sale cada precio y qué no se puede concluir. Lo que no vas a encontrar son las constantes: los umbrales exactos, los mínimos de muestra, las ventanas admitidas y las reglas de exclusión con su cifra. No es coquetería. La parte cara de esto no es la idea —las ideas están en cualquier manual—, sino los meses de limpieza que hacen falta para saber qué campo miente, en qué caso y cuánto. Publicar los parámetros es entregar ese trabajo hecho, como lista de comprobación.",
    p2: [
      "Las limitaciones son otra cosa, y por eso siguen enteras y sin suavizar: ",
      { b: "quien te oculta lo que su método no puede hacer te está vendiendo algo" },
      ". Para decidir si esto te sirve no necesitas poder reconstruirlo; necesitas saber qué mide, sobre qué datos y con qué agujeros. Y lo que sí conviene verificar se verifica carta a carta: la cohorte concreta, la gemela japonesa emparejada y el tipo de cambio con su fecha están en la ficha de cada carta.",
    ],
  },

  audit: {
    lead: "Nada de lo anterior pide confianza ciega. La ficha de cada carta publica el detalle de cada señal que la afecta: la cohorte concreta y su tamaño, la carta japonesa con la que se ha emparejado y el adelanto en días de su set, y el tipo de cambio usado en el arbitraje con su fecha.",
    th: { fact: "Dato de trazabilidad", value: "Valor actual" },
    asOf: "Fecha de cálculo de las señales",
    firstDay: "Primer día del archivo propio",
    days: "Días de precio almacenados",
    fx: "Tipo EUR/USD del último cálculo de arbitraje",
    noFx: "no disponible",
    note: [
      "Cuando exista track record se publicará con su n efectivo y su intervalo de confianza, e incluirá el veredicto explícito cuando el resultado sea ",
      { em: "todavía no distinguible de cero" },
      ". Publicar el punto sin el intervalo es exactamente lo que hace que estas herramientas no se puedan creer.",
    ],
  },

  days: (n, text) => `${text} ${n === 1 ? "día" : "días"}`,

  fmt: rateFor("es-ES"),
};

const en: MethodologyDict = {
  meta: {
    title: "Methodology — Cartoteca",
    description:
      "Sources, unit of analysis, what each signal measures and where the system falls short. The limitations in full, with nothing softened.",
  },
  h1: "Methodology",
  sub: (asOf) =>
    `What these numbers are made of: which source, which unit, what each signal measures, and what cannot be concluded from them. Signals computed on ${asOf}.`,
  navLabel: "Contents",

  stats: {
    cards: "Cards in the catalogue",
    instruments: "Clean instruments",
    priced: "With a price",
    days: "Days of archive",
    jpEn: "JP/EN pairs",
    arbs: "Live arbitrages",
  },

  sections: {
    sources: "Sources and attribution",
    instrument: "The unit is the instrument",
    marks: "Which price we use",
    signals: "The signals, one by one",
    composite: "The composite score",
    limits: "Limitations",
    notDoing: "What we do not do",
    parameters: "Why the method is published and the parameters are not",
    audit: "Traceability and commitment",
  },

  sources: {
    intro: [
      "The whole catalogue and every price come from ",
      { b: "TCGdex" },
      ", an open database of Pokémon cards published under the MIT licence. TCGdex provides cards, sets, release dates, illustrators, rarities and images, and redistributes the price block of two marketplaces. Cartoteca does not republish the raw price files: only derived and aggregated values.",
    ],
    th: { source: "Source", provides: "What it provides", currency: "Currency", note: "Note" },
    tcgdex: {
      name: "TCGdex",
      tag: "MIT licence",
      provides: "Catalogue, variants, images and the price block",
      note: (cards, sets) => `${cards} cards · ${sets} sets`,
    },
    cardmarket: {
      name: "Cardmarket",
      tag: "via TCGdex",
      provides: "European marketplace. It is the price reference for the whole application",
      note: "Covers most of the catalogue, in both English and Japanese",
    },
    tcgplayer: {
      name: "TCGplayer",
      tag: "via TCGdex",
      provides: "US marketplace. Used only as the counterparty of the cross-market gap",
      note: "No Japanese card arrives with a US price",
    },
    ecb: {
      name: "European Central Bank",
      provides: "Daily EUR/USD reference, applied before any gap is computed",
      note: "Daily",
      rate: (rate, date) => `last rate used ${rate}, ${date}`,
    },
    outro:
      "Japanese cards do not trade on the US marketplace, so the entire Japanese analysis is done in euros against the European one. And if the ECB rate is unavailable on the day of the calculation, the arbitrage signal is not published that day: it is not replaced by an invented rate, nor by the previous day's.",
  },

  instrument: {
    lead: [
      "The same artwork is sold in different finishes, and their prices look nothing alike. The unit of the whole system is not the card, it is the ",
      { b: "instrument" },
      ":",
    ],
    formula: "instrument = (card, language, variant)",
    scale: (cards, instruments) =>
      `The ${cards} non-digital cards in the catalogue produce ${instruments} clean instruments. Modelling the card instead of the instrument would mean averaging prices that do not belong to the same product, and that average is not the price of anything you can buy.`,
    ui: [
      { b: "Visible consequence in the interface:" },
      " the same card can appear several times in a ranking under different variants. It is not a duplicate bug. That is why every row always shows its variant.",
    ],
    reserved:
      "The identity model also reserves axes for stamp, pattern, grade and grading company. They sit empty today because no source populates them: they are declared now because adding them once six months of series hang off them would be brutally expensive.",
  },

  marks: {
    lead: "The European marketplace does not publish a daily price: it publishes averages over the transactions that happened in a window, and the number of transactions in that window is never published. That forces a careful choice of which field is treated as the price, and rules out others that much of the industry displays as if they were one.",
    trend: {
      title: "The valuation mark is the marketplace's own trend estimate",
      body: "It is what the card page shows and what feeds the signals. It reacts sooner than the long averages and drags fewer dead days behind it.",
    },
    settle: {
      title: "The settlement mark will be a long average with a declared definition",
      body: "It is what will measure the track record once one exists, precisely because a third party can reproduce it against the source and check the result.",
    },
    low: {
      title: "The lowest listing is not a price",
      body: "Most of it corresponds to played or damaged copies. Treating it as the price mechanically inflates any margin computed from it, because it compares the condition of a damaged copy with the value of a clean one. It is the most widespread error in this sector and here it is forbidden.",
    },
    lastDay: {
      title: "The last-day field is carried forward",
      body: "It arrives populated almost always, including when nothing sold. A value there does not mean there was a sale yesterday, so it is never used as a daily observation.",
    },
    stamp: {
      title: "The source's timestamp is a batch stamp",
      body: "It is not a per-card date but the moment the source synchronised the entire file. The only date that counts is the one in our own archive.",
    },
  },

  signals: {
    lead: [
      "These are the signals that work ",
      { b: "without history" },
      ", which is the only honest class with an archive this young. None of them predicts: they all measure a mispricing that already exists today and can be checked on the spot.",
    ],
    cost: [
      "The first one is not an opportunity, it is a filter. Shipping is a ",
      { b: "fixed" },
      " cost, so the percentage it takes to buy a card and sell it again explodes as the price falls: on a card worth cents, postage is worth several times the card. That fact alone rules out most of the catalogue before anything else is even looked at.",
    ],
    th: { signal: "Signal", measures: "What it measures", bounds: "What bounds it" },
    roundtrip: {
      measures: "The share of the price lost buying and selling again, fees and shipping included",
      bounds:
        "Computed for every instrument with a positive price. Below a certain price there is no trade to be had: the cost eats the margin before you start",
    },
    cohort: {
      measures:
        "Where the price falls within its own group of language, set and rarity. Low means cheap relative to its direct peers",
      bounds: "Cohorts too small for a percentile to mean anything are dropped",
    },
    artist: {
      measures:
        "The average position an illustrator's cards reach within their cohorts, shrunk for sample size so that a short body of work is not mistaken for a high premium",
      bounds: "Only illustrators with enough measured work are included.",
      link: "Full ranking →",
    },
    jpEn: {
      measures:
        "How the Japanese twin trades relative to the English one. The Japanese market leads the English one by a median of about 56 days",
      bounds:
        "Only cards with a one-to-one correspondence in both directions are paired, and only when the gap between releases is plausible",
    },
    arb: {
      measures: (arbs) =>
        `The gap between the European and US marketplaces that survives the exchange rate and the costs. Live today: ${arbs}`,
      bounds:
        "Published only if something is left once the exchange rate and the round-trip cost are taken out. A striking gross gap on a cheap card is not an opportunity: it is postage",
    },
    score: {
      measures: "Composite of the four above. It measures mispricing, not a forecast",
      bounds: "See the next section",
    },
    pairing: [
      "On the Japanese pairing: matching rarity is deliberately ",
      { b: "not" },
      " required. The English and Japanese rarity vocabularies only half overlap, so requiring it would throw away perfectly valid pairs over a difference in naming rather than in product. What is always required is the one-to-one correspondence: with several candidates on each side, guessing does not produce a weak signal, it produces a false one.",
    ],
  },

  composite: {
    th: { component: "Component", sign: "Sign", why: "Why that sign" },
    why: {
      cohort: "Cheap relative to its set-and-rarity peers is the part that can correct upward",
      artist: "Structural demand carried by the signature, not by the rarity",
      jpEn: "Its Japanese twin trades higher, and Japan leads",
      arb: "A cross-market gap that survives the exchange rate and the costs",
    },
    universe: [
      "Components are normalised ",
      { b: "only within the investable universe" },
      ": normalising against the rest of the catalogue, most of which trades in cents, would distort the entire scale. The score is a ",
      { b: "mean" },
      " of the components present, not a sum, so that a card with four signals does not automatically beat one with two; and nothing is scored off a single component.",
    ],
    weights: [
      "Weights are ",
      { b: "equal and the signs are frozen" },
      ". This is not laziness: with an archive measured in days there are no independent observations to estimate weights from, and any “optimal” weight fitted today would be fitted to noise. They will be revisited when there is enough history to measure them, not before.",
    ],
    note: [
      { b: "What a high score means:" },
      " this instrument shows a mispricing observable today against its peers, against its Japanese twin or against the other marketplace. ",
      { b: "What it does not mean:" },
      " that it is going to go up. There is no check against future returns yet, because there are no future returns to check. Any sentence of the form “this card will rise X%” would be dishonest, and you will not find one here.",
    ],
  },

  limits: {
    archive: {
      title: "Our own archive has only just started",
      body: (days, date) =>
        `It holds ${days} since ${date}. There is no history, no returns and no track record: nothing published here has been checked against what prices actually did afterwards.`,
    },
    stale: {
      title: "The price you see may have had no transaction behind it for a long time",
      body: "The source keeps publishing its average even when a card has not sold in a long while, and it never says how many transactions sit underneath. For a good part of the catalogue that means the mark is old, and how old is unobservable: there is no way to tell when the last real price was set.",
    },
    universe: {
      title: "Most of the catalogue is not investable",
      body: "The median card trades below the cost of a single shipment. For those cards the price is not the problem, the fixed cost is. They are not an investment vehicle at any horizon. Their price is still shown, but they are not scored.",
    },
    ambiguous: {
      title: "We exclude cards whose price cannot be attributed",
      body: "When the European source returns the same price for different finishes of the same card, that price belongs to no specific product. Those cards are left out of every query, even though they arrive with a published price.",
    },
    digital: {
      title: "We exclude digital cards",
      body: "They have no physical market and no shipping cost, so neither the round-trip cost nor the arbitrage means anything for them.",
    },
    jpUsd: {
      title: "The Japanese market does not trade in dollars",
      body: "The Europe / US arbitrage does not exist for Japanese cards: all of their analysis is done in euros.",
    },
    rarity: {
      title: "Japanese and English rarities are not the same vocabulary",
      body: "Japanese cohorts are built on the vocabulary exactly as it arrives, and the cross-language pairing does not require rarity to match.",
    },
    graded: {
      title: "We do not cover graded cards yet",
      body: "PSA, BGS and CGC are different instruments with their own price curves, and that price lives outside our sources.",
    },
  },

  notDoing: {
    momentum: {
      title: "There is no momentum signal at all",
      body: "It is the most important omission in the system and the easiest to mistake for an oversight. With the moving averages the source publishes you could build a spectacular momentum factor today, and it would be false by construction: a moving average is not an observation, it drags its own past along, and returns derived from it inherit a memory the market does not have. A backtest on that finds gold in an unpredictable market. That is why it does not exist.",
    },
    ml: {
      title: "We do not predict prices with machine learning",
      body: "With an archive measured in days, any model would be fitted to noise. And the problem is not solved by waiting a little: at horizons of weeks, a whole year yields only a handful of independent time slices, so picking a few factors out of dozens of candidates would burn more degrees of freedom than there are observations. The first-year system is equal-weighted with frozen signs on purpose.",
    },
    charts: {
      title: "We do not show trend charts or 30-day changes",
      body: "There is no series to plot. Wherever history is shown, the number of days is stated with it.",
    },
    targets: {
      title: "We do not publish price targets or probabilities of a rise",
      body: [
        "They would be numbers with nothing behind them. The correct language, and the one used throughout the application, is that a card ",
        { em: "shows a mispricing" },
        ", ",
        { em: "trades cheap relative to its cohort" },
        " or ",
        { em: "has a Japanese twin trading higher" },
        ".",
      ],
    },
    graded: {
      title: "We do not cover graded cards yet",
      body: "PSA, BGS and CGC are different instruments with their own price curves, and their price lives in an auction market, not on Cardmarket. Walking in there without listing-book hygiene (proxies, lots, reprints, misdeclared grades, seller concentration) would hand you a price floor that a single seller moves. It is specified; it is not in production.",
    },
    minBook: {
      title: "We do not use the lowest listing as a reference price",
      body: "The minimum of a sample is an order statistic: it falls as the number of listings grows and rises as listings dry up, with the market not having moved a cent. A good share of the “price breakouts” published elsewhere are that artefact.",
    },
  },

  parameters: {
    p1: "Up to here you have been told what each signal measures, where each price comes from and what cannot be concluded from either. What you will not find are the constants: the exact thresholds, the sample minimums, the accepted windows and the exclusion rules with their figures. This is not coyness. The expensive part of this work is not the idea — ideas are in any textbook — but the months of cleaning it takes to learn which field lies, in which case, and by how much. Publishing the parameters hands that work over finished, as a checklist.",
    p2: [
      "The limitations are a different matter, and that is why they stay whole and unsoftened: ",
      { b: "anyone who hides what their method cannot do is selling you something" },
      ". To decide whether this is useful to you, you do not need to be able to rebuild it; you need to know what it measures, on what data, and with which holes in it. And the part actually worth verifying is verifiable card by card: the exact cohort, the matched Japanese twin and the exchange rate with its date are all on each card's page.",
    ],
  },

  audit: {
    lead: "None of the above asks for blind trust. Every card's page publishes the detail of each signal affecting it: the exact cohort and its size, the Japanese card it was matched with and how many days its set led by, and the exchange rate used in the arbitrage together with its date.",
    th: { fact: "Traceability fact", value: "Current value" },
    asOf: "Date the signals were computed",
    firstDay: "First day of our own archive",
    days: "Days of price stored",
    fx: "EUR/USD used in the last arbitrage calculation",
    noFx: "not available",
    note: [
      "When a track record exists it will be published with its effective n and its confidence interval, and it will include the explicit verdict when the result is ",
      { em: "not yet distinguishable from zero" },
      ". Publishing the point estimate without the interval is exactly what makes tools like this impossible to believe.",
    ],
  },

  days: (n, text) => `${text} ${n === 1 ? "day" : "days"}`,

  fmt: rateFor("en-US"),
};

const ja: MethodologyDict = {
  meta: {
    title: "算出方法 — Cartoteca",
    description:
      "出典、分析の単位、各シグナルが測っているもの、そしてこのシステムの限界。限界は一つも省かず、和らげずに書いている。",
  },
  h1: "算出方法",
  sub: (asOf) =>
    `ここに並ぶ数字が何でできているか。どの出典を使い、何を単位とし、各シグナルが何を測り、そこから何は言えないのか。シグナルの計算日は${asOf}。`,
  navLabel: "目次",

  stats: {
    cards: "カタログ収録カード",
    instruments: "有効銘柄数",
    priced: "価格あり",
    days: "アーカイブ日数",
    jpEn: "日英ペア",
    arbs: "有効な裁定",
  },

  sections: {
    sources: "出典と権利表示",
    instrument: "単位はカードではなく銘柄",
    marks: "どの価格を使うか",
    signals: "各シグナルの内容",
    composite: "合成スコア",
    limits: "限界",
    notDoing: "あえてやっていないこと",
    parameters: "手法は公開し、パラメータは公開しない理由",
    audit: "追跡可能性と約束",
  },

  sources: {
    intro: [
      "カタログも価格も、すべて",
      { b: "TCGdex" },
      "に由来する。MIT ライセンスで公開されているポケモンカードのオープンデータベースで、カード、セット、発売日、イラストレーター、レアリティ、画像を提供し、二つの市場の価格ブロックを再配布している。Cartoteca は生の価格ファイルを公開しない。公開するのは派生値と集計値だけである。",
    ],
    th: { source: "出典", provides: "提供内容", currency: "通貨", note: "備考" },
    tcgdex: {
      name: "TCGdex",
      tag: "MIT ライセンス",
      provides: "カタログ、バリエーション、画像、価格ブロック",
      note: (cards, sets) => `カード ${cards} 件 · セット ${sets} 件`,
    },
    cardmarket: {
      name: "Cardmarket",
      tag: "TCGdex 経由",
      provides: "欧州市場。本サイト全体の価格の基準",
      note: "英語版・日本語版とも、カタログの大半をカバー",
    },
    tcgplayer: {
      name: "TCGplayer",
      tag: "TCGdex 経由",
      provides: "米国市場。市場間の価格差を見る相手方としてのみ使用",
      note: "日本語版カードには米国価格が一切付かない",
    },
    ecb: {
      name: "欧州中央銀行",
      provides: "EUR/USD の日次レート。価格差を計算する前に必ず適用する",
      note: "日次",
      rate: (rate, date) => `最新適用レート ${rate}(${date})`,
    },
    outro:
      "日本語版は米国市場で取引されないため、日本語版の分析はすべてユーロ建てで欧州市場に対して行う。また計算日に欧州中央銀行のレートが取得できない場合、その日は裁定シグナルを公開しない。架空のレートで代用することも、前日のレートを流用することもしない。",
  },

  instrument: {
    lead: [
      "同じ絵柄でも仕上げが違えば別の商品として売られ、価格も似ていない。このシステムの単位はカードではなく",
      { b: "銘柄" },
      "である:",
    ],
    formula: "銘柄 = (カード, 言語, バリエーション)",
    scale: (cards, instruments) =>
      `カタログにあるデジタル以外の ${cards} 枚のカードから、${instruments} の有効銘柄が生まれる。カード単位でモデル化すれば、同じ商品ではない価格を平均することになり、その平均はもはや「買えるもの」の価格ではない。`,
    ui: [
      { b: "画面上で見える帰結:" },
      " 同じカードがバリエーション違いでランキングに複数回現れることがある。重複のバグではない。だから各行には必ずバリエーションを表示している。",
    ],
    reserved:
      "識別モデルには、スタンプ、パターン、グレード、鑑定会社の軸も確保してある。今は埋めるデータ源がないため空のままだが、半年分の時系列を抱えてから軸を足すのは高くつくので、先に宣言している。",
  },

  marks: {
    lead: "欧州市場は日次の価格を公開していない。公開されるのは一定期間に成立した取引の平均であり、その期間に何件の取引があったかは公開されない。だから、どの項目を価格として扱うかは慎重に選ぶ必要があり、業界の多くが価格のように見せている項目のいくつかは使えない。",
    trend: {
      title: "評価に使うのは、市場自身が出しているトレンド推定値",
      body: "カード詳細に表示し、シグナルに入れているのはこの値である。長期平均より反応が早く、取引のない日を引きずる度合いも小さい。",
    },
    settle: {
      title: "将来の実績評価に使うのは、定義が公開されている長期平均",
      body: "トラックレコードができたとき、成績を測るのはこちらだ。第三者が出典に当たって同じ数字を再現し、結果を検証できるからである。",
    },
    low: {
      title: "最安出品価格は価格ではない",
      body: "その大半はプレイ済みや傷んだ個体である。これを価格とみなせば、傷んだ個体の状態と美品の価値を比べることになり、そこから計算した利幅は機械的に膨らむ。業界でもっとも広く行われている誤りであり、ここでは使用を禁じている。",
    },
    lastDay: {
      title: "「直近1日」の項目は値が持ち越される",
      body: "取引がなかった日でも、ほぼ常に値が入っている。そこに値があることは、昨日売れたことを意味しない。だから日次の観測値としては扱わない。",
    },
    stamp: {
      title: "出典の更新時刻はバッチの刻印にすぎない",
      body: "カードごとの日付ではなく、出典側がファイル全体を同期した時刻である。意味を持つ日付は自社アーカイブの日付だけだ。",
    },
  },

  signals: {
    lead: [
      { b: "履歴なしで" },
      "成立するシグナルだけを使っている。アーカイブがこれだけ若い段階で誠実でいられるのは、この種類だけだ。どれも予測はしない。すべて、今日すでに存在していて、その場で確かめられる価格のずれを測っている。",
    ],
    cost: [
      "最初のひとつはチャンスではなく、ふるいである。送料は",
      { b: "固定費" },
      "なので、買って売り直すのにかかる費用の割合は、価格が下がるほど跳ね上がる。数十円のカードでは、送料がカード価格の何倍にもなる。この一点だけで、ほかを見るまでもなくカタログの大部分が対象外になる。",
    ],
    th: { signal: "シグナル", measures: "何を測るか", bounds: "適用の範囲" },
    roundtrip: {
      measures: "買って再び売るときに失われる価格の割合。手数料と送料を含む",
      bounds:
        "正の価格を持つ全銘柄について計算する。ある価格を下回ると、そもそも取引が成立しない。始める前にコストが利幅を食い切ってしまう",
    },
    cohort: {
      measures:
        "言語・セット・レアリティが同じ群の中で、その価格がどこに位置するか。低いほど、直接の比較対象より割安",
      bounds: "パーセンタイルが意味を持たないほど小さい群は除外する",
    },
    artist: {
      measures:
        "そのイラストレーターのカードが各群内で到達する平均位置。作例が少ないだけでプレミアムが高く見えないよう、標本数で補正している",
      bounds: "十分な数の作例を測定できたイラストレーターのみを対象とする。",
      link: "ランキング全文 →",
    },
    jpEn: {
      measures:
        "日本語版が英語版に対してどの水準で取引されているか。日本市場は英語市場に中央値で約56日先行する",
      bounds:
        "双方向で一対一に対応するカードだけを突き合わせ、発売時期の差が妥当な範囲にあるものに限る",
    },
    arb: {
      measures: (arbs) => `為替と諸費用を差し引いても残る、欧州市場と米国市場の価格差。本日有効: ${arbs}`,
      bounds:
        "為替と往復コストを引いたうえで何か残る場合にのみ公開する。安いカードで見かけ上大きな価格差は好機ではない。送料である",
    },
    score: {
      measures: "上記四つの合成。予測ではなく、価格のずれを測る",
      bounds: "次節を参照",
    },
    pairing: [
      "日英の突き合わせについて。レアリティの一致は意図的に",
      { b: "要求しない" },
      "。英語と日本語のレアリティ語彙は半分ほどしか重ならないため、一致を要求すれば、商品の違いではなく呼び名の違いだけで妥当なペアを捨てることになる。一方で、一対一の対応は必ず要求する。候補が両側に複数ある状態で当て推量をすれば、弱いシグナルではなく、偽のシグナルができあがるからだ。",
    ],
  },

  composite: {
    th: { component: "構成要素", sign: "符号", why: "その符号である理由" },
    why: {
      cohort: "同じセット・レアリティの中で割安な部分こそ、上方に修正されうる余地である",
      artist: "レアリティではなく、作家性に支えられた構造的な需要",
      jpEn: "日本語版のほうが高く取引されており、日本市場が先行している",
      arb: "為替と諸費用を差し引いても残る市場間の価格差",
    },
    universe: [
      "各構成要素の標準化は",
      { b: "投資対象になる範囲の中だけで" },
      "行う。数十円で取引される残りのカタログまで含めて標準化すると、尺度全体が歪む。スコアは存在する構成要素の",
      { b: "平均" },
      "であって合計ではない。四つのシグナルを持つカードが、二つしか持たないカードに自動的に勝たないようにするためだ。構成要素がひとつしかない銘柄にはスコアを付けない。",
    ],
    weights: [
      "ウェイトは",
      { b: "等分で、符号は固定してある" },
      "。手抜きではない。数日分のアーカイブでは、ウェイトを推定できるだけの独立した観測がなく、今日「最適化」したウェイトは雑音に最適化したものにしかならない。見直すのは、それを測れるだけの履歴がたまってからである。",
    ],
    note: [
      { b: "スコアが高いことの意味:" },
      " その銘柄が、同じ群のほかのカード、日本語版の対応カード、あるいはもう一方の市場に対して、今日の時点で観測できる価格のずれを示しているということ。",
      { b: "意味しないこと:" },
      " これから値上がりするということ。将来のリターンに対する検証はまだ一切ない。検証すべき将来のリターンが、まだ存在しないからだ。「このカードは X % 上がる」といった文言は不誠実であり、ここには出てこない。",
    ],
  },

  limits: {
    archive: {
      title: "自社アーカイブは始まったばかり",
      body: (days, date) =>
        `${date}以降、${days}分しかない。履歴もリターンもトラックレコードもない。ここで公開している内容は、その後に価格が実際どう動いたかで検証されたものではない。`,
    },
    stale: {
      title: "表示されている価格の裏に、長く取引がないことがある",
      body: "出典は、そのカードが長らく売れていなくても平均値を出し続ける。しかも、その裏に何件の取引があるのかは公開しない。カタログのかなりの部分では、表示している値が古いということであり、どれだけ古いかは観測できない。最後に実際に付いた価格がいつのものかを知る手段はない。",
    },
    universe: {
      title: "カタログの大半は投資対象にならない",
      body: "カタログの中央値は、送料一回分にも満たない水準で取引されている。そうしたカードでは価格そのものではなく、固定費のほうが問題になる。どの投資期間をとっても投資対象にはならない。価格は表示し続けるが、スコアは付けない。",
    },
    ambiguous: {
      title: "価格を一つに帰属できないカードは除外する",
      body: "欧州の出典が、同じカードの異なる仕上げに同一の価格を返す場合、その価格はどの商品のものでもない。公開価格が付いていても、すべての集計から除外している。",
    },
    digital: {
      title: "デジタルカードは除外する",
      body: "現物市場も送料も存在しないため、往復コストも裁定も意味を持たない。",
    },
    jpUsd: {
      title: "日本市場はドル建てで取引されない",
      body: "日本語版カードに欧州/米国の裁定は存在せず、その分析はすべてユーロ建てで行う。",
    },
    rarity: {
      title: "日本語と英語のレアリティは同じ語彙ではない",
      body: "日本語版の群は、届いた語彙をそのまま使って構成している。言語をまたぐ突き合わせでも、レアリティの一致は要求しない。",
    },
    graded: {
      title: "鑑定品はまだ扱っていない",
      body: "PSA・BGS・CGC は独自の価格曲線を持つ別の銘柄であり、その価格は当サイトの出典の外にある。",
    },
  },

  notDoing: {
    momentum: {
      title: "モメンタムのシグナルは一切ない",
      body: "このシステムでもっとも重要な欠落であり、もっとも「うっかり忘れた」と誤解されやすい部分でもある。出典が公開している移動平均を使えば、今日にでも見栄えのするモメンタム・ファクターが作れる。そしてそれは構造的に偽物だ。移動平均は観測値ではなく、自分自身の過去を引きずる。そこから導いたリターンは、市場にはない記憶を受け継ぐ。それでバックテストをすれば、予測不能な市場から金脈が出てくる。だから作っていない。",
    },
    ml: {
      title: "機械学習で価格を予測しない",
      body: "数日分のアーカイブでは、どんなモデルも雑音に当てはめたものにしかならない。少し待てば解決する話でもない。数週間の予測期間なら、一年かけても独立した時点はほんの数個しか取れない。数十の候補からいくつかのファクターを選ぶだけで、観測数より多くの自由度を使い切ってしまう。初年度のシステムを等ウェイト・符号固定にしているのは、意図した判断である。",
    },
    charts: {
      title: "トレンドのグラフも30日変化率も出さない",
      body: "描くべき系列がまだない。履歴を表示する箇所では、必ず何日分あるかを併記している。",
    },
    targets: {
      title: "目標価格も上昇確率も出さない",
      body: [
        "中身のない数字になるからだ。アプリ全体で使っている正しい言い方は、そのカードが",
        { em: "価格のずれを示している" },
        "、",
        { em: "同じ群の中で割安に取引されている" },
        "、",
        { em: "日本語版のほうが高く取引されている" },
        "、である。",
      ],
    },
    graded: {
      title: "鑑定品はまだ扱わない",
      body: "PSA・BGS・CGC はそれぞれ固有の価格曲線を持つ別の銘柄であり、その価格は Cardmarket ではなくオークション市場にある。出品リストの衛生管理(代理出品、まとめ売り、再版、誤申告のグレード、出品者の偏り)なしにそこへ踏み込めば、たった一人の出品者が動かす価格の下限をつかまされる。仕様は書いてある。まだ本番には入っていない。",
    },
    minBook: {
      title: "出品最安値を基準価格として使わない",
      body: "標本の最小値は順序統計量である。出品数が増えれば下がり、出品が枯れれば上がる。市場が一円も動いていなくてもだ。世に出回る「価格の急騰」の少なからぬ部分は、この人工物にすぎない。",
    },
  },

  parameters: {
    p1: "ここまでで、各シグナルが何を測り、価格がどこから来て、そこから何は結論できないかは述べた。書いていないのは定数のほうだ。厳密なしきい値、標本数の下限、許容する期間の幅、除外ルールの具体的な数値は載せていない。もったいぶっているのではない。高くつくのは着想ではなく——着想なら教科書に載っている——どの項目が、どの場合に、どれだけ嘘をつくのかを突き止めるまでの、数か月分の地道なデータ整備のほうである。パラメータを公開することは、その仕事を仕上げた状態でチェックリストとして手渡すことに等しい。",
    p2: [
      "限界の開示はまったく別の話であり、だからこそ一つも削らず、和らげずに残してある。",
      { b: "自分の手法にできないことを隠す相手は、何かを売りつけようとしている" },
      "。これが自分の役に立つかを判断するのに、同じものを再現できる必要はない。何を、どのデータの上で、どんな穴を抱えたまま測っているのかが分かれば足りる。そして本当に検証したい部分は、カード単位で検証できる。該当する群、突き合わせた日本語版カード、適用した為替レートとその日付は、各カードの詳細ページに出ている。",
    ],
  },

  audit: {
    lead: "以上のどれも、無条件の信用を求めるものではない。各カードの詳細ページには、そのカードに効いているシグナルの内訳を公開している。該当する群とその規模、突き合わせた日本語版カードとそのセットの先行日数、裁定に使った為替レートとその日付である。",
    th: { fact: "追跡用データ", value: "現在値" },
    asOf: "シグナルの計算日",
    firstDay: "自社アーカイブの初日",
    days: "保存している価格の日数",
    fx: "直近の裁定計算に使った EUR/USD",
    noFx: "取得できず",
    note: [
      "トラックレコードができた際には、有効な n と信頼区間を添えて公開する。結果が",
      { em: "まだゼロと区別できない" },
      "場合には、その判定を明示する。区間を伏せて点推定だけを出すことこそ、この種のツールが信用されなくなる原因である。",
    ],
  },

  days: (n, text) => `${text}日`,

  fmt: rateFor("ja-JP"),
};

export const methodology: Dict<MethodologyDict> = { es, en, ja };
