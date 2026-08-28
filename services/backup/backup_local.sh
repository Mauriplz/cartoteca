#!/bin/bash
# Copia local del archivo a Backblaze B2 via rclone.
# PENDIENTE DE ACTIVACION: rclone config con un remote llamado "b2" (RUNBOOK).
set -e
RT="$HOME/Library/Application Support/pokemon-card-price"
command -v rclone >/dev/null || { echo "rclone no instalado (brew install rclone)"; exit 0; }
rclone lsd b2: >/dev/null 2>&1 || { echo "remote b2 sin configurar aun"; exit 0; }
rclone sync "$RT/data" b2:pcp-archive/data --exclude "pcp.db*" --checksum -v
echo "backup B2 completado $(date -u)"
