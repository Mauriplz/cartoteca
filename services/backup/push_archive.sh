#!/bin/bash
# Publica la captura del dia al repositorio-archivo (privado).
# PENDIENTE DE ACTIVACION: necesita ARCHIVE_TOKEN y el repo creado (RUNBOOK).
set -e
[ -z "$ARCHIVE_TOKEN" ] && { echo "sin ARCHIVE_TOKEN: archivo remoto no configurado aun"; exit 0; }
DAY=$(date -u +%Y-%m-%d)
DEST=/tmp/pcp-archive
git clone --depth 1 "https://x-access-token:${ARCHIVE_TOKEN}@github.com/${ARCHIVE_REPO:-USUARIO/pcp-archive}.git" "$DEST"
mkdir -p "$DEST/prices/en" "$DEST/prices/ja" "$DEST/sets" "$DEST/catalog" "$DEST/seals"
for L in en ja; do cp -f "data/prices/$L/prices_${DAY}.jsonl.gz" "$DEST/prices/$L/" 2>/dev/null || true; done
cp -f data/seals/* "$DEST/seals/" 2>/dev/null || true
cd "$DEST"
sha256sum prices/*/prices_${DAY}.jsonl.gz > "checksums_${DAY}.txt" 2>/dev/null || true
git add -A && git -c user.email=bot@cartoteca -c user.name=cartoteca-bot commit -m "archivo ${DAY}" && git push
