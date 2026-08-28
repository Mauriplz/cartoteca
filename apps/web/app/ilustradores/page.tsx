import type { Metadata } from "next";
import Link from "next/link";
import { getArtists, getCardSignals, getMarketStats, getScreener } from "@/lib/queries";
import type { ArtistPremium } from "@/lib/types";

// El precio de la carta se lee en la ficha; esta pagina se lee contra la base de
// datos en cada peticion para que las cifras nunca queden congeladas en el build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prima del ilustrador — Cartoteca",
  description:
    "Posición media que alcanzan las cartas de cada ilustrador dentro de su propia cohorte de set y rareza, corregida por tamaño de muestra.",
};

const P3 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const DATE = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC", // la fecha del almacen es un dia natural, no un instante
});

/** Fecha ISO del almacen, en prosa. */
function fecha(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}

/* Formato numerico espanol. `eur()` de lib/format ya usa es-ES, pero `pct()` de lib emite
   punto decimal ("80.6%"), que en una pagina en espanol se lee como un fallo junto a
   "0,500" y "46.068". Estos ayudantes son locales a la pagina: no tocan el contrato. */

function group(s: string): string {
  const [i, d] = s.split(",");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return d ? `${g},${d}` : g;
}

/** Entero con separador de millares, tambien en los de cuatro digitos. */
function num(v: number): string {
  return group(Math.round(v).toString());
}

/** Porcentaje con coma decimal y espacio antes del signo. */
function pctEs(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined) return "\u2014";
  return `${group((v * 100).toFixed(digits).replace(".", ","))} %`;
}

/** Percentil con tres decimales: 0,500 es la base neutra de todo el sistema. */
function p3(v: number): string {
  return P3.format(v);
}

