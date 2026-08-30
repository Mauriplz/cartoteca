#!/usr/bin/env python3
"""
Ingesta del historico de precios de tcgdex/price-history (MIT).

Que es esa fuente: series DIARIAS por carta con avg/count/min/max de ventas
observadas — noviembre 2022 a septiembre 2024 — desde TCGplayer (en) y eBay
Francia (fr). A diferencia de las marcas suavizadas de la API, esto son medias
de transacciones fechadas con su numero de observaciones: sirve para calcular
retornos reales y validar las senales contra lo que paso despues.

Va a una base SEPARADA (data/history.db): es material de investigacion, no de
produccion. La serie NO empalma con nuestro archivo (hueco oct-2024 -> ago-2026)
y no debe mezclarse con el.

Mapeo de identidad: sus carpetas usan en su mayoria nuestros mismos codigos de
set (base1, bw1, swsh...); el numero de fichero es el localId sin relleno de
ceros. Se intenta el join exacto y el rellenado; lo no mapeable se ingiere
igualmente con card_id NULL y se MIDE, no se descarta en silencio.
"""

import glob
import json
import os
import sqlite3
import sys
import time

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(PROJ, "price-history")
DB = os.path.join(PROJ, "data", "history.db")
PROD_DB = os.path.join(PROJ, "data", "pcp.db")

SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS price_history (
  lang     TEXT NOT NULL,        -- en (tcgplayer) | fr (ebay)
  src_set  TEXT NOT NULL,        -- carpeta de la fuente
  src_num  TEXT NOT NULL,        -- numero de fichero
  source   TEXT NOT NULL,
  vc       TEXT NOT NULL,        -- clave variante-estado tal cual la da la fuente
  date     TEXT NOT NULL,
  avg      REAL,
  cnt      INTEGER,              -- numero de observaciones ese dia: el peso real
  mn       REAL,
  mx       REAL,
  card_id  TEXT                  -- nuestro id si el mapeo es inequivoco; NULL si no
);
CREATE INDEX IF NOT EXISTS idx_ph_card ON price_history(card_id, date);
CREATE INDEX IF NOT EXISTS idx_ph_src  ON price_history(src_set, src_num);
"""


def main():
    t0 = time.time()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.execute("DELETE FROM price_history")

    # Cartas conocidas de produccion, para el mapeo (solo ingles: la fuente 'fr'
    # no existe en nuestro catalogo y se guarda sin mapear).
    prod = sqlite3.connect(PROD_DB)
    known = {r[0] for r in prod.execute("SELECT card_id FROM cards WHERE lang='en'")}
    prod.close()

    rows, files, mapped_files, skipped = [], 0, 0, 0
    for lang in ("en", "fr"):
        for path in glob.glob(os.path.join(SRC, lang, "*", "*.json")):
            files += 1
            parts = path.split(os.sep)
            src_set, fname = parts[-2], parts[-1]
            src_num, source, _ = fname.rsplit(".", 2)

            card_id = None
            if lang == "en":
                # Join exacto y con relleno de ceros a 3 (los sets modernos lo usan).
                for cand in (f"{src_set}-{src_num}", f"{src_set}-{src_num.zfill(3)}"):
                    if cand in known:
                        card_id = cand
                        break
                if card_id:
                    mapped_files += 1

            try:
                d = json.load(open(path, encoding="utf-8"))
            except Exception:
                skipped += 1
                continue
            for vc, block in (d.get("data") or {}).items():
                for date, v in (block.get("history") or {}).items():
                    rows.append((lang, src_set, src_num, source, vc, date,
                                 v.get("avg"), v.get("count"), v.get("min"), v.get("max"),
                                 card_id))
            if len(rows) >= 200_000:
                con.executemany("INSERT INTO price_history VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
                rows = []
    if rows:
        con.executemany("INSERT INTO price_history VALUES (?,?,?,?,?,?,?,?,?,?,?)", rows)
    con.commit()

    q = lambda s: con.execute(s).fetchone()[0]
    n = q("SELECT COUNT(*) FROM price_history")
    print(f"=== ingesta en {time.time()-t0:.0f}s ===")
    print(f"  ficheros: {files:,} ({skipped} ilegibles) | filas: {n:,}")
    print(f"  ficheros EN mapeados a nuestro catalogo: {mapped_files:,}")
    print(f"  filas con card_id: {q('SELECT COUNT(*) FROM price_history WHERE card_id IS NOT NULL'):,} "
          f"({100*q('SELECT COUNT(*) FROM price_history WHERE card_id IS NOT NULL')/max(n,1):.0f}%)")
    print(f"  rango de fechas: {q('SELECT MIN(date) FROM price_history')} -> {q('SELECT MAX(date) FROM price_history')}")
    print(f"  variantes-estado distintas: {q('SELECT COUNT(DISTINCT vc) FROM price_history')}")
    print(f"\n  -> {DB} ({os.path.getsize(DB)/1e6:.0f} MB)")
    con.close()


if __name__ == "__main__":
    main()
