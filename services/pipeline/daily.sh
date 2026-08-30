#!/bin/bash
# Pipeline diario completo de Cartoteca.
#
# Sustituye a la captura suelta del cron: ahora cada dia es una cadena con
# validacion entre eslabones. Si un paso falla, los siguientes NO corren y el
# fallo queda registrado — un dia invalido no envenena el almacen ni el sello.
#
#   captura -> valida -> ETL -> senales -> indice -> sello -> invariantes -> ping
#
# PCP_HEALTHCHECK_URL (opcional): URL de Healthchecks.io. Si esta definida, se
# hace ping al terminar con exito; su ausencia un dia = alerta desde FUERA de
# esta infraestructura (dead-man's switch). Pendiente de que el usuario cree la
# cuenta; el pipeline funciona igual sin ella.

set -o pipefail
PROJ="$(cd "$(dirname "$0")/../.." && pwd)"
# En el runtime del cron, PCP_DATA_DIR apunta al archivo real y logs/ vive alli.
[ -n "$PCP_DATA_DIR" ] && LOGDIR="$(dirname "$PCP_DATA_DIR")/logs" || LOGDIR="$PROJ/logs"
LOG="$LOGDIR/pipeline_$(date -u +%Y-%m-%d).log"
mkdir -p "$LOGDIR"
exec >> "$LOG" 2>&1

echo "=== pipeline $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
cd "$PROJ" || exit 1

step() {
  echo "--- $1"
  shift
  "$@" || { echo "!!! FALLO en el paso anterior; pipeline detenido"; exit 1; }
}

step "captura"      /usr/bin/python3 services/capture/capture.py --languages en,ja --catalog --workers 12 --rps 45
step "validacion"   /usr/bin/python3 services/pipeline/validate.py
step "ETL"          /usr/bin/python3 services/etl/load.py
step "etiquetas"    /usr/bin/python3 services/etl/special_editions.py
step "senales"      /usr/bin/python3 services/signals/compute.py
step "indice"       /usr/bin/python3 services/index/compute_index.py
step "sello"        /usr/bin/python3 services/seal/seal.py
step "invariantes"  /usr/bin/python3 tests/test_invariants.py

echo "--- publicacion (archivo + sellos + B2)"
bash services/backup/publish_local.sh || echo "publicacion incompleta; se reintenta manana"

if [ -n "$PCP_HEALTHCHECK_URL" ]; then
  curl -fsS -m 15 --retry 3 "$PCP_HEALTHCHECK_URL" > /dev/null && echo "--- ping healthcheck OK"
else
  echo "--- healthcheck: sin configurar (pendiente de cuenta del usuario)"
fi
echo "=== pipeline completo ==="
