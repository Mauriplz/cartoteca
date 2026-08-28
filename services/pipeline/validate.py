#!/usr/bin/env python3
"""
Validacion de integridad de una captura diaria.

Un fichero corrupto o truncado que entra al almacen envenena todo lo de aguas
abajo (senales, indice, sello) sin dar la cara. Esta validacion corre ANTES del
ETL: si falla, el dia no se carga y se avisa. Exit != 0 = captura invalida.

Umbrales minimos, medidos sobre el archivo real (no inventados):
  EN: el indice tiene 23.546 cartas; una captura sana ronda eso. Minimo 20.000.
  JA: 12.781 en el indice. Minimo 10.000.
"""

import argparse
import gzip
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA = os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data")

MIN_ROWS = {"en": 20000, "ja": 10000}
REQUIRED_KEYS = {"id", "lang", "fetched_at"}


def validate_file(path, lang):
    """Devuelve (ok, dict_resultado). Lee el fichero entero: la integridad gzip
    solo se comprueba descomprimiendo hasta el final."""
    r = {"path": os.path.basename(path), "lang": lang}
    if not os.path.exists(path):
        return False, {**r, "error": "no existe"}

    n = with_price = bad_schema = 0
    h = hashlib.sha256()
    try:
        with open(path, "rb") as fb:
            for chunk in iter(lambda: fb.read(1 << 20), b""):
                h.update(chunk)
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                n += 1
                if not REQUIRED_KEYS <= set(row):
                    bad_schema += 1
                if row.get("cardmarket") or row.get("tcgplayer") or row.get("variants_detailed"):
                    with_price += 1
    except (OSError, EOFError, json.JSONDecodeError) as e:
        return False, {**r, "error": f"corrupto: {e!r}", "rows_read": n}

    r.update(rows=n, with_price=with_price, bad_schema=bad_schema,
             sha256=h.hexdigest(), bytes=os.path.getsize(path))
    if n < MIN_ROWS[lang]:
        return False, {**r, "error": f"solo {n} filas (minimo {MIN_ROWS[lang]})"}
    if bad_schema > n * 0.01:
        return False, {**r, "error": f"{bad_schema} filas sin claves obligatorias"}
    if with_price < n * 0.5:
        return False, {**r, "error": f"solo {with_price} filas con algun precio"}
    return True, r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    args = ap.parse_args()

    results, ok_all = [], True
    for lang in ("en", "ja"):
        path = os.path.join(DATA, "prices", lang, f"prices_{args.day}.jsonl.gz")
        ok, r = validate_file(path, lang)
        ok_all &= ok
        results.append(r)
        print(f"  [{'OK' if ok else 'FALLO'}] {lang}: {json.dumps({k: v for k, v in r.items() if k != 'sha256'}, ensure_ascii=False)}")

    out = os.path.join(DATA, "validation.jsonl")
    with open(out, "a", encoding="utf-8") as f:
        f.write(json.dumps({"day": args.day, "ok": ok_all,
                            "at": datetime.now(timezone.utc).isoformat(),
                            "files": results}, ensure_ascii=False) + "\n")
    sys.exit(0 if ok_all else 1)


if __name__ == "__main__":
    main()
