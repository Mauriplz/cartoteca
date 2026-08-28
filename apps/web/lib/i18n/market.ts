import type { Dict } from "./index";

/**
 * Texto de la pantalla "Mercado hoy" (/mercado).
 *
 * Convenciones (las mismas del resto de diccionarios):
 * - Todo lo que interpola datos es una FUNCION; los numeros y fechas llegan ya
 *   formateados por makeFormatters(locale). Cuando hay que decidir plural, la
 *   funcion recibe ademas el numero crudo.
 * - El espanol define la interfaz; ingles y japones se tipan contra el.
 * - No se traducen los datos: nombres de carta, de set ni de fuente.
 *
 * Reglas de honestidad que este texto custodia:
 * - El indice tiene pocos puntos y se dice ("dia N del indice"), no se disimula.
 * - Los movers son variacion entre NUESTRAS capturas de una marca suavizada de
 *   la fuente: el titular lleva las dos fechas y el intervalo, jamas "hoy".
 * - Nada de "va a subir" ni "recomendado": se movio, cotiza, desajuste.
 */
export interface MarketDict {
  meta: { title: string; description: string };
  h1: string;
  /** Fecha de la ultima captura del archivo. */
  sub: (date: string) => string;

  index: {
    title: string;
    /** Contador que celebra que esto acaba de empezar: "dia N del indice". */
    day: (n: string) => string;
    base: (date: string) => string;
    /** Intervalo real del ultimo punto. `n` crudo para el plural. */
    interval: (from: string, to: string, days: string, n: number) => string;
    sinceBase: string;
    constituents: (n: string) => string;
    /** Nombre de cada segmento; la clave es el valor literal del almacen. */
    segment: Record<string, string>;
    /** Rotulo de la franja de puntos: fechados y SIN interpolar. */
    pointsLabel: string;
    pointTitle: (date: string, value: string) => string;
    baseLine: string;
    /** Con muy pocos puntos no hay linea que dibujar, y se dice. */
    note: string;
    methodology: string;
  };

  movers: {
    title: string;
    /** El titular obligatorio: desde nuestra ultima captura, con fechas e intervalo. */
    header: (from: string, to: string, days: string, n: number) => string;
    up: string;
    down: string;
    /** Intervalo visible en CADA fila. */
    rowInterval: (from: string, to: string, days: string, n: number) => string;
    empty: string;
    /** Etiqueta corta sobre la miniatura cuando la ilustracion no es propia. */
    borrowedTag: (langTag: string) => string;
    cardLink: string;
    /** Que es esta cifra y que filtros lleva. `artifacts` es null si no se pudo contar. */
    footnote: (artifacts: string | null) => string;
  };

  life: {
    title: string;
    intro: string;
    /** El sesgo de supervivencia, declarado en una frase. */
    bias: string;
    year: string;
    median: string;
    count: string;
    rowTitle: (year: string, median: string, n: string) => string;
  };

  quality: {
    title: string;
    /** Dias de archivo con la lista de fechas (pocas) o el rango (muchas). */
    daysList: (n: string, rawN: number, list: string) => string;
    daysRange: (n: string, first: string, last: string) => string;
    coverage: (present: string, declared: string, pct: string) => string;
    emptySets: (n: string) => string;
    gapsTitle: string;
    set: string;
    declared: string;
    present: string;
    missing: string;
    methodology: string;
  };
}

