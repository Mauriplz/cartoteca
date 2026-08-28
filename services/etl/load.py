#!/usr/bin/env python3
"""
Carga el archivo capturado (JSONL comprimido) al almacen analitico SQLite.

Idempotente: se puede reejecutar sobre todo el archivo sin duplicar nada.

El problema no trivial que resuelve: la IDENTIDAD DEL INSTRUMENTO a lo largo del
tiempo. Las capturas del 25 de agosto se hicieron antes de descubrir que el pricing
real vive en `variants_detailed`, asi que solo tienen el bloque `pricing` de nivel
superior. Las posteriores tienen ambos. Si cada dia generase ids distintos, la serie
temporal se partiria en dos justo en el arranque.

La solucion no es inventar un id sintetico: el bloque de nivel superior declara su
propio `idProduct` de Cardmarket, y ese idProduct identifica exactamente a cual de
las variantes corresponde. Asi que las filas antiguas se enganchan por idProduct a
la variante correcta, y la serie queda continua. Cuando no hay correspondencia
(carta sin variants_detailed en ninguna captura) se crea un instrumento marcado
como 'unknown', visible y auditable, nunca silencioso.

Uso:
    python3 services/etl/load.py                 # carga todo el archivo
    python3 services/etl/load.py --db ruta.db
"""

import argparse
import glob
import gzip
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data")
DB = os.path.join(os.environ.get("PCP_DATA_DIR") or os.path.join(PROJ, "data"), "pcp.db")

DATE_RE = re.compile(r"_(\d{4}-\d{2}-\d{2})\.jsonl\.gz$")


