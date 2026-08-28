/**
 * Internacionalizacion.
 *
 * Sin libreria externa: con cinco paginas, un diccionario tipado y un segmento de
 * ruta bastan, y evitan meter kilobytes de runtime en el cliente para algo que se
 * resuelve entero en el servidor.
 *
 * Los diccionarios se parten por espacio de nombres (uno por pagina) para que el
 * texto viva al lado de quien lo usa y para poder trabajar en varias paginas a la
 * vez sin pisarse.
 *
 * Lo que NO se traduce: los nombres de las cartas, de los sets y de los
 * ilustradores. Son datos de origen, vienen ya en su idioma desde TCGdex, y
 * traducirlos seria inventarselos.
 */

export const LOCALES = ["es", "en", "ja"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";

export const LOCALE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
  ja: "日本語",
};

export function isLocale(v: string | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

export function coerceLocale(v: string | undefined): Locale {
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Elige idioma a partir de la cabecera Accept-Language del navegador. */
export function negotiate(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Construye una ruta con prefijo de idioma. */
export function localePath(locale: Locale, path = ""): string {
  const clean = path.replace(/^\/+/, "");
  return clean ? `/${locale}/${clean}` : `/${locale}`;
}

/**
 * Un diccionario es un objeto plano de cadenas o funciones que reciben datos.
 * Se tipa contra el diccionario espanol, que es la referencia: si una traduccion
 * olvida una clave, el compilador lo dice antes de que lo vea un usuario.
 */
export type Dict<T> = Record<Locale, T>;

export function pick<T>(dict: Dict<T>, locale: Locale): T {
  return dict[locale] ?? dict[DEFAULT_LOCALE];
}

/** Formateadores dependientes del idioma. */
export function makeFormatters(locale: Locale) {
  const tag = { es: "es-ES", en: "en-US", ja: "ja-JP" }[locale];
  const eurFmt = new Intl.NumberFormat(tag, {
    style: "currency", currency: "EUR", maximumFractionDigits: 2,
  });
  const usdFmt = new Intl.NumberFormat(tag, {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  });
  const numFmt = new Intl.NumberFormat(tag);
  // timeZone UTC obligatorio: obs_date es un DIA NATURAL del almacen, no un instante.
  // Sin fijarlo, new Date("2026-08-25") se parsea como medianoche UTC y se formatea en
  // la zona local, asi que al oeste de UTC la fecha retrocede un dia y la portada
  // contradice a la pagina de metodologia, que si lo fija.
  const dateFmt = new Intl.DateTimeFormat(tag, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return {
    eur: (v: number | null | undefined) => (v == null ? "—" : eurFmt.format(v)),
    usd: (v: number | null | undefined) => (v == null ? "—" : usdFmt.format(v)),
    num: (v: number | null | undefined) => (v == null ? "—" : numFmt.format(v)),
    // El separador decimal solo cambia en espanol. El japones usa punto, igual que
    // el ingles: meterlo en el mismo saco que el espanol producia "18,4%" junto a
    // "1,333" en la misma pantalla, con la coma significando dos cosas distintas.
    pct: (v: number | null | undefined, d = 1) =>
      v == null ? "—" : `${(v * 100).toFixed(d).replace(".", locale === "es" ? "," : ".")}%`,
    date: (iso: string | null | undefined) => {
      if (!iso) return "—";
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : dateFmt.format(d);
    },
  };
}
export type Formatters = ReturnType<typeof makeFormatters>;
