import type { Dict } from "./index";

/**
 * Texto de la capa del usuario: watchlist y cartera.
 *
 * Las dos viven en localStorage del navegador, sin cuenta y sin servidor, y la
 * interfaz esta obligada a decirlo: varias claves de este diccionario existen
 * solo para repetir "se guarda en este navegador" alla donde el usuario deposita
 * datos que cree estar guardando "en la web".
 *
 * Convenciones: las del resto de diccionarios. Lo que interpola datos es una
 * funcion que recibe cadenas ya formateadas por makeFormatters(locale); cuando
 * ademas hay que decidir un plural, se recibe el numero crudo junto a su cadena.
 */
export interface UserDict {
  watch: {
    /** Texto del boton cuando la carta NO esta vigilada. */
    add: string;
    /** Texto del boton cuando SI lo esta. */
    remove: string;
    /** Coletilla del title: la lista vive en este navegador. */
    savedNote: string;
  };
  watchlist: {
    title: string;
    intro: string;
    empty: string;
    loading: string;
    error: string;
    colCard: string;
    colPrice: string;
    /** Fecha de la marca a la que esta el precio mostrado. */
    markOf: (date: string) => string;
    remove: string;
    notFound: string;
    capped: (n: string) => string;
  };
  portfolio: {
    metaTitle: string;
    metaDescription: string;
    title: string;
    sub: string;
    /** Aviso principal: todo vive en este navegador, sin cuenta ni copia. */
    localNote: string;
    /** Explica las tres cifras y por que manda el neto. */
    costsNote: string;
    addTitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    searching: string;
    noResults: (q: string) => string;
    /** Precio actual de la carta elegida, a la ultima marca. */
    currentMark: (price: string) => string;
    noMark: string;
    qtyLabel: string;
    priceLabel: string;
    addButton: string;
    cancel: string;
    empty: string;
    table: {
      position: string;
      qty: string;
      buyPrice: string;
      cost: string;
      markValue: string;
      /** Advertencia pegada a la columna de valor: no es una venta real. */
      markValueNote: string;
      net: string;
      /** Que costes se restan para llegar al neto. */
      netNote: string;
      total: string;
      remove: string;
      noPrice: string;
      markOf: (date: string) => string;
      unpriced: (n: number, s: string) => string;
    };
  };
}

const es: UserDict = {
  watch: {
    add: "Vigilar esta carta",
    remove: "Dejar de vigilar",
    savedNote: "se guarda en este navegador",
  },
  watchlist: {
    title: "Cartas vigiladas",
    intro:
      "La lista se guarda solo en este navegador: sin cuenta y sin servidor. Si borras los datos de navegación, se pierde.",
    empty:
      "Aún no vigilas ninguna carta. Pulsa la estrella en la ficha de cualquier carta para añadirla; la lista se guarda solo en este navegador.",
    loading: "Cargando precios…",
    error: "No se pudieron cargar los precios. Vuelve a intentarlo.",
    colCard: "Carta",
    colPrice: "Precio a la última marca",
    markOf: (date) => `marca del ${date}`,
    remove: "Quitar",
    notFound: "Esta carta ya no está en el catálogo",
    capped: (n) => `La lista tiene ${n} cartas; se muestran las 100 primeras.`,
  },
  portfolio: {
    metaTitle: "Cartera — Cartoteca",
    metaDescription:
      "Cartera local de cartas Pokémon: coste, valor a la última marca y neto tras costes de venta. Todo se guarda en tu navegador, sin cuenta.",
    title: "Cartera",
    sub: "Tus posiciones, valoradas a la última marca de Cardmarket. Todo se guarda solo en este navegador.",
    localNote:
      "Esta cartera vive únicamente en este navegador (localStorage). No hay cuenta ni copia en ningún servidor: si borras los datos de navegación o cambias de dispositivo, no la verás.",
    costsNote:
      "Cada posición muestra tres cifras: el coste, el valor a la última marca —que no es una venta real: es la marca suavizada que publica Cardmarket— y el neto que quedaría tras el coste de ida y vuelta (5% de comisión y 7 EUR de portes por posición). La cifra que manda es el neto.",
    addTitle: "Añadir posición",
    searchLabel: "Buscar carta",
    searchPlaceholder: "Nombre, ilustrador o edición…",
    searching: "Buscando…",
    noResults: (q) => `Sin resultados para «${q}»`,
    currentMark: (price) => `cotiza a ${price} a la última marca`,
    noMark: "sin precio en EUR a la última marca",
    qtyLabel: "Unidades",
    priceLabel: "Precio de compra por unidad (EUR)",
    addButton: "Añadir a la cartera",
    cancel: "Cancelar",
    empty:
      "La cartera está vacía. Busca una carta arriba y apunta tu precio de compra: todo queda guardado solo en este navegador.",
    table: {
      position: "Posición",
      qty: "Uds.",
      buyPrice: "Compra/ud.",
      cost: "Coste",
      markValue: "Valor a la marca",
      markValueNote: "no es una venta real",
      net: "Neto tras costes",
      netNote: "−5% de comisión y −7 EUR de portes por posición",
      total: "Total",
      remove: "Quitar",
      noPrice: "sin precio en EUR",
      markOf: (date) => `marca del ${date}`,
      unpriced: (n, s) =>
        n === 1
          ? "1 posición sin precio en EUR no entra en el valor ni en el neto."
          : `${s} posiciones sin precio en EUR no entran en el valor ni en el neto.`,
    },
  },
};

