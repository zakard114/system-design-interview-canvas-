# Testing

## What we run

| Layer | Command | Notes |
|-------|---------|--------|
| Backend unit | `cd backend && uv sync --group dev && uv run pytest -q` | SQLite by default |
| Frontend unit | `cd frontend && npm install && npm test` | Vitest |
| Frontend lint | `cd frontend && npm run lint` | ESLint + Prettier (`endOfLine: lf`) |
| Frontend build | `cd frontend && npm run build` | `VITE_USE_MOCK=false` for real API shell |
| Integration | Compose up, then `uv run pytest ../tests/integration -q` | Needs `http://127.0.0.1:8100/health` |
| E2E | `cd e2e && npm test` (Playwright Two-Session) | Optional; browsers on E: cache locally |
| Container | `docker build -t interview-canvas:ci .` | Multi-stage FE + FastAPI |

CI (`.github/workflows/ci.yml`) runs backend, frontend (install/test/build/lint), Compose integration, and Docker build on every push/PR to `main`.

## Integration fixtures

- `tests/integration/test_compose_api.py` — live `/health`, session create, object persist against Postgres via Compose.
- `tests/integration/test_frontend_build.py` — `npm run build` when `frontend/node_modules` exists; skips in CI integration job (covered by the frontend job).

Override base URL: `E2E_BASE_URL` (default `http://127.0.0.1:8100`).

## Auth / migrations

v1 has minimal auth (display name + session link). There is no Alembic migration chain yet — SQLAlchemy creates schema on startup. When migrations are added, run them in Compose/`deploy` before smoke tests.

## Breaking tests on purpose

Flip an assertion or stop Postgres and re-run integration — CI should fail. That is the point of the gate.
