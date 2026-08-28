import { NextResponse } from "next/server";
import { getCard, getCards } from "@/lib/queries";
import type { CardRow } from "@/lib/types";

/**
 * Datos de carta para las islas de cliente (watchlist y cartera).
 *
 * Vive bajo [locale] a proposito: el middleware redirige toda ruta sin prefijo
 * de idioma a /{locale}/..., asi que un /api/cards sin prefijo jamas llegaria
 * aqui (acabaria en un 404 tras la redireccion). Los clientes construyen la URL
 * con localePath(locale, "api/cards"). El locale no se usa: los datos son los
 * mismos en los tres idiomas.
 *
 * Dos modos, ambos de solo lectura:
 *   ?ids=a,b,c  filas exactas por instrument_id, hasta 100. La watchlist puede
 *               guardar ids que ya no existen: simplemente no se devuelven, y el
 *               cliente lo dice en vez de inventarse una fila.
 *   ?q=texto    busqueda por nombre/ilustrador/edicion/alias, la misma del
 *               explorador, limitada a 20 filas para el selector de la cartera.
 *
 * Los instrument_id llevan ':' y alguno un '%' literal: el cliente los codifica
 * con encodeURIComponent y searchParams ya los entrega decodificados aqui.
 */
export const dynamic = "force-dynamic";

const MAX_IDS = 100;
const MAX_SEARCH = 20;

export function GET(request: Request): NextResponse {
  const params = new URL(request.url).searchParams;

  const idsParam = params.get("ids");
  if (idsParam !== null) {
    const ids = [...new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))]
      .slice(0, MAX_IDS);
    const cards = ids
      .map((id) => getCard(id))
      .filter((c): c is CardRow => c !== null);
    return NextResponse.json({ cards });
  }

  const q = params.get("q")?.trim();
  if (q) {
    const { rows } = getCards({ q, limit: MAX_SEARCH });
    return NextResponse.json({ cards: rows });
  }

  return NextResponse.json({ cards: [] });
}
