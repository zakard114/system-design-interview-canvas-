# Backend (FastAPI + SQLite)

Implements root `openapi.yaml` with SQLAlchemy persistence (default SQLite file).

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
- Override: `$env:DATABASE_URL="postgresql+psycopg://..."` (Module 3 / later)

CORS allows `http://localhost:8080`. Frontend mock remains available via `VITE_USE_MOCK=true`.

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
