import { Fragment } from "react";
import { getMarketStats, getScreener } from "@/lib/queries";
import { resolveImage } from "@/lib/format";
import { coerceLocale, localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { common, type CommonDict } from "@/lib/i18n/common";
import { ranking, type Frag, type RankingDict } from "@/lib/i18n/ranking";
// Ruta canonica a la ficha de un instrumento: codifica los ':' y el '%' literal
// que llevan algunos instrument_id. Se importa en vez de reconstruirla a mano
// para que el ranking y el explorador no se separen nunca. Devuelve la ruta sin
// idioma, asi que se envuelve en localePath() para no sacar al usuario del suyo.
import { cardHref } from "@/components/CardTile";
import ScoreBar, {
  CLIP,
  ScoreBarHeader,
  makeScoreFormat,
  signalColumns,
  signalMeta,
  signalShort,
} from "@/components/ScoreBar";

// Los precios y las senales cambian cada dia y la pagina depende del querystring:
// no tiene sentido congelarla en el build.
export const dynamic = "force-dynamic";

const TOP = 100;
/** Techo defensivo: hoy el universo puntuado son ~1.300 instrumentos. */
const UNIVERSE_CAP = 5000;
const MIN_PRESETS = [50, 100, 300, 1000];

/** Los dos idiomas del catalogo. No son los idiomas de la interfaz. */
const LANGS = [
  { code: "en", short: "EN" },
  { code: "ja", short: "JA" },
] as const;

// Los nombres de las claves del querystring se quedan en espanol: son la URL
// publica de la pagina, no texto visible. Traducirlas romperia los enlaces ya
// compartidos y no le diria nada nuevo a nadie.
type Query = { idioma?: string; min?: string; rareza?: string };

function href(locale: Locale, cur: Query, patch: Query): string {
  const next: Query = { ...cur, ...patch };
  const p = new URLSearchParams();
  if (next.idioma) p.set("idioma", next.idioma);
  if (next.min) p.set("min", next.min);
  if (next.rareza) p.set("rareza", next.rareza);
  const q = p.toString();
  const base = localePath(locale);
  return q ? `${base}?${q}` : base;
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)] ?? null;
}

/** Etiqueta de variante en el idioma de la interfaz. El subtipo es dato: no se traduce. */
function variantName(c: CommonDict, type: string | null, sub: string | null): string {
  const base = type ? (c.variant[type] ?? type) : c.variantNone;
  return sub && sub !== "-" ? `${base} · ${sub}` : base;
}

/**
 * Los nombres de rareza son dato de origen y salen tal cual. La unica excepcion
 * es "None", que no es un nombre sino la ausencia de rareza, y esa si se dice en
 * el idioma del usuario. Vive en una funcion para que la etiqueta visible y el
 * tooltip no puedan volver a decir cosas distintas.
 */
function rarityName(t: RankingDict, rarity: string): string {
  return rarity === "None" ? t.rarityNone : rarity;
}

/**
 * Pinta un parrafo que el diccionario devuelve troceado. La negrita y la
 * tipografia tabular viajan en los fragmentos, de modo que cada idioma puede
 * colocar el enfasis y las cifras donde le corresponda; el japones, por ejemplo,
 * pone los numeros antes del sustantivo y cierra con el verbo.
 */
function Rich({ parts }: { parts: readonly Frag[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === "string") return <Fragment key={i}>{p}</Fragment>;
        const Tag = p.b ? "strong" : "span";
        return (
          <Tag key={i} className={p.n ? "num" : undefined}>
            {p.t}
          </Tag>
        );
      })}
    </>
  );
}

function Filtro({
  activo,
  destino,
  children,
  title,
}: {
  activo: boolean;
  destino: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <a href={destino} className={activo ? "tag acc" : "tag"} title={title}>
      {children}
    </a>
  );
}

function Stat({ v, k, ctx }: { v: string; k: string; ctx?: string }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
      {ctx ? (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4, lineHeight: 1.4 }}>
          {ctx}
        </div>
      ) : null}
    </div>
  );
}

const CAPTION_STYLE = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  width: 92,
} as const;

