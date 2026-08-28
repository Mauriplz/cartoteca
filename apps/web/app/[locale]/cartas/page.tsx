import type { CSSProperties } from "react";
import type { Metadata } from "next";
import CardTile from "@/components/CardTile";
import { LOCALES, coerceLocale, localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { cards as cardsDict } from "@/lib/i18n/cards";
import { common } from "@/lib/i18n/common";
import { getCards, getFilterOptions, getMarketStats } from "@/lib/queries";
import type { Lang } from "@/lib/types";

/** Lee de SQLite en cada peticion: nada que prerenderizar. */
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

/**
 * Los valores de orden y de idioma viajan en la URL y son contrato con la base:
 * no se traducen. Lo unico que cambia por idioma es la etiqueta que los nombra,
 * que sale del diccionario indexada por este mismo valor.
 */
const SORTS = ["price_desc", "price_asc", "name", "release_desc"] as const;
type Sort = (typeof SORTS)[number];

const PER = [24, 60, 120] as const;
const LANGS: readonly Lang[] = ["en", "ja"];

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

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const locale = coerceLocale((await params).locale);
  const t = pick(cardsDict, locale);
  // El layout declara los alternates de la portada; una pagina que trae los
  // suyos los sustituye enteros, asi que aqui se vuelven a listar apuntando a
  // esta misma ruta en cada idioma.
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: {
      canonical: localePath(locale, "cartas"),
      languages: Object.fromEntries(LOCALES.map((l) => [l, localePath(l, "cartas")])),
    },
  };
}

