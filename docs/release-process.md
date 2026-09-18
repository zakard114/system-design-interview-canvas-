# Release process

## Environments

| Env | What | URL |
|-----|------|-----|
| Local / staging-like | `docker compose` on a laptop | http://localhost:8100 |
| Production PoC | CloudFormation EC2 + Caddy | http://\<EIP\>/ (torn down after verify) |
| Artifact | GHCR image from `deploy.yml` | `ghcr.io/<owner>/<repo>:main` (and git SHA tag) |

There is no long-lived staging cluster in this repo by default. Treat Compose as staging; treat AWS stack as production PoC.

## Merge gate

1. Open PR → `ci` must be green (backend, frontend lint/test/build, integration, docker build).  
2. Merge to `main` → `ci` runs again → on success `deploy` publishes the image.  
3. If `APP_URL` is configured, `deploy` curls `/health` as a post-deploy smoke check.

## Release steps (human)

1. Ensure `main` is green.  
2. For a live AWS PoC: `create-stack` (see `docs/deployment.md`), wait for `/health`, Two-Session smoke.  
3. Record EIP / stack outputs in the PR or a short note.  
4. Same day (or after overnight Stop): `delete-stack` + orphan checklist (EIP, Available EBS, stray SG/instance).  
5. Rotate/delete IAM access keys used for the PoC.

## Rollback

| Situation | Action |
|-----------|--------|
| Bad commit on `main` before live deploy | Revert PR; wait for green `ci` / new GHCR tag |
| Live EC2 serving a bad build | SSM: `cd /opt/interview-canvas && git fetch && git checkout <good-sha> && docker compose -f docker-compose.prod.yaml up -d --build` **or** `delete-stack` and recreate from known `RepoRef` |
| Broken public PoC, no time to debug | `delete-stack` immediately (preferred over leaving a broken EIP live) |
| Image-only consumers | Pin to previous GHCR digest/SHA tag |

## Post-deploy smoke

Minimum:

```text
GET /health → 200 {"status":"ok"}
Two browser sessions: create room → join link → canvas sync
```

Optional automation: set GitHub Actions variable/secret `APP_URL` so `deploy.yml` runs the health curl after publish.
