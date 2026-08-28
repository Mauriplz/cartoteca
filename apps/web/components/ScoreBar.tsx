import type { CSSProperties } from "react";
import { pick, type Locale } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { ranking } from "@/lib/i18n/ranking";

/**
 * Desglose de la puntuacion de inversion.
 *
 * Cada senal ocupa SIEMPRE la misma columna, aunque la carta no tenga dato para
 * ella: asi el ojo puede comparar en vertical las cien filas de la tabla, y un
 * hueco vacio se lee como lo que es —falta de dato— y no como un cero.
 *
 * Los valores son z-scores con el signo ya orientado por la capa de senales:
 * positivo = empuja la puntuacion hacia arriba. Llegan recortados a +/-3.
 *
 * El componente recibe el idioma, no los textos: todo lo que dice son etiquetas
 * de senal y frases de tooltip que ya viven en los diccionarios. Pasarlos por
 * props serian cinco cadenas por columna y un contrato que hay que rehacer cada
 * vez que se anade una senal; con el locale, la tabla solo dice en que idioma
 * habla y el componente se sirve solo.
 */

export const SIGNAL_ORDER = ["cohort_pct", "artist_premium", "jp_en_ratio", "eu_us_arb"];

/**
 * Abreviatura de cada senal. No se traduce: son codigos de columna de cuatro o
 * cinco caracteres que tienen que caber igual en los tres idiomas y alinearse
 * con la cabecera. Su significado se explica al lado, en la leyenda, y eso si
 * esta traducido.
 */
export const SIGNAL_SHORT: Record<string, string> = {
  cohort_pct: "COH",
  artist_premium: "ART",
  jp_en_ratio: "JP/EN",
  eu_us_arb: "EU/US",
};

/** Recorte de la capa de senales. Un valor en 3,00 esta topado, no es exacto. */
export const CLIP = 3;

const BAR_W = 44;
const VAL_W = 34;
const COL_W = BAR_W + 6 + VAL_W; // 6px = gap de .contrib

const NUM_TAG: Record<Locale, string> = { es: "es-ES", en: "en-US", ja: "ja-JP" };

/**
 * Z-scores y puntuacion: dos decimales fijos para que la columna quede alineada.
 * No sale de makeFormatters porque alli num() usa el formato por defecto, y aqui
 * hacen falta los dos decimales siempre —y el signo siempre, en las barras—.
 * Lo que si cambia por idioma es el separador decimal: 1,23 en espanol, 1.23 en
 * ingles y en japones.
 */
export function makeScoreFormat(locale: Locale) {
  const tag = NUM_TAG[locale];
  const opts: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const zFmt = new Intl.NumberFormat(tag, { ...opts, signDisplay: "always" });
  const scoreFmt = new Intl.NumberFormat(tag, opts);
  return {
    /** Contribucion de una senal: siempre con signo. */
    z: (v: number) => zFmt.format(v),
    /** Puntuacion agregada: sin signo forzado. */
    score: (v: number) => scoreFmt.format(v),
  };
}

type Meta = { label: string; help: string };

/** Etiqueta y explicacion de una senal, en el idioma pedido. */
export function signalMeta(key: string, locale: Locale): Meta | undefined {
  return pick(common, locale).signal[key];
}

export function signalShort(key: string): string {
  return SIGNAL_SHORT[key] ?? key.slice(0, 5).toUpperCase();
}

/**
 * Columnas a pintar: las cuatro senales conocidas mas cualquier otra que
 * aparezca en los datos. Si el modelo anade una quinta senal, la tabla la
 * muestra sola, sin tocar este componente.
 */
export function signalColumns(rows: Array<{ components: Record<string, number> }>): string[] {
  const extra: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r.components)) {
      if (!SIGNAL_ORDER.includes(k) && !extra.includes(k)) extra.push(k);
    }
  }
  return [...SIGNAL_ORDER, ...extra.sort()];
}

function grid(n: number): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${n}, ${COL_W}px)`,
    columnGap: 12,
    alignItems: "center",
  };
}

/** Cabecera alineada columna a columna con las barras de las filas. */
export function ScoreBarHeader({ keys, locale }: { keys: string[]; locale: Locale }) {
  const t = pick(ranking, locale);
  return (
    <div style={grid(keys.length)}>
      {keys.map((k) => {
        const m = signalMeta(k, locale);
        return (
          <span
            key={k}
            title={m ? t.bars.headerTitle({ label: m.label, help: m.help }) : k}
            style={{ cursor: "help" }}
          >
            {signalShort(k)}
          </span>
        );
      })}
    </div>
  );
}

export default function ScoreBar({
  components,
  keys = SIGNAL_ORDER,
  locale,
}: {
  components: Record<string, number>;
  keys?: string[];
  locale: Locale;
}) {
  const t = pick(ranking, locale);
  const fmt = makeScoreFormat(locale);

  return (
    <div style={grid(keys.length)}>
      {keys.map((k) => {
        // El desglose sale del JSON de detalle de la base, no del compilador:
        // el tipo dice number, pero un null o un NaN pasarian por la puerta y
        // Intl los pintaria como "0,00". Aqui todo lo que no sea un numero
        // finito es falta de dato, que es lo que de verdad es.
        const raw: unknown = Object.prototype.hasOwnProperty.call(components, k)
          ? components[k]
          : undefined;
        const v = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        const m = signalMeta(k, locale);
        const name = m?.label ?? k;

        const title =
          v === null
            ? t.bars.noData(name)
            : t.bars.value({
                label: name,
                z: fmt.z(v),
                clipped: Math.abs(v) >= CLIP,
                help: m?.help ?? "",
              });

        // Barra divergente: el centro de la caja es el cero.
        const half = v === null ? 0 : Math.min(Math.abs(v) / CLIP, 1) * 50;
        const w = v === null ? 0 : Math.max(half, 2); // minimo visible
        const up = (v ?? 0) >= 0;
        const color =
          v === null
            ? "transparent"
            : Math.abs(v) < 0.005
              ? "var(--text-faint)"
              : up
                ? "var(--pos)"
                : "var(--neg)";

        return (
          <span key={k} className="contrib" title={title.trim()} style={{ cursor: "help" }}>
            <span className="contrib-bar" style={{ width: BAR_W, flexShrink: 0 }}>
              <i
                style={{
                  left: "50%",
                  marginLeft: -0.5,
                  width: 1,
                  borderRadius: 0,
                  background: "var(--border-strong)",
                }}
              />
              {v !== null && (
                <i
                  style={{
                    left: up ? "50%" : `${50 - w}%`,
                    width: `${w}%`,
                    background: color,
                  }}
                />
              )}
            </span>
            <span
              className="num faint"
              style={{ width: VAL_W, flexShrink: 0, textAlign: "right", fontSize: 10.5 }}
            >
              {v === null ? "·" : fmt.z(v)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
