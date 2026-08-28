#!/bin/bash
# Redespliega los scripts de captura al runtime del cron.
#
# Por que existe esto: macOS TCC impide que launchd lea ficheros bajo ~/Documents
# ("Operation not permitted"), asi que el cron ejecuta copias alojadas en
# ~/Library/Application Support, que no esta protegido. Tras editar capture.py
# o probe_cadence.py hay que ejecutar este script o el cron seguira con la version vieja.
set -e
RT="$HOME/Library/Application Support/pokemon-card-price"
cp "$(dirname "$0")/capture.py" "$(dirname "$0")/probe_cadence.py" "$RT/bin/"
echo "desplegado en $RT/bin"
