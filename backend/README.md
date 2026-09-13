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

## Tests

```powershell
uv run pytest -q
```
