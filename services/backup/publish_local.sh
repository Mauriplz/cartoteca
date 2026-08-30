#!/bin/bash
# Publicacion desde la pata local (el portatil): archivo, sellos y backup B2.
# Corre al final del pipeline diario. Idempotente y tolerante: un fallo de red
# aqui NO invalida el dia (los datos locales ya estan validados y sellados);
# se reintenta en la siguiente ejecucion.
set -u
DATA="${PCP_DATA_DIR:-$HOME/Library/Application Support/pokemon-card-price/data}"
DAY=$(date -u +%Y-%m-%d)
WORK=$(mktemp -d)

echo "--- publicar archivo (pcp-archive)"
if git clone --depth 1 git@github.com:Mauriplz/pcp-archive.git "$WORK/archive" 2>/dev/null; then
  cd "$WORK/archive"
  mkdir -p prices/en prices/ja sets/en sets/ja catalog/en catalog/ja seals
  for L in en ja; do
    for K in prices sets catalog; do
      cp -f "$DATA/$K/$L/${K}_${DAY}.jsonl.gz" "$K/$L/" 2>/dev/null || true
    done
  done
  cp -f "$DATA/seals/"* seals/ 2>/dev/null || true
  # El sello del lote de la fuente, para la guarda de frescura de la pata de Actions.
  python3 -c "
import gzip, json, sys
try:
    for line in gzip.open('$DATA/prices/en/prices_${DAY}.jsonl.gz','rt',encoding='utf-8'):
        cm=(json.loads(line).get('cardmarket') or {})
        if cm.get('updated'): print(cm['updated']); break
except Exception: pass" > last_batch_stamp.txt || true
  shasum -a 256 prices/*/prices_${DAY}.jsonl.gz > "checksums_${DAY}.txt" 2>/dev/null || true
  git add -A && git -c user.email=bot@cartoteca -c user.name=cartoteca-local commit -m "captura ${DAY} (local)" 2>/dev/null && git push && echo "archivo publicado"
else
  echo "aviso: sin acceso al repo-archivo (¿red?); se reintentara manana"
fi

echo "--- publicar sellos (pcp-seals, publico)"
if git clone --depth 1 git@github.com:Mauriplz/pcp-seals.git "$WORK/seals" 2>/dev/null; then
  cd "$WORK/seals"
  cp -f "$DATA/seals/"* . 2>/dev/null || true
  git add -A && git -c user.email=bot@cartoteca -c user.name=cartoteca-local commit -m "sello ${DAY}" 2>/dev/null && git push && echo "sellos publicados"
fi

echo "--- backup B2"
if command -v rclone >/dev/null && rclone lsd b2: >/dev/null 2>&1; then
  rclone sync "$DATA" b2:pcp-archive/data --exclude "pcp.db*" --checksum -q && echo "B2 sincronizado"
else
  echo "aviso: rclone/b2 sin configurar"
fi
rm -rf "$WORK"
exit 0
