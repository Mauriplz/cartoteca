import type { MetadataRoute } from "next";

/**
 * Manifest PWA. Los colores son los tokens del tema claro de globals.css
 * (--bg #fbfbfa, --accent #b4530a): el manifest no sabe de media queries,
 * asi que declara el tema base y el navegador hace el resto.
 *
 * Iconos: SVG en data-URI, sin ficheros binarios. La version "any" lleva
 * esquinas redondeadas; la "maskable" es a sangre completa con la C dentro
 * de la zona segura (el 80% central) para que cualquier mascara la respete.
 */

function icon(cornerRadius: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="${cornerRadius}" fill="#b4530a"/>` +
    `<text x="256" y="256" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Georgia, 'Times New Roman', serif" font-size="320" ` +
    `font-weight="700" fill="#fbfbfa">C</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cartoteca",
    short_name: "Cartoteca",
    description:
      "Precios, índice y señales de inversión en cartas Pokémon coleccionables.",
    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfbfa",
    theme_color: "#b4530a",
    lang: "es",
    icons: [
      { src: icon(96), sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: icon(0), sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
