#!/usr/bin/env python3
"""
Sonda de cadencia de TCGdex.

Una auditoria del algoritmo senalo, con razon, que damos por hecha una frecuencia
diaria sin haberla medido nunca. Si TCGdex refresca su espejo de precios de Cardmarket
una vez al dia a una hora concreta, capturar antes de esa hora significa archivar dos
veces el mismo lote y creer que el mercado no se movio.

Esta sonda pide UNA carta cada hora y anota el sello `updated` que declara la fuente
junto al instante en que lo pedimos nosotros. Con unos dias de registro sabremos la
hora real del refresco y podremos programar la captura justo despues, en vez de a ojo.

Coste: 24 peticiones al dia.
"""

import json
import os
import urllib.request
from datetime import datetime, timezone

CARD = "base1-4"          # carta liquida y estable, siempre con precio
# Ver nota en capture.py: la raiz de datos debe ser configurable para el cron.
OUT = os.path.join(
    os.environ.get("PCP_DATA_DIR")
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"),
    "cadence.jsonl",
)


def main():
    url = f"https://api.tcgdex.net/v2/en/cards/{CARD}"
    req = urllib.request.Request(url, headers={"User-Agent": "pokemon-card-price/0.1 (cadence probe)"})
    now = datetime.now(timezone.utc).isoformat()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            card = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        row = {"probed_at": now, "error": repr(e)}
    else:
        p = card.get("pricing") or {}
        cm, tcg = p.get("cardmarket") or {}, p.get("tcgplayer") or {}
        row = {
            "probed_at": now,
            "cm_updated": cm.get("updated"),
            "tcg_updated": tcg.get("updated"),
            # Guardamos tambien los valores: si el sello cambia pero los numeros no,
            # el refresco es cosmetico y no aporta observacion nueva.
            "cm_trend": cm.get("trend"),
            "cm_avg1": cm.get("avg1"),
            "cm_avg7": cm.get("avg7"),
            "cm_avg30": cm.get("avg30"),
        }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    main()
