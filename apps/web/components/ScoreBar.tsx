import type { CSSProperties } from "react";
import { SIGNAL_META } from "@/lib/format";

/**
 * Desglose de la puntuacion de inversion.
 *
 * Cada senal ocupa SIEMPRE la misma columna, aunque la carta no tenga dato para
 * ella: asi el ojo puede comparar en vertical las cien filas de la tabla, y un
 * hueco vacio se lee como lo que es —falta de dato— y no como un cero.
 *
 * Los valores son z-scores con el signo ya orientado por la capa de senales:
 * positivo = empuja la puntuacion hacia arriba. Llegan recortados a +/-3.
 */

export const SIGNAL_ORDER = ["cohort_pct", "artist_premium", "jp_en_ratio", "eu_us_arb"];

/** Abreviatura de cada senal. Se explica en la leyenda que acompana a la tabla. */
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

const Z = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

type Meta = { label: string; help: string };

export function signalMeta(key: string): Meta | undefined {
  return (SIGNAL_META as Record<string, Meta | undefined>)[key];
}

/** Une etiqueta y explicacion sin duplicar el punto de "EE. UU.". */
function frase(...partes: Array<string | undefined>): string {
  return partes
    .map((p) => (p ?? "").trim())
    .filter((p) => p !== "")
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(" ");
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
export function ScoreBarHeader({ keys }: { keys: string[] }) {
  return (
    <div style={grid(keys.length)}>
      {keys.map((k) => {
        const m = signalMeta(k);
        return (
          <span key={k} title={m ? frase(m.label, m.help) : k} style={{ cursor: "help" }}>
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
}: {
  components: Record<string, number>;
  keys?: string[];
}) {
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
        const m = signalMeta(k);
        const name = m?.label ?? k;

        const title =
          v === null
            ? `${name}: sin dato para esta carta, no entra en el promedio.`
            : frase(
                `${name}: ${Z.format(v)} z${Math.abs(v) >= CLIP ? " (recortado)" : ""}`,
                m?.help,
              );

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
          <span key={k} className="contrib" title={title} style={{ cursor: "help" }}>
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
              {v === null ? "·" : Z.format(v)}
            </span>
          </span>
        );
      })}
    </div>
  );
}
