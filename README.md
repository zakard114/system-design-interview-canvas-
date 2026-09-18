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
- `docker-compose.yml` / `docker-compose.yaml` — local `postgres` + `app` (:8100)  
- `docker-compose.prod.yaml` — Caddy + app + Postgres (AWS EC2)  
- `deploy/aws/stack.yaml` — CloudFormation PoC  
- `tests/integration/` — Compose-oriented integration  
- `e2e/` — Playwright  
- `docs/testing.md` · `docs/deployment.md` · `docs/release-process.md`  
- `.github/workflows/ci.yml` · `deploy.yml`

## Module 3 deliverables

| Path | Status |
|------|--------|
| `tests/integration/` | Yes |
| `Dockerfile` | Yes |
| `docker-compose.yml` | Yes (alias of `.yaml`) |
| `.github/workflows/ci.yml` | Yes (unit, lint, integration, image build) |
| `.github/workflows/deploy.yml` | Yes (GHCR publish after green CI; optional `APP_URL` smoke) |
| `docs/testing.md` | Yes |
| `docs/deployment.md` | Yes |
| `docs/release-process.md` | Yes |

Public AWS URL is a **same-day PoC** (create → verify → delete). Ongoing CD to EC2 is opt-in via secrets — see `docs/deployment.md`.

## CI / CD

- **CI:** `.github/workflows/ci.yml` — backend pytest, frontend lint/test/build, Compose integration, `docker build`.  
- **CD:** `.github/workflows/deploy.yml` — on successful `ci` for `main`, push image to GHCR; if repo variable `APP_URL` is set, smoke `/health`.

## AWS (6/7) — short-lived PoC

**Plan:** deploy → Two-Session → 7/7 CI green → **delete stack**.  
Overnight gap: **stop EC2** (EBS still bills). Do **not** leave Running until homework due date.

### Advice checkpoints (follow in order)

1. **Before create-stack:** Billing Budget/alarm (~$1); AWS CLI `sts get-caller-identity` works; prefer `t3.small`.  
2. **While CREATE_IN_PROGRESS:** watch CloudFormation events; do not click random console resources by hand.  
3. **After CREATE_COMPLETE:** open `AppUrlHint` / EIP → `/health` + Two-Session.  
4. **If pausing overnight:** `aws ec2 stop-instances` (from stack output). EIP kept for DNS; stopping alone is OK.  
5. **After 7/7 green (or if aborting AWS):** `delete-stack` + wait + orphan checklist (EIP gone, no Available EBS, no leftover SG/instance).

### Deploy

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
# New shell after AWS CLI install if needed
aws --version
aws sts get-caller-identity

cd E:\IT_SPACES\AI\ZoomCamp\AIDT\02\Development\system-design-interview-canvas

# Push latest main first — instance clones this repo
git push origin main

aws cloudformation create-stack `
  --stack-name interview-canvas `
  --template-body file://deploy/aws/stack.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameters `
    ParameterKey=RepoUrl,ParameterValue=https://github.com/zakard114/system-design-interview-canvas-.git `
    ParameterKey=RepoRef,ParameterValue=main

aws cloudformation wait stack-create-complete --stack-name interview-canvas
aws cloudformation describe-stacks --stack-name interview-canvas --query "Stacks[0].Outputs"
```

First boot **builds the image on the instance** (several minutes). Check SSM or bootstrap log if health stays down.

### Stop / start / delete

```powershell
$iid = aws cloudformation describe-stacks --stack-name interview-canvas --query "Stacks[0].Outputs[?OutputKey=='InstanceId'].OutputValue" --output text
aws ec2 stop-instances --instance-ids $iid
# later:
aws ec2 start-instances --instance-ids $iid

aws cloudformation delete-stack --stack-name interview-canvas
aws cloudformation wait stack-delete-complete --stack-name interview-canvas
```

### Orphan checklist (after delete)

- [ ] Stack DELETE_COMPLETE / gone  
- [ ] EC2 instance for this stack **0**  
- [ ] Elastic IP for this stack **released**  
- [ ] No Available EBS from this stack  
- [ ] Billing: no surprise spike next day  
