# Runbook — qué está activo, qué espera tu acción

> Actualizado: 2026-08-28. Este fichero es la lista de la compra de credenciales:
> todo el código está escrito y probado; cada bloque dice exactamente qué crear y dónde ponerlo.

## ✅ Activo ahora mismo (sin acción tuya)

| Pieza | Estado |
|---|---|
| Pipeline diario completo (18:30): captura → validación → ETL → señales → índice → sello → invariantes | LaunchAgent `com.pokemoncardprice.capture`, probado de punta a punta |
| Sonda de cadencia horaria | `com.pokemoncardprice.cadence` |
| Índice Cartoteca (index_v1, metodología congelada) | calculándose a diario |
| Sello criptográfico + anclaje OpenTimestamps | `data/seals/`, primer sello anclado el 28-08 |
| Tests de invariantes (12) | corren dentro del pipeline; si fallan, el día no se publica |

## 🔑 Esperando tus cuentas (en orden de urgencia)

### 1. Healthchecks.io — 2 minutos · el aviso si un día no se captura
1. Cuenta gratuita en https://healthchecks.io → «Add Check», nómbralo `cartoteca-pipeline`, periodo 1 día, gracia 6 h.
2. Copia la URL de ping y ejecútame esto o dímelo:
   `launchctl setenv PCP_HEALTHCHECK_URL "https://hc-ping.com/TU-UUID"`
   (y me lo dices para persistirla en el LaunchAgent).

### 2. GitHub — 10 minutos · la segunda pata de captura y la copia del archivo
1. `brew install gh && gh auth login`
2. Dímelo y yo creo: el repo del código (público, para minutos ilimitados de Actions),
   el repo `pcp-archive` (privado, los datos) y el repo `pcp-seals` (público, solo hashes),
   configuro `ARCHIVE_TOKEN` y `HEALTHCHECK_URL` como secretos y activo los 3 workflows ya escritos
   (`capture.yml` con crons redundantes y guarda de frescura, `watchdog.yml`, `ci.yml`).

### 3. Backblaze B2 — 5 minutos · copia fría del archivo (10 GB gratis, sin tarjeta)
1. Cuenta en https://www.backblaze.com/sign-up/cloud-storage → bucket privado `pcp-archive`.
2. Crea una App Key y pásame keyID + applicationKey; yo configuro rclone y el sync diario
   (`services/backup/backup_local.sh`, ya escrito).

### 4. Cloudflare — 15 minutos · salir a internet (Fase B del ROADMAP)
1. Cuenta gratuita + comprar el dominio que elijas (~10 €/año, único gasto del proyecto).
2. `npm i -g wrangler && wrangler login`, y yo hago el resto (Pages + Worker + D1).

### 5. eBay — 10 minutos · desbloquea la Fase F entera (gradeadas)
1. Cuenta de desarrollador: https://developer.ebay.com → App Key set (Browse API).
2. Cuenta de vendedor normal (activa Terapeak: ~3 años de ventas reales).

## 🔧 Operación

- **Logs del pipeline**: `~/Library/Application Support/pokemon-card-price/logs/pipeline_AAAA-MM-DD.log`
- **Redesplegar tras editar servicios**: `./services/capture/deploy.sh` (el cron ejecuta copias en
  `~/Library/Application Support` porque macOS impide a launchd leer `~/Documents`)
- **Recalcular a mano**: `bash "$HOME/Library/Application Support/pokemon-card-price/bin/daily.sh"`
- **Verificar un sello**: `~/Library/Python/3.9/bin/ots verify data/seals/seal_FECHA.json.ots`
  (necesita ~1 día hasta que el calendario ancle en Bitcoin; antes dice "pending")
- **Web local**: `cd apps/web && npm run build && npm run start` → http://localhost:3210
