export type Lang = "en" | "ja";

export interface CardRow {
  instrument_id: string;
  card_id: string;
  lang: Lang;
  name: string | null;
  illustrator: string | null;
  rarity: string | null;
  set_id: string | null;
  set_name: string | null;
  release_date: string | null;
  local_id: string | null;
  image: string | null;
  /** Ilustracion de la edicion inglesa, cuando TCGdex no tiene la de esta carta.
   *  Es OTRO objeto fisico: la interfaz debe etiquetarla, no hacerla pasar por la propia. */
  image_alt: string | null;
  image_alt_lang: string | null;
  /** URL completa de una fuente externa (TCGplayer). Ya resuelta, sin sufijo. */
  image_ext: string | null;
  image_ext_src: string | null;
  /** Tipos del Pokemon, JSON. Se usa para colorear el marcador cuando no hay ilustracion. */
  types: string | null;
  variant_type: string | null;
  variant_subtype: string | null;
  /** Cuantas variantes comparten producto y precio en Cardmarket. >1 = fila agrupada. */
  variant_count?: number;
  cm_variant_ambiguous?: number;
  price_eur: number | null;
  tcg_market: number | null;
  obs_date: string | null;
}

export interface ScoredCard extends CardRow {
  score: number;
  components: Record<string, number>;
  roundtrip_cost: number | null;
  variant_count: number;
  cm_variant_ambiguous: number;
}

export interface SignalDetail {
  signal: string;
  value: number;
  detail: Record<string, unknown>;
}

export interface ArtistPremium {
  artist: string;
  n: number;
  raw_mean: number;
  shrunk: number;
  weight: number;
}
