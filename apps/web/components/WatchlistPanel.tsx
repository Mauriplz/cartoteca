"use client";

/**
 * Islas de cliente de la capa del usuario: el panel de cartas vigiladas y el
 * gestor de cartera. Comparten fichero porque comparten todo lo demas: el
 * almacen local (watchlist-store), la ruta {locale}/api/cards que les sirve las
 * filas a la ultima marca, y la obligacion de decir que nada de esto sale del
 * navegador.
 *
 * Las listas viven en localStorage; los precios NO. Cada montaje pide a
 * /api/cards las filas vigentes de los instrumentos guardados, de modo que lo
 * unico persistido localmente son identificadores y compras apuntadas a mano.
 *
 * Honestidad contable de la cartera: tres cifras por posicion. El coste; el
 * valor a la ultima marca, que no es una venta real sino la marca suavizada de
 * Cardmarket; y el neto tras el coste de ida y vuelta (5% de comision + 7 EUR
 * de portes por posicion), que es la cifra destacada porque es la unica que se
 * pareceria a dinero de verdad.
 */

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { LANG_TAG, cardHref, variantName } from "@/components/CardTile";
import { usePortfolio, useWatchlist } from "@/components/watchlist-store";
import { localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { user } from "@/lib/i18n/user";
import type { CardRow } from "@/lib/types";

/** Mismos costes que la senal roundtrip_cost: comision de venta y portes fijos. */
const SELL_COMMISSION = 0.05;
const SHIPPING_EUR = 7;

/** Limite de la ruta /api/cards: mas alla, se dice, no se trunca en silencio. */
const MAX_FETCH = 100;

const EMPTY_IDS: string[] = [];

/* ------------------------------------------------- filas a la ultima marca */

/**
 * Filas vigentes de un conjunto de instrumentos, via GET {locale}/api/cards?ids=...
 * La ruta lleva prefijo de idioma porque el middleware redirige todo lo que no
 * lo lleve; localePath lo construye igual que en cualquier enlace del sitio.
 * La clave del efecto es la lista ya codificada: solo se vuelve a pedir cuando
 * cambian los ids, no en cada render.
 */
function useCardMap(ids: string[], locale: Locale) {
  const key = ids.slice(0, MAX_FETCH).map(encodeURIComponent).join(",");
  const base = localePath(locale, "api/cards");
  const [state, setState] = useState<{ key: string; cards: Map<string, CardRow> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!key) {
      setState({ key, cards: new Map() });
      return;
    }
    let cancelled = false;
    setFailed(false);
    fetch(`${base}?ids=${key}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ cards: CardRow[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ key, cards: new Map(data.cards.map((c) => [c.instrument_id, c])) });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [key, base]);

  const loading = !failed && (state === null || state.key !== key);
  return { cards: state?.cards ?? new Map<string, CardRow>(), loading, failed };
}

/* ----------------------------------------------------------------- piezas UI */

const GHOST_BTN: CSSProperties = {
  font: "inherit",
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-dim)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const PRIMARY_BTN: CSSProperties = {
  font: "inherit",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 16px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--bg)",
  cursor: "pointer",
};

/** Sublinea de una cabecera de tabla: advertencia pegada a su columna. */
const TH_SUB: CSSProperties = {
  display: "block",
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: 0,
  fontSize: 10,
  color: "var(--text-faint)",
};

const CELL_META: CSSProperties = { fontSize: 11.5 };

/** Identidad de una carta en una celda: nombre enlazado + edicion y variante. */
function CardCell({ card, locale }: { card: CardRow; locale: Locale }) {
  const c = pick(common, locale);
  return (
    <div style={{ minWidth: 180 }}>
      <a href={localePath(locale, cardHref(card.instrument_id))} style={{ fontWeight: 550 }}>
        {card.name ?? card.card_id}
      </a>
      <div className="faint" style={CELL_META}>
        {card.set_name ?? card.set_id ?? "—"}
        {card.local_id ? ` · ${card.local_id}` : ""}
        {" · "}
        {variantName(c, card.variant_type, card.variant_subtype)}
        {" · "}
        {LANG_TAG[card.lang]}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- panel de vigiladas */

export default function WatchlistPanel({ locale }: { locale: Locale }) {
  const t = pick(user, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);
  const { ids, ready, toggle } = useWatchlist();

  const shown = useMemo(() => ids.slice(0, MAX_FETCH), [ids]);
  const { cards, loading, failed } = useCardMap(ready ? shown : EMPTY_IDS, locale);

  return (
    <section>
      <p className="sub" style={{ marginBottom: 12 }}>{t.watchlist.intro}</p>

      {!ready || (loading && shown.length > 0) ? (
        <p className="faint" style={{ fontSize: 13 }}>{t.watchlist.loading}</p>
      ) : failed ? (
        <p className="neg" style={{ fontSize: 13 }}>{t.watchlist.error}</p>
      ) : shown.length === 0 ? (
        <div className="note">{t.watchlist.empty}</div>
      ) : (
        <div className="card scroll-x">
          <table className="grid">
            <thead>
              <tr>
                <th>{t.watchlist.colCard}</th>
                <th className="r">{t.watchlist.colPrice}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((id) => {
                const card = cards.get(id) ?? null;
                return (
                  <tr key={id}>
                    <td>
                      {card ? (
                        <CardCell card={card} locale={locale} />
                      ) : (
                        <div style={{ minWidth: 180 }}>
                          <span className="num faint" style={{ fontSize: 11.5, wordBreak: "break-all" }}>
                            {id}
                          </span>
                          <div className="faint" style={CELL_META}>{t.watchlist.notFound}</div>
                        </div>
                      )}
                    </td>
                    <td className="r">
                      {card?.price_eur != null ? (
                        <>
                          <span className="num" style={{ fontWeight: 600 }}>{f.eur(card.price_eur)}</span>
                          <div className="faint" style={{ fontSize: 10.5 }}>
                            {t.watchlist.markOf(f.date(card.obs_date))}
                          </div>
                        </>
                      ) : (
                        <span className="faint">{c.noData}</span>
                      )}
                    </td>
                    <td className="r">
                      <button
                        type="button"
                        style={GHOST_BTN}
                        title={`${t.watch.remove} — ${t.watch.savedNote}`}
                        onClick={() => toggle(id)}
                      >
                        {t.watchlist.remove}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ready && ids.length > MAX_FETCH && (
        <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          {t.watchlist.capped(f.num(ids.length))}
        </p>
      )}
    </section>
  );
}

/* --------------------------------------------------------- gestor de cartera */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function PortfolioManager({ locale }: { locale: Locale }) {
  const t = pick(user, locale);
  const f = makeFormatters(locale);
  const { positions, ready, add, remove } = usePortfolio();

  /* --- buscador de cartas --- */
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CardRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CardRow | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`${localePath(locale, "api/cards")}?q=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ cards: CardRow[] }>;
        })
        .then((data) => {
          if (cancelled) return;
          setResults(data.cards);
          setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, locale]);

  const qtyN = Math.floor(Number(qty));
  const priceN = Number(price);
  const formValid =
    selected !== null &&
    qty.trim() !== "" && Number.isFinite(qtyN) && qtyN >= 1 &&
    price.trim() !== "" && Number.isFinite(priceN) && priceN >= 0;

  const pickCard = (card: CardRow) => {
    setSelected(card);
    setResults(null);
    setQty("1");
    setPrice(card.price_eur != null ? String(round2(card.price_eur)) : "");
  };

  const clearForm = () => {
    setSelected(null);
    setResults(null);
    setQ("");
    setQty("1");
    setPrice("");
  };

  const submit = () => {
    if (!selected || !formValid) return;
    add({ instrument_id: selected.instrument_id, buy_price_eur: round2(priceN), qty: qtyN });
    clearForm();
  };

  /* --- marcas vigentes para las posiciones --- */
  const posIds = useMemo(
    () => [...new Set(positions.map((p) => p.instrument_id))],
    [positions],
  );
  const { cards, loading, failed } = useCardMap(ready ? posIds : EMPTY_IDS, locale);

  /* --- las tres cifras por posicion, y los totales --- */
  let totalQty = 0;
  let totalCost = 0;
  let pricedCost = 0;
  let totalValue = 0;
  let totalNet = 0;
  let priced = 0;
  const rows = positions.map((p) => {
    const card = cards.get(p.instrument_id) ?? null;
    const cost = p.qty * p.buy_price_eur;
    const value = card?.price_eur != null ? p.qty * card.price_eur : null;
    const net = value != null ? value * (1 - SELL_COMMISSION) - SHIPPING_EUR : null;
    totalQty += p.qty;
    totalCost += cost;
    if (value != null && net != null) {
      priced += 1;
      pricedCost += cost;
      totalValue += value;
      totalNet += net;
    }
    return { p, card, cost, value, net };
  });
  const unpriced = positions.length - priced;

  const signedEur = (v: number) => `${v >= 0 ? "+" : "−"}${f.eur(Math.abs(v))}`;

  return (
    <section>
      {/* ------------------------------------------------ alta de posiciones */}
      <div className="card pad" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>{t.portfolio.addTitle}</h2>

        <label
          htmlFor="pf-search"
          className="dim"
          style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}
        >
          {t.portfolio.searchLabel}
        </label>
        <input
          id="pf-search"
          type="text"
          value={q}
          placeholder={t.portfolio.searchPlaceholder}
          onChange={(e) => {
            setQ(e.target.value);
            setSelected(null);
          }}
          style={{ width: "100%", maxWidth: 440 }}
        />

        {searching && (
          <p className="faint" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            {t.portfolio.searching}
          </p>
        )}

        {!searching && !selected && results !== null && results.length === 0 && (
          <p className="faint" style={{ fontSize: 12.5, margin: "8px 0 0" }}>
            {t.portfolio.noResults(q.trim())}
          </p>
        )}

        {!selected && results !== null && results.length > 0 && (
          <div
            className="card"
            style={{ marginTop: 8, maxWidth: 440, maxHeight: 300, overflowY: "auto" }}
          >
            {results.map((card) => (
              <button
                key={card.instrument_id}
                type="button"
                onClick={() => pickCard(card)}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  font: "inherit",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 550, fontSize: 13 }}>{card.name ?? card.card_id}</span>
                  <span className="faint" style={{ display: "block", fontSize: 11.5 }}>
                    {card.set_name ?? card.set_id ?? "—"}
                    {card.local_id ? ` · ${card.local_id}` : ""}
                    {" · "}
                    {LANG_TAG[card.lang]}
                  </span>
                </span>
                <span className="num" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {card.price_eur != null ? f.eur(card.price_eur) : "—"}
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 14 }}>
            <CardCell card={selected} locale={locale} />
            <p className="dim" style={{ fontSize: 12.5, margin: "4px 0 12px" }}>
              {selected.price_eur != null
                ? t.portfolio.currentMark(f.eur(selected.price_eur))
                : t.portfolio.noMark}
              {selected.price_eur != null && selected.obs_date ? (
                <span className="faint"> · {t.portfolio.table.markOf(f.date(selected.obs_date))}</span>
              ) : null}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
              <div>
                <label
                  htmlFor="pf-qty"
                  className="dim"
                  style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}
                >
                  {t.portfolio.qtyLabel}
                </label>
                <input
                  id="pf-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  style={{ width: 90 }}
                />
              </div>
              <div>
                <label
                  htmlFor="pf-price"
                  className="dim"
                  style={{ display: "block", fontSize: 12.5, marginBottom: 4 }}
                >
                  {t.portfolio.priceLabel}
                </label>
                <input
                  id="pf-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  style={{ width: 140 }}
                />
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!formValid}
                title={t.watch.savedNote}
                style={{ ...PRIMARY_BTN, opacity: formValid ? 1 : 0.5 }}
              >
                {t.portfolio.addButton}
              </button>
              <button type="button" onClick={clearForm} style={GHOST_BTN}>
                {t.portfolio.cancel}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- tabla de posiciones */}
      {!ready ? null : positions.length === 0 ? (
        <div className="note">{t.portfolio.empty}</div>
      ) : failed ? (
        <p className="neg" style={{ fontSize: 13 }}>{t.watchlist.error}</p>
      ) : loading ? (
        <p className="faint" style={{ fontSize: 13 }}>{t.watchlist.loading}</p>
      ) : (
        <>
          <div className="card scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t.portfolio.table.position}</th>
                  <th className="r">{t.portfolio.table.qty}</th>
                  <th className="r">{t.portfolio.table.buyPrice}</th>
                  <th className="r">{t.portfolio.table.cost}</th>
                  <th className="r">
                    {t.portfolio.table.markValue}
                    <span style={TH_SUB}>{t.portfolio.table.markValueNote}</span>
                  </th>
                  <th className="r" style={{ background: "var(--accent-soft)" }}>
                    {t.portfolio.table.net}
                    <span style={TH_SUB}>{t.portfolio.table.netNote}</span>
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, card, cost, value, net }) => (
                  <tr key={`${p.instrument_id}|${p.added_at}`}>
                    <td>
                      {card ? (
                        <CardCell card={card} locale={locale} />
                      ) : (
                        <div style={{ minWidth: 180 }}>
                          <span className="num faint" style={{ fontSize: 11.5, wordBreak: "break-all" }}>
                            {p.instrument_id}
                          </span>
                          <div className="faint" style={CELL_META}>{t.watchlist.notFound}</div>
                        </div>
                      )}
                    </td>
                    <td className="r num">{f.num(p.qty)}</td>
                    <td className="r num">{f.eur(p.buy_price_eur)}</td>
                    <td className="r num">{f.eur(cost)}</td>
                    <td className="r">
                      {value != null ? (
                        <>
                          <span className="num">{f.eur(value)}</span>
                          <div className="faint" style={{ fontSize: 10.5 }}>
                            {t.portfolio.table.markOf(f.date(card?.obs_date ?? null))}
                          </div>
                        </>
                      ) : (
                        <span className="faint">{t.portfolio.table.noPrice}</span>
                      )}
                    </td>
                    <td className="r" style={{ background: "var(--accent-soft)" }}>
                      {net != null ? (
                        <>
                          <span className="num" style={{ fontWeight: 650 }}>{f.eur(net)}</span>
                          <div
                            className={`num ${net - cost >= 0 ? "pos" : "neg"}`}
                            style={{ fontSize: 10.5 }}
                          >
                            {signedEur(net - cost)}
                          </div>
                        </>
                      ) : (
                        <span className="faint">{t.portfolio.table.noPrice}</span>
                      )}
                    </td>
                    <td className="r">
                      <button
                        type="button"
                        style={GHOST_BTN}
                        title={`${t.portfolio.table.remove} — ${t.watch.savedNote}`}
                        onClick={() => remove(p)}
                      >
                        {t.portfolio.table.remove}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 600, borderTop: "1px solid var(--border-strong)" }}>
                    {t.portfolio.table.total}
                  </td>
                  <td className="r num" style={{ borderTop: "1px solid var(--border-strong)" }}>
                    {f.num(totalQty)}
                  </td>
                  <td style={{ borderTop: "1px solid var(--border-strong)" }} />
                  <td
                    className="r num"
                    style={{ fontWeight: 600, borderTop: "1px solid var(--border-strong)" }}
                  >
                    {f.eur(totalCost)}
                  </td>
                  <td className="r num" style={{ borderTop: "1px solid var(--border-strong)" }}>
                    {priced > 0 ? f.eur(totalValue) : "—"}
                  </td>
                  <td
                    className="r"
                    style={{
                      background: "var(--accent-soft)",
                      borderTop: "1px solid var(--border-strong)",
                    }}
                  >
                    {priced > 0 ? (
                      <>
                        <span className="num" style={{ fontWeight: 650 }}>{f.eur(totalNet)}</span>
                        <div
                          className={`num ${totalNet - pricedCost >= 0 ? "pos" : "neg"}`}
                          style={{ fontSize: 10.5 }}
                        >
                          {signedEur(totalNet - pricedCost)}
                        </div>
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td style={{ borderTop: "1px solid var(--border-strong)" }} />
                </tr>
              </tfoot>
            </table>
          </div>

          {unpriced > 0 && (
            <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>
              {t.portfolio.table.unpriced(unpriced, f.num(unpriced))}
            </p>
          )}
          <p className="faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.55 }}>
            {t.portfolio.costsNote}
          </p>
        </>
      )}
    </section>
  );
}
