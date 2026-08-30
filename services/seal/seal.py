#!/usr/bin/env python3
"""
Sello diario del track record.

Que es: cada dia, un hash SHA-256 de las senales del dia, encadenado con el sello
anterior y con el commit de codigo que las genero, anclado externamente via
OpenTimestamps (calendarios publicos que agregan hashes en Bitcoin).

Por que: el track record es el foso del proyecto y no se puede fabricar hacia
atras. Un hash en un repo propio no prueba nada (la historia de git se reescribe);
el anclaje OTS si: cualquiera puede verificar contra Bitcoin que ese hash existia
en esa fecha, sin confiar en nosotros. Los SELLOS son publicos; los DATOS no se
publican nunca (precios derivados de la fuente).

El sello cubre: senales del dia (dump canonico ordenado) + indice del dia +
sello anterior + HEAD de git. Cambiar cualquier cosa a posteriori rompe la cadena.
"""

import hashlib
import json
import os
import sqlite3
import subprocess
from datetime import datetime, timezone

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA = os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data")
DB = os.path.join(DATA, "pcp.db")
SEALS_DIR = os.path.join(DATA, "seals")
CHAIN = os.path.join(SEALS_DIR, "chain.jsonl")
OTS_BIN = os.path.expanduser("~/Library/Python/3.9/bin/ots")


def canonical_signals(con, as_of):
    """Dump canonico y determinista de las senales del dia."""
    rows = con.execute(
        """SELECT instrument_id, signal, value, detail FROM signals
           WHERE as_of = ? ORDER BY signal, instrument_id""", (as_of,)).fetchall()
    return "\n".join(f"{r[0]}\t{r[1]}\t{r[2]!r}\t{r[3]}" for r in rows), len(rows)


def canonical_index(con, as_of):
    rows = con.execute(
        """SELECT segment, value, mean_return, n_constituents FROM market_index
           WHERE as_of = ? AND methodology='index_v1' ORDER BY segment""", (as_of,)).fetchall()
    return "\n".join(f"{r[0]}\t{r[1]!r}\t{r[2]!r}\t{r[3]!r}" for r in rows)


def git_head():
    # En el runtime del cron el codigo no es un repo git: PCP_CODE_DIR apunta al real.
    code_dir = os.environ.get("PCP_CODE_DIR") or PROJ
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=code_dir, capture_output=True,
                              text=True, timeout=10).stdout.strip()
    except Exception:
        return "unknown"


def last_seal():
    if not os.path.exists(CHAIN):
        return None
    last = None
    with open(CHAIN, encoding="utf-8") as f:
        for line in f:
            if line.strip():
                last = json.loads(line)
    return last


def upgrade_pending():
    """Completa las pruebas OTS pendientes.

    ots stamp deja la prueba 'pending' hasta que el calendario agrega el hash en
    Bitcoin (~un dia). ots upgrade la sustituye por la atestacion completa, que ya
    es verificable sin depender del calendario. Se intenta cada dia para todos los
    sellos: idempotente, y un fallo de red no rompe nada.
    """
    if not os.path.exists(OTS_BIN):
        return
    upgraded = 0
    for f in sorted(os.listdir(SEALS_DIR)):
        if not f.endswith(".json.ots"):
            continue
        path = os.path.join(SEALS_DIR, f)
        r = subprocess.run([OTS_BIN, "upgrade", path], capture_output=True, text=True, timeout=120)
        if "Success" in (r.stdout + r.stderr):
            upgraded += 1
    if upgraded:
        print(f"  OTS: {upgraded} prueba(s) completada(s) con atestacion Bitcoin")


def main():
    os.makedirs(SEALS_DIR, exist_ok=True)
    upgrade_pending()
    con = sqlite3.connect(DB)
    as_of = con.execute("SELECT MAX(as_of) FROM signals").fetchone()[0]
    if not as_of:
        print("  sello: no hay senales que sellar")
        return

    prev = last_seal()
    if prev and prev["as_of"] == as_of:
        print(f"  sello: {as_of} ya sellado ({prev['sha256'][:16]}…)")
        return

    sig_dump, n_sig = canonical_signals(con, as_of)
    idx_dump = canonical_index(con, as_of)
    payload = "\n---\n".join([
        f"cartoteca-seal-v1 {as_of}",
        f"prev {prev['sha256'] if prev else 'GENESIS'}",
        f"code {git_head()}",
        sig_dump, idx_dump,
    ])
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    seal = {"v": 1, "as_of": as_of, "sha256": digest,
            "prev": prev["sha256"] if prev else None,
            "n_signals": n_sig, "code": git_head(),
            "sealed_at": datetime.now(timezone.utc).isoformat()}
    with open(CHAIN, "a", encoding="utf-8") as f:
        f.write(json.dumps(seal) + "\n")

    # Fichero individual del dia (lo que se ancla y lo que se publicara).
    day_file = os.path.join(SEALS_DIR, f"seal_{as_of}.json")
    with open(day_file, "w", encoding="utf-8") as f:
        json.dump(seal, f, indent=2)

    # Anclaje externo. Si falla (sin red, calendarios caidos) el sello local queda
    # y el .ots se reintenta al dia siguiente: ots stamp es idempotente por fichero.
    if os.path.exists(OTS_BIN):
        r = subprocess.run([OTS_BIN, "stamp", day_file], capture_output=True, text=True, timeout=120)
        ots_ok = os.path.exists(day_file + ".ots")
        print(f"  sello {as_of}: {digest[:20]}… | {n_sig:,} senales | OTS: {'anclado' if ots_ok else 'PENDIENTE (' + r.stderr.strip()[:60] + ')'}")
    else:
        print(f"  sello {as_of}: {digest[:20]}… | {n_sig:,} senales | OTS: cliente no disponible")
    con.close()


if __name__ == "__main__":
    main()
