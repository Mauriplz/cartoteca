import type { NextConfig } from "next";

const config: NextConfig = {
  // better-sqlite3 es un binario nativo: no debe pasar por el bundler.
  serverExternalPackages: ["better-sqlite3"],
  images: {
    // Las imagenes de carta las sirve el CDN de TCGdex.
    remotePatterns: [{ protocol: "https", hostname: "assets.tcgdex.net" }],
  },
};

export default config;
