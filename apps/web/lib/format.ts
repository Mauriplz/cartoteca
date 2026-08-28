const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function eur(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return EUR.format(v);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

/** Las imagenes de TCGdex se sirven sin extension: hay que anadir calidad y formato. */
export function cardImage(base: string | null, quality: "low" | "high" = "low"): string | null {
  return base ? `${base}/${quality}.webp` : null;
}

const VARIANT_ES: Record<string, string> = {
  holo: "Holo",
  normal: "Normal",
  reverse: "Reverse",
  firstEdition: "1ª edición",
  wPromo: "Promo",
  lenticular: "Lenticular",
  metal: "Metal",
};

export function variantLabel(t: string | null, sub: string | null): string {
  const base = t ? (VARIANT_ES[t] ?? t) : "Sin variante";
  return sub && sub !== "-" ? `${base} · ${sub}` : base;
}

/** Nombre legible de cada senal, y si un valor alto es bueno o malo. */
export const SIGNAL_META: Record<string, { label: string; help: string }> = {
  cohort_pct: {
    label: "Posición en su cohorte",
    help: "Percentil del precio dentro de su mismo set y rareza. Bajo = barata respecto a sus pares.",
  },
  artist_premium: {
    label: "Prima del ilustrador",
    help: "Posición media que alcanzan las cartas de este ilustrador dentro de sus cohortes, con corrección por tamaño de muestra. 0,50 es neutro.",
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
    help: "Fracción del precio que se pierde al comprar y volver a vender, incluyendo comisión y portes. Los portes son fijos, así que las cartas baratas son ininvertibles.",
  },
  invest_score: {
    label: "Puntuación de inversión",
    help: "Combinación de las señales anteriores en z-scores, con pesos iguales. Mide desajuste observable hoy, no es una previsión validada.",
  },
};