export default async function Ranking({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const [{ locale: rawLocale }, sp] = await Promise.all([params, searchParams]);
  const locale = coerceLocale(rawLocale);
  const t = pick(ranking, locale);
  const c = pick(common, locale);
  const f = makeFormatters(locale);
  const fmt = makeScoreFormat(locale);

  const idiomaRaw = first(sp.idioma);
  const lang = idiomaRaw === "en" || idiomaRaw === "ja" ? idiomaRaw : undefined;
  const minRaw = first(sp.min);
  const minNum = minRaw === undefined ? NaN : Number(minRaw);
  const minPrice = Number.isFinite(minNum) && minNum > 0 ? minNum : undefined;
  const rareza = first(sp.rareza);
  const cur: Query = { idioma: lang, min: minPrice ? String(minPrice) : undefined, rareza };
  const hayFiltros = Boolean(lang || minPrice || rareza);

  const stats = getMarketStats();

  // Una sola consulta: el universo puntuado bajo los filtros de idioma y precio.
  // De ahi salen a la vez el recuento real, las rarezas disponibles con su
  // frecuencia y las cien filas de la tabla. Son ~1.300 filas: cuesta 12 ms.
  const universo = getScreener({ limit: UNIVERSE_CAP, lang, minPrice });

  const conteoRareza = new Map<string, number>();
  for (const r of universo) {
    if (r.rarity) conteoRareza.set(r.rarity, (conteoRareza.get(r.rarity) ?? 0) + 1);
  }
  const rarezas = [...conteoRareza.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale))
    .filter(([k, n]) => n >= 3 || k === rareza)
    .slice(0, 16);

  const seleccion = rareza ? universo.filter((r) => r.rarity === rareza) : universo;
  const filas = seleccion.slice(0, TOP);
  const cols = signalColumns(filas);

  const precios = seleccion.map((r) => r.price_eur).filter((v): v is number => v != null);
  const masBarata = precios.length ? Math.min(...precios) : null;
  const rtMediano = median(seleccion.map((r) => r.roundtrip_cost).filter((v): v is number => v != null));

  const cotizanPct = stats.priced > 0 ? stats.investable / stats.priced : null;

  // El ranking no es el catalogo ordenado: solo se puntuan los instrumentos
  // invertibles que ademas tienen dos senales o mas, porque con una sola no hay
  // nada con lo que contrastarla. Sin filtros ese total ya lo tenemos; con
  // filtros hace falta preguntar por el universo completo para poder decir de
  // cuantos se ha partido en vez de dejar el hueco sin explicar.
  const totalPuntuado = hayFiltros
    ? getScreener({ limit: UNIVERSE_CAP }).length
    : universo.length;
  const sinPuntuar = Math.max(stats.investable - totalPuntuado, 0);
  // Cuantas de las filas visibles descansan en solo dos de las cuatro senales.
  const dosSenales = filas.filter((r) => Object.keys(r.components).length <= 2).length;

  const leyenda: Frag[] = [
    ...t.legend.body(cols.length),
    ...(filas.length > 0 && dosSenales > 0
      ? t.legend.thin({ two: f.num(dosSenales), rows: f.num(filas.length) })
      : []),
    ...t.legend.clip({ clip: f.num(CLIP), clipped: fmt.score(CLIP) }),
  ];

  return (
    <>
      <h1>{t.title}</h1>
      <p className="sub">{t.intro(f.date(stats.asOf))}</p>

      <div className="stats">
        <Stat v={f.num(stats.cards)} k={t.stat.cards} ctx={t.stat.cardsCtx} />
        <Stat v={f.num(stats.instruments)} k={t.stat.instruments} ctx={t.stat.instrumentsCtx} />
        <Stat
          v={f.num(stats.priced)}
          k={t.stat.priced}
          ctx={t.stat.pricedCtx(f.pct(stats.priced / Math.max(stats.instruments, 1), 0))}
        />
        <Stat
          v={f.num(stats.investable)}
          k={t.stat.investable}
          ctx={t.stat.investableCtx(f.pct(cotizanPct, 1))}
        />
        <Stat
          v={f.num(stats.days)}
          k={t.stat.days}
          ctx={t.stat.daysCtx(f.date(stats.firstDay))}
        />
        <Stat v={f.num(stats.sets)} k={t.stat.sets} ctx={t.stat.setsCtx} />
        <Stat v={f.num(stats.jpEnPairs)} k={t.stat.pairs} ctx={t.stat.pairsCtx} />
        <Stat v={f.num(stats.arbs)} k={t.stat.arbs} ctx={t.stat.arbsCtx} />
      </div>

      <p className="faint" style={{ fontSize: 12.5, margin: "10px 0 18px", maxWidth: "78ch" }}>
        {t.reality({
          priced: f.num(stats.priced),
          investable: f.num(stats.investable),
          scored: f.num(totalPuntuado),
          unscored: sinPuntuar > 0 ? f.num(sinPuntuar) : null,
        })}
      </p>

      <div className="note" style={{ marginBottom: 18 }}>
        <Rich parts={t.method({ days: f.num(stats.days), firstDay: f.date(stats.firstDay) })} />
      </div>

      <div className="card pad" style={{ marginBottom: 18, display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.lang}
          </span>
          <Filtro activo={!lang} destino={href(locale, cur, { idioma: undefined })}>
            {t.filters.langAll}
          </Filtro>
          {LANGS.map((l) => (
            <Filtro
              key={l.code}
              activo={lang === l.code}
              destino={href(locale, cur, { idioma: l.code })}
              title={t.filters.langOnly(c.langName[l.code])}
            >
              {c.langName[l.code]}
            </Filtro>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.minPrice}
          </span>
          <Filtro activo={!minPrice} destino={href(locale, cur, { min: undefined })}>
            {t.filters.minNone}
          </Filtro>
          {MIN_PRESETS.map((m) => (
            <Filtro
              key={m}
              activo={minPrice === m}
              destino={href(locale, cur, { min: String(m) })}
              title={t.filters.minHelp(f.eur(m))}
            >
              {t.filters.minChip(f.num(m))}
            </Filtro>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="faint" style={CAPTION_STYLE}>
            {t.filters.rarity}
          </span>
          <Filtro activo={!rareza} destino={href(locale, cur, { rareza: undefined })}>
            {t.filters.rarityAll}
          </Filtro>
          {rarezas.map(([k, n]) => (
            <Filtro
              key={k}
              activo={rareza === k}
              destino={href(locale, cur, { rareza: k })}
              title={
                k === "None"
                  ? t.filters.rarityNoneHelp(f.num(n))
                  : t.filters.rarityHelp(f.num(n), k)
              }
            >
              {rarityName(t, k)} <span className="num faint">{f.num(n)}</span>
            </Filtro>
          ))}
          {hayFiltros ? (
            <a href={localePath(locale)} className="faint" style={{ fontSize: 12 }}>
              {t.filters.clearAll}
            </a>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          className="pad"
          style={{
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            fontSize: 12.5,
          }}
        >
          <div>
            <Rich
              parts={t.table.caption({
                shown: f.num(Math.min(TOP, seleccion.length)),
                total: f.num(seleccion.length),
                filtered: hayFiltros,
              })}
            />
          </div>
          <div className="dim">
            {masBarata === null ? (
              t.table.noPrices
            ) : (
              <Rich
                parts={t.table.cheapest({
                  price: f.eur(masBarata),
                  roundtrip: rtMediano === null ? null : f.pct(rtMediano, 1),
                })}
              />
            )}
          </div>
        </div>

        {filas.length === 0 ? (
          <div className="pad dim" style={{ padding: 28, textAlign: "center" }}>
            {t.table.empty}{" "}
            <a href={localePath(locale)} style={{ color: "var(--accent)" }}>
              {t.table.clear}
            </a>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="grid">
              <thead>
                <tr>
                  <th className="r">#</th>
                  <th />
                  <th>{t.table.col.card}</th>
                  <th>{t.table.col.illustrator}</th>
                  <th>{t.table.col.lang}</th>
                  <th className="r" title={t.table.col.priceHelp}>
                    {t.table.col.price}
                  </th>
                  <th className="r" title={c.signal.roundtrip_cost.help}>
                    {t.table.col.roundtrip}
                  </th>
                  <th className="r" title={c.signal.invest_score.help}>
                    {t.table.col.score}
                  </th>
                  <th>
                    <div style={{ marginBottom: 3 }}>{t.table.col.breakdown(CLIP)}</div>
                    <ScoreBarHeader keys={cols} locale={locale} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r, i) => {
                  const { src: img, fallbackLang } = resolveImage(r, "low");
                  // La imagen prestada es OTRO objeto fisico: mismo arte, otro
                  // marco y otro texto. Se dice, y se marca con borde discontinuo.
                  const prestada =
                    fallbackLang === "en" || fallbackLang === "ja"
                      ? c.langName[fallbackLang]
                      : fallbackLang;
                  const variante = variantName(c, r.variant_type, r.variant_subtype);
                  const nComp = Object.keys(r.components).length;
                  const alt = t.row.imageAlt({
                    name: r.name ?? t.row.unnamed,
                    set: r.set_name ?? t.row.unknownSet,
                    variant: variante,
                  });
                  return (
                    <tr key={r.instrument_id}>
                      <td className="r num faint">{f.num(i + 1)}</td>
                      <td style={{ width: 46 }}>
                        {img ? (
                          <img
                            src={img}
                            alt={alt}
                            title={prestada ? t.row.imageFallback(prestada) : undefined}
                            width={34}
                            height={47}
                            loading="lazy"
                            decoding="async"
                            style={{
                              borderRadius: 3,
                              display: "block",
                              background: "var(--surface-2)",
                              border: prestada ? "1px dashed var(--border-strong)" : undefined,
                            }}
                          />
                        ) : (
                          <div
                            title={c.noImage}
                            style={{
                              width: 34,
                              height: 47,
                              borderRadius: 3,
                              border: "1px dashed var(--border-strong)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--text-faint)",
                              fontSize: 10,
                            }}
                          >
                            —
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ fontWeight: 550, whiteSpace: "nowrap" }}>
                          <a
                            href={localePath(locale, cardHref(r.instrument_id))}
                            title={t.row.cardLink}
                          >
                            {r.name ?? t.row.unnamed}
                          </a>{" "}
                          {r.local_id ? <span className="num faint">#{r.local_id}</span> : null}
                        </div>
                        <div style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>
                          <span className="faint">
                            {r.set_name ?? t.row.unknownSet}
                            {r.release_date ? ` · ${r.release_date.slice(0, 4)}` : ""}
                            {r.rarity ? ` · ${rarityName(t, r.rarity)}` : ""}
                          </span>{" "}
                          <span
                            className="tag"
                            title={
                              r.cm_variant_ambiguous ? t.row.variantShared : t.row.variantOwn
                            }
                          >
                            {variante}
                          </span>
                          {r.variant_count > 1 ? (
                            <>
                              {" "}
                              <span className="tag" title={t.row.finishesHelp(r.variant_count)}>
                                {t.row.finishesChip(r.variant_count - 1)}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {r.illustrator ? (
                          <a
                            href={`${localePath(locale, "cartas")}?artist=${encodeURIComponent(r.illustrator)}`}
                            title={t.row.illustratorLink(r.illustrator)}
                          >
                            {r.illustrator}
                          </a>
                        ) : (
                          <span className="faint">{t.row.noIllustrator}</span>
                        )}
                      </td>
                      <td>
                        <span className="tag" title={t.row.langTag(c.langName[r.lang])}>
                          {LANGS.find((l) => l.code === r.lang)?.short ?? r.lang.toUpperCase()}
                        </span>
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        <div className="num">{f.eur(r.price_eur)}</div>
                        {r.tcg_market == null ? (
                          <div className="faint" style={{ fontSize: 10.5 }} title={t.row.noTcg}>
                            —
                          </div>
                        ) : (
                          <div
                            className="num faint"
                            style={{ fontSize: 10.5 }}
                            title={t.row.tcgHelp}
                          >
                            {f.usd(r.tcg_market)}
                          </div>
                        )}
                      </td>
                      <td className="r num">
                        {r.roundtrip_cost == null ? (
                          <span className="faint">—</span>
                        ) : (
                          <span className={r.roundtrip_cost <= 0.15 ? "pos" : undefined}>
                            {f.pct(r.roundtrip_cost, 1)}
                          </span>
                        )}
                      </td>
                      <td className="r" style={{ whiteSpace: "nowrap" }}>
                        <div
                          className="num"
                          style={{ fontWeight: 600 }}
                          title={r.score >= CLIP ? t.row.scoreClipped(CLIP) : undefined}
                        >
                          {fmt.score(r.score)}
                        </div>
                        <div
                          className="num faint"
                          style={{ fontSize: 10.5 }}
                          title={t.row.componentsHelp(nComp, cols.length)}
                        >
                          {nComp}/{cols.length}
                        </div>
                      </td>
                      <td>
                        <ScoreBar components={r.components} keys={cols} locale={locale} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card pad" style={{ marginTop: 18 }}>
        <h2>{t.legend.title}</h2>
        <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px", maxWidth: "82ch" }}>
          <Rich parts={leyenda} />
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {cols.map((k) => {
            const m = signalMeta(k, locale);
            return (
              <div key={k}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  <span className="tag num">{signalShort(k)}</span>
                  <span style={{ fontWeight: 550, fontSize: 13 }}>{m?.label ?? k}</span>
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {(m?.help ?? t.legend.noHelp) + (t.legend.extra[k] ?? "")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="faint" style={{ fontSize: 11.5, marginTop: 18, maxWidth: "88ch" }}>
        {t.footer}
      </p>
    </>
  );
}
