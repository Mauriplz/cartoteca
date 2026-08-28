#!/usr/bin/env python3
"""
Motor de senales deterministas.

Estas son las senales que funcionan SIN historico, que es la unica clase de senal
honesta el primer dia. No predicen el futuro: miden desajustes que ya existen hoy
y que el usuario puede explotar. Deliberadamente NO hay momentum ni nada calculado
sobre retornos: con un archivo de dias no se puede, y calcularlo sobre las medias
moviles de Cardmarket produciria una senal espectacular y falsa (los retornos
diarios de avg30 tienen autocorrelacion 29/30 por construccion del filtro).

Senales implementadas:
  1. universe   : coste de ida y vuelta y si el instrumento es invertible siquiera
  2. cohort     : valor relativo dentro de su cohorte (set + rareza + idioma)
  3. artist     : prima del ilustrador, normalizada por cohorte y con shrinkage
  4. eu_us      : arbitraje Cardmarket (EUR) contra TCGplayer (USD), neto de FX
  5. jp_en      : diferencial entre la version japonesa y la inglesa de la misma carta

Todas excluyen: cartas digitales de TCG Pocket, instrumentos con colision de
idProduct, y precios ausentes. Ninguna usa `low` como precio.
"""

import argparse
import json
import math
import os
import sqlite3
import statistics as st
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DB = os.path.join(PROJ, "data", "pcp.db")

# --- Modelo de coste de ida y vuelta -----------------------------------------
# El envio es un coste FIJO. Por eso el coste porcentual explota a la baja en el
# precio y hace ininvertible la mayor parte del catalogo, que cotiza en centimos.
FEE_SELL = 0.05        # comision de venta de Cardmarket, aproximada
SHIP_IN = 3.50         # portes al comprar (EUR)
SHIP_OUT = 3.50        # portes al vender (EUR)
COST_CEILING = 0.25    # por encima de este coste no publicamos senal de inversion


def roundtrip_cost(price):
    """Fraccion del precio que se pierde en una compra + venta posterior."""
    if not price or price <= 0:
        return None
    return (FEE_SELL * price + SHIP_IN + SHIP_OUT) / price


