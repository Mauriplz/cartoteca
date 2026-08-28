import type { Metadata } from "next";
import WatchlistPanel, { PortfolioManager } from "@/components/WatchlistPanel";
import { coerceLocale, pick } from "@/lib/i18n";
import { user } from "@/lib/i18n/user";

/**
 * Cartera y watchlist del usuario. La pagina de servidor es solo el marco: los
 * datos viven en el localStorage del navegador y las islas de cliente
 * (PortfolioManager, WatchlistPanel) los leen alli y piden los precios a la
 * ultima marca a {locale}/api/cards. Aqui no se consulta la base: no hay nada del usuario que leer
 * en el servidor, y decirlo es parte del contrato de esta pagina.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const locale = coerceLocale((await params).locale);
  const t = pick(user, locale);
  return { title: t.portfolio.metaTitle, description: t.portfolio.metaDescription };
}

export default async function CarteraPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = coerceLocale((await params).locale);
  const t = pick(user, locale);

  return (
    <>
      <h1>{t.portfolio.title}</h1>
      <p className="sub">{t.portfolio.sub}</p>

      <div className="note" style={{ marginBottom: 20 }}>{t.portfolio.localNote}</div>

      <PortfolioManager locale={locale} />

      <h2 style={{ marginTop: 40 }}>{t.watchlist.title}</h2>
      <WatchlistPanel locale={locale} />
    </>
  );
}
