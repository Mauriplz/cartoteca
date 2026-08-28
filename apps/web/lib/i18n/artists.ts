import type { Dict } from "./index";

/**
 * Pagina de la prima del ilustrador.
 *
 * El espanol es la referencia: la interfaz se define sobre el y las otras dos
 * traducciones se tipan contra ella, asi que olvidar una clave es un error de
 * compilacion y no un hueco en produccion.
 *
 * Todo texto que lleve dato dentro es una funcion, nunca una plantilla con
 * marcadores: el japones coloca la cifra en otro sitio de la frase y con una
 * plantilla habria que romper la gramatica para conseguirlo.
 */

/**
 * Fragmento de texto con enfasis opcional. Permite que cada idioma decida donde
 * cae el termino resaltado, la formula o la cursiva sin que la pagina imponga un
 * orden de palabras. La pagina lo pinta con <Rich>.
 */
export type Chunk = string | { b: string } | { em: string } | { code: string };

export interface ArtistsDict {
  meta: { title: string; description: string };
  h1: string;
  sub: string;

  empty: {
    /** Ningun ilustrador llega al umbral pedido. */
    none: (min: number) => string;
    tryLower: string;
  };

  stats: {
    artists: string;
    instruments: string;
    reliability: string;
    range: string;
    min: string;
  };

  how: {
    title: string;
    intro: string;
    step1: { title: string; body: readonly Chunk[] };
    step2: { title: string; body: readonly Chunk[] };
    step3: {
      title: string;
      body: readonly Chunk[];
      /** Recorrido de la columna de peso en la tabla que se esta viendo. */
      weights: (lo: string, hi: string) => string;
    };
    step4: {
      title: string;
      body: (reliability: string) => readonly Chunk[];
      unavailable: string;
    };
  };

  level: {
    lead: string;
    body: readonly Chunk[];
    buyable: (investable: string, priced: string, share: string | null) => readonly Chunk[];
  };

  controls: {
    minLabel: string;
    nAtLeast: (n: number) => string;
    sortHint: (count: string) => string;
  };

  table: {
    rank: string;
    artist: string;
    n: string;
    nTitle: string;
    raw: string;
    rawTitle: string;
    shrunk: string;
    shrunkTitle: string;
    deviation: string;
    weight: string;
    weightTitle: string;
    explore: string;
    see: string;
  };

  /** Nota de cierre. Recibe la antiguedad del archivo ya redactada y la fecha. */
  extremes: (days: string, date: string) => readonly Chunk[];
  /** "2 dias" / "2 days" / "2日": el recuento ya formateado mas su unidad. */
  days: (n: number, text: string) => string;
  methodology: string;

  /**
   * Percentiles a tres decimales. makeFormatters no tiene variante de tres
   * decimales y 0,500 es la base neutra de todo el sistema: tiene que verse
   * siempre con sus tres cifras, y con el separador decimal de cada idioma.
   */
  fmt: { p3: (v: number) => string; signed: (v: number) => string };
}

