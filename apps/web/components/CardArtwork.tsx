import { resolveImage, type ImageOrigin } from "@/lib/format";

/**
 * La ilustracion de una carta, con su procedencia.
 *
 * Cuando no hay ninguna imagen disponible NO se pinta un hueco: se genera un
 * marcador que lleva la informacion que el usuario necesitaba de la imagen —que
 * carta es, de que edicion y con que numero— sobre el color del tipo del Pokemon.
 * Un recuadro vacio obliga a pulsar para saber que hay dentro; esto no.
 *
 * Y cuando la ilustracion viene prestada de otra edicion, se dice encima de la
 * propia imagen. Es otro objeto fisico y esta es la pantalla donde alguien decide
 * gastarse el dinero.
 */

// Colores de los tipos del juego. Sirven para que el marcador sea reconocible de
// un vistazo aunque no haya foto: un Charizard sin imagen sigue siendo rojo.
const TYPE_COLOR: Record<string, string> = {
  Fire: "#d4552b", Water: "#2f7fc4", Grass: "#3f9a4f", Lightning: "#d8a61c",
  Psychic: "#9a56b4", Fighting: "#b3612c", Darkness: "#3d4450", Metal: "#7c848c",
  Fairy: "#d2649a", Dragon: "#9a7c2c", Colorless: "#8d8a83",
  // Nombres japoneses: el catalogo japones los trae en su idioma.
  "炎": "#d4552b", "水": "#2f7fc4", "草": "#3f9a4f", "雷": "#d8a61c",
  "超": "#9a56b4", "闘": "#b3612c", "悪": "#3d4450", "鋼": "#7c848c",
  "フェアリー": "#d2649a", "ドラゴン": "#9a7c2c", "無色": "#8d8a83",
};

function typeColor(typesJson: string | null | undefined): string {
  if (!typesJson) return "#8d8a83";
  try {
    const arr = JSON.parse(typesJson) as unknown;
    if (Array.isArray(arr) && typeof arr[0] === "string") {
      return TYPE_COLOR[arr[0]] ?? "#8d8a83";
    }
  } catch { /* types viene de la base, no del compilador */ }
  return "#8d8a83";
}

export interface ArtworkCard {
  name: string | null;
  card_id: string;
  local_id: string | null;
  set_name: string | null;
  types?: string | null;
  image: string | null;
  image_alt: string | null;
  image_alt_lang: string | null;
  image_ext?: string | null;
  image_ext_src?: string | null;
}

export interface ArtworkLabels {
  /** p.ej. "Ilustración de la edición {lang}" */
  borrowed: (lang: string) => string;
  /** p.ej. "Imagen de {source}" */
  external: (source: string) => string;
  /** p.ej. "Sin ilustración disponible" */
  none: string;
  langName: (code: string) => string;
}

export function CardArtwork({
  card,
  labels,
  width,
  quality = "low",
  showBadge = true,
}: {
  card: ArtworkCard;
  labels: ArtworkLabels;
  width: number;
  quality?: "low" | "high";
  showBadge?: boolean;
}) {
  const { src, origin, fallbackLang, source } = resolveImage(card, quality);
  const height = Math.round(width * 1.395); // proporcion real de una carta Pokemon
  const alt = `${card.name ?? card.card_id}${card.set_name ? ` — ${card.set_name}` : ""}`;

  const badge: string | null =
    origin === "alt" && fallbackLang ? labels.borrowed(labels.langName(fallbackLang))
    : origin === "ext" && source ? labels.external(source)
    : null;

  if (!src) {
    return <ArtworkPlaceholder card={card} title={labels.none} width={width} />;
  }

  return (
    <div style={{ position: "relative", width, lineHeight: 0 }}>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        style={{
          width, height: "auto", borderRadius: Math.max(3, width * 0.045),
          display: "block", background: "var(--surface-2)",
        }}
      />
      {showBadge && badge && (
        <span
          title={badge}
          style={{
            position: "absolute", left: 3, bottom: 3, right: 3,
            fontSize: Math.max(8, width * 0.055), lineHeight: 1.25,
            padding: "1px 4px", borderRadius: 3,
            background: "color-mix(in srgb, var(--surface) 88%, transparent)",
            color: "var(--text-dim)", border: "1px solid var(--border)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

/**
 * Marcador para cartas sin ilustracion en ninguna fuente.
 *
 * No es un hueco decorado: lleva lo que el usuario iba a sacar de la imagen —que
 * carta es, de que edicion y con que numero— sobre el color del tipo del Pokemon,
 * para que siga siendo reconocible de un vistazo en una rejilla.
 */
export function ArtworkPlaceholder({
  card,
  title,
  width,
  fill = false,
}: {
  card: Pick<ArtworkCard, "name" | "card_id" | "local_id" | "set_name" | "types">;
  title: string;
  width: number;
  fill?: boolean;
}) {
  const color = typeColor(card.types);
  const pad = Math.max(4, width * 0.06);
  return (
    <div
      title={title}
      style={{
        ...(fill
          ? { width: "100%", aspectRatio: "1 / 1.395" }
          : { width, height: Math.round(width * 1.395) }),
        borderRadius: Math.max(3, width * 0.045),
        background: `linear-gradient(160deg, ${color}26, ${color}0d)`,
        border: `1px solid ${color}59`,
        display: "flex", flexDirection: "column", justifyContent: "flex-end",
        padding: pad, gap: 2, overflow: "hidden", boxSizing: "border-box",
      }}
    >
      <div style={{
        fontSize: Math.max(9, width * 0.085), fontWeight: 600, lineHeight: 1.15,
        color: "var(--text)", overflow: "hidden",
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
      }}>
        {card.name ?? card.card_id}
      </div>
      <div style={{ fontSize: Math.max(8, width * 0.062), color: "var(--text-faint)", lineHeight: 1.2 }}>
        {card.set_name ?? ""}{card.local_id ? ` · ${card.local_id}` : ""}
      </div>
    </div>
  );
}

export type { ImageOrigin };
