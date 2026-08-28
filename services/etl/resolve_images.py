#!/usr/bin/env python3
"""
Recupera las imagenes que TCGdex no declara pero SI sirve.

El problema, medido: el campo `image` viene a null en el 69,6% de las cartas
japonesas y en el 7,7% de las inglesas — 10.589 cartas en total, 333 de ellas
dentro del ranking de inversion. Una aplicacion de cartas con un cuarto del
ranking sin imagen no es la mejor del mercado.

El hallazgo: el CDN si tiene el fichero. La API no rellena el campo, pero
    https://assets.tcgdex.net/{lang}/{serie}/{set}/{localId}/low.webp
responde 200 para cartas cuyo `image` es null. Asi que la URL se puede
reconstruir y verificar una por una.

El resultado se guarda en data/image_resolution.jsonl, no en la base: comprobar
diez mil URLs cuesta minutos y no debe repetirse cada vez que se recarga el ETL.
Es dato capturado, y se trata como tal.

Uso:
    python3 services/etl/resolve_images.py            # solo las que faltan
    python3 services/etl/resolve_images.py --recheck  # revisa tambien las fallidas
"""

import argparse
import json
import os
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA = os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data")
OUT = os.path.join(DATA, "image_resolution.jsonl")
DB = os.path.join(os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data"), "pcp.db")
UA = "pokemon-card-price/0.1 (image resolution)"


class Throttle:
    def __init__(self, rps):
        self.interval = 1.0 / rps if rps > 0 else 0.0
        self.lock = threading.Lock()
        self.next_at = time.monotonic()

    def wait(self):
        if not self.interval:
            return
        with self.lock:
            now = time.monotonic()
            self.next_at = max(self.next_at, now)
            d = self.next_at - now
            self.next_at += self.interval
        if d > 0:
            time.sleep(d)


def exists(url, throttle):
    """HEAD sobre la variante /low.webp. Devuelve True solo con un 200 limpio."""
    throttle.wait()
    try:
        req = urllib.request.Request(url + "/low.webp", method="HEAD",
                                     headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception:
        return None      # fallo de red: distinto de "no existe", se reintenta otro dia


def load_previous():
    seen = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    seen[(r["card_id"], r["lang"])] = r
                except Exception:
                    continue
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--rps", type=float, default=40.0)
    ap.add_argument("--recheck", action="store_true",
                    help="reintenta tambien las que ya se comprobaron sin exito")
    args = ap.parse_args()

    con = sqlite3.connect(args.db)
    con.row_factory = sqlite3.Row
    series = {(r["set_id"], r["lang"]): r["serie_id"]
              for r in con.execute("SELECT set_id, lang, serie_id FROM sets")}
    known_sets = set(series.keys())

    faltan = con.execute("""
        SELECT card_id, lang, set_id, local_id FROM cards
        WHERE image IS NULL AND is_digital = 0 AND local_id IS NOT NULL
    """).fetchall()

    previo = load_previous()
    pendientes = [
        r for r in faltan
        if (r["card_id"], r["lang"]) not in previo
        or (args.recheck and not previo[(r["card_id"], r["lang"])].get("url"))
    ]

    print(f"cartas sin imagen declarada : {len(faltan):,}")
    print(f"ya comprobadas anteriormente: {len(faltan) - len(pendientes):,}")
    print(f"a comprobar ahora           : {len(pendientes):,}")
    if not pendientes:
        return

    throttle = Throttle(args.rps)
    lock = threading.Lock()
    stats = {"ok": 0, "no": 0, "err": 0}
    t0 = time.time()
    f = open(OUT, "a", encoding="utf-8")

    def candidates(r):
        """URLs a probar, en orden.

        Los subsets guardan sus imagenes bajo el set PADRE. Verificado:
        swsh12.5gg/GG50 da 404, pero swsh12.5/GG50 da 200 — la Galarian Gallery
        vive dentro de Crown Zenith. Lo mismo pasa con otros sets derivados, asi
        que se prueban los padres candidatos quitando el sufijo alfabetico final.
        """
        se = series.get((r["set_id"], r["lang"]))
        if not se:
            return []
        sid = r["set_id"]
        cands = [sid]
        # Padres candidatos: swsh12.5gg -> swsh12.5 ; SM12a -> SM12 ; cel25cc -> cel25
        stripped = sid
        while stripped and stripped[-1].isalpha():
            stripped = stripped[:-1]
            if stripped and stripped != sid and (stripped, r["lang"]) in known_sets:
                cands.append(stripped)
        q = urllib.parse.quote
        return [
            f"https://assets.tcgdex.net/{r['lang']}/{q(se, safe='')}/{q(c, safe='')}/{q(str(r['local_id']), safe='')}"
            for c in cands
        ]

    def work(r):
        hit_url, saw_error = None, False
        for url in candidates(r):
            hit = exists(url, throttle)
            if hit:
                hit_url = url
                break
            if hit is None:
                saw_error = True
        row = {"card_id": r["card_id"], "lang": r["lang"],
               "url": hit_url,
               "checked_at": datetime.now(timezone.utc).isoformat()}
        with lock:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            stats["ok" if hit_url else ("err" if saw_error else "no")] += 1
            n = sum(stats.values())
            if n % 1500 == 0:
                el = time.time() - t0
                print(f"  {n:,}/{len(pendientes):,}  encontradas {stats['ok']:,}  "
                      f"({n/el:.0f}/s, ETA {(len(pendientes)-n)/(n/el)/60:.1f} min)", flush=True)

    try:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            list(ex.map(work, pendientes))
    finally:
        f.close()

    print(f"\nRESULTADO en {time.time()-t0:.0f}s")
    print(f"  imagen recuperada : {stats['ok']:,}")
    print(f"  no existe         : {stats['no']:,}")
    print(f"  error de red      : {stats['err']:,}")
    print(f"\n  -> {OUT}")


if __name__ == "__main__":
    main()