const es: MarketDict = {
  meta: {
    title: "Mercado hoy — Cartoteca",
    description:
      "El Índice Cartoteca por segmentos, los movimientos entre nuestras capturas, la curva de vida por año de edición y la calidad de los datos.",
  },
  h1: "Mercado hoy",
  sub: (date) =>
    `Última captura del archivo: ${date}. Sin previsiones: lo que se midió, con su fecha.`,

  index: {
    title: "El Índice Cartoteca",
    day: (n) => `día ${n} del índice — la serie crece con cada captura`,
    base: (date) => `Base 100 el ${date}`,
    interval: (from, to, days, n) => `${from} → ${to} · ${days} ${n === 1 ? "día" : "días"}`,
    sinceBase: "desde la base",
    constituents: (n) => `${n} constituyentes`,
    segment: {
      TOTAL: "Total",
      "EN-vintage": "Inglés · vintage",
      "EN-moderno": "Inglés · moderno",
      JA: "Japonés",
    },
    pointsLabel: "Puntos de la serie, fechados y sin interpolar",
    pointTitle: (date, value) => `${date}: ${value}`,
    baseLine: "base 100",
    note:
      "Con dos observaciones no se dibuja una línea de tendencia: se muestran los valores con su fecha y su intervalo real. La gráfica llegará cuando el archivo la sostenga.",
    methodology: "Metodología del índice (index_v1, congelada)",
  },

  movers: {
    title: "Movimientos",
    header: (from, to, days, n) =>
      `Desde nuestra última captura (${from} → ${to}, ${days} ${n === 1 ? "día" : "días"})`,
    up: "Suben",
    down: "Bajan",
    rowInterval: (from, to, days, n) =>
      `${from} → ${to} · ${days} ${n === 1 ? "día" : "días"}`,
    empty: "Ningún movimiento supera los filtros en esta captura.",
    borrowedTag: (langTag) => `il. ${langTag}`,
    cardLink: "Abrir la ficha de este instrumento",
    footnote: (artifacts) =>
      "Variación de la marca de tendencia suavizada que publica la fuente (Cardmarket) entre nuestras dos observaciones; no es el precio de una venta ni un movimiento «de hoy». " +
      "Filtros aplicados: precio previo ≥ 15 € en el momento de la captura, sin instrumentos que despiertan tras un silencio de la fuente y sin artefactos de marca" +
      (artifacts ? ` (${artifacts} excluidos en esta captura)` : "") +
      ". Nunca anualizamos la variación de un intervalo de días.",
  },

  life: {
    title: "Curva de vida por año de edición",
    intro:
      "Mediana del precio actual de los instrumentos con precio, agrupados por el año de salida de su edición.",
    bias:
      "Sesgo de supervivencia declarado: de los años viejos solo siguen cotizando las cartas que alguien conservó, así que la mediana mide lo que sobrevivió, no lo que se vendía entonces.",
    year: "Año",
    median: "Mediana",
    count: "con precio",
    rowTitle: (year, median, n) =>
      `${year}: mediana de ${median} sobre ${n} instrumentos con precio`,
  },

  quality: {
    title: "Calidad de los datos",
    daysList: (n, rawN, list) => `${n} ${rawN === 1 ? "día" : "días"} de archivo: ${list}`,
    daysRange: (n, first, last) => `${n} días de archivo, de ${first} a ${last}`,
    coverage: (present, declared, pct) =>
      `${present} cartas presentes de las ${declared} que declara la fuente (${pct})`,
    emptySets: (n) => `${n} ediciones declaradas y sin ninguna carta publicada`,
    gapsTitle: "Los 5 sets con mayor hueco declarado vs. presente",
    set: "Set",
    declared: "Declaradas",
    present: "Presentes",
    missing: "Faltan",
    methodology: "Cómo medimos y qué no sabemos → metodología",
  },
};

const en: MarketDict = {
  meta: {
    title: "Market today — Cartoteca",
    description:
      "The Cartoteca Index by segment, movers between our captures, the life curve by edition year and the state of the data.",
  },
  h1: "Market today",
  sub: (date) =>
    `Latest archive capture: ${date}. No forecasts: what was measured, with its date.`,

  index: {
    title: "The Cartoteca Index",
    day: (n) => `day ${n} of the index — the series grows with every capture`,
    base: (date) => `Base 100 on ${date}`,
    interval: (from, to, days, n) => `${from} → ${to} · ${days} ${n === 1 ? "day" : "days"}`,
    sinceBase: "since base",
    constituents: (n) => `${n} constituents`,
    segment: {
      TOTAL: "Total",
      "EN-vintage": "English · vintage",
      "EN-moderno": "English · modern",
      JA: "Japanese",
    },
    pointsLabel: "Series points, dated and not interpolated",
    pointTitle: (date, value) => `${date}: ${value}`,
    baseLine: "base 100",
    note:
      "Two observations do not make a trend line: values are shown with their date and their real interval. The chart will come when the archive can support it.",
    methodology: "Index methodology (index_v1, frozen)",
  },

  movers: {
    title: "Movers",
    header: (from, to, days, n) =>
      `Since our last capture (${from} → ${to}, ${days} ${n === 1 ? "day" : "days"})`,
    up: "Up",
    down: "Down",
    rowInterval: (from, to, days, n) =>
      `${from} → ${to} · ${days} ${n === 1 ? "day" : "days"}`,
    empty: "No move clears the filters in this capture.",
    borrowedTag: (langTag) => `art ${langTag}`,
    cardLink: "Open this instrument's page",
    footnote: (artifacts) =>
      "Change in the smoothed trend mark published by the source (Cardmarket) between our two observations; it is not a sale price, nor a \"today\" move. " +
      "Filters applied: previous price ≥ €15 at capture time, no instruments waking up after source silence, and no source artifacts" +
      (artifacts ? ` (${artifacts} excluded in this capture)` : "") +
      ". We never annualize the change over an interval of days.",
  },

  life: {
    title: "Life curve by edition year",
    intro:
      "Median current price of priced instruments, grouped by their edition's release year.",
    bias:
      "Survivorship bias, declared: for old years only the cards someone preserved still trade, so the median measures what survived, not what sold back then.",
    year: "Year",
    median: "Median",
    count: "priced",
    rowTitle: (year, median, n) =>
      `${year}: median of ${median} across ${n} priced instruments`,
  },

  quality: {
    title: "Data quality",
    daysList: (n, rawN, list) => `${n} archive ${rawN === 1 ? "day" : "days"}: ${list}`,
    daysRange: (n, first, last) => `${n} archive days, from ${first} to ${last}`,
    coverage: (present, declared, pct) =>
      `${present} cards present out of the ${declared} the source declares (${pct})`,
    emptySets: (n) => `${n} editions declared with no card published`,
    gapsTitle: "The 5 sets with the largest declared-vs-present gap",
    set: "Set",
    declared: "Declared",
    present: "Present",
    missing: "Missing",
    methodology: "How we measure and what we don't know → methodology",
  },
};

