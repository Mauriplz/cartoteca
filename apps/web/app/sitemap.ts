import type { MetadataRoute } from "next";
import { LOCALES, DEFAULT_LOCALE, localePath, type Locale } from "@/lib/i18n";
import { getScreener } from "@/lib/queries";
import { cardHref } from "@/components/CardTile";

/**
 * Sitemap por idioma con hreflang.
 *
 * Rutas estaticas + las fichas del UNIVERSO PUNTUADO (getScreener), no las
 * 36.000 cartas del catalogo: el sitemap prioriza lo indexable con valor, que
 * son las ~1.300 fichas con puntuacion y precio. Cada URL se emite una vez por
 * idioma y lleva el juego completo de alternates para que el buscador entienda
 * que las tres versiones son la misma pagina.
 */

// En produccion la fija el despliegue; el fallback solo hace las URLs absolutas.
// `||` cubre tambien la cadena vacia; sin barra final para no generar "//".
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cartoteca.app").replace(/\/+$/, "");

function abs(locale: Locale, path: string): string {
  return `${BASE}${localePath(locale, path)}`;
}

/** hreflang: una entrada por idioma + x-default apuntando al idioma por defecto. */
function languages(path: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of LOCALES) map[l] = abs(l, path);
  map["x-default"] = abs(DEFAULT_LOCALE, path);
  return map;
}

interface StaticRoute {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
}

const STATIC_ROUTES: StaticRoute[] = [
  { path: "", changeFrequency: "daily", priority: 1.0 },
  { path: "cartas", changeFrequency: "daily", priority: 0.9 },
  { path: "mercado", changeFrequency: "daily", priority: 0.8 },
  { path: "ilustradores", changeFrequency: "weekly", priority: 0.6 },
  { path: "metodologia", changeFrequency: "monthly", priority: 0.5 },
  // La cartera vive en localStorage del visitante: la pagina es indexable como
  // herramienta, pero no tiene contenido que cambie en el servidor.
  { path: "cartera", changeFrequency: "monthly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const r of STATIC_ROUTES) {
    for (const locale of LOCALES) {
      entries.push({
        url: abs(locale, r.path),
        changeFrequency: r.changeFrequency,
        priority: r.priority,
        alternates: { languages: languages(r.path) },
      });
    }
  }

  // Universo puntuado completo (~1.300 filas ya deduplicadas por producto).
  // El limite alto es un techo de seguridad, no una aspiracion.
  const scored = getScreener({ limit: 5000 });
  for (const card of scored) {
    const path = cardHref(card.instrument_id).replace(/^\/+/, "");
    for (const locale of LOCALES) {
      entries.push({
        url: abs(locale, path),
        // La fecha de la ultima observacion de precio: el dato real mas reciente.
        ...(card.obs_date ? { lastModified: card.obs_date } : {}),
        changeFrequency: "weekly",
        priority: 0.6,
        alternates: { languages: languages(path) },
      });
    }
  }

  return entries;
}