export default async function CartasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const locale: Locale = coerceLocale((await params).locale);
  const sp = await searchParams;

  const t = pick(cardsDict, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);

  /**
   * El ano de un set es un identificador, no una cifra: sin separador de millares.
   * Se entrega crudo (o null si la fuente no lo publica) para que cada idioma lo
   * escriba a su manera; el japones le pone sufijo 年 y el resto no.
   */
  const year = (iso: string | null): string | null => (iso ? iso.slice(0, 4) : null);

  // ---- Estado, todo en la URL. Sin JavaScript de cliente: el formulario es GET
  // y cada filtro, cada pagina y cada orden son un enlace compartible.
  const q = one(sp.q);
  const langRaw = one(sp.lang);
  const lang = LANGS.find((l) => l === langRaw);
  const set = one(sp.set);
  const rarity = one(sp.rarity);
  const artist = one(sp.artist);

  const minRaw = one(sp.minPrice) ?? one(sp.min);
  const minParsed = minRaw ? Number(minRaw.replace(",", ".")) : NaN;
  const minPrice = Number.isFinite(minParsed) && minParsed > 0 ? minParsed : undefined;

  const sort: Sort = SORTS.find((s) => s === one(sp.sort)) ?? "price_desc";
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

  // Ruta del explorador en el idioma actual. El formulario es GET y su action
  // tiene que apuntar aqui: sin el prefijo, aplicar un filtro sacaria al usuario
  // de su idioma en el primer clic.
  const self = localePath(locale, "cartas");

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
    return s ? `${self}?${s}` : self;
  };

  const setRows = opts.sets.filter((s) => s.set_id === set);
  const setName = setRows[0]?.name ?? set;
  // Cuatro set_id (neo1–neo4) existen en ingles y en japones: filtrar por set sin
  // filtrar por idioma devuelve los dos. Se avisa en vez de mezclar en silencio.
  const setAmbiguous = setRows.length > 1 && !lang;

  const chips: Array<{ key: string; label: string }> = [];
  if (q) chips.push({ key: "q", label: t.explorer.chips.q(q) });
  if (lang) chips.push({ key: "lang", label: t.explorer.chips.lang(c.langName[lang]) });
  if (set) chips.push({ key: "set", label: t.explorer.chips.set(setName ?? "") });
  if (rarity) chips.push({ key: "rarity", label: t.explorer.chips.rarity(rarity) });
  if (artist) chips.push({ key: "artist", label: t.explorer.chips.artist(artist) });
  if (minPrice != null) {
    chips.push({ key: "minPrice", label: t.explorer.chips.minPrice(f.eur(minPrice)) });
  }

  const filtered = chips.length > 0;
  // Dos denominadores, porque son dos cosas distintas: el coste de ida y vuelta solo
  // se puede calcular donde hay precio. Decir solo el del catalogo entero exagera la
  // exclusion; decir solo el de los instrumentos con precio la disimula.
  const investableShare = stats.instruments > 0 ? stats.investable / stats.instruments : 0;
  const investablePriced = stats.priced > 0 ? stats.investable / stats.priced : 0;

  return (
    <>
      <h1>{t.explorer.h1}</h1>
      <p className="sub">
        {t.explorer.intro.a}
        <strong>{t.explorer.intro.strong}</strong>
        {t.explorer.intro.b}
        {t.explorer.intro.counts(
          f.num(stats.instruments),
          f.num(stats.cards),
          f.num(stats.sets),
        )}
      </p>

      <form method="get" action={self} className="card pad" style={{ marginBottom: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(165px, 100%), 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.name}</span>
            <input
              type="text" name="q" defaultValue={q ?? ""}
              placeholder={t.explorer.filters.namePlaceholder} style={FIELD}
            />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.language}</span>
            <select name="lang" defaultValue={lang ?? ""} style={FIELD}>
              <option value="">{t.explorer.filters.anyLanguage}</option>
              {LANGS.map((l) => (
                <option key={l} value={l}>{c.langName[l]}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.set}</span>
            <select name="set" defaultValue={set ?? ""} style={FIELD}>
              <option value="">{t.explorer.filters.allSets(f.num(opts.sets.length))}</option>
              {LANGS.map((l) => (
                <optgroup key={l} label={c.langName[l]}>
                  {opts.sets.filter((s) => s.lang === l).map((s) => (
                    <option key={`${l}-${s.set_id}`} value={s.set_id}>
                      {t.explorer.filters.setOption(
                        s.name,
                        year(s.release_date),
                        s.n,
                        f.num(s.n),
                      )}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.rarity}</span>
            <select name="rarity" defaultValue={rarity ?? ""} style={FIELD}>
              <option value="">{t.explorer.filters.anyRarity}</option>
              {opts.rarities.map((r) => (
                <option key={r.rarity} value={r.rarity}>
                  {t.explorer.filters.rarityOption(r.rarity, f.num(r.n))}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.artist}</span>
            <select name="artist" defaultValue={artist ?? ""} style={FIELD}>
              <option value="">{t.explorer.filters.allArtists(f.num(opts.artists.length))}</option>
              {opts.artists.map((a) => (
                <option key={a.illustrator} value={a.illustrator}>
                  {t.explorer.filters.artistOption(a.illustrator, f.num(a.n))}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.minPrice}</span>
            <input
              type="number" name="minPrice" min="0" step="0.01" inputMode="decimal"
              defaultValue={minPrice != null ? String(minPrice) : ""}
              placeholder={t.explorer.filters.minPricePlaceholder} style={FIELD}
            />
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.sort}</span>
            <select name="sort" defaultValue={sort} style={FIELD}>
              {SORTS.map((s) => (
                <option key={s} value={s}>{t.explorer.sort[s]}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 4, minWidth: 0 }}>
            <span className="faint" style={CAPTION}>{t.explorer.filters.perPage}</span>
            <select name="per" defaultValue={String(per)} style={FIELD}>
              {PER.map((p) => (
                <option key={p} value={p}>{f.num(p)}</option>
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
              {t.explorer.filters.apply}
            </button>
            {filtered && (
              <a className="dim" href={self} style={{ fontSize: 12.5 }}>
                {t.explorer.filters.clear}
              </a>
            )}
          </div>
        </div>
      </form>

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
          <span className="faint" style={{ ...CAPTION, marginRight: 2 }}>
            {t.explorer.chips.legend}
          </span>
          {chips.map((chip) => (
            <a
              key={chip.key}
              className="tag acc"
              href={href({ [chip.key]: null, page: null })}
              title={t.explorer.chips.remove}
            >
              {chip.label} ✕
            </a>
          ))}
        </div>
      )}

      {setAmbiguous && (
        <p className="note" style={{ marginBottom: 12 }}>
          {t.explorer.ambiguousSet.a}
          <span className="num">{set}</span>
          {t.explorer.ambiguousSet.b(setRows.map((s) => s.name).join(" / "))}
        </p>
      )}

      <div
        style={{
          display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline",
          justifyContent: "space-between", marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 13 }}>
          <span className="num" style={{ fontWeight: 600, fontSize: 15 }}>{f.num(total)}</span>
          <span className="dim">
            {t.explorer.results.unit(total, filtered)}
            {total > 0 ? t.explorer.results.showing(f.num(from), f.num(to)) : ""}
          </span>
        </div>
        {pages > 1 && (
          <span className="dim" style={{ fontSize: 12.5 }}>
            {t.explorer.results.pageOf(f.num(page), f.num(pages))}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="note">
          {total === 0 ? t.explorer.empty.noMatch : t.explorer.empty.outOfRange}{" "}
          <a href={total === 0 ? self : href({ page: null })} style={{ color: "var(--accent)" }}>
            {total === 0 ? t.explorer.empty.clearAll : t.explorer.empty.backToFirst}
          </a>
        </p>
      ) : (
        <div className="tiles">
          {rows.map((card) => (
            <CardTile key={card.instrument_id} card={card} locale={locale} />
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
              <a className="tag" href={href({ page: null })}>{t.explorer.pagination.first}</a>
              <a className="tag" href={href({ page: String(page - 1) })}>
                {t.explorer.pagination.prev}
              </a>
            </>
          ) : (
            <>
              <span className="tag faint">{t.explorer.pagination.first}</span>
              <span className="tag faint">{t.explorer.pagination.prev}</span>
            </>
          )}
          <span className="num dim" style={{ fontSize: 12.5, padding: "0 6px" }}>
            {f.num(page)} / {f.num(pages)}
          </span>
          {page < pages ? (
            <>
              <a className="tag" href={href({ page: String(page + 1) })}>
                {t.explorer.pagination.next}
              </a>
              <a className="tag" href={href({ page: String(pages) })}>
                {t.explorer.pagination.last}
              </a>
            </>
          ) : (
            <>
              <span className="tag faint">{t.explorer.pagination.next}</span>
              <span className="tag faint">{t.explorer.pagination.last}</span>
            </>
          )}
        </nav>
      )}

      <div className="note" style={{ marginTop: 24 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>{t.explorer.notes.price.title}</strong>
          {t.explorer.notes.price.a}
          <em>{t.explorer.notes.price.em}</em>
          {t.explorer.notes.price.b(f.num(stats.priced), f.num(stats.instruments))}
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>{t.explorer.notes.noChange.title}</strong>
          {t.explorer.notes.noChange.body(stats.days, f.num(stats.days), f.date(stats.firstDay))}
        </p>
        <p style={{ margin: 0 }}>
          <strong>{t.explorer.notes.investable.title}</strong>
          {t.explorer.notes.investable.body(
            f.num(stats.investable),
            f.pct(investablePriced, 1),
            f.num(stats.priced),
            f.pct(investableShare, 1),
          )}
        </p>
      </div>
    </>
  );
}