const ja: MarketDict = {
  meta: {
    title: "今日の市場 — Cartoteca",
    description:
      "セグメント別の Cartoteca 指数、取得間の値動き、発行年別のライフカーブ、データ品質。",
  },
  h1: "今日の市場",
  sub: (date) =>
    `アーカイブの最新取得: ${date}。予測はしません。測ったものを、その日付とともに示します。`,

  index: {
    title: "Cartoteca 指数",
    day: (n) => `指数 ${n} 日目 — 系列は取得のたびに伸びていきます`,
    base: (date) => `${date} を基準値 100 とする`,
    interval: (from, to, days) => `${from} → ${to}・${days}日間`,
    sinceBase: "基準比",
    constituents: (n) => `構成銘柄 ${n} 件`,
    segment: {
      TOTAL: "総合",
      "EN-vintage": "英語版・ヴィンテージ",
      "EN-moderno": "英語版・モダン",
      JA: "日本語版",
    },
    pointsLabel: "系列の観測点(日付つき・補間なし)",
    pointTitle: (date, value) => `${date}: ${value}`,
    baseLine: "基準 100",
    note:
      "観測が2回ではトレンドラインは引けません。各値を日付と実際の間隔とともに示します。グラフはアーカイブが育ってからです。",
    methodology: "指数の算出方法(index_v1、凍結済み)",
  },

  movers: {
    title: "値動き",
    header: (from, to, days) => `前回の取得から(${from} → ${to}、${days}日間)`,
    up: "上昇",
    down: "下落",
    rowInterval: (from, to, days) => `${from} → ${to}・${days}日間`,
    empty: "この取得ではフィルタを満たす値動きがありません。",
    borrowedTag: (langTag) => `図版 ${langTag}`,
    cardLink: "この銘柄のページを開く",
    footnote: (artifacts) =>
      "情報源(Cardmarket)が公開する平滑化されたトレンド値が、当サイトの2回の観測の間でどう動いたかです。実際の売買価格でも「今日の」値動きでもありません。" +
      "適用フィルタ: 取得時点の前回価格 15 € 以上、情報源の沈黙後に目覚めた銘柄を除外、情報源側のアーティファクトを除外" +
      (artifacts ? `(今回の取得で ${artifacts} 件除外)` : "") +
      "。日数間隔の変化を年率換算することはありません。",
  },

  life: {
    title: "発行年別のライフカーブ",
    intro: "価格のある銘柄の現在価格の中央値を、エディションの発売年ごとに集計。",
    bias:
      "生存バイアスを明記します。古い年について今も値が付くのは誰かが保存したカードだけなので、中央値は生き残ったものを測っており、当時売られていたものを測ってはいません。",
    year: "年",
    median: "中央値",
    count: "価格あり",
    rowTitle: (year, median, n) => `${year}年: 価格のある ${n} 銘柄の中央値 ${median}`,
  },

  quality: {
    title: "データ品質",
    daysList: (n, _rawN, list) => `アーカイブ ${n} 日分: ${list}`,
    daysRange: (n, first, last) => `アーカイブ ${n} 日分(${first} 〜 ${last})`,
    coverage: (present, declared, pct) =>
      `情報源が宣言する ${declared} 枚のうち ${present} 枚を収録(${pct})`,
    emptySets: (n) => `${n} エディションが宣言のみでカード未公開`,
    gapsTitle: "宣言と収録の差が大きい5セット",
    set: "セット",
    declared: "宣言",
    present: "収録",
    missing: "不足",
    methodology: "測り方と、わかっていないこと → 算出方法",
  },
};

export const market: Dict<MarketDict> = { es, en, ja };