const en: UserDict = {
  watch: {
    add: "Watch this card",
    remove: "Stop watching",
    savedNote: "saved in this browser",
  },
  watchlist: {
    title: "Watched cards",
    intro:
      "The list is saved only in this browser: no account, no server. Clearing your browsing data deletes it.",
    empty:
      "You are not watching any card yet. Press the star on any card page to add it; the list is saved only in this browser.",
    loading: "Loading prices…",
    error: "Prices could not be loaded. Please try again.",
    colCard: "Card",
    colPrice: "Price at the latest mark",
    markOf: (date) => `mark of ${date}`,
    remove: "Remove",
    notFound: "This card is no longer in the catalogue",
    capped: (n) => `The list holds ${n} cards; only the first 100 are shown.`,
  },
  portfolio: {
    metaTitle: "Portfolio — Cartoteca",
    metaDescription:
      "Local Pokémon card portfolio: cost, value at the latest mark, and net after selling costs. Everything is stored in your browser, no account.",
    title: "Portfolio",
    sub: "Your positions, valued at Cardmarket's latest mark. Everything is saved only in this browser.",
    localNote:
      "This portfolio lives only in this browser (localStorage). There is no account and no copy on any server: clear your browsing data or switch devices and it will not be there.",
    costsNote:
      "Each position shows three figures: the cost, the value at the latest mark — which is not a real sale: it is the smoothed mark Cardmarket publishes — and the net that would remain after the round-trip cost (5% commission plus 7 EUR shipping per position). The figure that matters is the net.",
    addTitle: "Add a position",
    searchLabel: "Search for a card",
    searchPlaceholder: "Name, illustrator or set…",
    searching: "Searching…",
    noResults: (q) => `No results for “${q}”`,
    currentMark: (price) => `quoted at ${price} at the latest mark`,
    noMark: "no EUR price at the latest mark",
    qtyLabel: "Quantity",
    priceLabel: "Purchase price per unit (EUR)",
    addButton: "Add to portfolio",
    cancel: "Cancel",
    empty:
      "The portfolio is empty. Search for a card above and record your purchase price: everything stays saved only in this browser.",
    table: {
      position: "Position",
      qty: "Qty",
      buyPrice: "Buy/unit",
      cost: "Cost",
      markValue: "Value at the mark",
      markValueNote: "not a real sale",
      net: "Net after costs",
      netNote: "−5% commission and −7 EUR shipping per position",
      total: "Total",
      remove: "Remove",
      noPrice: "no EUR price",
      markOf: (date) => `mark of ${date}`,
      unpriced: (n, s) =>
        n === 1
          ? "1 position without a EUR price is excluded from value and net."
          : `${s} positions without a EUR price are excluded from value and net.`,
    },
  },
};

const ja: UserDict = {
  watch: {
    add: "このカードをウォッチ",
    remove: "ウォッチを解除",
    savedNote: "このブラウザにのみ保存されます",
  },
  watchlist: {
    title: "ウォッチ中のカード",
    intro:
      "このリストはこのブラウザにのみ保存されます。アカウントもサーバーもありません。閲覧データを消すと失われます。",
    empty:
      "まだウォッチ中のカードはありません。カードのページで星を押すと追加できます。リストはこのブラウザにのみ保存されます。",
    loading: "価格を読み込み中…",
    error: "価格を読み込めませんでした。もう一度お試しください。",
    colCard: "カード",
    colPrice: "最新マークの価格",
    markOf: (date) => `${date}のマーク`,
    remove: "外す",
    notFound: "このカードはカタログにありません",
    capped: (n) => `リストには${n}枚ありますが、表示は先頭の100枚のみです。`,
  },
  portfolio: {
    metaTitle: "ポートフォリオ — Cartoteca",
    metaDescription:
      "ローカルのポケモンカード・ポートフォリオ。取得コスト、最新マークでの評価額、売却コスト控除後の手取りを表示。データはこのブラウザにのみ保存されます。",
    title: "ポートフォリオ",
    sub: "保有ポジションを Cardmarket の最新マークで評価します。すべてこのブラウザにのみ保存されます。",
    localNote:
      "このポートフォリオはこのブラウザ(localStorage)だけに存在します。アカウントもサーバー上のコピーもありません。閲覧データを消したり別の端末を使ったりすると表示されません。",
    costsNote:
      "各ポジションは3つの数字を表示します。取得コスト、最新マークでの評価額(実際の売却ではなく、Cardmarket が公表する平滑化されたマークです)、そして往復コスト(手数料5%と送料7 EUR/ポジション)控除後の手取りです。基準になるのは手取りです。",
    addTitle: "ポジションを追加",
    searchLabel: "カードを検索",
    searchPlaceholder: "カード名・イラストレーター・セット…",
    searching: "検索中…",
    noResults: (q) => `「${q}」に一致するカードはありません`,
    currentMark: (price) => `最新マークで ${price}`,
    noMark: "最新マークにEUR価格がありません",
    qtyLabel: "枚数",
    priceLabel: "購入価格(EUR/枚)",
    addButton: "ポートフォリオに追加",
    cancel: "キャンセル",
    empty:
      "ポートフォリオは空です。上でカードを検索して購入価格を登録してください。すべてこのブラウザにのみ保存されます。",
    table: {
      position: "ポジション",
      qty: "枚数",
      buyPrice: "購入/枚",
      cost: "コスト",
      markValue: "マーク評価額",
      markValueNote: "実際の売却ではありません",
      net: "コスト控除後の手取り",
      netNote: "手数料5%と送料7 EUR/ポジションを控除",
      total: "合計",
      remove: "削除",
      noPrice: "EUR価格なし",
      markOf: (date) => `${date}のマーク`,
      unpriced: (_n, s) =>
        `EUR価格のない${s}件のポジションは評価額と手取りに含まれていません。`,
    },
  },
};

export const user: Dict<UserDict> = { es, en, ja };
