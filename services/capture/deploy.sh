#!/bin/bash
# Sincroniza el codigo del pipeline al runtime del cron.
# macOS TCC impide a launchd leer bajo ~/Documents, asi que el cron ejecuta
# copias en ~/Library/Application Support. Tras editar cualquier servicio,
# ejecutar esto o el cron seguira corriendo la version vieja.
set -e
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
RT="$HOME/Library/Application Support/pokemon-card-price"
mkdir -p "$RT/bin"
rsync -a --delete "$SRC/services/" "$RT/bin/services/"
rsync -a "$SRC/tests/" "$RT/bin/tests/"
# daily.sh espera la estructura del proyecto: se instala un lanzador que la recrea.
cat > "$RT/bin/daily.sh" <<LAUNCHER
#!/bin/bash
export PCP_DATA_DIR="$RT/data"
export PCP_CODE_DIR="/Users/mplaza/Documents/pokemon-card-price"
cd "$RT/bin" && exec bash services/pipeline/daily.sh
LAUNCHER
chmod +x "$RT/bin/daily.sh"
echo "desplegado en $RT/bin"
