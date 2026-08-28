"use client";

import type { CSSProperties } from "react";
import { useWatchlist } from "@/components/watchlist-store";

/**
 * Estrella de vigilancia de la ficha de carta.
 *
 * Es una isla de cliente dentro de una pagina de servidor: recibe las etiquetas
 * ya traducidas por props en vez de importar diccionarios, que es el contrato
 * que le pide la ficha.
 *
 * Antes de montar no hay localStorage que leer: se pinta como no vigilada y se
 * corrige al montar. Ese es el unico orden que coincide con el HTML del servidor
 * y no rompe la hidratacion.
 */
export interface WatchLabels {
  add: string;
  remove: string;
  /** "se guarda en este navegador": obligatorio decirlo donde se guarda. */
  savedNote: string;
}

export default function WatchlistButton({
  instrumentId,
  labels,
}: {
  instrumentId: string;
  labels: WatchLabels;
}) {
  const { ids, ready, toggle } = useWatchlist();
  const saved = ready && ids.includes(instrumentId);
  const label = saved ? labels.remove : labels.add;

  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    font: "inherit",
    fontSize: 12.5,
    lineHeight: 1,
    padding: "6px 12px",
    borderRadius: 999,
    cursor: "pointer",
    border: `1px solid ${saved ? "var(--accent)" : "var(--border-strong)"}`,
    background: saved ? "var(--accent-soft)" : "var(--surface)",
    color: saved ? "var(--accent)" : "var(--text-dim)",
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      title={`${label} — ${labels.savedNote}`}
      onClick={() => toggle(instrumentId)}
      style={style}
    >
      <span aria-hidden="true" style={{ fontSize: 14 }}>{saved ? "★" : "☆"}</span>
      {label}
    </button>
  );
}
