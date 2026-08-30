import type { Dict } from "./index";

/**
 * Texto del explorador de cartas y de la ficha de carta.
 *
 * Convenciones de este diccionario:
 *
 * - Todo lo que lleva datos interpolados es una FUNCION, no una plantilla con
 *   marcadores. El japones coloca el numero, la unidad y el verbo en otro orden
 *   que el espanol, y con funciones cada idioma escribe su frase entera.
 * - Los numeros llegan ya formateados por makeFormatters(locale): la funcion
 *   recibe la cadena lista para pintar. Cuando ademas hace falta decidir singular
 *   o plural, se recibe tambien el numero crudo (`n`) junto a su cadena (`s`).
 * - Los parrafos que llevan <strong> o <em> dentro se parten en piezas (a / em /
 *   b) en vez de perder el enfasis o de meter HTML en el diccionario. El corte
 *   esta puesto donde las tres lenguas pueden colocar la palabra destacada.
 * - Lo que ya vive en `common` —etiquetas y ayudas de senal, nombres de idioma,
 *   nombres de variante, navegacion— no se duplica aqui: se reutiliza.
 * - No se traducen los datos: nombres de carta, de set, de ilustrador ni las
 *   etiquetas de rareza, que llegan en su idioma desde la fuente.
 */
export interface CardsDict {
  /** Piezas que usan por igual la baldosa, la ficha y la tabla de variantes. */
  noPrice: string;
  noPriceEur: string;
  notListed: string;
  cardNumber: (n: string) => string;

  meta: { title: string; description: string };

  tile: {
    /** Atributo title de la baldosa: nombre, variante e idioma. */
    title: (name: string, variant: string, lang: string) => string;
    noImage: string;
    /** Aviso corto: la ilustracion es la de la edicion en otro idioma. */
    imageFallbackTag: (langTag: string) => string;
    imageFallback: (lang: string) => string;
    unknownSet: string;
  };

  explorer: {
    h1: string;
    intro: {
      a: string;
      strong: string;
      b: string;
      counts: (instruments: string, cards: string, sets: string) => string;
    };
    filters: {
      name: string;
      namePlaceholder: string;
      language: string;
      anyLanguage: string;
      set: string;
      allSets: (n: string) => string;
      /**
       * `year` es null cuando la fuente no publica fecha de salida: cada idioma
       * dice «sin fecha» a su manera, y el japones necesita ademas decidir si
       * pone el sufijo 年, que sobre «desconocido» no pega.
       */
      setOption: (
        name: string,
        year: string | null,
        n: number,
        cards: string,
      ) => string;
      rarity: string;
      anyRarity: string;
      rarityOption: (rarity: string, n: string) => string;
      artist: string;
      allArtists: (n: string) => string;
      artistOption: (artist: string, n: string) => string;
      minPrice: string;
      minPricePlaceholder: string;
      sort: string;
      perPage: string;
      apply: string;
      clear: string;
    };
    sort: {
      price_desc: string;
      price_asc: string;
      name: string;
      release_desc: string;
    };
    chips: {
      legend: string;
      remove: string;
      q: (q: string) => string;
      lang: (label: string) => string;
      set: (name: string) => string;
      rarity: (rarity: string) => string;
      artist: (artist: string) => string;
      minPrice: (price: string) => string;
    };
    /** El identificador del set va en un <span className="num"> entre a y b. */
    ambiguousSet: { a: string; b: (names: string) => string };
    results: {
      unit: (n: number, filtered: boolean) => string;
      showing: (from: string, to: string) => string;
      pageOf: (page: string, pages: string) => string;
    };
    empty: {
      noMatch: string;
      outOfRange: string;
      clearAll: string;
      backToFirst: string;
    };
    pagination: { first: string; prev: string; next: string; last: string };
    notes: {
      price: {
        title: string;
        a: string;
        em: string;
        b: (priced: string, instruments: string) => string;
      };
      noChange: {
        title: string;
        body: (days: number, daysStr: string, since: string) => string;
      };
      investable: {
        title: string;
        body: (
          investable: string,
          sharePriced: string,
          priced: string,
          shareAll: string,
        ) => string;
      };
    };
  };

  detail: {
    notFoundTitle: string;
    metaTitle: (name: string, variant: string) => string;
    metaDescription: (
      name: string,
      set: string,
      lang: string,
      variant: string,
    ) => string;
    unknownSet: string;
    /** La ilustracion es la de la edicion en otro idioma: es otro objeto fisico. */
    imageFallback: (lang: string) => string;

    stats: {
      cmTrend: string;
      tcgMarket: string;
      tcgInEur: string;
      fxSuffix: (rate: string) => string;
      /**
       * Equivalencia del precio EUR en otras divisas, bajo el precio principal.
       * `amounts` llega ya formateado y ORDENADO segun el idioma (en: USD
       * primero; ja: JPY primero; es: USD · JPY). `date` es la fecha del tipo
       * BCE ya formateada, o null si la fuente no la trae: entonces la frase
       * se dice sin fecha, nunca con una inventada.
       */
      fxLine: (amounts: string, date: string | null) => string;
    };

    facts: {
      set: string;
      noSet: string;
      release: string;
      notRecorded: string;
      illustrator: string;
      notAttributed: string;
      rarity: string;
      noRarity: string;
      variant: string;
      language: string;
      lastObs: string;
      neverObserved: string;
      card: string;
    };

    signals: {
      h2: string;
      none: string;
      computed: (n: number, s: string, date: string) => string;
      measureA: string;
      measureStrong: string;
      measureB: (days: number, daysStr: string) => string;
      noHelp: string;
    };

    siblings: {
      h2: string;
      onlyOne: (name: string, lang: string, signalLabel: string) => string;
      /** El card_id va en un <span className="num"> entre a y b. */
      sameCardA: (n: number, s: string) => string;
      sameCardB: (lang: string) => string;
      thVariant: string;
      thCardmarket: string;
      thTcgplayer: string;
      thObserved: string;
      current: string;
    };

    archive: {
      h2: string;
      none: string;
      thDate: string;
      thTrend: string;
      thAvg7: string;
      thAvg30: string;
      thTcg: string;
      note: (
        n: number,
        s: string,
        from: string,
        to: string,
        firstDay: string,
      ) => string;
    };

    /**
     * Grafico de trayectoria de precio. Se parte en dos porque los dos dibujos
     * dicen cosas de naturaleza distinta y mezclarlos seria mentir: `levels` son
     * las medias de la fuente, ventanas SOLAPADAS hacia atras desde hoy, que se
     * situan como marcadores sobre un eje de precio; `archive` son nuestras
     * mediciones diarias, que si van sobre un eje temporal real.
     */
    trajectory: {
      h2: string;
      sub: string;
      /** Ni medias ni observaciones: no hay nada que dibujar. */
      none: string;

      levels: {
        h3: string;
        /** <title> y <desc> del SVG, para quien no ve el dibujo. */
        svgTitle: string;
        svgDesc: (trend: string, avg7: string, avg30: string) => string;
        /** Nombre de cada marcador, dentro del dibujo y en la tabla de respaldo. */
        label: { trend: string; avg7: string; avg30: string };
        statVs7: string;
        statVs30: string;
        /**
         * La lectura de un vistazo. `days` es la ventana de la media contra la
         * que se compara, en cifras: hoy 30, o 7 si no hay media de 30.
         */
        reading: {
          above: (pct: string, days: string) => string;
          below: (pct: string, days: string) => string;
          level: (days: string) => string;
        };
        /** Por que los marcadores no van unidos por una linea. Lleva <em> dentro. */
        windowsA: string;
        windowsEm: string;
        windowsB: string;
        /** Sin tendencia o sin ninguna media: no hay «respecto a» que dibujar. */
        none: string;
      };

      archive: {
        h3: string;
        svgTitle: string;
        svgDesc: (n: number, s: string, from: string, to: string) => string;
        none: string;
        /**
         * Pie del grafico. Dice dos cifras distintas y las separa: cuantos dias
         * medidos tiene ESTA carta, y cuantos dias tiene el archivo propio ENTERO.
         * No promete ninguna cadencia: el archivo tiene los dias que tiene.
         */
        foot: (
          n: number,
          s: string,
          from: string,
          archiveDays: number,
          archiveDaysStr: string,
          firstDay: string,
        ) => string;
        noLine: (n: number, s: string) => string;
      };

      table: {
        summary: string;
        capLevels: string;
        capArchive: string;
        thWhat: string;
        thValue: string;
        thVsRef: string;
        thDate: string;
      };
    };

    footer: { before: string; link: string; after: string };

    /** Cifra destacada de cada senal, en la etiqueta de la cabecera. */
    headline: {
      cohortPct: (p: string) => string;
      artistPremium: (v: string) => string;
      jpEnRatio: (v: string) => string;
      euUsArb: (v: string) => string;
      investScore: (v: string) => string;
    };

    priceUsed: string;

    investScore: {
      noBreakdown: string;
      explain: (n: number, s: string) => string;
    };

    roundtrip: {
      breakeven: string;
      investableUniverse: string;
      yes: string;
      no: string;
      explain: (instruments: string, investable: string) => string;
    };

    cohort: {
      label: string;
      size: string;
      /** "Base Set · Rare · Ingles": set, rareza e idioma de la cohorte. */
      cohortLabel: (set: string, rarity: string, lang: string) => string;
      top: string;
      bottom: string;
      middle: (p: string) => string;
      caveatA: string;
      caveatEm: string;
      caveatB: string;
      noisy: (n: number, s: string) => string;
    };

    /**
     * Analogas de cohorte: donde queda el precio de esta carta entre cartas
     * comparables (mismo idioma, misma rareza, era cercana). Es CONTEXTO de
     * valoracion, no una prediccion, y el texto de ayuda lo dice.
     */
    analogs: {
      h2: string;
      /** La linea honesta: contexto de valoracion, no prediccion. */
      help: string;
      /** "Las N cartas mas parecidas cotizan entre p25 y p75". */
      intro: (n: number, s: string, p25: string, p75: string) => string;
      /** Que significa "parecida". Los años llegan crudos: el japones les pone 年. */
      criteria: (lang: string, rarity: string, yearFrom: string, yearTo: string) => string;
      /** Etiquetas de las casillas: cuartiles, mediana y la posicion de ESTA carta. */
      p25: string;
      median: string;
      p75: string;
      thisCard: (percentile: string) => string;
      /** Titulo de la mini-lista de vecinas por precio. */
      closest: (n: number, s: string) => string;
    };

    artist: {
      cardCount: string;
      reliability: string;
      someone: string;
      explain: (artist: string, percentile: string) => string;
      reliabilityNote: (share: string) => string;
    };

    jpEn: {
      thEnglish: string;
      thJapanese: string;
      rowCard: string;
      rowSet: string;
      rowPrice: string;
      ratio: string;
      gap: string;
      sameDay: string;
      /** El adelanto va de -30 a 730 dias: puede valer 1, y puede ser negativo. */
      days: (n: number, s: string) => string;
      timesAbove: (x: string) => string;
      pctAbove: (x: string) => string;
      pctOf: (x: string) => string;
      equal: string;
      why: (pairs: string) => string;
      extreme: string;
    };

    euUs: {
      cmEu: string;
      tcgUs: string;
      tcgConverted: string;
      fx: string;
      fxValue: (rate: string) => string;
      gross: string;
      net: string;
      /** El almacen guarda la direccion en castellano: aqui se traduce. */
      direction: Record<string, string>;
      explain: (arbs: string) => string;
      extreme: string;
    };

    unknown: {
      value: string;
      /** El instrument_id va en un <span className="num"> entre a y b. */
      explainA: string;
      explainB: string;
    };
  };
}

