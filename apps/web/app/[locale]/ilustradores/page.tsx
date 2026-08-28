import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getArtists, getCardSignals, getMarketStats, getScreener } from "@/lib/queries";
import type { ArtistPremium } from "@/lib/types";
import { coerceLocale, localePath, makeFormatters, pick } from "@/lib/i18n";
import { artists as dict, type Chunk } from "@/lib/i18n/artists";

// El precio de la carta se lee en la ficha; esta pagina se lee contra la base de
// datos en cada peticion para que las cifras nunca queden congeladas en el build.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return pick(dict, coerceLocale((await params).locale)).meta;
}

type Key = "artist" | "n" | "raw" | "shrunk" | "weight";
type Dir = "asc" | "desc";

const KEYS: Key[] = ["artist", "n", "raw", "shrunk", "weight"];
const MINS = [30, 100, 300];

/** Escala de la barra divergente: ±0,30 sobre la base cubre todo el rango observado. */
const SPAN = 0.3;

function PremiumBar({ v }: { v: number }) {
  const d = v - 0.5;
  const half = Math.min(Math.abs(d) / SPAN, 1) * 50;
  const up = d >= 0;
  return (
    <span
      className="contrib-bar"
      style={{ display: "inline-block", width: 84, flex: "0 0 auto" }}
      aria-hidden="true"
    >
      <i style={{ left: "50%", width: 1, background: "var(--border-strong)", borderRadius: 0 }} />
      <i
        style={{
          left: up ? "50%" : `${50 - half}%`,
          width: `${half}%`,
          background: up ? "var(--pos)" : "var(--neg)",
        }}
      />
    </span>
  );
}

