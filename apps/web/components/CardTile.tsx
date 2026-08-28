import type { CSSProperties, ReactNode } from "react";
import { cardImage, eur, variantLabel } from "@/lib/format";
import type { CardRow } from "@/lib/types";

/**
 * Baldosa del explorador. Una baldosa = un instrumento (carta + idioma + variante),
 * no una ilustracion: por eso la variante se muestra siempre, para que las cartas
 * repetidas en la rejilla se lean como lo que son y no como un fallo del catalogo.
 */

const USD = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/** Los instrument_id llevan ':' y alguno lleva '%': hay que codificarlos en la ruta. */
export function cardHref(instrumentId: string): string {
  return `/cartas/${encodeURIComponent(instrumentId)}`;
}

export const LANG_TAG: Record<string, string> = { en: "EN", ja: "JA" };
export const LANG_NAME: Record<string, string> = { en: "Inglés", ja: "Japonés" };

// Proporcion real de una carta Pokemon: reserva el hueco antes de que cargue la
// imagen para que la rejilla no salte durante el desplazamiento.
const FRAME: CSSProperties = { aspectRatio: "5 / 7", width: "100%" };

const CLAMP2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const ONE_LINE: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export default function CardTile({ card, extra }: { card: CardRow; extra?: ReactNode }) {
  const src = cardImage(card.image, "low");
  const name = card.name ?? card.card_id;
  const variant = variantLabel(card.variant_type, card.variant_subtype);

  return (
    <a
      className="tile"
      href={cardHref(card.instrument_id)}
      title={`${name} · ${variant} · ${LANG_NAME[card.lang] ?? card.lang}`}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" style={{ ...FRAME, objectFit: "cover" }} />
      ) : (
        <div
          style={{
            ...FRAME,
            background: "var(--surface-2)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          sin imagen
        </div>
      )}

      <div className="t-name" style={CLAMP2}>{name}</div>
      <div className="t-meta" style={ONE_LINE}>
        {card.set_name ?? card.set_id ?? "Set desconocido"}
        {card.local_id ? ` · nº ${card.local_id}` : ""}
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
        <span className="tag" style={{ ...ONE_LINE, display: "inline-block", maxWidth: "100%" }}>
          {variant}
        </span>
        <span className="tag">{LANG_TAG[card.lang] ?? card.lang}</span>
      </div>

      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        {card.price_eur != null ? (
          <span className="num" style={{ fontWeight: 600 }}>{eur(card.price_eur)}</span>
        ) : card.tcg_market != null ? (
          <>
            <span className="faint" style={{ fontSize: 12 }}>sin precio EUR</span>
            <span className="num faint" style={{ fontSize: 11.5 }}>{USD.format(card.tcg_market)}</span>
          </>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>sin precio</span>
        )}
      </div>

      {extra}
    </a>
  );
}
