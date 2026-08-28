import { NextResponse, type NextRequest } from "next/server";
import { LOCALES, negotiate } from "@/lib/i18n";

// Toda ruta sin prefijo de idioma se redirige al idioma que pide el navegador.
// Se resuelve en el borde, antes de renderizar: el usuario nunca ve la pagina
// en un idioma que no es el suyo.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (hasLocale) return NextResponse.next();

  const locale = negotiate(req.headers.get("accept-language"));
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Se excluyen los internos de Next y cualquier fichero con extension.
  matcher: ["/((?!_next|favicon|.*\\.).*)"],
};