/** Desviacion firmada sobre la base neutra, en puntos de percentil. */
function signed(v: number): string {
  const d = v - 0.5;
  return `${d >= 0 ? "+" : "−"}${P3.format(Math.abs(d))}`;
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
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const rawKey = first(sp.orden);
  const key: Key = KEYS.includes(rawKey as Key) ? (rawKey as Key) : "shrunk";
  const dir: Dir = first(sp.dir) === "asc" ? "asc" : "desc";
  const minParam = Number(first(sp.min));
  const min = MINS.includes(minParam) ? minParam : 30;

  const artists = getArtists(min);

  if (artists.length === 0) {
    return (
      <>
        <h1>Prima del ilustrador</h1>
        <p className="sub">
          Ningún ilustrador alcanza el umbral de {min} instrumentos con percentil de cohorte.
        </p>
        <div className="note">
          Prueba con un umbral menor:{" "}
          <Link href="/ilustradores" style={{ color: "var(--accent)" }}>
            n ≥ 30
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

  const sorted = [...artists].sort((x, y) => {
    const s = dir === "asc" ? 1 : -1;
    if (key === "artist") return s * x.artist.localeCompare(y.artist, "es");
    const pick = (a: ArtistPremium) =>
      key === "n" ? a.n : key === "raw" ? a.raw_mean : key === "shrunk" ? a.shrunk : a.weight;
    return s * (pick(x) - pick(y));
  });

  const investablePct = stats.priced > 0 ? stats.investable / stats.priced : null;
  const covered = artists.reduce((s, a) => s + a.n, 0);
  const shrunks = artists.map((a) => a.shrunk);
  const weights = artists.map((a) => a.weight);
  const loShrunk = Math.min(...shrunks);
  const hiShrunk = Math.max(...shrunks);

  const hrefFor = (k: Key) => {
    const d: Dir = key === k ? (dir === "desc" ? "asc" : "desc") : k === "artist" ? "asc" : "desc";
    const q = new URLSearchParams({ orden: k, dir: d });
    if (min !== 30) q.set("min", String(min));
    return `/ilustradores?${q.toString()}`;
  };

  const hrefForMin = (m: number) => {
    const q = new URLSearchParams({ orden: key, dir });
    if (m !== 30) q.set("min", String(m));
    return `/ilustradores?${q.toString()}`;
  };

  const arrow = (k: Key) => (key === k ? (dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <>
      <h1>Prima del ilustrador</h1>
      <p className="sub">
        Qué posición ocupan, de media, las cartas de cada ilustrador dentro de su propia cohorte
        de set y rareza. Base neutra 0,500: por encima, sus cartas cotizan en la mitad alta de las
        cohortes en las que aparecen; por debajo, en la mitad baja.
      </p>

      <div className="stats" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="v">{num(artists.length)}</div>
          <div className="k">Ilustradores medidos</div>
        </div>
        <div className="stat">
          <div className="v">{num(covered)}</div>
          <div className="k">Instrumentos en la medida</div>
        </div>
        <div className="stat">
          <div className="v">{reliability === null ? "—" : pctEs(reliability, 1)}</div>
          <div className="k">Fiabilidad de la señal</div>
        </div>
        <div className="stat">
          <div className="v" style={{ fontSize: 16 }}>
            {p3(loShrunk)} – {p3(hiShrunk)}
          </div>
          <div className="k">Rango ajustado observado</div>
        </div>
        <div className="stat">
          <div className="v">{min}</div>
          <div className="k">Mínimo de instrumentos</div>
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2>Cómo se calcula, y por qué así</h2>
        <p className="dim" style={{ margin: "0 0 12px", fontSize: 13 }}>
          Ordenar ilustradores por el precio medio de sus cartas no mide su prima: mide qué
          cartas les asignan. Quien solo dibuja secret rares aparecería como un genio por serlo.
          El cálculo elimina esa confusión en cuatro pasos.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
          <li style={{ marginBottom: 10 }}>
            <strong>Percentil dentro de la cohorte.</strong> Cada instrumento con precio recibe su
            percentil de precio dentro de su cohorte de idioma + set + rareza, exigiendo al menos
            cuatro instrumentos en la cohorte. Comparar una <em>illustration rare</em> de un set
            de 2025 solo contra otras <em>illustration rare</em> de ese mismo set controla a la
            vez la rareza y la edición, que son los dos confusores obvios.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Media por ilustrador.</strong> Se promedian los percentiles de todos sus
            instrumentos. Es la columna <em>bruta</em>. Solo entran ilustradores con al menos 30
            instrumentos con percentil.
          </li>
          <li style={{ marginBottom: 10 }}>
            <strong>Corrección por tamaño de muestra (shrinkage).</strong> Un ilustrador con 30
            cartas tiene una media mucho más ruidosa que uno con 400, y no deben pesar igual en un
            ranking. Cada media se acerca a la base neutra en proporción a su ruido:{" "}
            <Formula>ajustada = 0,500 + w × (bruta − 0,500)</Formula> con{" "}
            <Formula>w = var_señal / (var_señal + var_del_ilustrador / n)</Formula>. Cuanta menos
            obra medida y más dispersa, más se acerca a 0,500. La columna <em>peso</em> es esa w:
            va del {pctEs(Math.min(...weights), 0)} al {pctEs(Math.max(...weights), 0)} en esta
            tabla.
          </li>
          <li>
            <strong>Fiabilidad de la señal.</strong> Descomposición de varianza: se resta a la
            varianza entre medias observadas la parte atribuible al ruido de muestreo. Lo que queda
            es señal real. Medido hoy:{" "}
            <strong>{reliability === null ? "no disponible" : pctEs(reliability, 1)}</strong> de la
            varianza entre ilustradores es diferencia genuina, no azar de muestreo.
          </li>
        </ol>
      </div>

      <div className="note" style={{ marginBottom: 20 }}>
        <strong style={{ color: "var(--text)" }}>
          Esta tabla explica el nivel de precio, no da ventaja por sí sola.
        </strong>{" "}
        La prima del ilustrador ya está dentro del precio de mercado de hoy: comprar cartas de un
        ilustrador con prima alta no es una operación, es pagar por lo que todo el mundo ya ve.
        Donde la prima puede aportar algo es en la{" "}
        <strong style={{ color: "var(--text)" }}>interacción</strong>: una carta de un ilustrador
        con prima alta que además cotiza barata <em>dentro de su propia cohorte</em>. Por eso la
        puntuación de inversión suma el percentil de cohorte con signo negativo y la prima del
        ilustrador con signo positivo, en vez de usar la prima sola. Es una hipótesis de
        construcción, no un resultado comprobado.{" "}
        <strong style={{ color: "var(--text)" }}>Y la carta tiene que ser comprable:</strong> solo{" "}
        {num(stats.investable)} de los {num(stats.priced)} instrumentos con precio
        {investablePct === null ? "" : ` (${pctEs(investablePct, 1)})`} bajan del 25 % de coste de
        ida y vuelta. En el resto, los portes se comen cualquier desajuste que esta tabla pueda
        señalar.
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
          Mínimo de instrumentos medidos:
        </span>
        {MINS.map((m) => (
          <Link key={m} href={hrefForMin(m)} className={m === min ? "tag acc" : "tag"}>
            n ≥ {m}
          </Link>
        ))}
        <span className="faint" style={{ fontSize: 12, marginLeft: "auto" }}>
          Cabeceras ordenables. {num(sorted.length)} ilustradores.
        </span>
      </div>

      <div className="card scroll-x">
        <table className="grid">
          <thead>
            <tr>
              <th className="r" style={{ width: 44 }}>
                #
              </th>
              <th>
                <Link href={hrefFor("artist")}>Ilustrador{arrow("artist")}</Link>
              </th>
              <th className="r" title="Instrumentos con percentil de cohorte atribuidos al ilustrador">
                <Link href={hrefFor("n")}>Instrum.{arrow("n")}</Link>
              </th>
              <th className="r" title="Media simple de los percentiles de cohorte, sin corregir">
                <Link href={hrefFor("raw")}>Bruta{arrow("raw")}</Link>
              </th>
              <th className="r" title="Media corregida por tamaño de muestra">
                <Link href={hrefFor("shrunk")}>Ajustada{arrow("shrunk")}</Link>
              </th>
              <th style={{ width: 190 }}>Desvío sobre 0,500</th>
              <th className="r" title="Cuánto pesa la media del ilustrador frente a la base neutra">
                <Link href={hrefFor("weight")}>Peso{arrow("weight")}</Link>
              </th>
              <th className="r" style={{ width: 92 }}>
                Explorar
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a, i) => {
              const up = a.shrunk >= 0.5;
              return (
                <tr key={a.artist}>
                  <td className="r num faint">{i + 1}</td>
                  <td style={{ fontWeight: 550 }}>
                    <Link href={`/cartas?artist=${encodeURIComponent(a.artist)}`}>{a.artist}</Link>
                  </td>
                  <td className="r num dim">{num(a.n)}</td>
                  <td className="r num dim">{p3(a.raw_mean)}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>
                    {p3(a.shrunk)}
                  </td>
                  <td>
                    <span className="contrib">
                      <PremiumBar v={a.shrunk} />
                      <span className={up ? "tag pos" : "tag neg"}>
                        <span className="num">{signed(a.shrunk)}</span>
                      </span>
                    </span>
                  </td>
                  <td className="r num dim">{pctEs(a.weight, 0)}</td>
                  <td className="r">
                    <Link
                      href={`/cartas?artist=${encodeURIComponent(a.artist)}`}
                      className="tag"
                      style={{ fontSize: 11 }}
                    >
                      ver →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note" style={{ marginTop: 20 }}>
        <strong style={{ color: "var(--text)" }}>Cómo leer los extremos.</strong> Un valor por
        debajo de 0,500 no significa que el ilustrador dibuje peor: significa que sus cartas tienden
        a ocupar la mitad baja de las cohortes en las que aparecen, algo que depende también de qué
        cartas le encargan dentro de cada rareza. <em>Instrum.</em> cuenta instrumentos, no cartas:
        la versión holo, la reverse y la normal de la misma ilustración son precios distintos y
        cuentan por separado. Y la señal no tiene todavía validación contra retornos futuros: el
        archivo propio acumula {stats.days} {stats.days === 1 ? "día" : "días"} desde el{" "}
        {fecha(stats.firstDay)}, así que lo que está medido es la fiabilidad de la{" "}
        <em>medida</em>, no su capacidad de anticipar precios.{" "}
        <Link href="/metodologia" style={{ color: "var(--accent)" }}>
          Metodología completa →
        </Link>
      </div>
    </>
  );
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
