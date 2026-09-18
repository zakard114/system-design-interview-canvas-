# Deployment

## Local (staging-like)

```powershell
. E:\IT_SPACES\AI\scripts\use_e_drive.ps1
cd <repo-root>
docker compose -f docker-compose.yml up --build
```

- App: http://localhost:8100  
- DB: Postgres service `postgres` (`DATABASE_URL=postgresql+psycopg://…@postgres:5432/sdip`)  
- Same file as `docker-compose.yaml` (lesson name alias).

Production-shaped Compose on a host: `docker-compose.prod.yaml` (Caddy :80/:443 → app:8000 + Postgres).

## AWS PoC (production-shaped, short-lived)

Template: `deploy/aws/stack.yaml` (one EC2 + EIP + UserData bootstrap).

```powershell
aws cloudformation create-stack `
  --region us-east-1 `
  --stack-name interview-canvas `
  --template-body file://deploy/aws/stack.yaml `
  --capabilities CAPABILITY_NAMED_IAM `
  --parameters `
    ParameterKey=RepoUrl,ParameterValue=<public-clone-url> `
    ParameterKey=RepoRef,ParameterValue=main

aws cloudformation wait stack-create-complete --region us-east-1 --stack-name interview-canvas
aws cloudformation describe-stacks --region us-east-1 --stack-name interview-canvas --query "Stacks[0].Outputs"
```

Verify: `http://<EIP>/health` → `{"status":"ok"}`, then Two-Session in two browsers.

Teardown (required after PoC / after CI green once):

```powershell
aws cloudformation delete-stack --region us-east-1 --stack-name interview-canvas
aws cloudformation wait stack-delete-complete --region us-east-1 --stack-name interview-canvas
```

Overnight pause without full teardown: `aws ec2 stop-instances` (EBS still bills; EIP on stopped instance bills).

## CI/CD wiring

| Workflow | Trigger | Role |
|----------|---------|------|
| `.github/workflows/ci.yml` | push/PR | Gate: unit, lint, integration, image build |
| `.github/workflows/deploy.yml` | `ci` success on `main` | Publish image to GHCR; optional smoke if `APP_URL` is set |

Permanent always-on AWS is **opt-in** (cost). This course PoC used create → verify → delete the same day. To re-enable live CD:

1. Store IAM access keys (narrow policy) as GitHub Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
2. Set variable/secret `APP_URL` to the public base URL after stack create
3. Extend `deploy.yml` (or re-run `create-stack` / SSM pull+rebuild) — do not leave `t3.small` running unused

## Managed DB note

Compose/AWS PoC keeps Postgres **on the same host**. Moving to RDS/Neon later: point `DATABASE_URL` at the managed URL and run schema init/migrations on deploy.
