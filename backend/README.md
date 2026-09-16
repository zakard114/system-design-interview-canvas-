# Backend (FastAPI + SQLAlchemy)

Implements root `openapi.yaml` with SQLAlchemy persistence (default SQLite file; Postgres via `DATABASE_URL`).

## Run

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas\backend
uv sync
uv run interview-canvas-backend
```

Or:

```powershell
uv run uvicorn interview_canvas_backend.main:app --reload --port 8000
```

- API: http://127.0.0.1:8000
- Docs: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/health
- DB file (default): `backend/data/app.db`

CORS allows `http://localhost:8080` and `http://localhost:8000`. Frontend mock remains available via `VITE_USE_MOCK=true`.

## Postgres (Module 03 — 3/7 standalone, optional)

Prefer **Docker Compose** (below) for day-to-day. Standalone DB is for 3/7-style local uvicorn:

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
docker run -d `
  --name interview-canvas-db `
  -e POSTGRES_USER=sdip `
  -e POSTGRES_PASSWORD=sdip `
  -e POSTGRES_DB=sdip `
  -p 5432:5432 `
  -v interview-canvas-pgdata:/var/lib/postgresql/data `
  postgres:16-alpine
```

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas\backend
$env:DATABASE_URL="postgresql+psycopg://sdip:sdip@localhost:5432/sdip"
uv sync
uv run uvicorn interview_canvas_backend.main:app --reload --host 127.0.0.1 --port 8000
```

Driver: `psycopg[binary]` (`postgresql+psycopg://`). Default without `DATABASE_URL` remains SQLite.

```powershell
uv run pytest -q tests/test_postgres_smoke.py
```

## Docker Compose (Module 03 — 4/7)

From the **repository root** (not `backend/`):

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas

# Free host 5432 if the 3/7 standalone container is still up
docker stop interview-canvas-db 2>$null

# Free 8000 only if you also mapped it; Compose app uses host 8100
docker compose up --build
```

- UI + API: http://localhost:8100  
- Health: http://localhost:8100/health  
- Inside Compose, the app reaches DB at hostname **`postgres`** (service name), not `localhost`.

Stop: `Ctrl+C`, or `docker compose down` (volume `interview-canvas-pgdata` keeps data unless you `down -v`).

## Docker (Module 03 — single container)

From the repository root (Docker Desktop running):

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas
docker build -t sdip:latest .
docker run --rm -p 8000:8000 `
  -v sdip-data:/data `
  -e DATABASE_URL=sqlite:////data/app.db `
  --name sdip sdip:latest
```

Open http://localhost:8000 (UI + API on one port). Set `INTERVIEW_CANVAS_STATIC_DIR` in the image to serve the built SPA from `dist/client`.

## Tests

```powershell
uv run pytest -q
```
