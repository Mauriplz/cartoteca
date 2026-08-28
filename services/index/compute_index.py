#!/usr/bin/env python3
"""
Indice Cartoteca (index_v1) y movers.

La metodologia esta CONGELADA en services/index/methodology.md. Este codigo la
implementa; no la decide. Si algo aqui contradice ese documento, manda el documento.

Corre a diario tras el ETL. Idempotente: recalcula toda la serie desde el primer
dia del archivo en cada ejecucion (barato: pocas fechas) para que una correccion
de datos antigua no deje valores encadenados obsoletos.
"""

import argparse
import os
import sqlite3
from datetime import datetime, timezone

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DB = os.path.join(os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data"), "pcp.db")

FLOOR_EUR = 15.0
CLIP = 0.50
BASE = 100.0
VINTAGE_CUTOFF = "2011-01-01"

SCHEMA = """
CREATE TABLE IF NOT EXISTS market_index (
  as_of          TEXT NOT NULL,
  segment        TEXT NOT NULL,
  value          REAL NOT NULL,
  mean_return    REAL,
  n_constituents INTEGER,
  n_clipped      INTEGER,
  prev_date      TEXT,
  interval_days  INTEGER,
  methodology    TEXT NOT NULL DEFAULT 'index_v1',
  computed_at    TEXT,
  PRIMARY KEY (as_of, segment, methodology)
);

CREATE TABLE IF NOT EXISTS movers (
  as_of         TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  prev_date     TEXT NOT NULL,
  interval_days INTEGER,
  prev_trend    REAL,
  curr_trend    REAL,
  pct_change    REAL,
  -- 1 = artefacto de marca: |cambio|>25% con las tres medias de la fuente congeladas.
  -- Se guarda para el panel de calidad; las pantallas de movers lo excluyen.
  is_artifact   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (as_of, instrument_id)
);
"""


def segment_of(lang, release_date):
    if lang == "ja":
        return "JA"
    if release_date and release_date < VINTAGE_CUTOFF:
        return "EN-vintage"
    return "EN-moderno"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    args = ap.parse_args()
    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)

    dates = [r[0] for r in con.execute("SELECT DISTINCT obs_date FROM price_obs ORDER BY obs_date")]
    if len(dates) < 2:
        print(f"  indice: {len(dates)} fecha(s) en archivo; se necesitan 2. Base pendiente.")
        return

    # Precios limpios por fecha: {fecha: {instrument_id: (trend, segmento)}}
    panel = {}
    for d in dates:
        rows = con.execute("""
            SELECT p.instrument_id, p.cm_trend, p.cm_avg1, p.cm_avg7, p.cm_avg30, i.lang, s.release_date
            FROM price_obs p
            JOIN instruments i ON i.instrument_id = p.instrument_id
            JOIN cards c ON c.card_id = i.card_id AND c.lang = i.lang
            LEFT JOIN sets s ON s.set_id = c.set_id AND s.lang = c.lang
            WHERE p.obs_date = ? AND i.is_digital = 0 AND i.cm_collision = 0
              AND p.cm_trend IS NOT NULL AND p.cm_trend > 0
        """, (d,)).fetchall()
        panel[d] = {r["instrument_id"]: (r["cm_trend"], segment_of(r["lang"], r["release_date"]),
                                         (r["cm_avg1"], r["cm_avg7"], r["cm_avg30"])) for r in rows}

    con.execute("DELETE FROM market_index WHERE methodology = 'index_v1'")
    con.execute("DELETE FROM movers")

    now = datetime.now(timezone.utc).isoformat()
    values = {}  # segmento -> valor encadenado
    for k in range(1, len(dates)):
        t_prev, t = dates[k - 1], dates[k]
        interval = (datetime.fromisoformat(t) - datetime.fromisoformat(t_prev)).days
        seg_rets = {}
        movers_rows = []

        n_artifacts = 0
        for iid, (px, seg, avgs) in panel[t].items():
            prev = panel[t_prev].get(iid)
            if not prev:
                continue
            prev_px, _, prev_avgs = prev
            # Suelo evaluado con el dato CONOCIDO en t_prev: point-in-time.
            if prev_px < FLOOR_EUR:
                continue
            r = px / prev_px - 1.0
            # Artefacto de marca: un salto grande de trend con el vector completo de
            # medias congelado no es mercado (ventas reales moverian alguna media).
            # Caso real que motiva la regla: ex7-99, 161 -> 5.201 EUR con avg1/7/30
            # identicos al centimo. Fuera del indice y marcado en movers.
            is_artifact = abs(r) > 0.25 and avgs == prev_avgs
            if is_artifact:
                n_artifacts += 1
                if r != 0.0:
                    movers_rows.append((t, iid, t_prev, interval, prev_px, px, r, 1))
                continue
            clipped = max(-CLIP, min(CLIP, r))
            seg_rets.setdefault(seg, []).append((clipped, r != clipped))
            seg_rets.setdefault("TOTAL", []).append((clipped, r != clipped))
            if r != 0.0:
                movers_rows.append((t, iid, t_prev, interval, prev_px, px, r, 0))

        for seg, rs in seg_rets.items():
            mean_r = sum(x for x, _ in rs) / len(rs)
            n_clip = sum(1 for _, c in rs if c)
            base = values.get(seg, BASE)
            values[seg] = base * (1.0 + mean_r)
            con.execute(
                "INSERT OR REPLACE INTO market_index VALUES (?,?,?,?,?,?,?,?,?,?)",
                (t, seg, values[seg], mean_r, len(rs), n_clip, t_prev, interval, "index_v1", now))

        # El primer valor de cada segmento en la fecha base:
        if k == 1:
            for seg in seg_rets:
                con.execute(
                    "INSERT OR REPLACE INTO market_index VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (t_prev, seg, BASE, None, None, None, None, None, "index_v1", now))

        con.executemany("INSERT OR REPLACE INTO movers VALUES (?,?,?,?,?,?,?,?)", movers_rows)

    con.commit()
    print("  indice index_v1:")
    for r in con.execute("""SELECT as_of, segment, value, mean_return, n_constituents, n_clipped, interval_days
                            FROM market_index WHERE methodology='index_v1' ORDER BY as_of, segment"""):
        mr = f"{100*r['mean_return']:+.2f}%" if r["mean_return"] is not None else "  base"
        print(f"    {r['as_of']}  {r['segment']:<11} {r['value']:>8.3f}  {mr:>8}  n={r['n_constituents'] or '—':>5}  clip={r['n_clipped'] if r['n_clipped'] is not None else '—'}  intervalo={r['interval_days'] or '—'}d")
    n_mov = con.execute("SELECT COUNT(*) FROM movers WHERE is_artifact=0").fetchone()[0]
    n_art = con.execute("SELECT COUNT(*) FROM movers WHERE is_artifact=1").fetchone()[0]
    print(f"  movers registrados: {n_mov:,} | artefactos de marca detectados y excluidos: {n_art:,}")
    con.close()


if __name__ == "__main__":
    main()
