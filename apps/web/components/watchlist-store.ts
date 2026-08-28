"use client";

/**
 * Almacen local del usuario: watchlist y cartera, en localStorage.
 *
 * Sin cuenta y sin servidor a proposito: la interfaz que use esto esta obligada
 * a decir "se guarda en este navegador" cada vez que el usuario deposita datos.
 *
 * Sincronizacion en dos frentes:
 *  - entre pestanas, con el evento nativo 'storage' (solo se dispara en las OTRAS);
 *  - dentro de la misma pestana, con un evento propio que cada escritura emite,
 *    para que el boton de la ficha y el panel de la cartera no se desincronicen.
 *
 * SSR: en el servidor no hay window; toda lectura devuelve el vacio y los hooks
 * arrancan vacios y con ready=false, cargando lo real en un efecto. Asi el primer
 * render del cliente coincide con el HTML del servidor y no hay desajuste de
 * hidratacion.
 */

import { useCallback, useEffect, useState } from "react";

export const WATCHLIST_KEY = "pcp:watchlist:v1";
export const PORTFOLIO_KEY = "pcp:portfolio:v1";

/** Una compra apuntada a mano: precio por unidad en EUR y cantidad. */
export interface PortfolioPosition {
  instrument_id: string;
  buy_price_eur: number;
  qty: number;
  /** ISO con hora: junto al instrument_id identifica la posicion al borrarla. */
  added_at: string;
}

/** El evento 'storage' no suena en la pestana que escribe: este si. */
const LOCAL_EVENT = "pcp:store-change";

/* ----------------------------------------------------------- lectura/escritura */

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // localStorage bloqueado (modo privado estricto) o JSON corrupto: vacio.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota llena o almacenamiento bloqueado: se avisa igualmente a los hooks
    // para que relean y pinten el estado que de verdad hay guardado.
  }
  window.dispatchEvent(new Event(LOCAL_EVENT));
}

export function readWatchlist(): string[] {
  const v = readJson(WATCHLIST_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Anade o quita un instrumento; devuelve la lista resultante. */
export function toggleWatch(instrumentId: string): string[] {
  const cur = readWatchlist();
  const next = cur.includes(instrumentId)
    ? cur.filter((x) => x !== instrumentId)
    : [...cur, instrumentId];
  writeJson(WATCHLIST_KEY, next);
  return next;
}

function isPosition(v: unknown): v is PortfolioPosition {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.instrument_id === "string" &&
    typeof p.buy_price_eur === "number" && Number.isFinite(p.buy_price_eur) &&
    typeof p.qty === "number" && Number.isFinite(p.qty) && p.qty > 0 &&
    typeof p.added_at === "string"
  );
}

export function readPortfolio(): PortfolioPosition[] {
  const v = readJson(PORTFOLIO_KEY);
  return Array.isArray(v) ? v.filter(isPosition) : [];
}

export function addPosition(pos: PortfolioPosition): PortfolioPosition[] {
  const next = [...readPortfolio(), pos];
  writeJson(PORTFOLIO_KEY, next);
  return next;
}

export function removePosition(
  pos: Pick<PortfolioPosition, "instrument_id" | "added_at">,
): PortfolioPosition[] {
  const next = readPortfolio().filter(
    (p) => !(p.instrument_id === pos.instrument_id && p.added_at === pos.added_at),
  );
  writeJson(PORTFOLIO_KEY, next);
  return next;
}

/* ------------------------------------------------------------------------ hooks */

// Vacios estables: el estado inicial (servidor y primer render de cliente) no
// debe cambiar de identidad en cada render.
const EMPTY_IDS: string[] = [];
const EMPTY_POSITIONS: PortfolioPosition[] = [];

function useStoredValue<T>(key: string, read: () => T, empty: T): { value: T; ready: boolean } {
  const [state, setState] = useState<{ value: T; ready: boolean }>({ value: empty, ready: false });

  useEffect(() => {
    const sync = () => setState({ value: read(), ready: true });
    sync();
    // e.key === null es clear(): tambien afecta a nuestra clave.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === key) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LOCAL_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LOCAL_EVENT, sync);
    };
    // `read` y `empty` son constantes de modulo: solo la clave identifica el almacen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/**
 * Watchlist viva: `ids` en orden de anadido, `ready` false hasta leer el almacen
 * (el primer render, tambien el del servidor, sale vacio a proposito).
 */
export function useWatchlist() {
  const { value: ids, ready } = useStoredValue(WATCHLIST_KEY, readWatchlist, EMPTY_IDS);
  const toggle = useCallback((instrumentId: string) => {
    toggleWatch(instrumentId);
  }, []);
  return { ids, ready, toggle };
}

/** Cartera viva. `add` sella added_at; `remove` identifica por id + added_at. */
export function usePortfolio() {
  const { value: positions, ready } = useStoredValue(PORTFOLIO_KEY, readPortfolio, EMPTY_POSITIONS);
  const add = useCallback((pos: Omit<PortfolioPosition, "added_at">) => {
    addPosition({ ...pos, added_at: new Date().toISOString() });
  }, []);
  const remove = useCallback((pos: Pick<PortfolioPosition, "instrument_id" | "added_at">) => {
    removePosition(pos);
  }, []);
  return { positions, ready, add, remove };
}
