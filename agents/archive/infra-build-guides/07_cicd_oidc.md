# Phase 6 — GitHub Actions OIDC + Matrix Workflow

> Push to main → only changed services rebuild and redeploy. No long-lived AWS keys.

## Goal
- GitHub Actions workflows that build/push/deploy each service automatically when its code changes.
- Authentication via OIDC (created in Phase 0); no AWS access keys in GitHub secrets.
- A separate workflow that runs `terraform plan` on PRs and `terraform apply` on main for `infra/` changes.

## Prerequisites
- Phase 0 (OIDC provider + `reelmart-gha-deploy` role exist)
- Phase 4 (services deployed at least once manually so workflows have something to update)
- GitHub CLI (`gh`) authenticated locally

## Inputs
- `AWS_ACCOUNT_ID`
- `AWS_REGION = ap-south-1`
- `ECS_CLUSTER_DEV = reelmart-dev`
- `GITHUB_REPO = <owner>/<repo>`

## Files to create

Drop these into `.github/workflows/` at repo root (templates live in `infra/.github-workflows/`):

```
.github/workflows/
├── deploy.yml         ← matrix: build + push + ECS update for changed services
├── _build-push.yml    ← reusable workflow called by deploy.yml
└── infra.yml          ← terraform fmt/validate/plan/apply
```

## Steps

### 6.1 — Set repo variables (NOT secrets — values are not sensitive)
```bash
gh variable set AWS_REGION         --body "ap-south-1"
gh variable set AWS_ACCOUNT_ID     --body "${AWS_ACCOUNT_ID}"
gh variable set AWS_DEPLOY_ROLE    --body "arn:aws:iam::${AWS_ACCOUNT_ID}:role/reelmart-gha-deploy"
gh variable set ECS_CLUSTER_DEV    --body "reelmart-dev"
```

### 6.2 — Copy workflow files
```bash
mkdir -p .github/workflows
cp infra/.github-workflows/deploy.yml      .github/workflows/
cp infra/.github-workflows/_build-push.yml .github/workflows/
cp infra/.github-workflows/infra.yml       .github/workflows/
```

### 6.3 — Commit + open a PR with a no-op change to one service
```bash
git checkout -b ci/test-deploy-workflow
echo "// trigger ci" >> reelmart/services/catalog-service/src/index.ts
git commit -am "ci: trigger catalog deploy"
git push -u origin ci/test-deploy-workflow
gh pr create --title "ci: test deploy workflow" --body "Smoke test of OIDC + matrix deploy"
```

When the PR is merged, the workflow should:
1. Detect `reelmart/services/catalog-service/**` changed.
2. Assume role via OIDC.
3. Build + push `reelmart/catalog-service:dev-<sha>` and `:dev-latest`.
4. `aws ecs update-service --force-new-deployment` on `catalog-service`.
5. Wait for `services-stable`.
6. Curl `https://api-dev.reelmart.in/api/catalog/health` → expect 200.

### 6.4 — Watch the run
```bash
gh run watch
gh run view --log
```

## How the matrix workflow works

`deploy.yml` (sketch):
```yaml
name: Deploy services
on:
  push:
    branches: [main]
    paths: ['reelmart/services/**']

permissions:
  id-token: write
  contents: read

jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      services: ${{ steps.changes.outputs.services }}
    steps:
      - uses: actions/checkout@v4
      - id: changes
        uses: dorny/paths-filter@v3
        with:
          filters: |
            catalog: ['reelmart/services/catalog-service/**']
            order: ['reelmart/services/order-service/**']
            payment: ['reelmart/services/payment-service/**']
            # ... 7 more
      - run: |
          # convert filter outputs into a JSON array of changed service names
          echo "services=$(jq -nc '...')" >> $GITHUB_OUTPUT

  deploy:
    needs: detect
    if: needs.detect.outputs.services != '[]'
    strategy:
      matrix:
        service: ${{ fromJson(needs.detect.outputs.services) }}
      fail-fast: false
    uses: ./.github/workflows/_build-push.yml
    with:
      service: ${{ matrix.service }}
      env: dev
    secrets: inherit
```

