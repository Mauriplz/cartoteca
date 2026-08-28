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
  variant_type: string | null;
  variant_subtype: string | null;
  price_eur: number | null;
  tcg_market: number | null;
  obs_date: string | null;
}

export interface ScoredCard extends CardRow {
  score: number;
  components: Record<string, number>;
  roundtrip_cost: number | null;
  /** Cuantas variantes comparten este mismo producto de Cardmarket y precio. */
  variant_count: number;
  /** 1 si el precio europeo no distingue entre variantes de la carta. */
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