function fmtFor(tag: string): ArtistsDict["fmt"] {
  const p3 = new Intl.NumberFormat(tag, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return {
    p3: (v) => p3.format(v),
    signed: (v) => `${v >= 0.5 ? "+" : "−"}${p3.format(Math.abs(v - 0.5))}`,
  };
}

const es: ArtistsDict = {
  meta: {
    title: "Prima del ilustrador — Cartoteca",
    description:
      "Posición media que alcanzan las cartas de cada ilustrador dentro de su propia cohorte de set y rareza, corregida por tamaño de muestra.",
  },
  h1: "Prima del ilustrador",
  sub: "Qué posición ocupan, de media, las cartas de cada ilustrador dentro de su propia cohorte de set y rareza. Base neutra 0,500: por encima, sus cartas cotizan en la mitad alta de las cohortes en las que aparecen; por debajo, en la mitad baja.",

  empty: {
    none: (min) => `Ningún ilustrador alcanza el umbral de ${min} instrumentos con percentil de cohorte.`,
    tryLower: "Prueba con un umbral menor:",
  },

  stats: {
    artists: "Ilustradores medidos",
    instruments: "Instrumentos en la medida",
    reliability: "Fiabilidad de la señal",
    range: "Rango ajustado observado",
    min: "Mínimo de instrumentos",
  },

  how: {
    title: "Cómo se calcula, y por qué así",
    intro:
      "Ordenar ilustradores por el precio medio de sus cartas no mide su prima: mide qué cartas les asignan. Quien solo dibuja secret rares aparecería como un genio por serlo. El cálculo elimina esa confusión en cuatro pasos.",
    step1: {
      title: "Percentil dentro de la cohorte.",
      body: [
        "Cada instrumento con precio recibe su percentil de precio dentro de su cohorte de idioma + set + rareza, exigiendo al menos cuatro instrumentos en la cohorte. Comparar una ",
        { em: "illustration rare" },
        " de un set de 2025 solo contra otras ",
        { em: "illustration rare" },
        " de ese mismo set controla a la vez la rareza y la edición, que son los dos confusores obvios.",
      ],
    },
    step2: {
      title: "Media por ilustrador.",
      body: [
        "Se promedian los percentiles de todos sus instrumentos. Es la columna ",
        { em: "bruta" },
        ". Solo entran ilustradores con al menos 30 instrumentos con percentil.",
      ],
    },
    step3: {
      title: "Corrección por tamaño de muestra (shrinkage).",
      body: [
        "Un ilustrador con 30 cartas tiene una media mucho más ruidosa que uno con 400, y no deben pesar igual en un ranking. Cada media se acerca a la base neutra en proporción a su ruido: ",
        { code: "ajustada = 0,500 + w × (bruta − 0,500)" },
        " con ",
        { code: "w = var_señal / (var_señal + var_del_ilustrador / n)" },
        ". Cuanta menos obra medida y más dispersa, más se acerca a 0,500. La columna ",
        { em: "peso" },
        " es esa w: ",
      ],
      weights: (lo, hi) => `va del ${lo} al ${hi} en esta tabla.`,
    },
    step4: {
      title: "Fiabilidad de la señal.",
      body: (reliability) => [
        "Descomposición de varianza: se resta a la varianza entre medias observadas la parte atribuible al ruido de muestreo. Lo que queda es señal real. Medido hoy: ",
        { b: reliability },
        " de la varianza entre ilustradores es diferencia genuina, no azar de muestreo.",
      ],
      unavailable: "no disponible",
    },
  },

  level: {
    lead: "Esta tabla explica el nivel de precio, no da ventaja por sí sola.",
    body: [
      " La prima del ilustrador ya está dentro del precio de mercado de hoy: comprar cartas de un ilustrador con prima alta no es una operación, es pagar por lo que todo el mundo ya ve. Donde la prima puede aportar algo es en la ",
      { b: "interacción" },
      ": una carta de un ilustrador con prima alta que además cotiza barata ",
      { em: "dentro de su propia cohorte" },
      ". Por eso la puntuación de inversión suma el percentil de cohorte con signo negativo y la prima del ilustrador con signo positivo, en vez de usar la prima sola. Es una hipótesis de construcción, no un resultado comprobado. ",
    ],
    buyable: (investable, priced, share) => [
      { b: "Y la carta tiene que ser comprable:" },
      ` solo ${investable} de los ${priced} instrumentos con precio${
        share === null ? "" : ` (${share})`
      } bajan del 25 % de coste de ida y vuelta. En el resto, los portes se comen cualquier desajuste que esta tabla pueda señalar.`,
    ],
  },

  controls: {
    minLabel: "Mínimo de instrumentos medidos:",
    nAtLeast: (n) => `n ≥ ${n}`,
    sortHint: (count) => `Cabeceras ordenables. ${count} ilustradores.`,
  },

  table: {
    rank: "#",
    artist: "Ilustrador",
    n: "Instrum.",
    nTitle: "Instrumentos con percentil de cohorte atribuidos al ilustrador",
    raw: "Bruta",
    rawTitle: "Media simple de los percentiles de cohorte, sin corregir",
    shrunk: "Ajustada",
    shrunkTitle: "Media corregida por tamaño de muestra",
    deviation: "Desvío sobre 0,500",
    weight: "Peso",
    weightTitle: "Cuánto pesa la media del ilustrador frente a la base neutra",
    explore: "Explorar",
    see: "ver →",
  },

  extremes: (days, date) => [
    { b: "Cómo leer los extremos." },
    " Un valor por debajo de 0,500 no significa que el ilustrador dibuje peor: significa que sus cartas tienden a ocupar la mitad baja de las cohortes en las que aparecen, algo que depende también de qué cartas le encargan dentro de cada rareza. ",
    { em: "Instrum." },
    ` cuenta instrumentos, no cartas: la versión holo, la reverse y la normal de la misma ilustración son precios distintos y cuentan por separado. Y la señal no tiene todavía validación contra retornos futuros: el archivo propio acumula ${days} desde el ${date}, así que lo que está medido es la fiabilidad de la `,
    { em: "medida" },
    ", no su capacidad de anticipar precios. ",
  ],
  days: (n, text) => `${text} ${n === 1 ? "día" : "días"}`,
  methodology: "Metodología completa →",

  fmt: fmtFor("es-ES"),
};

const en: ArtistsDict = {
  meta: {
    title: "Illustrator premium — Cartoteca",
    description:
      "The average position each illustrator's cards reach within their own set-and-rarity cohort, shrunk for sample size.",
  },
  h1: "Illustrator premium",
  sub: "Where each illustrator's cards sit, on average, within their own set-and-rarity cohort. Neutral baseline 0.500: above it, their cards trade in the upper half of the cohorts they appear in; below it, in the lower half.",

  empty: {
    none: (min) => `No illustrator reaches the threshold of ${min} instruments with a cohort percentile.`,
    tryLower: "Try a lower threshold:",
  },

  stats: {
    artists: "Illustrators measured",
    instruments: "Instruments behind the measure",
    reliability: "Signal reliability",
    range: "Observed shrunk range",
    min: "Minimum instruments",
  },

  how: {
    title: "How it is computed, and why this way",
    intro:
      "Ranking illustrators by the average price of their cards does not measure their premium: it measures which cards they get assigned. Someone who only draws secret rares would look like a genius for that reason alone. The calculation strips that confound out in four steps.",
    step1: {
      title: "Percentile within the cohort.",
      body: [
        "Every priced instrument gets its price percentile within its language + set + rarity cohort, requiring at least four instruments in the cohort. Comparing an ",
        { em: "illustration rare" },
        " from a 2025 set only against other ",
        { em: "illustration rare" },
        " cards from that same set controls for rarity and print run at once, which are the two obvious confounders.",
      ],
    },
    step2: {
      title: "Average per illustrator.",
      body: [
        "The percentiles of all their instruments are averaged. That is the ",
        { em: "raw" },
        " column. Only illustrators with at least 30 percentile-bearing instruments are included.",
      ],
    },
    step3: {
      title: "Sample-size correction (shrinkage).",
      body: [
        "An illustrator with 30 cards has a far noisier average than one with 400, and the two should not carry the same weight in a ranking. Each average is pulled toward the neutral baseline in proportion to its noise: ",
        { code: "shrunk = 0.500 + w × (raw − 0.500)" },
        " with ",
        { code: "w = var_signal / (var_signal + var_illustrator / n)" },
        ". The less work measured and the more scattered it is, the closer to 0.500. The ",
        { em: "weight" },
        " column is that w: ",
      ],
      weights: (lo, hi) => `it runs from ${lo} to ${hi} in this table.`,
    },
    step4: {
      title: "Signal reliability.",
      body: (reliability) => [
        "Variance decomposition: the share attributable to sampling noise is subtracted from the variance across observed averages. What is left is real signal. Measured today: ",
        { b: reliability },
        " of the variance across illustrators is genuine difference, not sampling luck.",
      ],
      unavailable: "not available",
    },
  },

  level: {
    lead: "This table explains the price level; on its own it is not an edge.",
    body: [
      " The illustrator premium is already inside today's market price: buying cards by a high-premium illustrator is not a trade, it is paying for what everyone can already see. Where the premium can add something is in the ",
      { b: "interaction" },
      ": a card by a high-premium illustrator that also trades cheap ",
      { em: "within its own cohort" },
      ". That is why the investment score adds the cohort percentile with a negative sign and the illustrator premium with a positive one, instead of using the premium on its own. It is a design hypothesis, not a proven result. ",
    ],
    buyable: (investable, priced, share) => [
      { b: "And the card has to be buyable:" },
      ` only ${investable} of the ${priced} priced instruments${
        share === null ? "" : ` (${share})`
      } come in under the 25% round-trip cost. For the rest, shipping eats any mispricing this table could point at.`,
    ],
  },

  controls: {
    minLabel: "Minimum instruments measured:",
    nAtLeast: (n) => `n ≥ ${n}`,
    sortHint: (count) => `Sortable headers. ${count} illustrators.`,
  },

  table: {
    rank: "#",
    artist: "Illustrator",
    n: "Instr.",
    nTitle: "Instruments with a cohort percentile attributed to this illustrator",
    raw: "Raw",
    rawTitle: "Plain average of the cohort percentiles, uncorrected",
    shrunk: "Shrunk",
    shrunkTitle: "Average corrected for sample size",
    deviation: "Deviation from 0.500",
    weight: "Weight",
    weightTitle: "How much the illustrator's own average counts against the neutral baseline",
    explore: "Explore",
    see: "view →",
  },

  extremes: (days, date) => [
    { b: "How to read the extremes." },
    " A value below 0.500 does not mean the illustrator draws worse: it means their cards tend to sit in the lower half of the cohorts they appear in, which also depends on which cards they are commissioned within each rarity. ",
    { em: "Instr." },
    ` counts instruments, not cards: the holo, the reverse and the normal version of the same artwork are separate prices and count separately. And the signal still has no validation against future returns: our own archive holds ${days} since ${date}, so what is measured is the reliability of the `,
    { em: "measurement" },
    ", not its ability to anticipate prices. ",
  ],
  days: (n, text) => `${text} ${n === 1 ? "day" : "days"}`,
  methodology: "Full methodology →",

  fmt: fmtFor("en-US"),
};

const ja: ArtistsDict = {
  meta: {
    title: "イラストレーター・プレミアム — Cartoteca",
    description:
      "各イラストレーターのカードが、同じセット・同じレアリティの群の中で平均してどの位置に来るか。標本数による補正済み。",
  },
  h1: "イラストレーター・プレミアム",
  sub: "各イラストレーターのカードが、同じセット・同じレアリティの群の中で平均してどの位置に来るか。中立基準は 0.500。これを上回れば、そのカードは属する群の上半分で取引されており、下回れば下半分にあるということ。",

  empty: {
    none: (min) => `群内パーセンタイルを持つ銘柄が ${min} 件という基準に達したイラストレーターはいません。`,
    tryLower: "基準を下げて試す:",
  },

  stats: {
    artists: "測定対象イラストレーター",
    instruments: "測定に用いた銘柄数",
    reliability: "シグナルの信頼度",
    range: "補正値の観測レンジ",
    min: "銘柄数の下限",
  },

  how: {
    title: "算出方法と、その理由",
    intro:
      "カードの平均価格でイラストレーターを並べても、プレミアムは測れない。測れるのは「どのカードを担当したか」でしかない。シークレットレアばかり描いていれば、それだけで天才に見えてしまう。この計算は、その交絡を四つの手順で取り除く。",
    step1: {
      title: "群内パーセンタイル。",
      body: [
        "価格のある銘柄それぞれに、言語・セット・レアリティが同じ群の中での価格パーセンタイルを与える。群には最低四つの銘柄を要求する。2025年のセットの ",
        { em: "illustration rare" },
        " を、同じセットの他の ",
        { em: "illustration rare" },
        " とだけ比べれば、レアリティと版という明らかな交絡を同時に抑えられる。",
      ],
    },
    step2: {
      title: "イラストレーターごとの平均。",
      body: [
        "そのイラストレーターの全銘柄のパーセンタイルを平均する。これが",
        { em: "素の値" },
        "の列。パーセンタイルを持つ銘柄が30件以上のイラストレーターだけを対象とする。",
      ],
    },
    step3: {
      title: "標本数による補正(縮小推定)。",
      body: [
        "銘柄が30件のイラストレーターの平均は、400件あるイラストレーターの平均よりはるかにぶれる。両者をランキングで同じ重みには扱えない。そこで各平均を、そのぶれの大きさに応じて中立基準へ引き寄せる: ",
        { code: "補正値 = 0.500 + w × (素の値 − 0.500)" },
        "、ここで ",
        { code: "w = シグナル分散 / (シグナル分散 + イラストレーター内分散 / n)" },
        "。測定できた銘柄が少なく、ばらつきが大きいほど 0.500 に近づく。",
        { em: "重み" },
        " の列がこの w にあたり、",
      ],
      weights: (lo, hi) => `この表では ${lo} から ${hi} の範囲にある。`,
    },
    step4: {
      title: "シグナルの信頼度。",
      body: (reliability) => [
        "分散分解による。観測された平均どうしの分散から、標本誤差に由来する分を差し引く。残ったものが本物のシグナルである。本日の測定では、イラストレーター間の分散のうち ",
        { b: reliability },
        " が偶然ではない実際の差だった。",
      ],
      unavailable: "測定不能",
    },
  },

  level: {
    lead: "この表が説明するのは価格の水準であって、それ自体が優位性になるわけではない。",
    body: [
      " イラストレーター・プレミアムは、すでに今日の市場価格に織り込まれている。プレミアムの高いイラストレーターのカードを買うのは売買判断ではなく、誰の目にも見えているものに対価を払っているだけだ。プレミアムが効いてくるのは",
      { b: "組み合わせ" },
      "の場面である。プレミアムの高いイラストレーターの作品でありながら、",
      { em: "自分が属する群の中では" },
      "割安に放置されているカード。投資スコアが群内パーセンタイルを負の符号で、イラストレーター・プレミアムを正の符号で足し合わせ、プレミアム単独では使わないのはこのためだ。これは設計上の仮説であって、検証済みの結論ではない。",
    ],
    buyable: (investable, priced, share) => [
      { b: "そして、そもそも買えるカードでなければならない。" },
      ` 価格のある銘柄 ${priced} 件のうち、往復コストが 25 % を下回るのはわずか ${investable} 件${
        share === null ? "" : `(${share})`
      }にすぎない。残りは、この表が示しうる価格のずれを送料がそのまま食い尽くす。`,
    ],
  },

  controls: {
    minLabel: "測定銘柄数の下限:",
    nAtLeast: (n) => `n ≥ ${n}`,
    sortHint: (count) => `見出しで並べ替えできます。${count} 名。`,
  },

  table: {
    rank: "#",
    artist: "イラストレーター",
    n: "銘柄数",
    nTitle: "そのイラストレーターに帰属する、群内パーセンタイルを持つ銘柄の数",
    raw: "素の値",
    rawTitle: "群内パーセンタイルの単純平均(補正なし)",
    shrunk: "補正値",
    shrunkTitle: "標本数で補正した平均",
    deviation: "0.500 からの乖離",
    weight: "重み",
    weightTitle: "中立基準に対して、そのイラストレーター自身の平均がどれだけ効くか",
    explore: "詳細",
    see: "見る →",
  },

  extremes: (days, date) => [
    { b: "両端の読み方。" },
    " 0.500 を下回るのは、そのイラストレーターの絵が劣るという意味ではない。属する群の下半分に位置しやすいという意味であり、それは各レアリティの中でどのカードを任されるかにも左右される。",
    { em: "銘柄数" },
    ` が数えているのはカードではなく銘柄だ。同じ絵柄でもホロ・リバース・ノーマルは別の価格として別々に数える。またこのシグナルは、将来のリターンに対する検証をまだ受けていない。自社アーカイブは${date}以降${days}しか蓄積されておらず、測れているのは`,
    { em: "測定そのもの" },
    "の信頼度であって、価格を先読みする能力ではない。",
  ],
  days: (n, text) => `${text}日`,
  methodology: "算出方法の全文 →",

  fmt: fmtFor("ja-JP"),
};

export const artists: Dict<ArtistsDict> = { es, en, ja };