`_build-push.yml` (sketch):
```yaml
on:
  workflow_call:
    inputs:
      service: { type: string, required: true }
      env:     { type: string, required: true }

jobs:
  build:
    runs-on: ubuntu-latest
    permissions: { id-token: write, contents: read }
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE }}
          aws-region:     ${{ vars.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
      - uses: docker/setup-buildx-action@v3
      - name: Build & push
        run: |
          REPO="${{ vars.AWS_ACCOUNT_ID }}.dkr.ecr.${{ vars.AWS_REGION }}.amazonaws.com/reelmart/${{ inputs.service }}-service"
          docker buildx build --platform linux/amd64 \
            --tag $REPO:${{ inputs.env }}-${{ github.sha }} \
            --tag $REPO:${{ inputs.env }}-latest \
            --push \
            reelmart/services/${{ inputs.service }}-service
      - name: Deploy
        run: |
          aws ecs update-service \
            --cluster ${{ vars.ECS_CLUSTER_DEV }} \
            --service ${{ inputs.service }}-service \
            --force-new-deployment
          aws ecs wait services-stable \
            --cluster ${{ vars.ECS_CLUSTER_DEV }} \
            --services ${{ inputs.service }}-service
      - name: Smoke test
        run: |
          # map service name to API path
          declare -A PATHS=([order]=orders [payment]=payments [delivery]=delivery \
                            [notification]=notifications [whatsapp]=whatsapp \
                            [payout]=payouts [analytics]=analytics [return]=returns \
                            [admin]=admin [catalog]=catalog)
          P=${PATHS[${{ inputs.service }}]}
          curl -fsS https://api-dev.reelmart.in/api/$P/health
```

`infra.yml`:
```yaml
on:
  pull_request: { paths: ['infra/terraform/**'] }
  push:         { branches: [main], paths: ['infra/terraform/**'] }
permissions: { id-token: write, contents: read, pull-requests: write }
jobs:
  plan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: 1.7.5 }
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: ${{ vars.AWS_DEPLOY_ROLE }}, aws-region: ${{ vars.AWS_REGION }} }
      - run: terraform -chdir=infra/terraform/environments/dev init
      - run: terraform -chdir=infra/terraform/environments/dev fmt -check
      - run: terraform -chdir=infra/terraform/environments/dev validate
      - run: terraform -chdir=infra/terraform/environments/dev plan -out=tfplan
      - if: github.event_name == 'push'
        run: terraform -chdir=infra/terraform/environments/dev apply -auto-approve tfplan
```

## Validation
- Open a PR touching one service file → only that service's matrix job runs.
- Merge → ECR has new `dev-<sha>` tag, ECS service has new task definition revision, smoke test green.
- Open a PR touching `infra/terraform/**` → `infra.yml` `plan` job runs, posts the plan to the PR.

## Common pitfalls
- **`Could not assume role` / `unauthorized`.** The OIDC trust policy `sub` claim doesn't match. The trust must be `repo:<owner>/<repo>:*` (covers all branches/PRs). For tighter control, use `repo:<owner>/<repo>:ref:refs/heads/main`.
- **`id-token: write` missing.** Without this permission on the job, OIDC won't issue a token.
- **paths-filter false negatives.** If a workflow run sees zero changed paths, double-check the filter config — the `paths-filter` action uses YAML-glob, not bash glob.
- **Concurrency.** Two simultaneous main-branch runs touching the same service can fight over `update-service`. Add a `concurrency: { group: deploy-${{ inputs.service }}, cancel-in-progress: false }` to `_build-push.yml`.
- **Cluster name drift.** If you rename the cluster, update `ECS_CLUSTER_DEV` repo variable; otherwise the `aws ecs wait` call pukes.
- **Secrets manager values must exist.** A failed deploy after a fresh secret-name change usually means the value isn't populated yet — re-run `populate-secrets.sh dev`.

## Rollback
- Disable the workflow files: `git rm .github/workflows/{deploy,_build-push,infra}.yml && git commit && git push`. Re-enable any time.
- For a bad deploy: `aws ecs update-service --task-definition <previous-revision-arn>` (Terraform output stores prior revisions, or use the AWS console "Roll back deployment" button).

## Next: Phase 7
Hand off to `08_vercel_web.md`.
