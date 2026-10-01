# Deployment

Synoptiq has three separately deployed concerns: the Vercel frontend, the Render FastAPI web service, and a Render Cron Job that refreshes live provider data every 15 minutes. PostgreSQL is the production source of truth. The Render filesystem is not used for permanent raw data.

## Render

Use `render.yaml` or create the web service and cron job separately. The blueprint selects the corrected `synoptiq-real-12m-20260930-aifs-unitfix` bundle under `artifacts/real_12m_aifs_corrected/`; deploy that directory with its manifest, models, calibration, metrics, and compressed corrected history seed together. Set `DATABASE_URL`, `SYNOPTIQ_CORS_ORIGINS`, `NASA_EARTHDATA_USERNAME`, and `NASA_EARTHDATA_PASSWORD` in Render secrets. Before the API starts, the version-guarded seed command imports corrected historical forecasts, observations, and frozen skill into PostgreSQL; it refuses a superseded/synthetic source and skips after that model version is seeded. The cron worker and API use the same corrected model/artifact environment. The live worker writes newly validated cycles to PostgreSQL and the API is ready when at least two real provider cycles are fresh. ECMWF AIFS retrieval tries Azure, Google Cloud, ECMWF, then AWS Open Data mirrors.

Historical training uses `TRAINING_DATABASE_URL` locally and never receives or changes the production `DATABASE_URL`. It writes a new immutable manifest and prototype/metrics version; promote those with the selected real models and calibration before scheduling ingestion.

## Automatic live data (no manual steps, ever)

The deployment keeps itself fed with real GFS / IFS / AIFS cycles. Three
mechanisms exist; you only need one, and they are single-flight-safe if you
run more than one.

**1. In-process scheduler (works anywhere, including a bare container).**
When the API starts in real mode it spawns one daemon thread
(`backend/app/live_scheduler.py`) that refreshes immediately if the last
manifest is older than `SYNOPTIQ_LIVE_REFRESH_MINUTES` (default 15) and then
keeps refreshing forever. This is what makes a plain
`uvicorn app.main:app` deployment self-sufficient — no cron, no sidecar.
Control it with `SYNOPTIQ_AUTO_REFRESH=0` (off) and inspect it with
`GET /api/v1/ops/live-refresh/status`; trigger one on demand with
`POST /api/v1/ops/live-refresh`. The worker runs as a subprocess
(`training/realdata/live_refresh.py --once`) so a failure or hang in the fetch
path can never take the API down, and every attempt is recorded in
`data/real/live/scheduler_state.json`.

**2. Render Cron Job** — already declared in `render.yaml`
(`*/15 * * * *`, `python training/realdata/live_refresh.py --once`).

**3. Self-hosted (systemd / cron)** — `deploy/` ships ready-made units:
`synoptiq-api.service` (API + scheduler), `synoptiq-live-refresh.service` and
`.timer` (standalone worker), and `crontab.example` (15-minute refresh plus
the daily routine workflow). Install with the one-line commands in each file.

The container image copies `training/`, `scripts/` and `ops/` and sets
`SYNOPTIQ_AUTO_REFRESH=1`, so `docker run` also self-refreshes.

### AIFS in LIVE mode — the model-id bug, fixed

AIFS previously never reached LIVE while GFS and IFS did. Two causes, both
found and fixed:

1. **Wrong Open-Meteo model id.** The live path requested `ecmwf_aifs025`,
   which Open-Meteo answers with **HTTP 200 and an all-null array** — a silent
   failure, not an error. The correct id is **`ecmwf_aifs025_single`**
   (verified 2026-10-01: 24/24 non-null hourly values). `fetch_openmeteo.py`
   now uses it and the non-finite error message names the model id so this
   class of bug is loud next time.
2. **Fallback cycle selection stepped back too far.** When the Open-Meteo
   path failed, the ECMWF Open Data fallback subtracted a full cycle from the
   newest one and only tried two candidates, so at 06:45 UTC it tried
   yesterday's 12Z and 00Z and never today's 00Z — which was already
   published. The fallback now walks **newest-first** through four candidate
   cycles and tries the cloud mirrors (Azure, Google, AWS) before
   `data.ecmwf.int`, which is rate-limited and the most likely to fail.

No ECMWF API key is needed for any of this: AIFS is on the public Open Data
mirrors. `ECMWF_API_KEY` / `ECMWF_API_EMAIL` are used only by the MARS
archive path (`ecmwf_archive.py`) for historical backfill.

## Vercel

Set only `VITE_API_BASE_URL` to the Render `/api/v1` URL and leave `VITE_APP_MODE=LIVE`. Do not add NOAA, ECMWF, NASA, CDS, PostgreSQL, or model credentials to Vercel.

## Local

Use the existing `D:\SIH2026\.venv`. Set `SYNOPTIQ_MODE=real` to use the corrected real bundle or `SYNOPTIQ_MODE=fake` to use the explicit local demo archive. Real mode requires PostgreSQL for normal serving; local validation can select `SYNOPTIQ_DATABASE_ROLE=TRAINING` with `TRAINING_DATABASE_URL` pointing to `data/real/training_aifs_corrected.sqlite3`.

For local automatic refresh, run `python training/realdata/live_refresh.py`; use `--once` for a single cycle. The worker records provider status, freshness, coverage, and mirror provenance with every ingestion.
