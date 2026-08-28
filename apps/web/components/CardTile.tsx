import type { CSSProperties, ReactNode } from "react";
import { resolveImage } from "@/lib/format";
import { localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { cards } from "@/lib/i18n/cards";
import { common, type CommonDict } from "@/lib/i18n/common";
import type { CardRow, Lang } from "@/lib/types";

/**
 * Baldosa del explorador. Una baldosa = un instrumento (carta + idioma + variante),
 * no una ilustracion: por eso la variante se muestra siempre, para que las cartas
 * repetidas en la rejilla se lean como lo que son y no como un fallo del catalogo.
 *
 * Recibe el idioma, no los textos: lo poco que dice son etiquetas que ya viven en
 * los diccionarios, y pasarlas por props obligaria a rehacer el contrato cada vez
 * que la baldosa gana una linea.
 */

/**
 * Ruta de la ficha, SIN prefijo de idioma: quien la use la envuelve en
 * localePath(locale, ...), que respeta la codificacion ya aplicada aqui.
 * Los instrument_id llevan ':' y alguno lleva '%': hay que codificarlos.
 */
export function cardHref(instrumentId: string): string {
  return `/cartas/${encodeURIComponent(instrumentId)}`;
}

/** Codigo de idioma para la etiqueta. No se traduce: es un codigo, no una palabra. */
export const LANG_TAG: Record<Lang, string> = { en: "EN", ja: "JA" };

/** Etiqueta de variante en el idioma de la interfaz. El subtipo es dato: no se traduce. */
export function variantName(c: CommonDict, type: string | null, sub: string | null): string {
  const base = type ? (c.variant[type] ?? type) : c.variantNone;
  return sub && sub !== "-" ? `${base} · ${sub}` : base;
}

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

export default function CardTile({
  card,
  locale,
  extra,
}: {
  card: CardRow;
  locale: Locale;
  extra?: ReactNode;
}) {
  const t = pick(cards, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);

  const { src, fallbackLang } = resolveImage(card, "low");
  const name = card.name ?? card.card_id;
  const variant = variantName(c, card.variant_type, card.variant_subtype);
  const langName = c.langName[card.lang];
  // La ilustracion prestada es de OTRA carta: se dice en la baldosa, no solo en
  // el atributo title, que en un movil no existe.
  const fallbackName =
    fallbackLang === "en" || fallbackLang === "ja" ? c.langName[fallbackLang] : fallbackLang;

  return (
    <a
      className="tile"
      href={localePath(locale, cardHref(card.instrument_id))}
      title={t.tile.title(name, variant, langName)}
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
          {t.tile.noImage}
        </div>
      )}

      <div className="t-name" style={CLAMP2}>{name}</div>
      <div className="t-meta" style={ONE_LINE}>
        {card.set_name ?? card.set_id ?? t.tile.unknownSet}
        {card.local_id ? ` · ${t.cardNumber(card.local_id)}` : ""}
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
        <span className="tag" style={{ ...ONE_LINE, display: "inline-block", maxWidth: "100%" }}>
          {variant}
        </span>
        <span className="tag">{LANG_TAG[card.lang]}</span>
        {fallbackName && (
          <span className="tag faint" title={t.tile.imageFallback(fallbackName)}>
            {t.tile.imageFallbackTag(
              fallbackLang === "en" || fallbackLang === "ja" ? LANG_TAG[fallbackLang] : fallbackName,
            )}
          </span>
        )}
      </div>

      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        {card.price_eur != null ? (
          <span className="num" style={{ fontWeight: 600 }}>{f.eur(card.price_eur)}</span>
        ) : card.tcg_market != null ? (
          <>
            <span className="faint" style={{ fontSize: 12 }}>{t.noPriceEur}</span>
            <span className="num faint" style={{ fontSize: 11.5 }}>{f.usd(card.tcg_market)}</span>
          </>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>{t.noPrice}</span>
        )}
      </div>

      {extra}
    </a>
  );
}
