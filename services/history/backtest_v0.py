#!/usr/bin/env python3
"""
Backtest v0: las senales del sistema frente a dos años y medio de ventas reales.

Fuente: tcgdex/price-history (MIT) — medias DIARIAS de ventas de TCGplayer con
numero de observaciones, nov-2022 a jun-2025, mapeadas a nuestro catalogo.

QUE PREGUNTA RESPONDE: ¿los disenos de senal que hoy publicamos como "desajuste
observable" predijeron de verdad retornos en 2023-2025?

DISCIPLINA (las trampas que este proyecto se prohibio, aplicadas aqui):
 - Retornos sobre MEDIAS DE VENTAS REALES con peso por numero de observaciones,
   no sobre marcas suavizadas de un agregador: aqui el momentum SI es medible.
 - Panel MENSUAL: los dias con una sola venta son ruido; el mes agrega.
 - Point-in-time: el percentil de cohorte del mes t usa solo precios del mes t.
 - Cortes transversales: cada mes se rankea contra los demas instrumentos de ese
   mes; el IC es la correlacion de rango con el retorno de los 3 meses siguientes.
 - Se publican TODOS los meses (distribucion de ICs), no el mejor.
 - Ventanas adelantadas SOLAPADAS mes a mes: los ICs consecutivos comparten 2 de
   cada 3 meses de retorno y NO son independientes; el resumen honesto es la
   mediana y el recuento de signos, no un t-test ingenuo.
 - Sesgo de supervivencia declarado: exigir precio en t y en t+3m excluye lo que
   dejo de venderse; los retornos estan medidos SOLO sobre lo que siguio liquido.

FILTROS: estado good|nearmint (los mayoritarios), precio >= 5 USD en formacion,
>= 3 ventas en el mes de formacion y >= 3 en el de medicion.
"""

import os
import sqlite3
import statistics as st
from collections import defaultdict

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
HDB = os.path.join(PROJ, "data", "history.db")
PDB = os.path.join(PROJ, "data", "pcp.db")

MIN_PRICE = 5.0
MIN_OBS = 3
FWD = 3          # horizonte en meses
FORM = 3         # ventana de formacion del momentum


def spearman(xs, ys):
    def ranks(v):
        order = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = ranks(xs), ranks(ys)
    mx, my = st.mean(rx), st.mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = sum((a - mx) ** 2 for a in rx) ** 0.5
    dy = sum((b - my) ** 2 for b in ry) ** 0.5
    return num / (dx * dy) if dx and dy else 0.0


def load_panel():
    """(card_id, mes) -> (precio medio ponderado por ventas, ventas)."""
    con = sqlite3.connect(HDB)
    panel = defaultdict(lambda: [0.0, 0])
    for cid, date, avg, cnt in con.execute("""
        SELECT card_id, date, avg, cnt FROM price_history
        WHERE card_id IS NOT NULL AND avg > 0 AND cnt > 0
          AND vc IN ('normal-good','normal-nearmint','holo-good','holo-nearmint')"""):
        key = (cid, date[:7])
        cell = panel[key]
        cell[0] += avg * cnt
        cell[1] += cnt
    con.close()
    return {k: (v[0] / v[1], v[1]) for k, v in panel.items() if v[1] >= MIN_OBS}


def month_shift(m, k):
    y, mo = int(m[:4]), int(m[5:7])
    mo += k
    y += (mo - 1) // 12
    mo = (mo - 1) % 12 + 1
    return f"{y:04d}-{mo:02d}"


def main():
    panel = load_panel()
    months = sorted({m for _, m in panel})
    print(f"panel mensual: {len(panel):,} celdas carta-mes | {months[0]} -> {months[-1]}")

    # Metadatos de cohorte desde produccion
    con = sqlite3.connect(PDB)
    meta = {r[0]: (r[1], r[2], r[3]) for r in con.execute("""
        SELECT c.card_id, c.rarity, c.set_id, s.release_date
        FROM cards c LEFT JOIN sets s ON s.set_id=c.set_id AND s.lang=c.lang
        WHERE c.lang='en'""")}
    con.close()

    ics = {"momentum": [], "cohorte_barata": [], "edad_set": []}
    q_spread = {"momentum": [], "cohorte_barata": []}

    for m in months:
        fwd_m = month_shift(m, FWD)
        form_m = month_shift(m, -FORM)
        rows = []
        for (cid, mm), (px, n) in panel.items():
            if mm != m or px < MIN_PRICE:
                continue
            f = panel.get((cid, fwd_m))
            if not f:
                continue
            fwd_ret = f[0] / px - 1.0
            form = panel.get((cid, form_m))
            mom = px / form[0] - 1.0 if form else None
            rar, sid, rel = meta.get(cid, (None, None, None))
            age = None
            if rel:
                age = (int(m[:4]) - int(rel[:4])) * 12 + (int(m[5:7]) - int(rel[5:7]))
            rows.append((cid, px, fwd_ret, mom, rar, sid, age))
        if len(rows) < 150:
            continue

        # percentil dentro de cohorte (set+rareza) ese mes, point-in-time
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

        mom_pairs = [(r[3], r[2]) for r in rows if r[3] is not None]
        coh_pairs = [(pct[r[0]], r[2]) for r in rows if r[0] in pct]
        age_pairs = [(r[6], r[2]) for r in rows if r[6] is not None]

        if len(mom_pairs) >= 100:
            ics["momentum"].append((m, spearman([a for a, _ in mom_pairs], [b for _, b in mom_pairs]), len(mom_pairs)))
            mom_pairs.sort(key=lambda x: x[0])
            k = len(mom_pairs) // 5
            q_spread["momentum"].append(st.mean([b for _, b in mom_pairs[-k:]]) - st.mean([b for _, b in mom_pairs[:k]]))
        if len(coh_pairs) >= 100:
            # signo invertido: nuestra senal dice que BARATA en cohorte = alcista
            ics["cohorte_barata"].append((m, -spearman([a for a, _ in coh_pairs], [b for _, b in coh_pairs]), len(coh_pairs)))
            coh_pairs.sort(key=lambda x: x[0])
            k = len(coh_pairs) // 5
            q_spread["cohorte_barata"].append(st.mean([b for _, b in coh_pairs[:k]]) - st.mean([b for _, b in coh_pairs[-k:]]))
        if len(age_pairs) >= 100:
            ics["edad_set"].append((m, spearman([a for a, _ in age_pairs], [b for _, b in age_pairs]), len(age_pairs)))

    print(f"\n=== IC transversal a {FWD} meses (ventanas solapadas: mirar mediana y signos, no un t-test) ===")
    for name, vals in ics.items():
        if not vals:
            continue
        xs = [v for _, v, _ in vals]
        pos = sum(1 for v in xs if v > 0)
        med = st.median(xs)
        line = f"  {name:<16} meses={len(xs):>2}  IC mediano={med:+.3f}  positivos={pos}/{len(xs)}"
        if name in q_spread and q_spread[name]:
            line += f"  Q5-Q1 medio={100*st.mean(q_spread[name]):+.1f}%"
        print(line)
    print("\n  IC>0 = la senal apunta en la direccion correcta ese mes.")
    print("  momentum: retorno pasado 3m vs futuro 3m | cohorte_barata: percentil bajo en (set,rareza) vs futuro")
    print("  edad_set: meses desde la edicion vs futuro (curva de vida)")


if __name__ == "__main__":
    main()
