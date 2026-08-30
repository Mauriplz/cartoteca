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

## ✅ Activado el 2026-08-30

| Pieza | Estado |
|---|---|
| **Healthchecks** | armado: el pipeline hace ping al terminar; su ausencia dispara email desde fuera de nuestra infraestructura |
| **GitHub** | código en `Mauriplz/cartoteca` (público) · archivo en `Mauriplz/pcp-archive` (público, con backfill completo desde el 25-08 y checksums) · sellos en `Mauriplz/pcp-seals` (público, con .ots) · llave de despliegue + secretos · CI en verde · captura redundante con 3 crons y guarda de frescura verificada contra la fuente (200 application/json) que además detecta si la pata local ya archivó el día |
| **Backblaze B2** | rclone configurado, bucket `pcp-archive` sincronizado (~27 MB); sync diario dentro del pipeline |
| **Publicación diaria** | el pipeline local publica archivo + sellos + B2 tras sellar; la pata de Actions cubre los días en que el portátil no esté |

## 🔑 Todavía esperando

### 4. Cloudflare — 15 minutos · salir a internet (Fase B del ROADMAP)
1. Cuenta gratuita + comprar el dominio que elijas (~10 €/año, único gasto del proyecto).
2. `npm i -g wrangler && wrangler login`, y yo hago el resto (Pages + Worker + D1).

### 5. eBay — EN TRÁMITE
- Desarrollador: solicitud enviada, **pendiente de aprobación de eBay** (≥1 día hábil).
  Cuando llegue el correo: crear un App Key set de producción y pasarme App ID + Cert ID.
- Vendedor: cuenta `maur-967913` creada ✅ (Terapeak disponible para cuando toque).

## 🔧 Operación

- **Logs del pipeline**: `~/Library/Application Support/pokemon-card-price/logs/pipeline_AAAA-MM-DD.log`
- **Redesplegar tras editar servicios**: `./services/capture/deploy.sh` (el cron ejecuta copias en
  `~/Library/Application Support` porque macOS impide a launchd leer `~/Documents`)
- **Recalcular a mano**: `bash "$HOME/Library/Application Support/pokemon-card-price/bin/daily.sh"`
- **Verificar un sello**: `~/Library/Python/3.9/bin/ots verify data/seals/seal_FECHA.json.ots`
  (necesita ~1 día hasta que el calendario ancle en Bitcoin; antes dice "pending")
- **Web local**: `cd apps/web && npm run build && npm run start` → http://localhost:3210