/* ------------------------------------------------------------------ espanol */

const es: CardsDict = {
  noPrice: "sin precio",
  noPriceEur: "sin precio EUR",
  notListed: "no cotiza",
  cardNumber: (n) => `nº ${n}`,

  meta: {
    title: "Explorador de cartas — Cartoteca",
    description:
      "Todas las cartas Pokémon con precio de Cardmarket, filtrables por idioma, set, rareza, ilustrador y precio mínimo.",
  },

  tile: {
    title: (name, variant, lang) => `${name} · ${variant} · ${lang}`,
    noImage: "sin imagen",
    imageFallbackTag: (langTag) => `arte ${langTag}`,
    imageFallback: (lang) =>
      `La ilustración es la de la edición en ${lang.toLowerCase()}: TCGdex no publica la de esta carta. Mismo arte, distinto marco y distinto texto.`,
    unknownSet: "Set desconocido",
  },

  explorer: {
    h1: "Explorador de cartas",
    intro: {
      a: "Cada resultado es un ",
      strong: "instrumento",
      b: ": una carta concreta, en un idioma y con una variante determinada (normal, holo, reverse, 1ª edición). Una misma ilustración aparece varias veces si tiene varias variantes, y cada baldosa dice cuál es.",
      counts: (instruments, cards, sets) =>
        ` ${instruments} instrumentos de ${cards} cartas y ${sets} sets.`,
    },
    filters: {
      name: "Nombre",
      namePlaceholder: "Charizard…",
      language: "Idioma",
      anyLanguage: "Todos",
      set: "Set",
      allSets: (n) => `Todos los sets (${n})`,
      setOption: (name, year, n, cards) =>
        `${name} · ${year ?? "s/f"} · ${cards} ${n === 1 ? "carta" : "cartas"}`,
      rarity: "Rareza",
      anyRarity: "Todas",
      rarityOption: (rarity, n) => `${rarity} (${n})`,
      artist: "Ilustrador",
      allArtists: (n) => `Todos (${n})`,
      artistOption: (artist, n) => `${artist} (${n})`,
      minPrice: "Precio mínimo (€)",
      minPricePlaceholder: "0,00",
      sort: "Orden",
      perPage: "Por página",
      apply: "Aplicar",
      clear: "Limpiar",
    },
    sort: {
      price_desc: "Precio: de mayor a menor",
      price_asc: "Precio: de menor a mayor",
      name: "Nombre: A → Z",
      release_desc: "Lanzamiento: más reciente",
    },
    chips: {
      legend: "Filtros",
      remove: "Quitar este filtro",
      q: (q) => `Nombre contiene «${q}»`,
      lang: (label) => `Idioma: ${label}`,
      set: (name) => `Set: ${name}`,
      rarity: (rarity) => `Rareza: ${rarity}`,
      artist: (artist) => `Ilustrador: ${artist}`,
      minPrice: (price) => `Desde ${price}`,
    },
    ambiguousSet: {
      a: "El identificador ",
      b: (names) =>
        ` corresponde a un set que existe en inglés y en japonés (${names}). Los resultados mezclan ambos: usa el filtro de idioma para separarlos.`,
    },
    results: {
      unit: (n, filtered) =>
        ` ${n === 1 ? "instrumento" : "instrumentos"}${
          filtered ? " con estos filtros" : " en el catálogo"
        }`,
      showing: (from, to) => ` · mostrando ${from}–${to}`,
      pageOf: (page, pages) => `Página ${page} de ${pages}`,
    },
    empty: {
      noMatch:
        "Ningún instrumento cumple estos filtros. Prueba a bajar el precio mínimo o a soltar el idioma: un ilustrador concreto dentro de un set concreto es una combinación que muchas veces no existe, y el catálogo además deja fuera las cartas digitales y los productos de Cardmarket compartidos por varias cartas.",
      outOfRange: "Esta página está fuera del rango de resultados.",
      clearAll: "Quitar todos los filtros",
      backToFirst: "Volver a la primera página",
    },
    pagination: {
      first: "« Primera",
      prev: "‹ Anterior",
      next: "Siguiente ›",
      last: "Última »",
    },
    notes: {
      price: {
        title: "Qué es este precio.",
        a: " Es la ",
        em: "tendencia",
        b: (priced, instruments) =>
          ` de Cardmarket en euros de la última observación de cada instrumento. ${priced} de ${instruments} instrumentos tienen precio; los demás aparecen como «sin precio», nunca como 0 €. Quedan fuera del catálogo las cartas digitales de TCG Pocket y los instrumentos cuyo producto de Cardmarket está compartido por varias cartas, porque su precio no es atribuible a una sola.`,
      },
      noChange: {
        title: "Por qué no hay variaciones.",
        body: (days, daysStr, since) =>
          ` El archivo propio tiene ${daysStr} ${days === 1 ? "día" : "días"} de observaciones (desde el ${since}). Con eso no se puede calcular ninguna variación honesta, así que esta pantalla no muestra ninguna.`,
      },
      investable: {
        title: "Casi nada es invertible.",
        body: (investable, sharePriced, priced, shareAll) =>
          ` Solo ${investable} instrumentos tienen un coste de ida y vuelta igual o inferior al 25%: el ${sharePriced} de los ${priced} que cotizan —el coste no se puede calcular sin precio— y el ${shareAll} del catálogo completo. Los portes son un coste fijo: por debajo de unos pocos euros, comprar y revender pierde dinero por construcción, y la mediana del catálogo cotiza por debajo de un euro. El ranking de inversión trabaja solo sobre ese subconjunto.`,
      },
    },
  },

  detail: {
    notFoundTitle: "Carta no encontrada — Cartoteca",
    metaTitle: (name, variant) => `${name} · ${variant} — Cartoteca`,
    metaDescription: (name, set, lang, variant) =>
      `${name} (${set}, ${lang}, ${variant}): precio de Cardmarket, señales de desajuste y variantes de la misma carta.`,
    unknownSet: "set desconocido",
    imageFallback: (lang) =>
      `Ilustración de la edición en ${lang.toLowerCase()}: TCGdex no publica la de esta carta. Mismo arte, distinto marco y distinto texto; el objeto que se compra es el de esta ficha.`,

    stats: {
      cmTrend: "Cardmarket · tendencia",
      tcgMarket: "TCGplayer · precio de mercado",
      tcgInEur: "TCGplayer en euros",
      fxSuffix: (rate) => ` · 1 € = ${rate} $`,
      fxLine: (amounts, date) =>
        date ? `≈ ${amounts} — tipo BCE del ${date}` : `≈ ${amounts} — tipo BCE`,
    },

    facts: {
      set: "Set",
      noSet: "sin set",
      release: "Lanzamiento",
      notRecorded: " (no registrado)",
      illustrator: "Ilustrador",
      notAttributed: "no atribuido",
      rarity: "Rareza",
      noRarity: "sin rareza declarada",
      variant: "Variante",
      language: "Idioma",
      lastObs: "Última observación",
      neverObserved: "nunca observada",
      card: "Carta",
    },

    signals: {
      h2: "Señales activas",
      none: "Este instrumento no tiene ninguna señal calculada.",
      computed: (n, s, date) =>
        `${s} ${n === 1 ? "señal calculada" : "señales calculadas"} el ${date}.`,
      measureA: " Miden ",
      measureStrong: "desajuste observable hoy",
      measureB: (days, daysStr) =>
        `: verde = la señal juega a favor del desajuste, rojo = en contra. Ninguna es una previsión de precio, y no hay histórico con el que validarla: el archivo propio tiene ${daysStr} ${days === 1 ? "día" : "días"}.`,
      noHelp: "Señal sin descripción registrada en el diccionario de señales.",
    },

    siblings: {
      h2: "Otras variantes de esta carta",
      onlyOne: (name, lang, signalLabel) =>
        `No hay más variantes registradas de ${name} en ${lang}. La versión en el otro idioma es otra carta del catálogo, con su propio identificador: si existe pareja, aparece en la señal «${signalLabel}».`,
      sameCardA: (_n, s) => `${s} instrumentos son la misma carta (`,
      sameCardB: (lang) =>
        `, ${lang}) con acabados distintos. Cotizan por separado porque en Cardmarket son productos distintos.`,
      thVariant: "Variante",
      thCardmarket: "Cardmarket",
      thTcgplayer: "TCGplayer",
      thObserved: "Observado",
      current: "esta",
    },

    archive: {
      h2: "Archivo de precios",
      none: "Este instrumento no tiene ninguna observación de precio: existe en el catálogo, pero no hemos registrado ninguna cotización suya.",
      thDate: "Fecha",
      thTrend: "Tendencia (EUR)",
      thAvg7: "Media 7 d (EUR)",
      thAvg30: "Media 30 d (EUR)",
      thTcg: "TCGplayer (USD)",
      note: (n, s, from, to, firstDay) =>
        `${s} ${n === 1 ? "observación propia" : "observaciones propias"}, del ${from} al ${to}. Son las mismas que están dibujadas arriba, punto a punto y sin unir: con ${s} ${n === 1 ? "punto" : "puntos"} una línea de tendencia sería un dibujo, no un dato. Las medias de 7 y 30 días las publica Cardmarket con su propio histórico; no salen de este archivo, que empezó el ${firstDay}.`,
    },

    trajectory: {
      h2: "Trayectoria del precio",
      sub: "Dos cosas de naturaleza distinta, y por eso no van en el mismo trazo: dónde cotiza hoy frente a las medias que publica Cardmarket, y las mediciones diarias de nuestro propio archivo.",
      none: "No hay ni medias de la fuente ni observaciones propias para esta carta: no hay nada que dibujar.",

      levels: {
        h3: "Dónde cotiza hoy frente a sus medias",
        svgTitle:
          "Precio actual y medias de 7 y 30 días, situados como marcadores sobre un eje de precio",
        svgDesc: (trend, avg7, avg30) =>
          `Tendencia actual ${trend}. Media de 7 días ${avg7}. Media de 30 días ${avg30}. La referencia vertical es la media más larga disponible.`,
        label: {
          trend: "tendencia actual",
          avg7: "media 7 días",
          avg30: "media 30 días",
        },
        statVs7: "Frente a su media de 7 días",
        statVs30: "Frente a su media de 30 días",
        reading: {
          above: (pct, days) =>
            `El precio actual está un ${pct} por encima de su media de ${days} días.`,
          below: (pct, days) =>
            `El precio actual está un ${pct} por debajo de su media de ${days} días.`,
          level: (days) => `El precio actual coincide con su media de ${days} días.`,
        },
        windowsA: "Las medias de 7 y de 30 días son ",
        windowsEm: "ventanas solapadas",
        windowsB:
          " calculadas hacia atrás desde hoy, no cotizaciones de días sucesivos: por eso aparecen como marcadores sobre un eje de precio y no unidas por una línea, que sería un histórico inventado. El color indica la dirección del movimiento reciente, no una recomendación: cotizar por encima de la media no dice si conviene comprar.",
        none: "La última observación no trae suficientes valores para situar el precio: hacen falta al menos la tendencia actual y una de las dos medias.",
      },

      archive: {
        h3: "Nuestras observaciones diarias",
        svgTitle:
          "Observaciones propias de precio sobre un eje temporal, dibujadas como puntos sueltos",
        svgDesc: (n, s, from, to) =>
          `${s} ${n === 1 ? "observación" : "observaciones"} de la tendencia de Cardmarket en euros, ${n === 1 ? "el" : "del"} ${from}${n === 1 ? "" : ` al ${to}`}. Los puntos no están unidos por ninguna línea.`,
        none: "Todavía no hay ninguna observación con precio en euros para esta carta.",
        foot: (n, s, from, archiveDays, archiveDaysStr, firstDay) =>
          `${s} ${n === 1 ? "día medido" : "días medidos"} de esta carta, ${n === 1 ? "el" : "desde el"} ${from}. El archivo propio tiene ${archiveDaysStr} ${archiveDays === 1 ? "día" : "días"} en total, desde el ${firstDay}: no hay nada anterior con lo que comparar. `,
        noLine: (n, s) =>
          `No se traza ninguna línea entre los puntos: con ${s} ${n === 1 ? "observación" : "observaciones"} una línea de tendencia sería un dibujo, no una medición.`,
      },

      table: {
        summary: "Ver los mismos números en tabla",
        capLevels: "Precio actual y medias de la fuente",
        capArchive: "Observaciones propias",
        thWhat: "Medida",
        thValue: "Valor",
        thVsRef: "Frente a la referencia",
        thDate: "Fecha",
      },
    },

    footer: {
      before: "Cómo se calcula cada señal, con sus umbrales y sus límites: ",
      link: "metodología",
      after: ".",
    },

    headline: {
      cohortPct: (p) => `percentil ${p}`,
      artistPremium: (v) => `${v} de 1,00`,
      jpEnRatio: (v) => `×${v}`,
      euUsArb: (v) => `${v} neto`,
      investScore: (v) => `${v} z`,
    },

    priceUsed: "Precio usado",

    investScore: {
      noBreakdown:
        "El desglose por componentes no está disponible para este instrumento.",
      explain: (_n, s) =>
        `Compuesto de ${s} señales de las cuatro posibles; las que no existen para esta carta no entran en la media, no puntúan como cero. Cada componente es un z-score con el signo ya orientado: positivo significa que empuja el desajuste a favor. El compuesto no es una previsión de rentabilidad —no hay serie con la que haberla validado— sino una medida de cuánto se separa hoy esta carta de lo que se paga por sus pares.`,
    },

    roundtrip: {
      breakeven: "Subida necesaria para no perder",
      investableUniverse: "Dentro del universo invertible (≤ 25%)",
      yes: "sí",
      no: "no",
      explain: (instruments, investable) =>
        `Comisión y portes son un coste fijo: no bajan cuando la carta es barata, así que se comen un porcentaje enorme de las cotizaciones pequeñas. De los ${instruments} instrumentos del catálogo, solo ${investable} quedan por debajo del 25%. Todo lo que hay por encima de ese umbral se puede coleccionar, pero no se puede operar.`,
    },

    cohort: {
      label: "Cohorte",
      size: "Instrumentos en la cohorte",
      cohortLabel: (set, rarity, lang) => `${set} · ${rarity} · ${lang}`,
      top: "Es la más cara de su cohorte: mismo set, misma rareza, mismo idioma.",
      bottom: "Es la más barata de su cohorte: mismo set, misma rareza, mismo idioma.",
      middle: (p) =>
        `Cotiza por encima del ${p}% de su cohorte: mismo set, misma rareza, mismo idioma.`,
      caveatA: " Un percentil bajo dice que está barata ",
      caveatEm: "respecto a sus pares",
      caveatB: "; no dice por qué, y a veces la razón es buena (la carta es menos deseada).",
      noisy: (_n, s) =>
        ` Con solo ${s} pares, este percentil es ruidoso: cada carta mueve el resultado varios puntos.`,
    },

    analogs: {
      h2: "Dónde cotiza entre sus análogas",
      help: "Es contexto de valoración: dónde queda su precio hoy entre cartas comparables. No dice nada de hacia dónde va.",
      intro: (_n, s, p25, p75) =>
        `Las ${s} cartas más parecidas a esta cotizan entre ${p25} y ${p75} (p25–p75). `,
      criteria: (lang, rarity, yearFrom, yearTo) =>
        `Parecida significa: mismo idioma (${lang}), misma rareza (${rarity}) y era cercana (sets de ${yearFrom} a ${yearTo}).`,
      p25: "p25 de la cohorte",
      median: "Mediana de la cohorte",
      p75: "p75 de la cohorte",
      thisCard: (percentile) => `esta carta · percentil ${percentile}`,
      closest: (_n, s) => `Las ${s} más cercanas por precio`,
    },

    artist: {
      cardCount: "Cartas suyas en el catálogo",
      reliability: "Fiabilidad global de la señal",
      someone: "este ilustrador",
      explain: (artist, percentile) =>
        `Las cartas de ${artist} alcanzan de media el percentil ${percentile} dentro de sus cohortes, ya corregido por tamaño de muestra: un ilustrador con pocas cartas se arrastra hacia el 0,50 neutro en vez de coronar el ranking por casualidad.`,
      reliabilityNote: (share) =>
        ` La descomposición de varianza atribuye al ilustrador un ${share} de fiabilidad: es una cifra global de la señal, la misma para todos los ilustradores, no una medida de la solidez de este en concreto. El resto lo explican el set, la rareza y el ruido.`,
    },

    jpEn: {
      thEnglish: "Inglesa",
      thJapanese: "Japonesa",
      rowCard: "Carta",
      rowSet: "Set",
      rowPrice: "Precio",
      ratio: "Ratio japonesa ÷ inglesa",
      gap: "Diferencia entre las dos ediciones",
      sameDay: "salieron el mismo día",
      days: (n, s) => `${s} ${Math.abs(n) === 1 ? "día" : "días"}`,
      timesAbove: (x) => `La japonesa cotiza a ${x} veces el precio de la inglesa.`,
      pctAbove: (x) => `La japonesa cotiza un ${x}% por encima de la inglesa.`,
      pctOf: (x) => `La japonesa cotiza al ${x}% del precio de la inglesa.`,
      equal: "Ambas cotizan igual.",
      why: (pairs) =>
        ` Se comparan porque el mercado japonés se adelanta al inglés una mediana de 56 días (p25 49, p75 83) sobre ${pairs} parejas casadas. Eso justifica mirar el par, no promete que converjan: son productos distintos, con tiradas distintas y compradores distintos.`,
      extreme:
        " Una diferencia de esta magnitud rara vez es una dislocación de mercado: lo habitual es que el emparejamiento no sea equivalente (otra variante, otro estado, otra tirada) o que uno de los dos precios salga de muy pocas ventas. Compruébalo a mano antes de darlo por bueno.",
    },

    euUs: {
      cmEu: "Cardmarket (EU)",
      tcgUs: "TCGplayer (US)",
      tcgConverted: "TCGplayer convertido",
      fx: "Tipo de cambio",
      fxValue: (rate) => `1 € = ${rate} $`,
      gross: "Diferencial bruto (US en euros frente a EU)",
      net: "Diferencial neto",
      direction: {
        "comprar en EU, vender en US": "comprar en EU, vender en US",
        "comprar en US, vender en EU": "comprar en US, vender en EU",
      },
      explain: (arbs) =>
        `Es lo que queda del diferencial entre los dos mercados después de convertir a euros y descontar comisión y portes. El signo del bruto solo dice qué lado está más barato —negativo significa que TCGplayer cotiza por debajo de Cardmarket, y entonces se compra en Estados Unidos—, así que la dirección la marca la etiqueta, no el signo. El neto siempre sale positivo porque solo se guardan los ${arbs} diferenciales que sobreviven a los costes. Ojo con extrapolarlo a una operación real: no incluye aduanas, IVA de importación ni el riesgo de que el tipo de cambio se mueva mientras el sobre cruza el Atlántico.`,
      extreme:
        " Y un diferencial neto de este tamaño casi nunca es dinero en la calle: lo normal es que los dos mercados no estén cotizando el mismo producto (edición, estado o tirada distintos) o que uno de los precios venga de muy pocas ventas. Verifícalo carta a carta antes de operar.",
    },

    unknown: {
      value: "Valor",
      explainA:
        "Esta señal no está en el diccionario de la interfaz: se muestra su contenido sin interpretar para no inventar una explicación. Instrumento ",
      explainB: ".",
    },
  },
};

