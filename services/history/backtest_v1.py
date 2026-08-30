#!/usr/bin/env python3
"""
Backtest v1 — la version que se defiende del ruido de medida.

Por que existe: la v0 dio IC de +/-0,4 y diferenciales Q5-Q1 del 140% por
trimestre. Eso no es una senal descubierta: es la firma de la REVERSION POR
ERROR DE MEDIDA. El precio medio del mes t lleva ruido de muestreo (pocas
ventas, mezcla de estados); rankear por ese precio y medir el retorno DESDE ese
mismo precio pone el mismo ruido en los dos lados con signo opuesto. "Barata en
cohorte" compra ruido negativo que rebota solo; el momentum hereda el espejo.

Defensas (convenciones estandar de la literatura de factores):
 1. RANKING sobre la media movil ponderada de 3 meses (t-2..t), >=10 ventas:
    el ruido de un mes no domina la ordenacion.
 2. SKIP-MONTH: el retorno adelantado se mide de t+1 a t+4. El mes del ranking
    no aparece en la medicion: su ruido no puede estar en ambos lados.
 3. El momentum se forma sobre medias moviles separadas por el salto.

Si una senal sobrevive ATENUADA a estas defensas, hay algo real. Si se
desploma, la v0 media ruido. Ambos resultados se publican.
"""

import os
import sqlite3
import statistics as st
from collections import defaultdict

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
HDB = os.path.join(PROJ, "data", "history.db")
PDB = os.path.join(PROJ, "data", "pcp.db")

MIN_PRICE = 5.0
MIN_OBS_RANK = 10     # ventas minimas en la ventana de ranking (3 meses)
MIN_OBS_M = 3         # ventas minimas por mes usado en la medicion
FWD_A, FWD_B = 1, 4   # retorno medido de t+1 a t+4 (skip-month)


def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v); i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            for k in range(i, j + 1):
                r[order[k]] = (i + j) / 2.0
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = st.mean(rx), st.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def month_shift(m, k):
    y, mo = int(m[:4]), int(m[5:7]) + k
    y += (mo - 1) // 12
    mo = (mo - 1) % 12 + 1
    return f"{y:04d}-{mo:02d}"


def main():
    con = sqlite3.connect(HDB)
    monthly = defaultdict(lambda: [0.0, 0])
    for cid, date, avg, cnt in con.execute("""
        SELECT card_id, date, avg, cnt FROM price_history
        WHERE card_id IS NOT NULL AND avg > 0 AND cnt > 0
          AND vc IN ('normal-good','normal-nearmint','holo-good','holo-nearmint')"""):
        c = monthly[(cid, date[:7])]
        c[0] += avg * cnt
        c[1] += cnt
    con.close()
    monthly = {k: (v[0] / v[1], v[1]) for k, v in monthly.items() if v[1] >= MIN_OBS_M}
    months = sorted({m for _, m in monthly})
    cards = {c for c, _ in monthly}
    print(f"panel: {len(monthly):,} celdas | {months[0]} -> {months[-1]} | {len(cards):,} cartas")

    def trailing(cid, m, k=3):
        """Media ponderada por ventas de los meses m-k+1..m; None si pocas ventas."""
        tot_v = tot_n = 0.0
        for i in range(k):
            cell = monthly.get((cid, month_shift(m, -i)))
            if cell:
                tot_v += cell[0] * cell[1]
                tot_n += cell[1]
        return (tot_v / tot_n, tot_n) if tot_n >= MIN_OBS_RANK else None

    conp = sqlite3.connect(PDB)
    meta = {r[0]: (r[1], r[2]) for r in conp.execute(
        "SELECT card_id, rarity, set_id FROM cards WHERE lang='en'")}
    conp.close()

    ics = {"momentum_skip": [], "cohorte_barata_skip": []}
    spread = {"momentum_skip": [], "cohorte_barata_skip": []}

    for m in months:
        rows = []
        for cid in cards:
            tr = trailing(cid, m)
            if not tr or tr[0] < MIN_PRICE:
                continue
            fwd_a = trailing(cid, month_shift(m, FWD_A), 1)
            fwd_b = trailing(cid, month_shift(m, FWD_B), 1)
            # medicion de t+1 a t+4, sin tocar la ventana del ranking
            if not fwd_a or not fwd_b or fwd_a[1] < MIN_OBS_M or fwd_b[1] < MIN_OBS_M:
                continue
            fwd_ret = fwd_b[0] / fwd_a[0] - 1.0
            form = trailing(cid, month_shift(m, -4))    # formacion separada por el salto
            mom = tr[0] / form[0] - 1.0 if form else None
            rar, sid = meta.get(cid, (None, None))
            rows.append((cid, tr[0], fwd_ret, mom, rar, sid))
        if len(rows) < 120:
            continue

        coh = defaultdict(list)
        for r in rows:
            if r[4] and r[5]:
                coh[(r[5], r[4])].append(r)
        pct = {}
        for _, items in coh.items():
            if len(items) < 4:
                continue
            items.sort(key=lambda r: r[1])
            n = len(items)
            for i, r in enumerate(items):
                pct[r[0]] = i / (n - 1)

        mp = [(r[3], r[2]) for r in rows if r[3] is not None]
        cp = [(pct[r[0]], r[2]) for r in rows if r[0] in pct]
        if len(mp) >= 80:
            ics["momentum_skip"].append(spearman([a for a, _ in mp], [b for _, b in mp]))
            mp.sort(key=lambda x: x[0]); k = len(mp) // 5
            spread["momentum_skip"].append(st.mean([b for _, b in mp[-k:]]) - st.mean([b for _, b in mp[:k]]))
        if len(cp) >= 80:
            ics["cohorte_barata_skip"].append(-spearman([a for a, _ in cp], [b for _, b in cp]))
            cp.sort(key=lambda x: x[0]); k = len(cp) // 5
            spread["cohorte_barata_skip"].append(st.mean([b for _, b in cp[:k]]) - st.mean([b for _, b in cp[-k:]]))

    print(f"\n=== IC a 3 meses CON skip-month y ranking sobre media movil (solapado: mediana y signos) ===")
    for name, xs in ics.items():
        if not xs:
            print(f"  {name:<22} sin meses suficientes")
            continue
        pos = sum(1 for v in xs if v > 0)
        print(f"  {name:<22} meses={len(xs):>2}  IC mediano={st.median(xs):+.3f}  positivos={pos}/{len(xs)}"
              f"  Q5-Q1 medio={100*st.mean(spread[name]):+.1f}%")
    print("\n  Comparar con v0 (sin defensas): momentum -0.400 | cohorte_barata +0.382, Q5-Q1 +143%.")
    print("  Lo que sobreviva aqui es senal; la diferencia con v0 era ruido de medida.")


if __name__ == "__main__":
    main()
