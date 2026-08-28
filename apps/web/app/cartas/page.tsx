import type { CSSProperties } from "react";
import type { Metadata } from "next";
import CardTile from "@/components/CardTile";
import { eur, pct } from "@/lib/format";
import { getCards, getFilterOptions, getMarketStats } from "@/lib/queries";

/** Lee de SQLite en cada peticion: nada que prerenderizar. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explorador de cartas — Cartoteca",
  description:
    "Todas las cartas Pokémon con precio de Cardmarket, filtrables por idioma, set, rareza, ilustrador y precio mínimo.",
};

type SP = Record<string, string | string[] | undefined>;

const SORTS = [
  { value: "price_desc", label: "Precio: de mayor a menor" },
  { value: "price_asc", label: "Precio: de menor a mayor" },
  { value: "name", label: "Nombre: A → Z" },
  { value: "release_desc", label: "Lanzamiento: más reciente" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

const PER = [24, 60, 120] as const;
const LANGS = [
  { value: "en", label: "Inglés" },
  { value: "ja", label: "Japonés" },
] as const;

const INT = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

const CAPTION: CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const FIELD: CSSProperties = { width: "100%", maxWidth: "100%" };

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : undefined;
}

function year(iso: string | null): string {
  return iso ? iso.slice(0, 4) : "s/f";
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(d);
}

export default async function CartasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  // ---- Estado, todo en la URL. Sin JavaScript de cliente: el formulario es GET
  // y cada filtro, cada pagina y cada orden son un enlace compartible.
  const q = one(sp.q);
  const langRaw = one(sp.lang);
  const lang = LANGS.find((l) => l.value === langRaw)?.value;
  const set = one(sp.set);
  const rarity = one(sp.rarity);
  const artist = one(sp.artist);

  const minRaw = one(sp.minPrice) ?? one(sp.min);
  const minParsed = minRaw ? Number(minRaw.replace(",", ".")) : NaN;
  const minPrice = Number.isFinite(minParsed) && minParsed > 0 ? minParsed : undefined;

  const sort: Sort = SORTS.find((s) => s.value === one(sp.sort))?.value ?? "price_desc";
  const per: number = PER.find((p) => p === Number(one(sp.per))) ?? 60;
  const pageRaw = Math.floor(Number(one(sp.page) ?? 1));
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? pageRaw : 1;

  const { rows, total } = getCards({
    q, lang, set, rarity, artist, minPrice, sort, limit: per, offset: (page - 1) * per,
  });
  const opts = getFilterOptions();
  const stats = getMarketStats();

  const pages = Math.max(1, Math.ceil(total / per));
  const from = total === 0 ? 0 : (page - 1) * per + 1;
  const to = (page - 1) * per + rows.length;

  // URL canonica: solo los parametros que siguen activos.
  const base = new URLSearchParams();
  if (q) base.set("q", q);
  if (lang) base.set("lang", lang);
  if (set) base.set("set", set);
  if (rarity) base.set("rarity", rarity);
  if (artist) base.set("artist", artist);
  if (minPrice != null) base.set("minPrice", String(minPrice));
  if (sort !== "price_desc") base.set("sort", sort);
  if (per !== 60) base.set("per", String(per));
  if (page > 1) base.set("page", String(page));

  const href = (patch: Record<string, string | null>): string => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    return s ? `/cartas?${s}` : "/cartas";
  };

  const setRows = opts.sets.filter((s) => s.set_id === set);
  const setName = setRows[0]?.name ?? set;
  // Cuatro set_id (neo1–neo4) existen en ingles y en japones: filtrar por set sin
  // filtrar por idioma devuelve los dos. Se avisa en vez de mezclar en silencio.
  const setAmbiguous = setRows.length > 1 && !lang;

  const chips: Array<{ key: string; label: string }> = [];
  if (q) chips.push({ key: "q", label: `Nombre contiene «${q}»` });
  if (lang) chips.push({ key: "lang", label: `Idioma: ${LANGS.find((l) => l.value === lang)?.label}` });
  if (set) chips.push({ key: "set", label: `Set: ${setName}` });
  if (rarity) chips.push({ key: "rarity", label: `Rareza: ${rarity}` });
  if (artist) chips.push({ key: "artist", label: `Ilustrador: ${artist}` });
  if (minPrice != null) chips.push({ key: "minPrice", label: `Desde ${eur(minPrice)}` });

  const filtered = chips.length > 0;
  // Dos denominadores, porque son dos cosas distintas: el coste de ida y vuelta solo
  // se puede calcular donde hay precio. Decir solo el del catalogo entero exagera la
  // exclusion; decir solo el de los instrumentos con precio la disimula.
  const investableShare = stats.instruments > 0 ? stats.investable / stats.instruments : 0;
  const investablePriced = stats.priced > 0 ? stats.investable / stats.priced : 0;

  return (
    <>
      <h1>Explorador de cartas</h1>
      <p className="sub">
        Cada resultado es un <strong>instrumento</strong>: una carta concreta, en un idioma y con una
        variante determinada (normal, holo, reverse, 1ª edición). Una misma ilustración aparece varias
        veces si tiene varias variantes, y cada baldosa dice cuál es. {INT.format(stats.instruments)}{" "}
        instrumentos de {INT.format(stats.cards)} cartas y {INT.format(stats.sets)} sets.
      </p>

      <form method="get" className="card pad" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(165px, 100%), 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Nombre</span>
            <input type="text" name="q" defaultValue={q ?? ""} placeholder="Charizard…" style={FIELD} />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Idioma</span>
            <select name="lang" defaultValue={lang ?? ""} style={FIELD}>
              <option value="">Todos</option>
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Set</span>
            <select name="set" defaultValue={set ?? ""} style={FIELD}>
              <option value="">Todos los sets ({INT.format(opts.sets.length)})</option>
              <optgroup label="Inglés">
                {opts.sets.filter((s) => s.lang === "en").map((s) => (
                  <option key={`en-${s.set_id}`} value={s.set_id}>
                    {s.name} · {year(s.release_date)} · {s.n} cartas
                  </option>
                ))}
              </optgroup>
              <optgroup label="Japonés">
                {opts.sets.filter((s) => s.lang === "ja").map((s) => (
                  <option key={`ja-${s.set_id}`} value={s.set_id}>
                    {s.name} · {year(s.release_date)} · {s.n} cartas
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Rareza</span>
            <select name="rarity" defaultValue={rarity ?? ""} style={FIELD}>
              <option value="">Todas</option>
              {opts.rarities.map((r) => (
                <option key={r.rarity} value={r.rarity}>{r.rarity} ({r.n})</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Ilustrador</span>
            <select name="artist" defaultValue={artist ?? ""} style={FIELD}>
              <option value="">Todos ({INT.format(opts.artists.length)})</option>
              {opts.artists.map((a) => (
                <option key={a.illustrator} value={a.illustrator}>{a.illustrator} ({a.n})</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Precio mínimo (€)</span>
            <input
              type="number" name="minPrice" min="0" step="0.01" inputMode="decimal"
              defaultValue={minPrice != null ? String(minPrice) : ""} placeholder="0,00" style={FIELD}
            />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Orden</span>
            <select name="sort" defaultValue={sort} style={FIELD}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>Por página</span>
            <select name="per" defaultValue={String(per)} style={FIELD}>
              {PER.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="submit"
              style={{
                background: "var(--accent-soft)", color: "var(--accent)",
                border: "1px solid var(--accent)", borderRadius: 6,
                padding: "6px 14px", fontSize: 13, fontWeight: 600,
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              Aplicar
            </button>
            {filtered && <a className="dim" href="/cartas" style={{ fontSize: 12.5 }}>Limpiar</a>}
          </div>
        </div>
      </form>

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
          <span className="faint" style={{ ...CAPTION, marginRight: 2 }}>Filtros</span>
          {chips.map((c) => (
            <a key={c.key} className="tag acc" href={href({ [c.key]: null, page: null })} title="Quitar este filtro">
              {c.label} ✕
            </a>
          ))}
        </div>
      )}

      {setAmbiguous && (
        <p className="note" style={{ marginBottom: 12 }}>
          El identificador <span className="num">{set}</span> corresponde a un set que existe en inglés y en
          japonés ({setRows.map((s) => s.name).join(" / ")}). Los resultados mezclan ambos: usa el filtro de
          idioma para separarlos.
        </p>
      )}

      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline",
          justifyContent: "space-between", marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13 }}>
          <span className="num" style={{ fontWeight: 600, fontSize: 15 }}>{INT.format(total)}</span>{" "}
          <span className="dim">
            {total === 1 ? "instrumento" : "instrumentos"}
            {filtered ? " con estos filtros" : " en el catálogo"}
            {total > 0 && ` · mostrando ${INT.format(from)}–${INT.format(to)}`}
          </span>
        </div>
        {pages > 1 && (
          <span className="dim" style={{ fontSize: 12.5 }}>
            Página <span className="num">{INT.format(page)}</span> de{" "}
            <span className="num">{INT.format(pages)}</span>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="note">
          {total === 0
            ? "Ningún instrumento cumple estos filtros. Prueba a bajar el precio mínimo o a soltar el idioma: un ilustrador concreto dentro de un set concreto es una combinación que muchas veces no existe, y el catálogo además deja fuera las cartas digitales y los productos de Cardmarket compartidos por varias cartas."
            : "Esta página está fuera del rango de resultados."}{" "}
          <a href={total === 0 ? "/cartas" : href({ page: null })} style={{ color: "var(--accent)" }}>
            {total === 0 ? "Quitar todos los filtros" : "Volver a la primera página"}
          </a>
        </p>
      ) : (
        <div className="tiles">
          {rows.map((c) => (
            <CardTile key={c.instrument_id} card={c} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav
          style={{
            display: "flex", gap: 8, alignItems: "center", justifyContent: "center",
            flexWrap: "wrap", marginTop: 24,
          }}
        >
          {page > 1 ? (
            <>
              <a className="tag" href={href({ page: null })}>« Primera</a>
              <a className="tag" href={href({ page: String(page - 1) })}>‹ Anterior</a>
            </>
          ) : (
            <>
              <span className="tag faint">« Primera</span>
              <span className="tag faint">‹ Anterior</span>
            </>
          )}
          <span className="num dim" style={{ fontSize: 12.5, padding: "0 6px" }}>
            {INT.format(page)} / {INT.format(pages)}
          </span>
          {page < pages ? (
            <>
              <a className="tag" href={href({ page: String(page + 1) })}>Siguiente ›</a>
              <a className="tag" href={href({ page: String(pages) })}>Última »</a>
            </>
          ) : (
            <>
              <span className="tag faint">Siguiente ›</span>
              <span className="tag faint">Última »</span>
            </>
          )}
        </nav>
      )}

      <div className="note" style={{ marginTop: 24 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Qué es este precio.</strong> Es la <em>tendencia</em> de Cardmarket en euros de la última
          observación de cada instrumento. {INT.format(stats.priced)} de {INT.format(stats.instruments)}{" "}
          instrumentos tienen precio; los demás aparecen como «sin precio», nunca como 0 €. Quedan fuera del
          catálogo las cartas digitales de TCG Pocket y los instrumentos cuyo producto de Cardmarket está
          compartido por varias cartas, porque su precio no es atribuible a una sola.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Por qué no hay variaciones.</strong> El archivo propio tiene {stats.days}{" "}
          {stats.days === 1 ? "día" : "días"} de observaciones (desde el {fecha(stats.firstDay)}). Con eso no se puede
          calcular ninguna variación honesta, así que esta pantalla no muestra ninguna.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Casi nada es invertible.</strong> Solo {INT.format(stats.investable)} instrumentos tienen un
          coste de ida y vuelta igual o inferior al 25%: el {pct(investablePriced, 1)} de los{" "}
          {INT.format(stats.priced)} que cotizan —el coste no se puede calcular sin precio— y el{" "}
          {pct(investableShare, 1)} del catálogo completo. Los portes son un coste fijo: por debajo de unos
          pocos euros, comprar y revender pierde dinero por construcción, y la mediana del catálogo cotiza por
          debajo de un euro. El ranking de inversión trabaja solo sobre ese subconjunto.
        </p>
      </div>
    </>
  );
}