/* ------------------------------------------------------------------- ingles */

const en: CardsDict = {
  noPrice: "no price",
  noPriceEur: "no EUR price",
  notListed: "not listed",
  cardNumber: (n) => `no. ${n}`,

  meta: {
    title: "Card explorer — Cartoteca",
    description:
      "Every Pokémon card with a Cardmarket price, filterable by language, set, rarity, illustrator and minimum price.",
  },

  tile: {
    title: (name, variant, lang) => `${name} · ${variant} · ${lang}`,
    noImage: "no image",
    imageFallbackTag: (langTag) => `${langTag} art`,
    imageFallback: (lang) =>
      `The artwork shown is the ${lang} edition's: TCGdex publishes none for this card. Same art, different frame and different text.`,
    unknownSet: "Unknown set",
  },

  explorer: {
    h1: "Card explorer",
    intro: {
      a: "Every result is one ",
      strong: "instrument",
      b: ": a specific card, in one language and with one finish (normal, holo, reverse, 1st edition). The same artwork shows up several times when it has several finishes, and every tile says which one it is.",
      counts: (instruments, cards, sets) =>
        ` ${instruments} instruments across ${cards} cards and ${sets} sets.`,
    },
    filters: {
      name: "Name",
      namePlaceholder: "Charizard…",
      language: "Language",
      anyLanguage: "Any",
      set: "Set",
      allSets: (n) => `All sets (${n})`,
      setOption: (name, year, n, cards) =>
        `${name} · ${year ?? "n.d."} · ${cards} ${n === 1 ? "card" : "cards"}`,
      rarity: "Rarity",
      anyRarity: "Any",
      rarityOption: (rarity, n) => `${rarity} (${n})`,
      artist: "Illustrator",
      allArtists: (n) => `All (${n})`,
      artistOption: (artist, n) => `${artist} (${n})`,
      minPrice: "Minimum price (€)",
      minPricePlaceholder: "0.00",
      sort: "Sort by",
      perPage: "Per page",
      apply: "Apply",
      clear: "Clear",
    },
    sort: {
      price_desc: "Price: high to low",
      price_asc: "Price: low to high",
      name: "Name: A → Z",
      release_desc: "Release: newest first",
    },
    chips: {
      legend: "Filters",
      remove: "Remove this filter",
      q: (q) => `Name contains “${q}”`,
      lang: (label) => `Language: ${label}`,
      set: (name) => `Set: ${name}`,
      rarity: (rarity) => `Rarity: ${rarity}`,
      artist: (artist) => `Illustrator: ${artist}`,
      minPrice: (price) => `From ${price}`,
    },
    ambiguousSet: {
      a: "The identifier ",
      b: (names) =>
        ` belongs to a set that exists in both English and Japanese (${names}). These results mix the two: use the language filter to separate them.`,
    },
    results: {
      unit: (n, filtered) =>
        ` ${n === 1 ? "instrument" : "instruments"}${
          filtered ? " matching these filters" : " in the catalogue"
        }`,
      showing: (from, to) => ` · showing ${from}–${to}`,
      pageOf: (page, pages) => `Page ${page} of ${pages}`,
    },
    empty: {
      noMatch:
        "No instrument matches these filters. Try lowering the minimum price or dropping the language: one specific illustrator inside one specific set is a combination that often does not exist, and the catalogue also leaves out digital cards and Cardmarket products shared by several cards.",
      outOfRange: "This page is outside the range of results.",
      clearAll: "Clear every filter",
      backToFirst: "Back to the first page",
    },
    pagination: {
      first: "« First",
      prev: "‹ Previous",
      next: "Next ›",
      last: "Last »",
    },
    notes: {
      price: {
        title: "What this price is.",
        a: " It is the Cardmarket ",
        em: "trend price",
        b: (priced, instruments) =>
          ` in euros, from the latest observation of each instrument. ${priced} of ${instruments} instruments have a price; the rest show up as “no price”, never as €0. The catalogue leaves out TCG Pocket digital cards and any instrument whose Cardmarket product is shared by several cards, because that price cannot be attributed to a single one.`,
      },
      noChange: {
        title: "Why there are no price moves.",
        body: (days, daysStr, since) =>
          ` Our own archive holds ${daysStr} ${days === 1 ? "day" : "days"} of observations (since ${since}). That is not enough to compute an honest price move, so this screen shows none.`,
      },
      investable: {
        title: "Almost nothing is investable.",
        body: (investable, sharePriced, priced, shareAll) =>
          ` Only ${investable} instruments carry a round-trip cost of 25% or less: ${sharePriced} of the ${priced} that have a price —the cost cannot be computed without one— and ${shareAll} of the whole catalogue. Shipping is a fixed cost: below a few euros, buying and reselling loses money by construction, and the median of the catalogue trades under one euro. The investment ranking works on that subset alone.`,
      },
    },
  },

  detail: {
    notFoundTitle: "Card not found — Cartoteca",
    metaTitle: (name, variant) => `${name} · ${variant} — Cartoteca`,
    metaDescription: (name, set, lang, variant) =>
      `${name} (${set}, ${lang}, ${variant}): Cardmarket price, mispricing signals and the other finishes of the same card.`,
    unknownSet: "unknown set",
    imageFallback: (lang) =>
      `Artwork from the ${lang} edition: TCGdex publishes none for this card. Same art, different frame and different text; the object you would buy is the one on this page.`,

    stats: {
      cmTrend: "Cardmarket · trend",
      tcgMarket: "TCGplayer · market price",
      tcgInEur: "TCGplayer in euros",
      fxSuffix: (rate) => ` · €1 = $${rate}`,
      fxLine: (amounts, date) =>
        date ? `≈ ${amounts} — ECB rate of ${date}` : `≈ ${amounts} — ECB rate`,
    },

    facts: {
      set: "Set",
      noSet: "no set",
      release: "Release",
      notRecorded: " (not recorded)",
      illustrator: "Illustrator",
      notAttributed: "not attributed",
      rarity: "Rarity",
      noRarity: "no rarity declared",
      variant: "Variant",
      language: "Language",
      lastObs: "Latest observation",
      neverObserved: "never observed",
      card: "Card",
    },

    signals: {
      h2: "Active signals",
      none: "No signal has been computed for this instrument.",
      computed: (n, s, date) =>
        `${s} ${n === 1 ? "signal" : "signals"} computed on ${date}.`,
      measureA: " They measure ",
      measureStrong: "mispricing observable today",
      measureB: (days, daysStr) =>
        `: green = the signal argues for the mispricing, red = against it. None of them is a price forecast, and there is no history to validate one against: our own archive holds ${daysStr} ${days === 1 ? "day" : "days"}.`,
      noHelp: "This signal has no description registered in the signal dictionary.",
    },

    siblings: {
      h2: "Other finishes of this card",
      onlyOne: (name, lang, signalLabel) =>
        `No other finish of ${name} in ${lang} is on record. The version in the other language is a different card in the catalogue, with its own identifier: if a match exists, it shows up under the “${signalLabel}” signal.`,
      sameCardA: (_n, s) => `${s} instruments are the same card (`,
      sameCardB: (lang) =>
        `, ${lang}) with different finishes. They trade separately because on Cardmarket they are different products.`,
      thVariant: "Variant",
      thCardmarket: "Cardmarket",
      thTcgplayer: "TCGplayer",
      thObserved: "Observed",
      current: "this one",
    },

    archive: {
      h2: "Price archive",
      none: "This instrument has no price observation at all: it exists in the catalogue, but we have never recorded a quote for it.",
      thDate: "Date",
      thTrend: "Trend (EUR)",
      thAvg7: "7-day avg. (EUR)",
      thAvg30: "30-day avg. (EUR)",
      thTcg: "TCGplayer (USD)",
      note: (n, s, from, to, firstDay) =>
        `${s} ${n === 1 ? "observation" : "observations"} of our own, from ${from} to ${to}. They are the same ones plotted above, point by point and never joined: with ${s} ${n === 1 ? "point" : "points"} a trend line would be a drawing, not a measurement. The 7- and 30-day averages are published by Cardmarket out of its own history; they do not come from this archive, which started on ${firstDay}.`,
    },

    trajectory: {
      h2: "Price trajectory",
      sub: "Two things of a different nature, which is why they never share a line: where it trades today against the averages Cardmarket publishes, and the daily measurements from our own archive.",
      none: "There are neither source averages nor observations of our own for this card: there is nothing to plot.",

      levels: {
        h3: "Where it trades today against its averages",
        svgTitle:
          "Current price and 7- and 30-day averages, placed as markers on a price axis",
        svgDesc: (trend, avg7, avg30) =>
          `Current trend ${trend}. 7-day average ${avg7}. 30-day average ${avg30}. The vertical reference is the longest average available.`,
        label: {
          trend: "current trend",
          avg7: "7-day average",
          avg30: "30-day average",
        },
        statVs7: "Against its 7-day average",
        statVs30: "Against its 30-day average",
        reading: {
          above: (pct, days) =>
            `The current price sits ${pct} above its ${days}-day average.`,
          below: (pct, days) =>
            `The current price sits ${pct} below its ${days}-day average.`,
          level: (days) => `The current price matches its ${days}-day average.`,
        },
        windowsA: "The 7- and 30-day averages are ",
        windowsEm: "overlapping windows",
        windowsB:
          " computed backwards from today, not quotes from consecutive days: that is why they are markers on a price axis and not joined by a line, which would be a fabricated history. The colour shows the direction of the recent move, not a recommendation: trading above the average does not say whether it is worth buying.",
        none: "The latest observation does not carry enough values to place the price: at least the current trend and one of the two averages are needed.",
      },

      archive: {
        h3: "Our own daily observations",
        svgTitle:
          "Our own price observations on a time axis, drawn as separate points",
        svgDesc: (n, s, from, to) =>
          `${s} ${n === 1 ? "observation" : "observations"} of the Cardmarket trend in euros, ${n === 1 ? `on ${from}` : `from ${from} to ${to}`}. The points are not joined by any line.`,
        none: "There is no observation with a euro price for this card yet.",
        foot: (n, s, from, archiveDays, archiveDaysStr, firstDay) =>
          `${s} measured ${n === 1 ? "day" : "days"} for this card, ${n === 1 ? "on" : "since"} ${from}. Our own archive holds ${archiveDaysStr} ${archiveDays === 1 ? "day" : "days"} in total, since ${firstDay}: there is nothing earlier to compare against. `,
        noLine: (n, s) =>
          `No line is drawn between the points: with ${s} ${n === 1 ? "observation" : "observations"} a trend line would be a drawing, not a measurement.`,
      },

      table: {
        summary: "See the same figures as a table",
        capLevels: "Current price and source averages",
        capArchive: "Observations of our own",
        thWhat: "Measure",
        thValue: "Value",
        thVsRef: "Against the reference",
        thDate: "Date",
      },
    },

    footer: {
      before: "How each signal is computed, with its thresholds and its limits: ",
      link: "methodology",
      after: ".",
    },

    headline: {
      cohortPct: (p) => `percentile ${p}`,
      artistPremium: (v) => `${v} of 1.00`,
      jpEnRatio: (v) => `×${v}`,
      euUsArb: (v) => `${v} net`,
      investScore: (v) => `${v} z`,
    },

    priceUsed: "Price used",

    investScore: {
      noBreakdown: "The per-component breakdown is not available for this instrument.",
      explain: (_n, s) =>
        `Composed of ${s} of the four possible signals; the ones that do not exist for this card stay out of the average, they do not score as a zero. Each component is a z-score with its sign already oriented: positive means it pushes the mispricing in favour. The composite is not a return forecast —there is no series against which one could have been validated— but a measure of how far this card sits today from what its peers fetch.`,
    },

    roundtrip: {
      breakeven: "Rise needed to break even",
      investableUniverse: "Inside the investable universe (≤ 25%)",
      yes: "yes",
      no: "no",
      explain: (instruments, investable) =>
        `Fees and shipping are a fixed cost: they do not shrink when the card is cheap, so they eat a huge share of small quotes. Of the ${instruments} instruments in the catalogue, only ${investable} stay below 25%. Everything above that threshold can be collected, but it cannot be traded.`,
    },

    cohort: {
      label: "Cohort",
      size: "Instruments in the cohort",
      cohortLabel: (set, rarity, lang) => `${set} · ${rarity} · ${lang}`,
      top: "It is the most expensive in its cohort: same set, same rarity, same language.",
      bottom: "It is the cheapest in its cohort: same set, same rarity, same language.",
      middle: (p) =>
        `It trades above ${p}% of its cohort: same set, same rarity, same language.`,
      caveatA: " A low percentile says it is cheap ",
      caveatEm: "relative to its peers",
      caveatB: "; it does not say why, and sometimes the reason is a sound one (the card is simply less wanted).",
      noisy: (_n, s) =>
        ` With only ${s} peers, this percentile is noisy: each single card moves the result by several points.`,
    },

    analogs: {
      h2: "Where it trades among its analogues",
      help: "This is valuation context: where its price sits today among comparable cards. It says nothing about where it is heading.",
      intro: (_n, s, p25, p75) =>
        `The ${s} cards most similar to this one trade between ${p25} and ${p75} (p25–p75). `,
      criteria: (lang, rarity, yearFrom, yearTo) =>
        `Similar means: same language (${lang}), same rarity (${rarity}) and a close era (sets from ${yearFrom} to ${yearTo}).`,
      p25: "Cohort p25",
      median: "Cohort median",
      p75: "Cohort p75",
      thisCard: (percentile) => `this card · percentile ${percentile}`,
      closest: (_n, s) => `The ${s} closest by price`,
    },

    artist: {
      cardCount: "Cards of theirs in the catalogue",
      reliability: "Overall reliability of the signal",
      someone: "this illustrator",
      explain: (artist, percentile) =>
        `Cards by ${artist} reach percentile ${percentile} on average within their cohorts, already corrected for sample size: an illustrator with few cards is pulled back towards the neutral 0.50 instead of topping the ranking by chance.`,
      reliabilityNote: (share) =>
        ` The variance decomposition attributes ${share} of reliability to the illustrator: that is a global figure for the signal, the same for every illustrator, not a measure of how solid this particular one is. The rest is explained by the set, the rarity and the noise.`,
    },

    jpEn: {
      thEnglish: "English",
      thJapanese: "Japanese",
      rowCard: "Card",
      rowSet: "Set",
      rowPrice: "Price",
      ratio: "Japanese ÷ English ratio",
      gap: "Gap between the two editions",
      sameDay: "released the same day",
      days: (n, s) => `${s} ${Math.abs(n) === 1 ? "day" : "days"}`,
      timesAbove: (x) => `The Japanese one trades at ${x} times the English price.`,
      pctAbove: (x) => `The Japanese one trades ${x}% above the English one.`,
      pctOf: (x) => `The Japanese one trades at ${x}% of the English price.`,
      equal: "Both trade at the same price.",
      why: (pairs) =>
        ` They are compared because the Japanese market leads the English one by a median of 56 days (p25 49, p75 83) across ${pairs} matched pairs. That justifies watching the pair; it does not promise the two converge: they are different products, with different print runs and different buyers.`,
      extreme:
        " A gap this large is rarely a market dislocation: the usual explanation is that the pairing is not equivalent (different finish, different condition, different print run) or that one of the two prices comes from very few sales. Check it by hand before taking it at face value.",
    },

    euUs: {
      cmEu: "Cardmarket (EU)",
      tcgUs: "TCGplayer (US)",
      tcgConverted: "TCGplayer converted",
      fx: "Exchange rate",
      fxValue: (rate) => `€1 = $${rate}`,
      gross: "Gross spread (US in euros against EU)",
      net: "Net spread",
      direction: {
        "comprar en EU, vender en US": "buy in the EU, sell in the US",
        "comprar en US, vender en EU": "buy in the US, sell in the EU",
      },
      explain: (arbs) =>
        `This is what is left of the gap between the two markets after converting to euros and subtracting fees and shipping. The sign of the gross spread only says which side is cheaper —negative means TCGplayer trades below Cardmarket, so you buy in the United States— which is why the direction is given by the tag and not by the sign. The net is always positive because only the ${arbs} spreads that survive the costs are stored. Careful before extrapolating to a real trade: it leaves out customs, import VAT and the risk of the exchange rate moving while the envelope crosses the Atlantic.`,
      extreme:
        " And a net spread this size is almost never money lying in the street: the usual explanation is that the two markets are not quoting the same product (different edition, condition or print run) or that one of the prices comes from very few sales. Verify it card by card before trading.",
    },

    unknown: {
      value: "Value",
      explainA:
        "This signal is not in the interface dictionary: its contents are shown uninterpreted so as not to invent an explanation. Instrument ",
      explainB: ".",
    },
  },
};

