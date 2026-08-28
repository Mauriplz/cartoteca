import type { CardRow } from "@/lib/types";
import { resolveImage } from "@/lib/format";
import { localePath, type Locale } from "@/lib/i18n";
import { cardHref } from "@/components/CardTile";

/**
 * JSON-LD Product para la ficha de carta. Componente servidor: emite un
 * <script type="application/ld+json"> y nada mas; el orquestador lo inserta
 * en la pagina de la ficha.
 *
 * Sin datos inventados:
 *  - offers solo si hay precio observado; el precio es la marca cm_trend en EUR
 *    y validFrom es la fecha real de esa observacion. Sin availability: no
 *    somos una tienda y no sabemos el stock de nadie.
 *  - image solo si es la ilustracion PROPIA de esta carta (origin "own"):
 *    la alternativa inglesa es otro objeto fisico y no se hace pasar por esta.
 *  - description compuesta solo de campos presentes (set, numero, rareza,
 *    ilustrador), sin texto de relleno.
 */

// Mismo fallback que app/sitemap.ts: en produccion la fija el despliegue.
// `||` cubre tambien la cadena vacia; sin barra final para no generar "//".
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cartoteca.app").replace(/\/+$/, "");

export default function JsonLdCard({
  card,
  locale,
}: {
  card: CardRow;
  /** Si se pasa, el Product lleva la URL canonica de la ficha en ese idioma. */
  locale?: Locale;
}) {
  const product: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: card.name ?? card.card_id,
    sku: card.instrument_id,
  };

  const img = resolveImage(card, "high");
  if (img.origin === "own" && img.src) product.image = img.src;

  const description = [
    card.set_name,
    card.local_id ? `#${card.local_id}` : null,
    card.rarity,
    card.illustrator,
  ]
    .filter(Boolean)
    .join(" · ");
  if (description) product.description = description;

  if (locale) {
    product.url = `${BASE}${localePath(locale, cardHref(card.instrument_id))}`;
  }

  if (card.price_eur != null) {
    product.offers = {
      "@type": "Offer",
      priceCurrency: "EUR",
      price: Number(card.price_eur.toFixed(2)),
      ...(card.obs_date ? { validFrom: card.obs_date } : {}),
    };
  }

  // < evita que un nombre con '<' pueda cerrar el <script>.
  const json = JSON.stringify(product).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