def read_jsonl(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


def files(kind, lang):
    """Ficheros de un tipo y idioma, ordenados por fecha ascendente."""
    out = []
    for p in glob.glob(os.path.join(DATA, kind, lang, f"{kind}_*.jsonl.gz")):
        m = DATE_RE.search(p)
        if m:
            out.append((m.group(1), p))
    return sorted(out)


def inst_id(lang, card_id, vtype, vsubtype):
    return f"{lang}:{card_id}:{vtype or 'unknown'}:{vsubtype or '-'}"


# Correspondencia entre la variante de TCGdex y el bloque de precios de TCGplayer.
#
# Por que esto importa tanto: TCGplayer anida sus precios por nombre de variante
# ('normal', 'reverse-holofoil', 'holofoil', '1st-edition'...). Coger un bloque
# cualquiera equivale a comparar el precio europeo de la carta normal contra el
# americano de la reverse holo, que valen cosas muy distintas. Medido antes de
# arreglarlo: producia arbitrajes fantasma de hasta 12x en cartas vintage y
# contaminaba el 22% de la senal EU/US.
#
# Cada variante tiene una lista de preferencia ORDENADA. Si ninguna existe, se
# devuelve vacio: es preferible no tener precio de TCGplayer a tener el precio
# de otra carta.
TCG_PREF = {
    ("normal", "unlimited"):    ["unlimited", "normal"],
    ("normal", "1stedition"):   ["1st-edition", "normal"],
    ("normal", None):           ["normal", "unlimited", "1st-edition"],
    ("holo", "unlimited"):      ["unlimited-holofoil", "holofoil"],
    ("holo", "1stedition"):     ["1st-edition-holofoil", "holofoil"],
    ("holo", None):             ["holofoil", "unlimited-holofoil", "1st-edition-holofoil"],
    # La reverse holo NUNCA cae a 'normal' ni a 'holofoil': son productos distintos
    # y ese respaldo era justo el origen del arbitraje fantasma.
    ("reverse", None):          ["reverse-holofoil"],
    ("firstedition", None):     ["1st-edition", "1st-edition-holofoil"],
}


def tcg_block(tcg, vtype=None, vsub=None):
    """Bloque de precios de TCGplayer que corresponde REALMENTE a esta variante."""
    if not isinstance(tcg, dict):
        return {}
    avail = {k: v for k, v in tcg.items() if k not in ("unit", "updated") and isinstance(v, dict)}
    if not avail:
        return {}

    t = (vtype or "").lower() or None
    sub = (vsub or "").lower().replace(" ", "").replace("_", "") or None
    pref = TCG_PREF.get((t, sub)) or TCG_PREF.get((t, None))

    if pref is None:
        # Variante desconocida (lenticular, metal, wPromo...). Solo se acepta si
        # hay UN unico bloque: entonces no hay ambiguedad posible.
        return next(iter(avail.values())) if len(avail) == 1 else {}

    for k in pref:
        if k in avail:
            return avail[k]
    return {}


# Series que no son mercado fisico. Regla por SERIE, no por lista de sets: la lista
# hay que mantenerla a mano y se queda corta en cuanto sale una entrega nueva. Medido:
# marcando por lista se colaban 799 cartas de TCG Pocket (B1, B1a, B2, B2a) como
# mercado fisico, contaminando el explorador y el calculo de cohortes.
DIGITAL_SERIES = {"tcgp"}


def load_dimensions(con, langs):
    """Sets y cartas: se usa la captura MAS RECIENTE de cada uno."""
    digital = set()
    n_sets = n_cards = 0

    for lang in langs:
        fs = files("sets", lang)
        if fs:
            for s in read_jsonl(fs[-1][1]):
                if "id" not in s:
                    continue          # fila defectuosa de una captura antigua
                cc = s.get("cardCount") or {}
                lg = s.get("legal") or {}
                sr = s.get("serie") or {}
                es_digital = bool(s.get("is_digital")) or (sr.get("id") in DIGITAL_SERIES)
                if es_digital:
                    digital.add((s["id"], lang))
                con.execute(
                    """INSERT INTO sets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(set_id, lang) DO UPDATE SET
                         name=excluded.name, release_date=excluded.release_date,
                         is_digital=excluded.is_digital""",
                    (s["id"], lang, s.get("name"), sr.get("id"), sr.get("name"),
                     s.get("releaseDate"), cc.get("total"), cc.get("official"),
                     cc.get("holo"), cc.get("reverse"), cc.get("firstEd"),
                     int(bool(lg.get("standard"))), int(bool(lg.get("expanded"))),
                     int(es_digital)),
                )
                n_sets += 1

        fc = files("catalog", lang)
        if fc:
            for c in read_jsonl(fc[-1][1]):
                sid = (c.get("set") or {}).get("id")
                con.execute(
                    """INSERT INTO cards (card_id, lang, set_id, local_id, name, illustrator,
                                          rarity, category, stage, evolve_from, hp, types, dex_id,
                                          regulation_mark, image, is_digital)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                       ON CONFLICT(card_id, lang) DO UPDATE SET
                         name=excluded.name, illustrator=excluded.illustrator,
                         rarity=excluded.rarity, is_digital=excluded.is_digital""",
                    (c["id"], lang, sid, c.get("localId"), c.get("name"),
                     c.get("illustrator"), c.get("rarity"), c.get("category"),
                     c.get("stage"), c.get("evolveFrom"), c.get("hp"),
                     json.dumps(c.get("types")) if c.get("types") else None,
                     json.dumps(c.get("dexId")) if c.get("dexId") else None,
                     c.get("regulationMark"), c.get("image"),
                     int((sid, lang) in digital)),
                )
                n_cards += 1
    return n_sets, n_cards, digital


def load_prices(con, langs, digital):
    """Instrumentos y observaciones de precio, dia a dia."""
    # Dos indices para enganchar las capturas antiguas a la identidad de variante:
    #   prod_map     : idProduct de Cardmarket -> instrument_id  (criterio primario)
    #   card_variants: (lang, card_id) -> instrument_ids conocidos (criterio de respaldo)
    prod_map = {}
    card_variants = defaultdict(list)
    stats = defaultdict(int)

    for lang in langs:
        # Orden descendente: las capturas recientes traen variants_detailed y
        # definen la identidad; las antiguas se enganchan a lo ya definido.
        for obs_date, path in sorted(files("prices", lang), reverse=True):
            rows_in = n_inst = n_px = 0
            for r in read_jsonl(path):
                rows_in += 1
                cid, sid = r["id"], r.get("set")
                is_dig = int((sid, lang) in digital)
                vds = r.get("variants_detailed")

                if vds:
                    variants = [
                        (v.get("type"), v.get("subtype"), v.get("size"),
                         v.get("variantId"), (v.get("pricing") or {}))
                        for v in vds
                    ]
                else:
                    # Captura antigua: un solo bloque, sin identidad de variante.
                    # Se engancha luego por idProduct.
                    variants = [(None, None, None, None,
                                 {"cardmarket": r.get("cardmarket"),
                                  "tcgplayer": r.get("tcgplayer")})]

                for vtype, vsub, vsize, vid, pricing in variants:
                    cm = pricing.get("cardmarket") or {}
                    tcg = pricing.get("tcgplayer") or {}
                    idp = cm.get("idProduct")
                    tb = tcg_block(tcg, vtype, vsub)

                    if vtype is not None:
                        iid = inst_id(lang, cid, vtype, vsub)
                    elif idp and idp in prod_map:
                        # Criterio primario: el bloque antiguo declara su propio
                        # idProduct, que identifica exactamente la variante.
                        iid = prod_map[idp]
                        stats["legacy_by_product"] += 1
                    elif len(card_variants[(lang, cid)]) == 1:
                        # Criterio de respaldo: si la carta tiene UNA sola variante
                        # conocida, el bloque antiguo solo puede ser esa. No es una
                        # suposicion, es la unica posibilidad.
                        iid = card_variants[(lang, cid)][0]
                        stats["legacy_by_single_variant"] += 1
                    else:
                        # Ambiguo de verdad: varias variantes y sin idProduct que
                        # desempate. Se crea un instrumento 'unknown' explicito en
                        # vez de adivinar; queda visible y auditable.
                        iid = inst_id(lang, cid, None, None)
                        stats["legacy_ambiguous"] += 1

                    con.execute(
                        """INSERT INTO instruments
                             (instrument_id, card_id, lang, variant_type, variant_subtype,
                              variant_size, tcgdex_variant_id, cm_id_product, tcg_product_id,
                              is_digital, first_seen, last_seen)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                           ON CONFLICT(instrument_id) DO UPDATE SET
                             first_seen = MIN(first_seen, excluded.first_seen),
                             last_seen  = MAX(last_seen,  excluded.last_seen),
                             cm_id_product = COALESCE(instruments.cm_id_product, excluded.cm_id_product)""",
                        (iid, cid, lang, vtype, vsub, vsize, vid, idp,
                         tb.get("productId"), is_dig, obs_date, obs_date),
                    )
                    n_inst += 1
                    if vtype is not None:
                        if idp:
                            prod_map.setdefault(idp, iid)
                        if iid not in card_variants[(lang, cid)]:
                            card_variants[(lang, cid)].append(iid)

                    if cm or tb:
                        con.execute(
                            """INSERT INTO price_obs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                               ON CONFLICT(instrument_id, obs_date) DO NOTHING""",
                            (iid, obs_date, r.get("fetched_at"), cm.get("updated"),
                             cm.get("trend"), cm.get("avg"), cm.get("low"),
                             cm.get("avg1"), cm.get("avg7"), cm.get("avg30"),
                             tb.get("marketPrice"), tb.get("lowPrice"), tb.get("midPrice"),
                             tb.get("highPrice"), tb.get("directLowPrice")),
                        )
                        n_px += 1

            con.execute(
                "INSERT INTO etl_runs VALUES (?,?,?,?,?,?,?)",
                (datetime.now(timezone.utc).isoformat(), obs_date, lang,
                 rows_in, n_inst, n_px, os.path.basename(path)),
            )
            print(f"  {lang} {obs_date}: {rows_in:,} filas -> {n_inst:,} instrumentos, {n_px:,} precios", flush=True)
            con.commit()
    return stats


def fill_alt_images(con):
    """Respaldo de ilustracion para cartas japonesas sin imagen propia.

    Se empareja por (dexId, ilustrador) exigiendo correspondencia 1-a-1 en ambos
    sentidos, la misma regla estricta que usa la senal JP/EN: con varias candidatas
    a cada lado no sabriamos cual es cual, y adivinar seria peor que no mostrar nada.

    Se guarda aparte de `image` a proposito. La carta inglesa es OTRO objeto fisico
    -mismo arte, distinto texto y marco-, asi que la interfaz debe presentarla como
    referencia visual y decir de donde sale. Hacerla pasar por la carta japonesa
    seria enganar al usuario justo en la pantalla donde decide comprar.
    """
    def index(lang, con_img):
        cond = "image IS NOT NULL" if con_img else "image IS NULL"
        d = {}
        for r in con.execute(
            f"""SELECT card_id, dex_id, illustrator, image FROM cards
                WHERE lang = ? AND is_digital = 0 AND dex_id IS NOT NULL
                  AND illustrator IS NOT NULL AND {cond}""", (lang,)):
            d.setdefault((r[1], r[2]), []).append(r)
        return d

    faltan = index("ja", False)
    tienen = index("en", True)
    n = 0
    for key, ja_rows in faltan.items():
        en_rows = tienen.get(key)
        if not en_rows or len(ja_rows) != 1 or len(en_rows) != 1:
            continue
        con.execute("UPDATE cards SET image_alt = ?, image_alt_lang = 'en' WHERE card_id = ? AND lang = 'ja'",
                    (en_rows[0][3], ja_rows[0][0]))
        n += 1
    return n


def fill_ext_images(con):
    """Ultima via para las cartas sin ilustracion: el CDN de TCGplayer.

    Cuando TCGdex no tiene imagen ni existe equivalente en otro idioma, pero el
    instrumento si tiene productId de TCGplayer, su CDN publica la foto del producto
    en una URL derivable del identificador. Es la misma carta, no un sustituto, asi
    que no necesita la advertencia que si lleva la ilustracion prestada de otra
    edicion; solo se anota la procedencia.
    """
    cur = con.execute("""
        UPDATE cards SET
          image_ext = 'https://tcgplayer-cdn.tcgplayer.com/product/' ||
                      (SELECT i.tcg_product_id FROM instruments i
                       WHERE i.card_id = cards.card_id AND i.lang = cards.lang
                         AND i.tcg_product_id IS NOT NULL LIMIT 1) || '_in_1000x1000.jpg',
          image_ext_src = 'tcgplayer'
        WHERE image IS NULL AND image_alt IS NULL AND is_digital = 0
          AND EXISTS (SELECT 1 FROM instruments i
                      WHERE i.card_id = cards.card_id AND i.lang = cards.lang
                        AND i.tcg_product_id IS NOT NULL)
    """)
    return cur.rowcount


def mark_collisions(con):
    """Marcas de calidad sobre la identidad de precio.

    Dos problemas distintos, ambos medidos sobre los datos reales:

    1. cm_collision: el mismo idProduct de Cardmarket apunta a mas de una CARTA.
       Su precio esta atribuido a la carta equivocada. Fuera de todo modelo.

    2. cm_variant_ambiguous: el mismo idProduct apunta a mas de una VARIANTE de la
       misma carta. Ejemplo real, lc-29 (Mewtwo, Legendary Collection): sus tres
       variantes comparten el idProduct 274794 con un unico trend de 36,56 EUR,
       mientras TCGplayer si separa 'normal' a 49 USD de 'reverse-holofoil' a 1014
       USD. El precio europeo no es atribuible a una variante concreta, asi que
       cualquier comparacion entre mercados sobre ese instrumento compara cosas
       distintas y produce arbitrajes fantasma.
    """
    con.execute("UPDATE instruments SET cm_collision = 0, cm_variant_ambiguous = 0")
    con.execute(
        """UPDATE instruments SET cm_collision = 1
           WHERE cm_id_product IN (
             SELECT cm_id_product FROM instruments
             WHERE cm_id_product IS NOT NULL
             GROUP BY cm_id_product HAVING COUNT(DISTINCT card_id) > 1)"""
    )
    con.execute(
        """UPDATE instruments SET cm_variant_ambiguous = 1
           WHERE cm_id_product IN (
             SELECT cm_id_product FROM instruments
             WHERE cm_id_product IS NOT NULL
             GROUP BY cm_id_product HAVING COUNT(DISTINCT instrument_id) > 1)"""
    )
    q = lambda c: con.execute(f"SELECT COUNT(*) FROM instruments WHERE {c}=1").fetchone()[0]
    return q("cm_collision"), q("cm_variant_ambiguous")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    ap.add_argument("--languages", default="en,ja")
    args = ap.parse_args()
    langs = [x.strip() for x in args.languages.split(",") if x.strip()]

    os.makedirs(os.path.dirname(args.db), exist_ok=True)
    con = sqlite3.connect(args.db)
    con.executescript(open(os.path.join(HERE, "schema.sql"), encoding="utf-8").read())

    print("=== dimensiones ===")
    n_sets, n_cards, digital = load_dimensions(con, langs)
    con.commit()
    print(f"  sets: {n_sets:,} | cartas: {n_cards:,} | sets digitales: {len(digital)}")

    # Imagenes recuperadas por reconstruccion de URL. TCGdex deja el campo `image`
    # a null en muchas cartas (sobre todo japonesas) aunque su CDN si sirve el fichero,
    # asi que resolve_images.py las verifica una a una y guarda el resultado aparte.
    # Se aplican aqui porque comprobar diez mil URLs cuesta minutos y no debe repetirse
    # en cada recarga: es dato capturado, no dato derivado.
    img_path = os.path.join(DATA, "image_resolution.jsonl")
    if os.path.exists(img_path):
        n_img = 0
        with open(img_path, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if r.get("url"):
                    cur = con.execute(
                        "UPDATE cards SET image = ? WHERE card_id = ? AND lang = ? AND image IS NULL",
                        (r["url"], r["card_id"], r["lang"]))
                    n_img += cur.rowcount
        con.commit()
        print(f"  imagenes recuperadas y aplicadas: {n_img:,}")

    print("=== precios ===")
    stats = load_prices(con, langs, digital)

    n_alt = fill_alt_images(con)
    n_ext = fill_ext_images(con)
    col, amb = mark_collisions(con)
    con.commit()

    print("\n=== RESUMEN ===")
    q = lambda s: con.execute(s).fetchone()[0]
    print(f"  cartas            : {q('SELECT COUNT(*) FROM cards'):,}")
    print(f"  instrumentos      : {q('SELECT COUNT(*) FROM instruments'):,}")
    print(f"    digitales       : {q('SELECT COUNT(*) FROM instruments WHERE is_digital=1'):,}  (excluidos aguas abajo)")
    print(f"    colision carta  : {col:,}  (idProduct compartido con otra carta)")
    print(f"    variante ambigua: {amb:,}  (idProduct compartido entre variantes de la misma carta)")
    print(f"  ilustracion de respaldo (edicion inglesa): {n_alt:,}")
    print(f"  ilustracion desde TCGplayer              : {n_ext:,}")
    print(f"  observaciones     : {q('SELECT COUNT(*) FROM price_obs'):,}")
    print(f"  dias en archivo   : {q('SELECT COUNT(DISTINCT obs_date) FROM price_obs')}")
    if stats:
        print("  enganche de capturas antiguas a la identidad de variante:")
        print(f"    por idProduct        : {stats['legacy_by_product']:,}")
        print(f"    por variante unica   : {stats['legacy_by_single_variant']:,}")
        print(f"    ambiguas ('unknown') : {stats['legacy_ambiguous']:,}")
    print(f"\n  -> {args.db} ({os.path.getsize(args.db)/1e6:.1f} MB)")
    con.close()


if __name__ == "__main__":
    main()
