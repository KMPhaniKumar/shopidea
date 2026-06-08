# GitHub Actions templates

Copy these into `.github/workflows/` at the repo root once **Phase 6** is reached:

```bash
mkdir -p .github/workflows
cp infra/.github-workflows/deploy.yml      .github/workflows/
cp infra/.github-workflows/_build-push.yml .github/workflows/
cp infra/.github-workflows/infra.yml       .github/workflows/
```

Required GitHub repo variables (set via `gh variable set`):
- `AWS_REGION = ap-south-1`
- `AWS_ACCOUNT_ID = <12-digit>`
- `AWS_DEPLOY_ROLE = arn:aws:iam::<acct>:role/reelmart-gha-deploy`
- `ECS_CLUSTER_DEV = reelmart-dev`

No GitHub secrets needed for AWS auth — OIDC handles it.

See [`agents/07_cicd_oidc.md`](../agents/07_cicd_oidc.md) for the full setup.