def fetch_fx():
    """EUR/USD del BCE. Publico y gratuito. Si falla, la senal eu_us se omite:
    preferimos no publicar una senal a publicarla con un tipo inventado."""
    try:
        url = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD"
        req = urllib.request.Request(url, headers={"User-Agent": "pokemon-card-price/0.1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.loads(r.read())
        return float(d["rates"]["USD"]), d.get("date")
    except Exception as e:
        print(f"  aviso: FX no disponible ({e}); se omite la senal eu_us")
        return None, None


SCHEMA = """
CREATE TABLE IF NOT EXISTS signals (
  instrument_id TEXT NOT NULL,
  as_of         TEXT NOT NULL,
  signal        TEXT NOT NULL,
  value         REAL,
  detail        TEXT,          -- JSON con lo necesario para explicar la senal
  PRIMARY KEY (instrument_id, as_of, signal)
);
CREATE INDEX IF NOT EXISTS idx_sig ON signals(signal, value);
CREATE INDEX IF NOT EXISTS idx_sig_inst ON signals(instrument_id);

CREATE TABLE IF NOT EXISTS artist_premium (
  artist    TEXT PRIMARY KEY,
  n         INTEGER,
  raw_mean  REAL,
  shrunk    REAL,
  weight    REAL,
  as_of     TEXT
);
"""


def latest_prices(con):
    """Ultimo precio observado por instrumento, con su contexto. Solo instrumentos
    limpios: sin colision de idProduct y no digitales."""
    return con.execute("""
        SELECT i.instrument_id, i.card_id, i.lang, i.variant_type, i.variant_subtype,
               c.name, c.illustrator, c.rarity, c.set_id, c.local_id, c.image, c.dex_id,
               s.release_date, s.name AS set_name,
               p.obs_date, p.cm_trend, p.cm_avg30, p.tcg_market, p.tcg_low,
               i.cm_variant_ambiguous
        FROM instruments i
        JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
        LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
        JOIN price_obs p ON p.instrument_id = i.instrument_id
        JOIN (SELECT instrument_id, MAX(obs_date) md FROM price_obs GROUP BY instrument_id) mx
             ON mx.instrument_id = p.instrument_id AND mx.md = p.obs_date
        WHERE i.is_digital = 0 AND i.cm_collision = 0
    """).fetchall()


def sig_universe(rows, as_of):
    """Coste de ida y vuelta. La senal mas util del sistema y la mas ignorada:
    dice al usuario que la mayor parte del catalogo no es vehiculo de inversion
    a ningun horizonte, porque los portes se lo comen."""
    out = []
    for r in rows:
        p = r["cm_trend"]
        c = roundtrip_cost(p)
        if c is None:
            continue
        out.append((r["instrument_id"], as_of, "roundtrip_cost", c,
                    json.dumps({"price_eur": p, "investable": c <= COST_CEILING,
                                "breakeven_move_pct": round(100 * c, 1)})))
    return out


def sig_cohort(rows, as_of):
    """Percentil del precio dentro de su cohorte (idioma + set + rareza).
    Controla a la vez rareza y edicion, que son los dos confusores obvios."""
    coh = defaultdict(list)
    for r in rows:
        if r["cm_trend"] and r["rarity"] and r["set_id"]:
            coh[(r["lang"], r["set_id"], r["rarity"])].append((r["instrument_id"], r["cm_trend"]))
    out, pct = [], {}
    for key, items in coh.items():
        if len(items) < 4:      # cohorte demasiado pequena para un percentil con sentido
            continue
        items.sort(key=lambda x: x[1])
        n = len(items)
        for i, (iid, price) in enumerate(items):
            q = i / (n - 1)
            pct[iid] = q
            out.append((iid, as_of, "cohort_pct", q,
                        json.dumps({"cohort": f"{key[0]}/{key[1]}/{key[2]}", "n": n,
                                    "price_eur": price})))
    return out, pct


def sig_artist(rows, pct, as_of):
    """Prima del ilustrador.

    El precio bruto por artista esta confundido: quien solo dibuja secret rares
    pareceria un genio por serlo. Se usa el percentil dentro de cohorte, y despues
    se aplica shrinkage empirico bayesiano, porque un artista con 30 cartas tiene
    una media mucho mas ruidosa que uno con 300 y no deben pesar igual.
    """
    by = defaultdict(list)
    art_of = {}
    for r in rows:
        iid = r["instrument_id"]
        if iid in pct and r["illustrator"]:
            by[r["illustrator"]].append(pct[iid])
            art_of[iid] = r["illustrator"]
    by = {a: v for a, v in by.items() if len(v) >= 30}
    if not by:
        return [], []

    means = {a: st.mean(v) for a, v in by.items()}
    grand = st.mean(means.values())
    var_obs = st.pvariance(list(means.values()))
    var_noise = st.mean([st.pvariance(v) / len(v) for v in by.values()])
    var_signal = max(var_obs - var_noise, 1e-9)
    reliability = var_signal / var_obs if var_obs else 0.0

    prem, rows_out = {}, []
    for a, v in by.items():
        n, m = len(v), means[a]
        w = var_signal / (var_signal + st.pvariance(v) / n)
        shrunk = grand + w * (m - grand)
        prem[a] = shrunk
        rows_out.append((a, n, m, shrunk, w, as_of))

    sigs = []
    for iid, a in art_of.items():
        if a in prem:
            sigs.append((iid, as_of, "artist_premium", prem[a],
                         json.dumps({"artist": a, "n": len(by[a]),
                                     "reliability_global": round(reliability, 3)})))
    print(f"  prima de artista: {len(by)} artistas | fiabilidad de la senal {reliability:.1%}")
    return sigs, rows_out


# Banda de plausibilidad para comparar dos mercados.
#
# Un diferencial real entre Europa y Estados Unidos en un coleccionable liquido se
# mueve en decenas de puntos porcentuales, no en multiplos. Cuando dos fuentes
# discrepan por mas de este factor, la explicacion casi nunca es una ineficiencia
# de mercado: es que no estan describiendo el mismo objeto. Publicarlo como
# oportunidad seria el fallo mas visible posible para cualquier coleccionista.
ARB_MIN_RATIO = 0.40
ARB_MAX_RATIO = 2.50


def sig_eu_us(rows, fx, fx_date, as_of):
    """Arbitraje entre el mercado europeo (Cardmarket, EUR) y el estadounidense
    (TCGplayer, USD llevado a euros).

    Dos guardas, ambas nacidas de haber medido el problema:

    1. Se excluyen los instrumentos con `cm_variant_ambiguous`: TCGdex adjunta el
       producto entero de Cardmarket a todas las variantes de una carta, asi que
       para 15.020 instrumentos el precio europeo no distingue reverse de normal
       aunque el americano si. Comparar ahi es comparar objetos distintos.

    2. Banda de plausibilidad. Aun con la variante bien mapeada quedan desajustes
       de origen (impresiones distintas bajo un mismo producto). Un factor de 20x
       no es una oportunidad, es una senal de que las dos fuentes hablan de cosas
       distintas.

    Solo se publica lo que ademas sobrevive al coste de ida y vuelta: un
    diferencial del 15% en una carta de 8 EUR no es una oportunidad, es ruido que
    los portes se comen entero.
    """
    if not fx:
        return [], 0
    out, descartados = [], 0
    for r in rows:
        eu, us = r["cm_trend"], r["tcg_market"]
        if not eu or not us or eu <= 0:
            continue
        if r["cm_variant_ambiguous"]:
            descartados += 1
            continue
        us_eur = us / fx
        ratio = us_eur / eu
        if not (ARB_MIN_RATIO <= ratio <= ARB_MAX_RATIO):
            descartados += 1
            continue
        spread = ratio - 1.0
        cost = roundtrip_cost(min(eu, us_eur))
        if cost is None or cost > COST_CEILING:
            continue
        net = abs(spread) - cost
        if net <= 0:
            continue
        out.append((r["instrument_id"], as_of, "eu_us_arb", net,
                    json.dumps({"eur": round(eu, 2), "usd": round(us, 2),
                                "usd_in_eur": round(us_eur, 2),
                                "gross_spread_pct": round(100 * spread, 1),
                                "roundtrip_cost_pct": round(100 * cost, 1),
                                "direction": "comprar en EU, vender en US" if spread > 0
                                             else "comprar en US, vender en EU",
                                "fx_eurusd": fx, "fx_date": fx_date})))
    return out, descartados


def sig_jp_en(rows, as_of):
    """Diferencial Japon / Ingles de la misma ilustracion, y adelanto temporal.

    El emparejamiento es el problema real: los ids de TCGdex no se corresponden
    entre idiomas. Se casa por (dexId, ilustrador), exigiendo correspondencia
    1-a-1 en ambos sentidos.

    Deliberadamente NO se exige que coincida la rareza: medido sobre el catalogo,
    los vocabularios de rareza de EN y JA solo solapan en 19 de 43 valores, asi
    que exigirla descartaria pares perfectamente validos por una diferencia de
    nomenclatura, no de producto.

    Se publica ademas el adelanto en dias entre el lanzamiento del set japones y
    el del ingles, que es lo que convierte el diferencial en una senal ADELANTADA
    y no en una simple comparacion de precios.
    """
    en, ja = defaultdict(list), defaultdict(list)
    for r in rows:
        if not (r["cm_trend"] and r["dex_id"] and r["illustrator"]):
            continue
        (en if r["lang"] == "en" else ja)[(r["dex_id"], r["illustrator"])].append(r)

    out = []
    leads = []
    for key, ens in en.items():
        jas = ja.get(key)
        # Solo pares 1-a-1. Con varias candidatas a cada lado no sabemos cual es
        # cual, y adivinar no produce una senal debil: produce una senal FALSA.
        if not jas or len(ens) != 1 or len(jas) != 1:
            continue
        e, j = ens[0], jas[0]
        if not e["cm_trend"] or e["cm_trend"] <= 0:
            continue

        lead = None
        if e["release_date"] and j["release_date"]:
            try:
                lead = (datetime.fromisoformat(e["release_date"])
                        - datetime.fromisoformat(j["release_date"])).days
                # Un adelanto negativo o absurdo delata un emparejamiento malo.
                if -30 <= lead <= 730:
                    leads.append(lead)
                else:
                    continue
            except Exception:
                lead = None

        ratio = j["cm_trend"] / e["cm_trend"]
        out.append((e["instrument_id"], as_of, "jp_en_ratio", ratio,
                    json.dumps({"en_card": e["card_id"], "ja_card": j["card_id"],
                                "en_set": e["set_id"], "ja_set": j["set_id"],
                                "en_eur": round(e["cm_trend"], 2),
                                "ja_eur": round(j["cm_trend"], 2),
                                "lead_days": lead,
                                "illustrator": e["illustrator"]})))

    if leads:
        leads.sort()
        med = leads[len(leads) // 2]
        print(f"  pares JP/EN 1-a-1: {len(out):,} | adelanto japones: mediana {med} dias "
              f"(p25 {leads[len(leads)//4]}, p75 {leads[3*len(leads)//4]})")
    return out


def sig_invest_score(con, as_of):
    """Puntuacion compuesta de inversion.

    QUE ES: una medida de DESAJUSTE observable hoy. Combina cuatro senales que no
    necesitan historico, cada una normalizada en z-score cross-seccional sobre el
    universo invertible, y sumadas con PESOS IGUALES y signos congelados.

    QUE NO ES: una prevision validada. Con dos dias de archivo no existe track
    record, y cualquier peso "optimizado" hoy estaria ajustado al ruido. Los pesos
    iguales no son pereza: con tan pocas observaciones independientes, cualquier
    otra eleccion consume grados de libertad que no tenemos. Se revisaran cuando
    haya historico suficiente para medirlo, no antes.

    Componentes y por que ese signo:
      -z(cohort_pct)     barata respecto a su cohorte de set y rareza -> al alza
      +z(artist_premium) ilustrador con prima historica -> demanda estructural
      +z(jp_en_ratio)    su gemela japonesa cotiza mas alto -> margen de convergencia,
                         con el japones adelantando ~56 dias al ingles
      +z(eu_us_arb)      diferencial entre mercados que sobrevive a los costes

    El cruce importante es cohort_pct BAJO con artist_premium ALTO: un ilustrador
    caro cuya carta cotiza barata dentro de su cohorte. La prima del artista por si
    sola no da alfa, porque ya esta dentro del precio.
    """
    sigs = {}
    for name in ("cohort_pct", "artist_premium", "jp_en_ratio", "eu_us_arb"):
        rows = con.execute(
            "SELECT instrument_id, value FROM signals WHERE signal=? AND as_of=?",
            (name, as_of)).fetchall()
        sigs[name] = {r[0]: r[1] for r in rows}

    universe = [r[0] for r in con.execute(
        "SELECT instrument_id FROM signals WHERE signal='roundtrip_cost' AND value<=? AND as_of=?",
        (COST_CEILING, as_of))]
    if not universe:
        return []

    def z_of(name):
        """z-score calculado SOLO sobre el universo invertible: normalizar contra
        las 34.000 cartas de centimos distorsionaria toda la escala."""
        vals = {i: sigs[name][i] for i in universe if i in sigs[name]}
        if len(vals) < 20:
            return {}
        xs = list(vals.values())
        m, sd = st.mean(xs), st.pstdev(xs)
        if sd == 0:
            return {}
        return {i: max(-3.0, min(3.0, (v - m) / sd)) for i, v in vals.items()}   # winsorizado

    Z = {n: z_of(n) for n in sigs}
    SIGN = {"cohort_pct": -1.0, "artist_premium": 1.0, "jp_en_ratio": 1.0, "eu_us_arb": 1.0}

    out = []
    for iid in universe:
        parts, total = {}, 0.0
        for n, sgn in SIGN.items():
            if iid in Z.get(n, {}):
                c = sgn * Z[n][iid]
                parts[n] = round(c, 3)
                total += c
        if len(parts) < 2:      # con una sola componente no hay compuesto que valga
            continue
        out.append((iid, as_of, "invest_score", total / len(parts),
                    json.dumps({"components": parts, "n_components": len(parts)})))
    print(f"  puntuacion de inversion: {len(out):,} instrumentos del universo invertible")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)

    as_of = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rows = latest_prices(con)
    print(f"=== instrumentos limpios con precio: {len(rows):,} ===")

    fx, fx_date = fetch_fx()
    if fx:
        print(f"  EUR/USD = {fx} ({fx_date})")

    all_sigs = []
    all_sigs += sig_universe(rows, as_of)
    coh, pct = sig_cohort(rows, as_of)
    all_sigs += coh
    art_sigs, art_rows = sig_artist(rows, pct, as_of)
    all_sigs += art_sigs
    arb, arb_desc = sig_eu_us(rows, fx, fx_date, as_of)
    all_sigs += arb
    print(f"  arbitraje EU/US: {len(arb):,} publicados | {arb_desc:,} descartados "
          f"por variante ambigua o ratio fuera de banda [{ARB_MIN_RATIO}-{ARB_MAX_RATIO}x]")
    all_sigs += sig_jp_en(rows, as_of)

    con.executemany("INSERT OR REPLACE INTO signals VALUES (?,?,?,?,?)", all_sigs)
    con.commit()
    # El compuesto se calcula sobre las senales ya escritas.
    con.executemany("INSERT OR REPLACE INTO signals VALUES (?,?,?,?,?)", sig_invest_score(con, as_of))
    if art_rows:
        con.executemany("INSERT OR REPLACE INTO artist_premium VALUES (?,?,?,?,?,?)", art_rows)
    con.commit()

    print("\n=== SENALES ESCRITAS ===")
    for s, n in con.execute("SELECT signal, COUNT(*) FROM signals WHERE as_of=? GROUP BY signal", (as_of,)):
        print(f"  {s:16} {n:>8,}")
    inv = con.execute("SELECT COUNT(*) FROM signals WHERE signal='roundtrip_cost' AND value<=? AND as_of=?",
                      (COST_CEILING, as_of)).fetchone()[0]
    tot = con.execute("SELECT COUNT(*) FROM signals WHERE signal='roundtrip_cost' AND as_of=?", (as_of,)).fetchone()[0]
    print(f"\n  universo invertible (coste <= {COST_CEILING:.0%}): {inv:,} de {tot:,}  ({100*inv/max(tot,1):.1f}%)")
    con.close()


if __name__ == "__main__":
    main()
