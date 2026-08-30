#!/usr/bin/env python3
"""Comprobaciones de CI que no necesitan datos: sintaxis de todos los servicios."""
import ast, glob, sys
bad = []
for f in glob.glob("services/**/*.py", recursive=True) + glob.glob("tests/*.py"):
    try:
        ast.parse(open(f, encoding="utf-8").read())
    except SyntaxError as e:
        bad.append(f"{f}: {e}")
if bad:
    print("\n".join(bad)); sys.exit(1)
print(f"sintaxis OK en {len(glob.glob('services/**/*.py', recursive=True))} servicios")
