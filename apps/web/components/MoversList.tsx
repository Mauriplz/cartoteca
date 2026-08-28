import type { CSSProperties } from "react";
import { resolveImage } from "@/lib/format";
import { ArtworkPlaceholder } from "@/components/CardArtwork";
import { cardHref, LANG_TAG, variantName } from "@/components/CardTile";
import { localePath, makeFormatters, pick, type Locale } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { market } from "@/lib/i18n/market";
import type { getMovers } from "@/lib/queries";

/**
 * Movers entre nuestras DOS ultimas capturas, en dos columnas (suben / bajan).
 *
 * Lo que esta cifra es —y lo que no— gobierna el texto: es la variacion de la
 * marca de tendencia SUAVIZADA de la fuente entre nuestras observaciones. El
 * titular lleva las dos fechas y el intervalo real ("desde nuestra ultima
 * captura", jamas "hoy"), cada fila repite ese intervalo, y el pie declara los
 * filtros aplicados y cuantos artefactos de la fuente se excluyeron. Nada se
 * anualiza.
 */

export type MoverRow = ReturnType<typeof getMovers>[number];

const ONE_LINE: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function MoverItem({ r, locale }: { r: MoverRow; locale: Locale }) {
  const t = pick(market, locale).movers;
  const c = pick(common, locale);
  const f = makeFormatters(locale);

  const { src, origin, fallbackLang, source } = resolveImage(r, "low");
  // La ilustracion prestada es OTRO objeto fisico (misma ilustracion, otra
  // edicion); la externa es la misma carta desde otro CDN. Ambas se etiquetan.
  const borrowedName =
    origin === "alt" && (fallbackLang === "en" || fallbackLang === "ja")
      ? c.langName[fallbackLang]
      : origin === "alt"
        ? fallbackLang
        : null;
  const originTag =
    origin === "alt"
      ? {
          text: t.borrowedTag(
            fallbackLang === "en" || fallbackLang === "ja"
              ? LANG_TAG[fallbackLang]
              : (fallbackLang ?? "?"),
          ),
          title: borrowedName ? c.artwork.borrowed(borrowedName) : undefined,
        }
      : origin === "ext" && source
        ? { text: source, title: c.artwork.external(source) }
        : null;

  const up = r.pct_change >= 0;

  return (
    <a
      href={localePath(locale, cardHref(r.instrument_id))}
      title={t.cardLink}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "8px 12px",
        borderTop: "1px solid var(--border)",
        color: "inherit",
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={34}
          height={47}
          loading="lazy"
          decoding="async"
          style={{
            borderRadius: 3,
            display: "block",
            flex: "0 0 auto",
            background: "var(--surface-2)",
            border: origin === "alt" ? "1px dashed var(--border-strong)" : undefined,
          }}
        />
      ) : (
        <div style={{ flex: "0 0 auto" }}>
          <ArtworkPlaceholder card={r} title={c.artwork.none} width={34} />
        </div>
      )}

      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <div style={{ ...ONE_LINE, fontWeight: 550, fontSize: 13 }}>
          {r.name ?? r.card_id}
          {r.local_id ? <span className="num faint"> #{r.local_id}</span> : null}
        </div>
        <div className="faint" style={{ ...ONE_LINE, fontSize: 11.5 }}>
          {r.set_name ?? r.set_id ?? "—"} · {variantName(c, r.variant_type, r.variant_subtype)}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          <span className="tag" style={{ fontSize: 10 }}>{LANG_TAG[r.lang]}</span>
          {originTag ? (
            <span className="tag faint" style={{ fontSize: 10 }} title={originTag.title}>
              {originTag.text}
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ flex: "0 0 auto", textAlign: "right" }}>
        <div className="num" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
          <span className="dim">{f.eur(r.prev_trend)}</span>
          <span className="faint"> → </span>
          <span style={{ fontWeight: 600 }}>{f.eur(r.curr_trend)}</span>
        </div>
        <div
          className={`num ${up ? "pos" : "neg"}`}
          style={{ fontSize: 13, fontWeight: 650 }}
        >
          {up ? "+" : ""}
          {f.pct(r.pct_change, 1)}
        </div>
        <div className="faint num" style={{ fontSize: 10 }}>
          {t.rowInterval(
            f.date(r.prev_date),
            f.date(r.as_of),
            f.num(r.interval_days),
            r.interval_days,
          )}
        </div>
      </div>
    </a>
  );
}

function Column({
  rows,
  label,
  positive,
  locale,
}: {
  rows: MoverRow[];
  label: string;
  positive: boolean;
  locale: Locale;
}) {
  const t = pick(market, locale).movers;
  return (
    <div className="card">
      <div
        className="pad"
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          padding: "10px 12px",
        }}
      >
        <span className={`tag ${positive ? "pos" : "neg"}`}>{label}</span>
        <span className="num faint" style={{ fontSize: 11.5 }}>
          {rows.length}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="pad dim" style={{ fontSize: 12.5, borderTop: "1px solid var(--border)" }}>
          {t.empty}
        </div>
      ) : (
        rows.map((r) => <MoverItem key={r.instrument_id} r={r} locale={locale} />)
      )}
    </div>
  );
}

export default function MoversList({
  up,
  down,
  artifactsExcluded,
  locale,
}: {
  up: MoverRow[];
  down: MoverRow[];
  /** Artefactos de la fuente excluidos en esta captura; null si no se conto. */
  artifactsExcluded: number | null;
  locale: Locale;
}) {
  const t = pick(market, locale).movers;
  const f = makeFormatters(locale);
  const ref = up[0] ?? down[0];

  return (
    <section style={{ marginBottom: 26 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>{t.title}</h2>
        {ref ? (
          <span className="dim" style={{ fontSize: 12.5 }}>
            {t.header(
              f.date(ref.prev_date),
              f.date(ref.as_of),
              f.num(ref.interval_days),
              ref.interval_days,
            )}
          </span>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 12,
        }}
      >
        <Column rows={up} label={t.up} positive locale={locale} />
        <Column rows={down} label={t.down} positive={false} locale={locale} />
      </div>

      <p className="faint" style={{ fontSize: 11.5, margin: "10px 0 0", maxWidth: "98ch" }}>
        {t.footnote(
          artifactsExcluded != null && artifactsExcluded > 0
            ? f.num(artifactsExcluded)
            : null,
        )}
      </p>
    </section>
  );
}