/* ------------------------------------------------------------------ japones */

const ja: CardsDict = {
  noPrice: "価格なし",
  noPriceEur: "ユーロ価格なし",
  notListed: "取引なし",
  cardNumber: (n) => `No.${n}`,

  meta: {
    title: "カード検索 — Cartoteca",
    description:
      "Cardmarket の価格が付いたポケモンカードのすべて。言語・セット・レアリティ・イラストレーター・最低価格で絞り込めます。",
  },

  tile: {
    title: (name, variant, lang) => `${name}・${variant}・${lang}`,
    noImage: "画像なし",
    imageFallbackTag: (langTag) => `${langTag}版の絵`,
    imageFallback: (lang) =>
      `表示しているイラストは${lang}版のものです。TCGdex はこのカードの画像を公開していません。絵柄は同じですが、枠と文字は異なります。`,
    unknownSet: "セット不明",
  },

  explorer: {
    h1: "カード検索",
    intro: {
      a: "検索結果の1件は1つの",
      strong: "銘柄",
      b: "です。同じカードでも、言語と仕様（ノーマル・ホロ・リバース・初版）ごとに別の1件として数えます。同じイラストが何度も並ぶのはそのためで、各タイルに仕様を表示しています。",
      counts: (instruments, cards, sets) =>
        `${cards}枚のカード・${sets}セットから${instruments}銘柄。`,
    },
    filters: {
      name: "カード名",
      namePlaceholder: "リザードン…",
      language: "言語",
      anyLanguage: "すべて",
      set: "セット",
      allSets: (n) => `すべてのセット（${n}）`,
      setOption: (name, year, _n, cards) =>
        `${name}・${year ? `${year}年` : "発売年不明"}・${cards}枚`,
      rarity: "レアリティ",
      anyRarity: "すべて",
      rarityOption: (rarity, n) => `${rarity}（${n}）`,
      artist: "イラストレーター",
      allArtists: (n) => `すべて（${n}）`,
      artistOption: (artist, n) => `${artist}（${n}）`,
      minPrice: "最低価格（€）",
      minPricePlaceholder: "0.00",
      sort: "並び順",
      perPage: "1ページの件数",
      apply: "適用",
      clear: "クリア",
    },
    sort: {
      price_desc: "価格が高い順",
      price_asc: "価格が安い順",
      name: "名前順（A → Z）",
      release_desc: "発売日が新しい順",
    },
    chips: {
      legend: "絞り込み",
      remove: "この条件を外す",
      q: (q) => `名前に「${q}」を含む`,
      lang: (label) => `言語：${label}`,
      set: (name) => `セット：${name}`,
      rarity: (rarity) => `レアリティ：${rarity}`,
      artist: (artist) => `イラストレーター：${artist}`,
      minPrice: (price) => `${price} 以上`,
    },
    ambiguousSet: {
      a: "識別子 ",
      b: (names) =>
        ` は英語版と日本語版の両方に存在するセットのものです（${names}）。この結果には両方が混ざっています。言語フィルタで分けてください。`,
    },
    results: {
      unit: (_n, filtered) =>
        `件の銘柄${filtered ? "（この条件に一致）" : "（カタログ全体）"}`,
      showing: (from, to) => ` · ${from}–${to}件目を表示`,
      pageOf: (page, pages) => `${pages} ページ中 ${page} ページ目`,
    },
    empty: {
      noMatch:
        "この条件に一致する銘柄はありません。最低価格を下げるか、言語の指定を外してみてください。特定のセットの中の特定のイラストレーターという組み合わせは存在しないことが多く、さらにカタログはデジタル専用カードと、複数のカードで共有される Cardmarket 商品を除外しています。",
      outOfRange: "このページは結果の範囲外です。",
      clearAll: "すべての条件を外す",
      backToFirst: "1ページ目に戻る",
    },
    pagination: {
      first: "« 最初",
      prev: "‹ 前へ",
      next: "次へ ›",
      last: "最後 »",
    },
    notes: {
      price: {
        title: "この価格について。",
        a: "各銘柄の最新観測時点における Cardmarket の",
        em: "トレンド価格",
        b: (priced, instruments) =>
          `（ユーロ建て）です。${instruments}銘柄のうち${priced}銘柄に価格があり、残りは「価格なし」と表示します。0 € とは表示しません。TCG Pocket のデジタル専用カードと、複数のカードで1つの Cardmarket 商品を共有している銘柄は、価格を1枚に帰属させられないためカタログから除外しています。`,
      },
      noChange: {
        title: "変動率を表示しない理由。",
        body: (_days, daysStr, since) =>
          `自前のアーカイブには${daysStr}日分の観測しかありません（${since}以降）。これでは誠実な変動率を計算できないため、この画面では一切表示しません。`,
      },
      investable: {
        title: "投資対象になるものはごくわずか。",
        body: (investable, sharePriced, priced, shareAll) =>
          `往復コストが25%以下の銘柄は${investable}件だけです。価格のある${priced}銘柄の${sharePriced}、カタログ全体の${shareAll}にあたります（価格がなければコストは計算できません）。送料は固定費なので、数ユーロを下回る価格帯では、買って売り直した時点で構造的に損をします。しかもカタログの中央値は1ユーロ未満です。投資ランキングはこの部分集合だけを対象にしています。`,
      },
    },
  },

  detail: {
    notFoundTitle: "カードが見つかりません — Cartoteca",
    metaTitle: (name, variant) => `${name}・${variant} — Cartoteca`,
    metaDescription: (name, set, lang, variant) =>
      `${name}（${set}／${lang}／${variant}）の Cardmarket 価格、価格のずれを示すシグナル、同じカードの他の仕様。`,
    unknownSet: "セット不明",
    imageFallback: (lang) =>
      `${lang}版のイラストです。TCGdex はこのカードの画像を公開していません。絵柄は同じですが、枠と文字は異なります。購入対象はこのページのカードです。`,

    stats: {
      cmTrend: "Cardmarket・トレンド",
      tcgMarket: "TCGplayer・マーケット価格",
      tcgInEur: "TCGplayer（ユーロ換算）",
      fxSuffix: (rate) => ` · 1 € = ${rate} $`,
      fxLine: (amounts, date) =>
        date
          ? `≈ ${amounts} — 欧州中央銀行レート（${date}）`
          : `≈ ${amounts} — 欧州中央銀行レート`,
    },

    facts: {
      set: "セット",
      noSet: "セットなし",
      release: "発売日",
      notRecorded: "（記録なし）",
      illustrator: "イラストレーター",
      notAttributed: "記載なし",
      rarity: "レアリティ",
      noRarity: "レアリティ表記なし",
      variant: "仕様",
      language: "言語",
      lastObs: "最終観測日",
      neverObserved: "観測実績なし",
      card: "カード",
    },

    signals: {
      h2: "有効なシグナル",
      none: "この銘柄に計算済みのシグナルはありません。",
      computed: (_n, s, date) => `${date}時点で${s}件のシグナルを計算しています。`,
      measureA: "これらが測るのは",
      measureStrong: "今日の時点で観測できる価格のずれ",
      measureB: (_days, daysStr) =>
        `です。緑はずれを支持する方向、赤は逆方向を示します。いずれも価格の予測ではなく、検証に使える履歴もありません。自前のアーカイブは${daysStr}日分です。`,
      noHelp: "このシグナルはシグナル辞書に説明が登録されていません。",
    },

    siblings: {
      h2: "このカードの他の仕様",
      onlyOne: (name, lang, signalLabel) =>
        `${lang}版の${name}には、他の仕様は登録されていません。もう一方の言語版はカタログ上では別のカードで、独自の識別子を持ちます。対応が取れている場合は「${signalLabel}」シグナルに表示されます。`,
      sameCardA: (_n, s) => `${s}件の銘柄が同じカード（`,
      sameCardB: (lang) =>
        `／${lang}）の仕様違いです。Cardmarket では別商品として扱われるため、価格も別々に付きます。`,
      thVariant: "仕様",
      thCardmarket: "Cardmarket",
      thTcgplayer: "TCGplayer",
      thObserved: "観測日",
      current: "表示中",
    },

    archive: {
      h2: "価格アーカイブ",
      none: "この銘柄には価格の観測が1件もありません。カタログには存在しますが、取引価格を記録できていません。",
      thDate: "日付",
      thTrend: "トレンド（EUR）",
      thAvg7: "7日平均（EUR）",
      thAvg30: "30日平均（EUR）",
      thTcg: "TCGplayer（USD）",
      note: (_n, s, from, to, firstDay) =>
        `自前の観測は${s}件、${from}から${to}まで。上のグラフに描いてあるのと同じ点で、線でつないではいません。${s}点で引いたトレンド線は、データではなく絵にすぎないからです。7日平均と30日平均は Cardmarket が自社の履歴から公開している値で、${firstDay}に始まったこのアーカイブによるものではありません。`,
    },

    trajectory: {
      h2: "価格の推移",
      sub: "性質の異なる2つを、同じ線にはしていません。Cardmarket が公開する平均に対する現在の位置と、自前のアーカイブによる日次の実測です。",
      none: "このカードには提供元の平均も自前の観測もありません。描けるものがありません。",

      levels: {
        h3: "現在の価格と平均の位置関係",
        svgTitle: "現在価格と7日・30日平均を、価格軸上のマーカーとして配置した図",
        svgDesc: (trend, avg7, avg30) =>
          `現在のトレンド ${trend}。7日平均 ${avg7}。30日平均 ${avg30}。縦の基準線は、利用できるうち最も長い平均です。`,
        label: {
          trend: "現在のトレンド",
          avg7: "7日平均",
          avg30: "30日平均",
        },
        statVs7: "7日平均との差",
        statVs30: "30日平均との差",
        reading: {
          above: (pct, days) => `現在の価格は${days}日平均を${pct}上回っています。`,
          below: (pct, days) => `現在の価格は${days}日平均を${pct}下回っています。`,
          level: (days) => `現在の価格は${days}日平均とほぼ同じです。`,
        },
        windowsA: "7日平均と30日平均は、今日から過去にさかのぼって計算した",
        windowsEm: "期間の重なる窓",
        windowsB:
          "であり、連続した日の相場ではありません。だから価格軸上のマーカーとして置き、線でつないでいません。つなげば、存在しない履歴を捏造することになります。色は直近の値動きの向きを示すだけで、推奨ではありません。平均より高いことは、買うべきかどうかを何も語りません。",
        none: "最新の観測には価格を位置づけるだけの値がありません。少なくとも現在のトレンドと、2つの平均のうち1つが必要です。",
      },

      archive: {
        h3: "自前の日次観測",
        svgTitle: "自前の価格観測を時間軸上に、独立した点として描いた図",
        svgDesc: (n, s, from, to) =>
          `ユーロ建て Cardmarket トレンドの観測${s}件（${n === 1 ? from : `${from}から${to}まで`}）。点は線でつないでいません。`,
        none: "このカードにはユーロ建て価格の観測がまだ1件もありません。",
        foot: (_n, s, from, _archiveDays, archiveDaysStr, firstDay) =>
          `このカードの実測は${s}日分（${from}以降）です。自前のアーカイブは全体で${archiveDaysStr}日分（${firstDay}以降）しかなく、それ以前のデータはありません。`,
        noLine: (_n, s) =>
          `点と点は線でつないでいません。${s}件の観測で引いたトレンド線は、測定ではなく絵にすぎないからです。`,
      },

      table: {
        summary: "同じ数値を表で見る",
        capLevels: "現在価格と提供元の平均",
        capArchive: "自前の観測",
        thWhat: "項目",
        thValue: "値",
        thVsRef: "基準との差",
        thDate: "日付",
      },
    },

    footer: {
      before: "各シグナルの計算方法・しきい値・限界については",
      link: "算出方法",
      after: "をご覧ください。",
    },

    headline: {
      cohortPct: (p) => `パーセンタイル ${p}`,
      artistPremium: (v) => `1.00 中 ${v}`,
      jpEnRatio: (v) => `×${v}`,
      euUsArb: (v) => `純 ${v}`,
      investScore: (v) => `${v} z`,
    },

    priceUsed: "計算に用いた価格",

    investScore: {
      noBreakdown: "この銘柄では構成要素ごとの内訳を取得できません。",
      explain: (_n, s) =>
        `4つのシグナルのうち${s}件で構成しています。このカードに存在しないシグナルは平均に含めません。ゼロとして数えることもしません。各要素は符号を揃えた z スコアで、正の値はずれを後押しすることを意味します。この合成値は収益の予測ではありません。検証できる時系列が存在しないからです。同種のカードに支払われている価格から、このカードが今日どれだけ離れているかを測る指標です。`,
    },

    roundtrip: {
      breakeven: "損益分岐に必要な値上がり",
      investableUniverse: "投資対象（25%以下）に該当",
      yes: "該当",
      no: "非該当",
      explain: (instruments, investable) =>
        `手数料と送料は固定費です。カードが安くなっても下がらないため、少額の価格ではその割合が非常に大きくなります。カタログの${instruments}銘柄のうち、25%を下回るのは${investable}件だけです。この水準を超えるカードは、集めることはできても、売買で利益を出すことはできません。`,
    },

    cohort: {
      label: "同群",
      size: "同群内の銘柄数",
      cohortLabel: (set, rarity, lang) => `${set}・${rarity}・${lang}`,
      top: "同群（同じセット・同じレアリティ・同じ言語）で最も高いカードです。",
      bottom: "同群（同じセット・同じレアリティ・同じ言語）で最も安いカードです。",
      middle: (p) =>
        `同群（同じセット・同じレアリティ・同じ言語）の${p}%より高い価格で取引されています。`,
      caveatA: "パーセンタイルが低いということは",
      caveatEm: "同種のカードに比べて割安",
      caveatB: "だという意味であって、その理由までは示しません。単に人気が低いという真っ当な理由の場合もあります。",
      noisy: (_n, s) =>
        `同群が${s}件しかないため、このパーセンタイルは不安定です。1枚増減するだけで結果が数ポイント動きます。`,
    },

    analogs: {
      h2: "類似カードの中での価格位置",
      help: "これは評価の文脈です。比較可能なカードの中で今日の価格がどこに位置するかを示すもので、今後の値動きについては何も述べません。",
      intro: (_n, s, p25, p75) =>
        `このカードに最も近い${s}枚は、${p25} から ${p75} の間（p25–p75）で取引されています。`,
      criteria: (lang, rarity, yearFrom, yearTo) =>
        `「近い」の定義は、同じ言語（${lang}）、同じレアリティ（${rarity}）、近い時代（${yearFrom}年〜${yearTo}年のセット）です。`,
      p25: "同群の p25",
      median: "同群の中央値",
      p75: "同群の p75",
      thisCard: (percentile) => `このカード・パーセンタイル ${percentile}`,
      closest: (_n, s) => `価格が最も近い${s}枚`,
    },

    artist: {
      cardCount: "カタログ内の担当枚数",
      reliability: "シグナル全体の信頼度",
      someone: "このイラストレーター",
      explain: (artist, percentile) =>
        `${artist}のカードは、各同群内で平均してパーセンタイル ${percentile} に位置します（標本数による補正済み）。担当枚数の少ないイラストレーターが偶然で上位に来ないよう、中立の 0.50 に引き寄せられます。`,
      reliabilityNote: (share) =>
        `分散分解では、イラストレーターに ${share} の信頼度が割り当てられます。これはシグナル全体の数値で、すべてのイラストレーターに共通です。このイラストレーター個人の確からしさを示すものではありません。残りはセット・レアリティ・ノイズで説明されます。`,
    },

    jpEn: {
      thEnglish: "英語版",
      thJapanese: "日本語版",
      rowCard: "カード",
      rowSet: "セット",
      rowPrice: "価格",
      ratio: "日本語版 ÷ 英語版",
      gap: "2つの版の発売日の差",
      sameDay: "同日発売",
      days: (_n, s) => `${s}日`,
      timesAbove: (x) => `日本語版は英語版の ${x} 倍の価格で取引されています。`,
      pctAbove: (x) => `日本語版は英語版より ${x}% 高い価格で取引されています。`,
      pctOf: (x) => `日本語版は英語版の ${x}% の価格で取引されています。`,
      equal: "両者は同じ価格で取引されています。",
      why: (pairs) =>
        `両者を比べるのは、${pairs}件の対応ペアで日本市場が英語圏より中央値56日（p25 49、p75 83）先行しているからです。ペアを見る根拠にはなりますが、価格が収束する保証ではありません。印刷枚数も買い手も異なる、別の商品です。`,
      extreme:
        "これほどの差が市場の歪みであることはまれです。多くの場合、対応付けが同等でない（仕様・状態・印刷が異なる）か、どちらかの価格がごく少数の取引によるものです。鵜呑みにせず、手作業で確認してください。",
    },

    euUs: {
      cmEu: "Cardmarket（欧州）",
      tcgUs: "TCGplayer（米国）",
      tcgConverted: "TCGplayer（換算後）",
      fx: "為替レート",
      fxValue: (rate) => `1 € = ${rate} $`,
      gross: "総スプレッド（ユーロ換算の米国価格 対 欧州価格）",
      net: "純スプレッド",
      direction: {
        "comprar en EU, vender en US": "欧州で買い、米国で売る",
        "comprar en US, vender en EU": "米国で買い、欧州で売る",
      },
      explain: (arbs) =>
        `2つの市場の価格差から、ユーロに換算したうえで手数料と送料を差し引いて残った分です。総スプレッドの符号はどちらが安いかを示すだけで、負なら TCGplayer が Cardmarket より安く、その場合は米国で買うことになります。方向は符号ではなくタグが示します。純スプレッドが常に正なのは、コストを差し引いても残る${arbs}件だけを保存しているためです。実際の取引にそのまま当てはめないでください。関税、輸入時の付加価値税、封筒が大西洋を渡る間に為替が動くリスクは含まれていません。`,
      extreme:
        "これほど大きな純スプレッドが、そのまま拾える利益であることはほとんどありません。通常は両市場が同じ商品を扱っていない（版・状態・印刷が異なる）か、どちらかの価格がごく少数の取引によるものです。売買の前にカードごとに確認してください。",
    },

    unknown: {
      value: "値",
      explainA:
        "このシグナルは画面側の辞書に登録されていません。説明を捏造しないよう、内容をそのまま表示します。銘柄 ",
      explainB: "。",
    },
  },
};

export const cards: Dict<CardsDict> = { es, en, ja };