export default async function IlustradoresPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const locale = coerceLocale((await params).locale);
  const t = pick(dict, locale);
  const f = makeFormatters(locale);

  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  // Los nombres de parametro no se traducen: un enlace compartido tiene que seguir
  // funcionando cuando el que lo abre lee la pagina en otro idioma.
  const rawKey = first(sp.orden);
  const key: Key = KEYS.includes(rawKey as Key) ? (rawKey as Key) : "shrunk";
  const dir: Dir = first(sp.dir) === "asc" ? "asc" : "desc";
  const minParam = Number(first(sp.min));
  const min = MINS.includes(minParam) ? minParam : 30;

  const rows = getArtists(min);

  if (rows.length === 0) {
    return (
      <>
        <h1>{t.h1}</h1>
        <p className="sub">{t.empty.none(min)}</p>
        <div className="note">
          {t.empty.tryLower}{" "}
          <Link href={localePath(locale, "ilustradores")} style={{ color: "var(--accent)" }}>
            {t.controls.nAtLeast(30)}
          </Link>
          .
        </div>
      </>
    );
  }

  const stats = getMarketStats();

  // La fiabilidad de la senal se calcula en el motor y viaja dentro del detalle de
  // cada senal artist_premium. Se lee de ahi en vez de escribirla a mano: si el
  // motor la recalcula, esta pagina cambia sola.
  const reliability = readReliability();
  const reliabilityText =
    reliability === null ? t.how.step4.unavailable : f.pct(reliability, 1);

  const sorted = [...rows].sort((x, y) => {
    const s = dir === "asc" ? 1 : -1;
    if (key === "artist") return s * x.artist.localeCompare(y.artist, locale);
    const val = (a: ArtistPremium) =>
      key === "n" ? a.n : key === "raw" ? a.raw_mean : key === "shrunk" ? a.shrunk : a.weight;
    return s * (val(x) - val(y));
  });

  const investablePct = stats.priced > 0 ? stats.investable / stats.priced : null;
  const covered = rows.reduce((s, a) => s + a.n, 0);
  const shrunks = rows.map((a) => a.shrunk);
  const weights = rows.map((a) => a.weight);
  const loShrunk = Math.min(...shrunks);
  const hiShrunk = Math.max(...shrunks);

  const hrefFor = (k: Key) => {
    const d: Dir = key === k ? (dir === "desc" ? "asc" : "desc") : k === "artist" ? "asc" : "desc";
    const q = new URLSearchParams({ orden: k, dir: d });
    if (min !== 30) q.set("min", String(min));
    return `${localePath(locale, "ilustradores")}?${q.toString()}`;
  };

  const hrefForMin = (m: number) => {
    const q = new URLSearchParams({ orden: key, dir });
    if (m !== 30) q.set("min", String(m));
    return `${localePath(locale, "ilustradores")}?${q.toString()}`;
  };

  const cardsHref = (artist: string) =>
    `${localePath(locale, "cartas")}?artist=${encodeURIComponent(artist)}`;

  const arrow = (k: Key) => (key === k ? (dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <>
      <h1>{t.h1}</h1>
      <p className="sub">{t.sub}</p>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="v">{f.num(rows.length)}</div>
          <div className="k">{t.stats.artists}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(covered)}</div>
          <div className="k">{t.stats.instruments}</div>
        </div>
        <div className="stat">
          <div className="v">{reliability === null ? "—" : f.pct(reliability, 1)}</div>
          <div className="k">{t.stats.reliability}</div>
        </div>
        <div className="stat">
          <div className="v" style={{ fontSize: 16 }}>
            {t.fmt.p3(loShrunk)} – {t.fmt.p3(hiShrunk)}
          </div>
          <div className="k">{t.stats.range}</div>
        </div>
        <div className="stat">
          <div className="v">{f.num(min)}</div>
          <div className="k">{t.stats.min}</div>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>{t.how.title}</h2>
        <p className="dim" style={{ margin: "0 0 12px", fontSize: 13 }}>
          {t.how.intro}
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
          <li style={{ marginBottom: 10 }}>
            <B>{t.how.step1.title}</B> <Rich parts={t.how.step1.body} />
          </li>
          <li style={{ marginBottom: 10 }}>
            <B>{t.how.step2.title}</B> <Rich parts={t.how.step2.body} />
          </li>
          <li style={{ marginBottom: 10 }}>
            <B>{t.how.step3.title}</B> <Rich parts={t.how.step3.body} />
            {t.how.step3.weights(f.pct(Math.min(...weights), 0), f.pct(Math.max(...weights), 0))}
          </li>
          <li>
            <B>{t.how.step4.title}</B> <Rich parts={t.how.step4.body(reliabilityText)} />
          </li>
        </ol>
      </div>

      <div className="note" style={{ marginBottom: 20 }}>
        <B>{t.level.lead}</B>
        <Rich parts={t.level.body} />
        <Rich
          parts={t.level.buyable(
            f.num(stats.investable),
            f.num(stats.priced),
            investablePct === null ? null : f.pct(investablePct, 1),
          )}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <span className="faint" style={{ fontSize: 12 }}>
          {t.controls.minLabel}
        </span>
        {MINS.map((m) => (
          <Link key={m} href={hrefForMin(m)} className={m === min ? "tag acc" : "tag"}>
            {t.controls.nAtLeast(m)}
          </Link>
        ))}
        <span className="faint" style={{ fontSize: 12, marginLeft: "auto" }}>
          {t.controls.sortHint(f.num(sorted.length))}
        </span>
      </div>

      <div className="card scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th className="r" style={{ width: 44 }}>
                {t.table.rank}
              </th>
              <th>
                <Link href={hrefFor("artist")}>
                  {t.table.artist}
                  {arrow("artist")}
                </Link>
              </th>
              <th className="r" title={t.table.nTitle}>
                <Link href={hrefFor("n")}>
                  {t.table.n}
                  {arrow("n")}
                </Link>
              </th>
              <th className="r" title={t.table.rawTitle}>
                <Link href={hrefFor("raw")}>
                  {t.table.raw}
                  {arrow("raw")}
                </Link>
              </th>
              <th className="r" title={t.table.shrunkTitle}>
                <Link href={hrefFor("shrunk")}>
                  {t.table.shrunk}
                  {arrow("shrunk")}
                </Link>
              </th>
              <th style={{ width: 190 }}>{t.table.deviation}</th>
              <th className="r" title={t.table.weightTitle}>
                <Link href={hrefFor("weight")}>
                  {t.table.weight}
                  {arrow("weight")}
                </Link>
              </th>
              <th className="r" style={{ width: 92 }}>
                {t.table.explore}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const up = a.shrunk >= 0.5;
              return (
                <tr key={a.artist}>
                  <td className="r num faint">{f.num(i + 1)}</td>
                  <td style={{ fontWeight: 550 }}>
                    {/* El nombre del ilustrador es dato de origen: no se traduce. */}
                    <Link href={cardsHref(a.artist)}>{a.artist}</Link>
                  </td>
                  <td className="r num dim">{f.num(a.n)}</td>
                  <td className="r num dim">{t.fmt.p3(a.raw_mean)}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>
                    {t.fmt.p3(a.shrunk)}
                  </td>
                  <td>
                    <span className="contrib">
                      <PremiumBar v={a.shrunk} />
                      <span className={up ? "tag pos" : "tag neg"}>
                        <span className="num">{t.fmt.signed(a.shrunk)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="r num dim">{f.pct(a.weight, 0)}</td>
                  <td className="r">
                    <Link href={cardsHref(a.artist)} className="tag" style={{ fontSize: 11 }}>
                      {t.table.see}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <Rich parts={t.extremes(t.days(stats.days, f.num(stats.days)), f.date(stats.firstDay))} />
        <Link href={localePath(locale, "metodologia")} style={{ color: "var(--accent)" }}>
          {t.methodology}
        </Link>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Pinta los fragmentos del diccionario respetando el orden que fija cada idioma. */
function Rich({ parts }: { parts: readonly Chunk[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : "b" in p ? (
          <B key={i}>{p.b}</B>
        ) : "em" in p ? (
          <em key={i}>{p.em}</em>
        ) : (
          <Formula key={i}>{p.code}</Formula>
        ),
      )}
    </>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: 12,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Lee la fiabilidad global de la senal desde el detalle de un artist_premium vivo. */
function readReliability(): number | null {
  const sample = getScreener({ limit: 40 }).find((c) => c.components.artist_premium !== undefined);
  if (!sample) return null;
  const sig = getCardSignals(sample.instrument_id).find((s) => s.signal === "artist_premium");
  const v = sig?.detail["reliability_global"];
  return typeof v === "number" ? v : null;
}
