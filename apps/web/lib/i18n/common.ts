import type { Dict } from "./index";

/**
 * Texto compartido: navegacion, etiquetas de senal, variantes e idiomas.
 * El espanol es la referencia; las demas se tipan contra el.
 */
export interface CommonDict {
  brand: { a: string; b: string };
  nav: { ranking: string; cards: string; artists: string; methodology: string };
  langName: { en: string; ja: string };
  variant: Record<string, string>;
  variantNone: string;
  signal: Record<string, { label: string; help: string }>;
  noImage: string;
  noData: string;
  artwork: {
    /** La ilustracion viene de otra edicion: es OTRO objeto fisico y hay que decirlo. */
    borrowed: (lang: string) => string;
    /** La imagen procede de una fuente externa. Misma carta, solo se anota de donde. */
    external: (source: string) => string;
    none: string;
  };
}

const es: CommonDict = {
  brand: { a: "Carto", b: "teca" },
  nav: { ranking: "Ranking", cards: "Cartas", artists: "Ilustradores", methodology: "Metodología" },
  langName: { en: "Inglés", ja: "Japonés" },
  variant: {
    holo: "Holo", normal: "Normal", reverse: "Reverse", firstEdition: "1ª edición",
    wPromo: "Promo", lenticular: "Lenticular", metal: "Metal",
  },
  variantNone: "Sin variante",
  signal: {
    cohort_pct: {
      label: "Posición en su cohorte",
      help: "Percentil del precio dentro de su mismo set y rareza. Bajo significa barata respecto a sus pares.",
    },
    artist_premium: {
      label: "Prima del ilustrador",
      help: "Posición media que alcanzan las cartas de este ilustrador dentro de sus cohortes, corregida por el tamaño de la muestra. 0,50 es neutro.",
    },
    jp_en_ratio: {
      label: "Ratio Japón / Inglés",
      help: "Precio de la versión japonesa dividido por el de la inglesa. El mercado japonés se adelanta unos 56 días de mediana.",
    },
    eu_us_arb: {
      label: "Arbitraje Europa / EE. UU.",
      help: "Diferencial entre Cardmarket y TCGplayer que sobrevive al tipo de cambio y a los costes de ida y vuelta.",
    },
    roundtrip_cost: {
      label: "Coste de ida y vuelta",
      help: "Fracción del precio que se pierde al comprar y volver a vender, incluyendo comisión y portes. Los portes son un coste fijo, así que las cartas baratas son ininvertibles.",
    },
    invest_score: {
      label: "Puntuación de inversión",
      help: "Combinación de las señales anteriores en z-scores, con pesos iguales. Mide desajuste observable hoy; no es una previsión validada.",
    },
  },
  noImage: "TCGdex no publica imagen de esta carta",
  noData: "sin dato",
  artwork: {
    borrowed: (lang) => `Ilustración de la edición en ${lang.toLowerCase()}`,
    external: (source) => `Imagen de ${source}`,
    none: "No hay ilustración disponible de esta carta en ninguna de nuestras fuentes",
  },
};

const en: CommonDict = {
  brand: { a: "Carto", b: "teca" },
  nav: { ranking: "Ranking", cards: "Cards", artists: "Illustrators", methodology: "Methodology" },
  langName: { en: "English", ja: "Japanese" },
  variant: {
    holo: "Holo", normal: "Normal", reverse: "Reverse", firstEdition: "1st Edition",
    wPromo: "Promo", lenticular: "Lenticular", metal: "Metal",
  },
  variantNone: "No variant",
  signal: {
    cohort_pct: {
      label: "Position within cohort",
      help: "Price percentile within the same set and rarity. Low means cheap relative to its peers.",
    },
    artist_premium: {
      label: "Illustrator premium",
      help: "Average position this illustrator's cards reach within their cohorts, shrunk for sample size. 0.50 is neutral.",
    },
    jp_en_ratio: {
      label: "Japan / English ratio",
      help: "Japanese price divided by the English one. The Japanese market leads by a median of 56 days.",
    },
    eu_us_arb: {
      label: "Europe / US arbitrage",
      help: "Gap between Cardmarket and TCGplayer that survives the exchange rate and round-trip costs.",
    },
    roundtrip_cost: {
      label: "Round-trip cost",
      help: "Share of the price lost buying and selling again, including fees and shipping. Shipping is a fixed cost, which is why cheap cards cannot be investments.",
    },
    invest_score: {
      label: "Investment score",
      help: "The signals above combined as z-scores with equal weights. It measures mispricing observable today; it is not a validated forecast.",
    },
  },
  noImage: "TCGdex publishes no image for this card",
  noData: "no data",
  artwork: {
    borrowed: (lang) => `Artwork from the ${lang} edition`,
    external: (source) => `Image from ${source}`,
    none: "No artwork for this card is available from any of our sources",
  },
};

const ja: CommonDict = {
  brand: { a: "Carto", b: "teca" },
  nav: { ranking: "ランキング", cards: "カード", artists: "イラストレーター", methodology: "算出方法" },
  langName: { en: "英語", ja: "日本語" },
  variant: {
    holo: "ホロ", normal: "ノーマル", reverse: "リバース", firstEdition: "初版",
    wPromo: "プロモ", lenticular: "レンチキュラー", metal: "メタル",
  },
  variantNone: "バリエーションなし",
  signal: {
    cohort_pct: {
      label: "同群内での位置",
      help: "同じセット・同じレアリティの中での価格パーセンタイル。低いほど同種のカードに比べて割安。",
    },
    artist_premium: {
      label: "イラストレーター・プレミアム",
      help: "このイラストレーターのカードが各群内で到達する平均位置。標本数による補正済み。0.50 が中立。",
    },
    jp_en_ratio: {
      label: "日本版 / 英語版 比率",
      help: "日本版価格を英語版価格で割った値。日本市場は中央値で約56日先行する。",
    },
    eu_us_arb: {
      label: "欧州 / 米国 裁定",
      help: "為替と往復コストを差し引いても残る Cardmarket と TCGplayer の価格差。",
    },
    roundtrip_cost: {
      label: "往復コスト",
      help: "購入して再び売却する際に失われる価格の割合。手数料と送料を含む。送料は固定費のため、安価なカードは投資対象にならない。",
    },
    invest_score: {
      label: "投資スコア",
      help: "上記シグナルを標準化し等ウェイトで合成した値。本日時点で観測可能な価格のずれを測るものであり、検証済みの予測ではない。",
    },
  },
  noImage: "TCGdex はこのカードの画像を公開していません",
  noData: "データなし",
  artwork: {
    borrowed: (lang) => `${lang}版のイラストです`,
    external: (source) => `画像提供: ${source}`,
    none: "このカードのイラストは、当サイトのどの情報源にもありません",
  },
};

export const common: Dict<CommonDict> = { es, en, ja };
