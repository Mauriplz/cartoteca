import type { Metadata } from "next";
import "../globals.css";
import "../responsive.css";
import { LOCALES, LOCALE_NAMES, coerceLocale, localePath, pick, type Locale } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";

// El layout raiz vive dentro del segmento [locale] para que el atributo lang del
// documento sea el correcto desde el servidor, sin parpadeo ni JavaScript.
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

const META: Record<Locale, { title: string; description: string }> = {
  es: {
    title: "Cartoteca — precios e inversión en cartas Pokémon",
    description:
      "Precios de todas las cartas Pokémon de todas las ediciones, y el ranking de las que presentan mayor desajuste de valoración.",
  },
  en: {
    title: "Cartoteca — Pokémon card prices and investment",
    description:
      "Prices for every Pokémon card from every set, and a ranking of those showing the largest mispricing.",
  },
  ja: {
    title: "Cartoteca — ポケモンカードの価格と投資",
    description:
      "全エディションのポケモンカード価格と、価格のずれが最も大きいカードのランキング。",
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = coerceLocale((await params).locale);
  return {
    ...META[locale],
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, localePath(l)])),
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = coerceLocale((await params).locale);
  const t = pick(common, locale);

  const nav = [
    { href: localePath(locale, "mercado"), label: t.nav.market },
    { href: localePath(locale), label: t.nav.ranking },
    { href: localePath(locale, "cartas"), label: t.nav.cards },
    { href: localePath(locale, "ilustradores"), label: t.nav.artists },
    { href: localePath(locale, "metodologia"), label: t.nav.methodology },
    { href: localePath(locale, "cartera"), label: t.nav.portfolio },
  ];

  return (
    <html lang={locale}>
      <body>
        <nav className="nav">
          <div className="wrap nav-inner">
            <a href={localePath(locale)} className="brand">
              {t.brand.a}
              <span>{t.brand.b}</span>
            </a>
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="link">
                {n.label}
              </a>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {LOCALES.map((l) => (
                <a
                  key={l}
                  href={localePath(l)}
                  className="tag"
                  aria-current={l === locale ? "true" : undefined}
                  style={l === locale ? { color: "var(--accent)", borderColor: "var(--accent)" } : undefined}
                  hrefLang={l}
                >
                  {LOCALE_NAMES[l]}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <main className="wrap" style={{ padding: "28px 20px 80px" }}>{children}</main>
      </body>
    </html>
  );
}
