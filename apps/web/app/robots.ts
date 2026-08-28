import type { MetadataRoute } from "next";

// Mismo fallback que app/sitemap.ts: en produccion la fija el despliegue.
// `||` cubre tambien la cadena vacia; sin barra final para no generar "//".
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cartoteca.app").replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // La API interna de la watchlist (app/[locale]/api/cards) no es contenido.
      { userAgent: "*", allow: "/", disallow: ["/es/api/", "/en/api/", "/ja/api/"] },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
