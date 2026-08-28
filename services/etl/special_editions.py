#!/usr/bin/env python3
"""
Etiqueta ediciones especiales, exclusivas y colaboraciones.

El problema que resuelve: el catalogo SI contiene estas cartas —el Pikachu del Museo
Van Gogh figura como "Pikachu with Grey Felt Hat" a 743 EUR, y el Special Delivery
Pikachu de Pokemon Center a 1.369 EUR— pero son INENCONTRABLES. Nadie que busque
"Van Gogh" escribe el nombre oficial de la carta, y nadie que busque "Pokemon Center"
da con "Special Delivery". Sin estas etiquetas, la parte mas cara y mas coleccionable
del mercado queda escondida detras de un nombre que nadie usa.

Las reglas son curadas y verificables: cada una dice por que incluye lo que incluye.
Se aplican por set, por ilustrador o por patron de nombre, y cada carta puede llevar
varias etiquetas.
"""

import argparse
import os
import re
import sqlite3

PROJ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DB = os.path.join(PROJ, "data", "pcp.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL,
  lang    TEXT NOT NULL,
  tag     TEXT NOT NULL,
  PRIMARY KEY (card_id, lang, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON card_tags(tag);

-- Sinonimos de busqueda: lo que la gente ESCRIBE -> la carta que quiere encontrar.
CREATE TABLE IF NOT EXISTS card_aliases (
  card_id TEXT NOT NULL,
  lang    TEXT NOT NULL,
  alias   TEXT NOT NULL,
  PRIMARY KEY (card_id, lang, alias)
);
CREATE INDEX IF NOT EXISTS idx_alias ON card_aliases(alias);
"""

# (tag, criterio, valor, sinonimos que la gente teclea)
#
# `set`        : el set entero lleva la etiqueta
# `illustrator`: todas las cartas de ese ilustrador
# `name`       : expresion regular sobre el nombre de la carta
RULES = [
    # --- Colaboraciones con artistas y museos --------------------------------
    ("collab:van-gogh", "name", r"Grey Felt Hat|グレーのフェルト帽",
     ["van gogh", "gogh", "museo van gogh", "ゴッホ"]),
    ("collab:yu-nagaba", "illustrator", "YU NAGABA",
     ["yu nagaba", "nagaba", "ナガバ"]),
    ("collab:pokemon-futsal", "set", "fut2020", ["futsal"]),

    # --- Exclusivas de Pokemon Center ---------------------------------------
    ("exclusive:pokemon-center", "name", r"Special Delivery",
     ["pokemon center", "pokémon center", "special delivery", "ポケモンセンター"]),

    # --- Campeonatos y eventos ----------------------------------------------
    ("event:worlds", "set", "PCG10", ["worlds", "world championships", "campeonato mundial"]),
    ("event:champions-path", "set", "swsh3.5", ["champions path", "champion's path"]),
    ("event:champions-festival", "name", r"Champions Festival", ["champions festival"]),

    # --- Aniversarios y celebraciones ---------------------------------------
    ("anniversary:celebrations", "set", "cel25", ["celebrations", "25 aniversario"]),
    ("anniversary:celebrations", "set", "cel25cc", ["celebrations classic"]),
    ("anniversary:25th", "set", "S8a", ["25th", "25 aniversario", "アニバーサリー"]),
    ("anniversary:20th", "set", "CP6", ["20th", "20 aniversario"]),
]

# Sets cuyo nombre delata su naturaleza. Se detectan por patron en vez de a mano
# porque salen entregas nuevas continuamente y una lista fija se queda corta.
SET_NAME_TAGS = [
    ("promo", r"promo|プロモ"),
    ("trainer-kit", r"trainer kit"),
    ("deck", r"deck|デッキ"),
    ("box", r"box|ボックス|ＢＯＸ"),
]


def apply_rules(con):
    con.executescript(SCHEMA)
    con.execute("DELETE FROM card_tags")
    con.execute("DELETE FROM card_aliases")
    counts = {}

    for tag, kind, value, aliases in RULES:
        if kind == "set":
            rows = con.execute(
                "SELECT card_id, lang FROM cards WHERE set_id = ? AND is_digital = 0", (value,)).fetchall()
        elif kind == "illustrator":
            rows = con.execute(
                "SELECT card_id, lang FROM cards WHERE illustrator = ? AND is_digital = 0", (value,)).fetchall()
        else:  # name, expresion regular
            rx = re.compile(value, re.I)
            rows = [(r[0], r[1]) for r in con.execute(
                "SELECT card_id, lang, name FROM cards WHERE name IS NOT NULL AND is_digital = 0")
                if rx.search(r[2])]

        con.executemany("INSERT OR IGNORE INTO card_tags VALUES (?,?,?)",
                        [(c, l, tag) for c, l in rows])
        con.executemany("INSERT OR IGNORE INTO card_aliases VALUES (?,?,?)",
                        [(c, l, a.lower()) for c, l in rows for a in aliases])
        counts[tag] = counts.get(tag, 0) + len(rows)

    # Etiquetas derivadas del nombre del set
    for tag, pat in SET_NAME_TAGS:
        rx = re.compile(pat, re.I)
        sets = [(r[0], r[1]) for r in con.execute(
            "SELECT set_id, lang, name FROM sets WHERE is_digital = 0 AND name IS NOT NULL")
            if rx.search(r[2])]
        n = 0
        for sid, lang in sets:
            rows = con.execute(
                "SELECT card_id, lang FROM cards WHERE set_id = ? AND lang = ? AND is_digital = 0",
                (sid, lang)).fetchall()
            con.executemany("INSERT OR IGNORE INTO card_tags VALUES (?,?,?)",
                            [(c, l, tag) for c, l in rows])
            n += len(rows)
        counts[tag] = n

    con.commit()
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=DB)
    args = ap.parse_args()
    con = sqlite3.connect(args.db)
    counts = apply_rules(con)

    print("=== etiquetas aplicadas ===")
    for tag, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {tag:<28} {n:>6,} cartas")
    tot = con.execute("SELECT COUNT(DISTINCT card_id||lang) FROM card_tags").fetchone()[0]
    al = con.execute("SELECT COUNT(*) FROM card_aliases").fetchone()[0]
    print(f"\n  cartas etiquetadas: {tot:,} | sinonimos de busqueda: {al:,}")

    print("\n=== las mas caras entre las etiquetadas como especiales ===")
    for r in con.execute("""
        SELECT c.name, t.tag, c.lang, MAX(p.cm_trend) px
        FROM card_tags t
        JOIN cards c ON c.card_id = t.card_id AND c.lang = t.lang
        JOIN instruments i ON i.card_id = c.card_id AND i.lang = c.lang
        JOIN price_obs p ON p.instrument_id = i.instrument_id
        WHERE t.tag NOT IN ('promo','deck','box','trainer-kit') AND p.cm_trend IS NOT NULL
        GROUP BY c.card_id, c.lang, t.tag ORDER BY px DESC LIMIT 10"""):
        print(f"  {r[3]:>9.2f} EUR  {r[2]}  {(r[0] or '')[:34]:<34} [{r[1]}]")
    con.close()


if __name__ == "__main__":
    main()
