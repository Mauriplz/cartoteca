#!/usr/bin/env python3
"""
Captura diaria de precios de cartas Pokemon desde TCGdex.

Sin dependencias externas: solo biblioteca estandar. Pensado para correr a diario
via cron desde el minuto cero del proyecto, porque el historico de precios no
existe en ninguna parte y cada dia no capturado se pierde para siempre.

Salida (JSONL comprimido, una linea por carta):
    data/prices/<lang>/prices_<YYYY-MM-DD>.jsonl.gz    diario
    data/catalog/<lang>/catalog_<YYYY-MM-DD>.jsonl.gz  metadatos (semanal basta)
    data/sets/<lang>/sets_<YYYY-MM-DD>.jsonl.gz        sets + releaseDate (con --catalog)

Correccion point-in-time: `fetched_at` es NUESTRO reloj y es el unico fiable.
AVISO, medido el 2026-08-25: `pricing.updated` NO es un sello "as-of" por carta.
En 19.818 cartas EN solo hay 7 valores distintos, todos dentro del mismo segundo:
es la marca del batch de refresco de TCGdex, no la fecha de la ultima venta. Usarlo
como reloj de conocimiento por carta seria un error. El unico reloj valido para el
feature store es `fetched_at`, y la latencia real de la agregacion de Cardmarket
(medias moviles de ventana desconocida) es inobservable desde esta fuente.

Uso:
    python3 capture.py                      # EN + JA, precios
    python3 capture.py --catalog            # ademas refresca metadatos
    python3 capture.py --languages en       # solo ingles
    python3 capture.py --limit 200          # prueba rapida
"""

import argparse
import gzip
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

API = "https://api.tcgdex.net/v2"
UA = "pokemon-card-price/0.1 (daily price archival; contact: plazamauri7@gmail.com)"
# Raiz de datos. Configurable porque el cron NO ejecuta desde el arbol del proyecto:
# macOS TCC impide a launchd leer bajo ~/Documents, asi que el runtime vive en
# ~/Library/Application Support y alli la ruta relativa "../../data" apunta fuera.
ROOT = os.environ.get("PCP_DATA_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"
)

# Campos de metadatos que conservamos del catalogo.
CATALOG_FIELDS = (
    "id localId name illustrator rarity category stage evolveFrom hp types "
    "dexId regulationMark suffix image variants variants_detailed legal updated"
).split()


class Throttle:
    """Limitador de ritmo global. Somos invitados en una API abierta y gratuita."""

    def __init__(self, rps):
        self.interval = 1.0 / rps if rps > 0 else 0.0
        self.lock = threading.Lock()
        self.next_at = time.monotonic()

    def wait(self):
        if not self.interval:
            return
        with self.lock:
            now = time.monotonic()
            if self.next_at < now:
                self.next_at = now
            delay = self.next_at - now
            self.next_at += self.interval
        if delay > 0:
            time.sleep(delay)


def get_json(url, throttle, attempts=4):
    """GET con reintentos y backoff exponencial con jitter."""
    last = None
    for i in range(attempts):
        throttle.wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code == 404:
                return None                      # carta retirada del catalogo: no reintentar
            if e.code == 429:
                time.sleep(5 * (i + 1))          # nos estan frenando: cedemos de verdad
        except Exception as e:
            last = repr(e)
        time.sleep(min(2 ** i, 8) + random.random())
    return {"__error__": last}


# Sets del juego movil Pokemon TCG Pocket: cartas DIGITALES, sin mercado fisico.
# Contaminan cualquier analisis de precio si se cuelan. Se marcan aqui y se excluyen aguas abajo.
DIGITAL_SETS = {"A1", "A1a", "A2", "A2a", "A2b", "A3", "A3a", "A3b", "A4", "A4a", "P-A"}


def capture_sets(lang, day, throttle):
    """Metadatos de set. `releaseDate` SOLO existe aqui: el objeto `set` embebido en la
    carta no lo trae, y sin el no se pueden calcular los factores de ciclo de vida."""
    index = get_json(f"{API}/{lang}/sets", throttle)
    if not isinstance(index, list):
        print(f"[{lang}] ERROR: indice de sets no disponible", file=sys.stderr)
        return 0
    path = out_path("sets", lang, day)
    n = 0
    with gzip.open(path, "wt", encoding="utf-8") as f:
        for s in index:
            full = get_json(f"{API}/{lang}/sets/{s['id']}", throttle) or {}
            if "__error__" in full:
                continue
            full.pop("cards", None)                      # la lista de cartas ya la tenemos
            full["lang"] = lang
            full["is_digital"] = s["id"] in DIGITAL_SETS
            full["captured_at"] = datetime.now(timezone.utc).isoformat()
            f.write(json.dumps(full, ensure_ascii=False) + "\n")
            n += 1
    print(f"[{lang}] sets: {n} capturados (con releaseDate)", flush=True)
    return n


def out_path(kind, lang, day):
    d = os.path.join(ROOT, kind, lang)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{kind}_{day}.jsonl.gz")


def already_captured(path):
    """Ids ya presentes en el fichero de hoy, para poder reanudar sin duplicar."""
    if not os.path.exists(path):
        return set()
    seen = set()
    try:
        with gzip.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                try:
                    seen.add(json.loads(line)["id"])
                except Exception:
                    continue
    except (OSError, EOFError):
        pass                                     # fichero truncado por una interrupcion: se reescribe
    return seen


