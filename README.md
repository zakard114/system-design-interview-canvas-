# Interview Canvas — local run & Module 03 checks

Repo root for Docker / Compose / tests.

## Docker Compose (4/7)

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas
docker stop interview-canvas-db 2>$null
docker compose up --build
```

- App: http://localhost:8100  
- Stop: `docker compose down`

## Integration tests (5/7)

Requires Compose stack Up (or set `E2E_BASE_URL`).

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas
docker compose up --build -d
# wait until http://127.0.0.1:8100/health returns ok

cd backend
uv sync --group dev
uv run pytest ../tests/integration -q
```

- `test_compose_api.py` — `/health` + session/object against Postgres via Compose  
- `test_frontend_build.py` — `frontend` `npm run build` (SPA shell)

Skip live API tests if the stack is down.

## E2E (Playwright Two-Session)

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
$env:PLAYWRIGHT_BROWSERS_PATH="E:\IT_SPACES\AI\.cache\ms-playwright"
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas

docker compose up --build -d

cd e2e
npm install
npm run install:browsers
npm test
```

Optional: `make e2e` (same flow if `make` is available).

Override URL: `$env:E2E_BASE_URL="http://127.0.0.1:8100"`

## Layout

- `backend/` — FastAPI  
- `frontend/` — Vite SPA  
- `docker-compose.yaml` — `postgres` + `app`  
- `tests/integration/` — Compose-oriented integration  
- `e2e/` — Playwright
