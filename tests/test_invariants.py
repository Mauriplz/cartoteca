#!/usr/bin/env python3
"""
Invariantes del almacen. Cada una existe porque su violacion YA ocurrio una vez
o porque su violacion seria silenciosa y venenosa. Se ejecutan tras cada pipeline
y en CI. Un fallo aqui = el dia no se publica.
"""

import json
import os
import sqlite3
import sys

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DB = os.path.join(os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data"), "pcp.db")

FAILURES = []


def check(name, ok, detail=""):
    print(f"  [{'OK' if ok else 'FALLO'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    if not ok:
        FAILURES.append(name)


def main():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    q = lambda s, *a: con.execute(s, a).fetchone()[0]

    # --- Exclusiones que ya fallaron una vez ---
    check("0 cartas digitales en señales",
          q("""SELECT COUNT(*) FROM signals sg JOIN instruments i ON i.instrument_id=sg.instrument_id
               WHERE i.is_digital=1""") == 0)
    check("0 colisiones de idProduct en invest_score",
          q("""SELECT COUNT(*) FROM signals sg JOIN instruments i ON i.instrument_id=sg.instrument_id
               WHERE sg.signal='invest_score' AND i.cm_collision=1""") == 0)
    check("0 variantes ambiguas en market_divergence",
          q("""SELECT COUNT(*) FROM signals sg JOIN instruments i ON i.instrument_id=sg.instrument_id
               WHERE sg.signal='market_divergence' AND i.cm_variant_ambiguous=1""") == 0)
    check("TCG Pocket detectado por serie (>=15 sets digitales)",
          q("SELECT COUNT(*) FROM sets WHERE is_digital=1") >= 15)

    # --- Point-in-time ---
    check("toda observacion tiene reloj de conocimiento (fetched_at)",
          q("SELECT COUNT(*) FROM price_obs WHERE fetched_at IS NULL") == 0)

    # --- Senales del dia coherentes ---
    as_of = q("SELECT MAX(as_of) FROM signals")
    check("sin esquemas mezclados en detalles de divergencia",
          q("""SELECT COUNT(*) FROM signals WHERE signal='market_divergence' AND as_of=?
               AND detail NOT LIKE '%excess_pct%'""", as_of) == 0)
    rel = con.execute(
        "SELECT MIN(shrunk) a, MAX(shrunk) b FROM artist_premium").fetchone()
    check("prima de ilustrador en [0,1]", rel["a"] is not None and 0 <= rel["a"] and rel["b"] <= 1)
    check("universo puntuado sin cartas de centimos (min >= 15 EUR)",
          (q("""SELECT MIN(p.cm_trend) FROM signals sg
                JOIN price_obs p ON p.instrument_id=sg.instrument_id
                WHERE sg.signal='invest_score' AND sg.as_of=?
                AND p.obs_date=(SELECT MAX(obs_date) FROM price_obs WHERE instrument_id=sg.instrument_id)""",
              as_of) or 0) >= 15)

    # --- Indice ---
    check("indice encadenado: todos los valores positivos",
          q("SELECT COUNT(*) FROM market_index WHERE value <= 0") == 0)
    check("indice: intervalo declarado en todo valor no-base",
          q("SELECT COUNT(*) FROM market_index WHERE mean_return IS NOT NULL AND interval_days IS NULL") == 0)
    check("indice: n_constituents >= 100 en TOTAL",
          (q("""SELECT MIN(n_constituents) FROM market_index
                WHERE segment='TOTAL' AND n_constituents IS NOT NULL""") or 0) >= 100)

    # --- Sello ---
    chain_path = os.path.join(
        os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data"), "seals", "chain.jsonl")
    if os.path.exists(chain_path):
        seals = [json.loads(l) for l in open(chain_path) if l.strip()]
        ok_chain = all(seals[i]["prev"] == seals[i - 1]["sha256"] for i in range(1, len(seals)))
        check(f"cadena de sellos integra ({len(seals)} sello/s)", ok_chain)
    else:
        check("cadena de sellos existe", False)

    con.close()
    if FAILURES:
        print(f"\n{len(FAILURES)} INVARIANTE(S) ROTA(S): {FAILURES}")
        sys.exit(1)
    print("\ntodas las invariantes OK")


if __name__ == "__main__":
    main()