def capture_language(lang, day, throttle, workers, want_catalog, limit):
    print(f"[{lang}] pidiendo indice de cartas...", flush=True)
    index = get_json(f"{API}/{lang}/cards", throttle)
    if not isinstance(index, list):
        print(f"[{lang}] ERROR: no se pudo obtener el indice ({index})", file=sys.stderr)
        return {"lang": lang, "error": True}

    ids = [c["id"] for c in index]
    if limit:
        ids = ids[:limit]
    total = len(ids)

    prices_path = out_path("prices", lang, day)
    catalog_path = out_path("catalog", lang, day) if want_catalog else None

    done = already_captured(prices_path)
    todo = [i for i in ids if i not in done]
    if done:
        print(f"[{lang}] reanudando: {len(done)} ya capturadas, faltan {len(todo)}", flush=True)

    stats = {"lang": lang, "total": total, "ok": 0, "errors": 0, "no_price": 0, "cm": 0, "tcg": 0}
    lock = threading.Lock()
    t0 = time.time()

    pf = gzip.open(prices_path, "at", encoding="utf-8")
    cf = gzip.open(catalog_path, "at", encoding="utf-8") if catalog_path else None

    def worker(cid):
        # El indice devuelve ids YA url-encoded (p.ej. la Unown "exu-%3F", que es "exu-?").
        # Hay que volver a codificar el '%' o la API responde 404. Verificado: exu-%3F -> 404,
        # exu-%253F -> 200.
        card = get_json(f"{API}/{lang}/cards/{urllib.parse.quote(cid, safe='')}", throttle)
        now = datetime.now(timezone.utc).isoformat()

        if card is None or "__error__" in (card or {}):
            with lock:
                stats["errors"] += 1
            return

        pricing = card.get("pricing") or {}
        cm, tcg = pricing.get("cardmarket"), pricing.get("tcgplayer")

        # variants_detailed es la fuente de verdad: trae pricing POR VARIANTE, con su
        # propio variantId, type (holo/normal/reverse), subtype (1st edition vs unlimited)
        # e idProduct. El bloque `pricing` de nivel superior es solo la primera variante,
        # asi que para cartas multivariante pierde el resto. No descartarlo nunca.
        row = {
            "id": card.get("id"),
            "lang": lang,
            "set": (card.get("set") or {}).get("id"),
            "fetched_at": now,
            "cardmarket": cm,
            "tcgplayer": tcg,
            "variants_detailed": card.get("variants_detailed"),
        }
        cat = None
        if cf:
            cat = {k: card[k] for k in CATALOG_FIELDS if k in card}
            cat["lang"] = lang
            cat["set"] = card.get("set")
            cat["captured_at"] = now

        with lock:
            pf.write(json.dumps(row, ensure_ascii=False) + "\n")
            if cf and cat:
                cf.write(json.dumps(cat, ensure_ascii=False) + "\n")
            stats["ok"] += 1
            if cm:
                stats["cm"] += 1
            if tcg:
                stats["tcg"] += 1
            if not cm and not tcg:
                stats["no_price"] += 1
            n = stats["ok"] + stats["errors"]
            if n % 2500 == 0:
                el = time.time() - t0
                rate = n / el if el else 0
                eta = (len(todo) - n) / rate / 60 if rate else 0
                print(f"[{lang}] {n}/{len(todo)}  {rate:.0f} req/s  ETA {eta:.1f} min", flush=True)

    try:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(worker, todo))
    finally:
        pf.close()
        if cf:
            cf.close()

    stats["seconds"] = round(time.time() - t0, 1)
    stats["file"] = prices_path
    stats["bytes"] = os.path.getsize(prices_path) if os.path.exists(prices_path) else 0
    return stats


def main():
    ap = argparse.ArgumentParser(description="Captura diaria de precios de cartas Pokemon (TCGdex)")
    ap.add_argument("--languages", default="en,ja", help="idiomas separados por coma (def: en,ja)")
    ap.add_argument("--workers", type=int, default=12, help="hilos concurrentes (def: 12)")
    ap.add_argument("--rps", type=float, default=45.0, help="techo de peticiones/segundo (def: 45)")
    ap.add_argument("--catalog", action="store_true", help="capturar tambien metadatos completos")
    ap.add_argument("--limit", type=int, default=0, help="solo las N primeras cartas (pruebas)")
    ap.add_argument("--day", default=None, help="fecha YYYY-MM-DD (def: hoy UTC)")
    args = ap.parse_args()

    day = args.day or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    throttle = Throttle(args.rps)

    print(f"=== Captura {day} · idiomas={args.languages} · {args.workers} hilos · techo {args.rps} req/s ===", flush=True)
    results = []
    for lang in [l.strip() for l in args.languages.split(",") if l.strip()]:
        if args.catalog:
            capture_sets(lang, day, throttle)
        results.append(capture_language(lang, day, throttle, args.workers, args.catalog, args.limit))

    print("\n=== RESUMEN ===")
    for s in results:
        if s.get("error"):
            print(f"  {s['lang']}: FALLO")
            continue
        ok, tot = s["ok"], s["total"]
        print(
            f"  {s['lang']}: {ok}/{tot} cartas · {s['errors']} errores · "
            f"Cardmarket {100*s['cm']/max(ok,1):.0f}% · TCGplayer {100*s['tcg']/max(ok,1):.0f}% · "
            f"{s['seconds']}s · {s['bytes']/1e6:.1f} MB"
        )

    manifest = os.path.join(ROOT, "manifest.jsonl")
    os.makedirs(ROOT, exist_ok=True)
    with open(manifest, "a", encoding="utf-8") as f:
        f.write(json.dumps({"day": day, "at": datetime.now(timezone.utc).isoformat(), "results": results}, ensure_ascii=False) + "\n")
    print(f"\nManifiesto: {manifest}")


if __name__ == "__main__":
    main()
