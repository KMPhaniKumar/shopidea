# Phase 3 — Build & Push 10 Service Images

> First-run is manual (operator's machine). After Phase 6 ships, GitHub Actions does this on every push.

## Goal
All 10 service images built for `linux/amd64` and pushed to ECR with two tags: `dev-<sha>` (immutable) and `dev-latest` (rolling).

## Prerequisites
- Phase 1 complete (ECR repos exist)
- Docker Desktop running locally with `buildx` (Apple Silicon fine — we cross-compile)
- Each service has a working `Dockerfile` at `reelmart/services/<svc>-service/Dockerfile`

## Inputs
- `AWS_ACCOUNT_ID`
- `ENV=dev`
- `REGION=ap-south-1`

## Steps

### 3.1 — Sanity check Dockerfiles
```bash
for s in catalog order payment delivery notification whatsapp payout analytics return admin; do
  test -f reelmart/services/${s}-service/Dockerfile && echo "✓ ${s}" || echo "✗ ${s} MISSING"
done
```
Every line must show `✓`. If any service is missing a Dockerfile, write one before continuing (use `catalog-service/Dockerfile` as the template).

### 3.2 — Login to ECR
```bash
export AWS_PROFILE=reelmart-admin
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=ap-south-1

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
```

### 3.3 — Build & push (single shot)
```bash
cd infra/scripts
./build-and-push.sh dev
```

What the script does:
```
ENV=$1
GIT_SHA=$(git rev-parse --short HEAD)

for svc in catalog order payment delivery notification whatsapp payout analytics return admin; do
  REPO="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/reelmart/${svc}-service"

  docker buildx build \
    --platform linux/amd64 \
    --tag $REPO:$ENV-$GIT_SHA \
    --tag $REPO:$ENV-latest \
    --push \
    reelmart/services/${svc}-service
done
```

### 3.4 — Verify each repo received the new tag
```bash
for s in catalog order payment delivery notification whatsapp payout analytics return admin; do
  echo "=== $s ==="
  aws ecr describe-images \
    --repository-name reelmart/${s}-service \
    --query 'sort_by(imageDetails, &imagePushedAt)[-1].{Tags:imageTags,Pushed:imagePushedAt,Size:imageSizeInBytes}' \
    --output table
done
```

Each must show `dev-<sha>` and `dev-latest` tags with a recent timestamp.

## Deliverables
- 10 ECR repos each with `:dev-<sha>` and `:dev-latest` tags
- Local Docker images cached (can `docker rmi` to reclaim disk if needed)

## Validation
```bash
# Pull one image back from ECR and inspect it
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker pull $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/reelmart/catalog-service:dev-latest
docker run --rm $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/reelmart/catalog-service:dev-latest \
  node --version
# → some v20+ output (no crash)
```

## Common pitfalls
- **Missing `--platform linux/amd64`.** Building on Apple Silicon without it produces an `arm64` image that fails on EC2 with `exec format error`. Always cross-compile.
- **Using `docker build` without `buildx`.** The `--push` flag won't work; you'd need a separate `docker push`. Use `docker buildx build ... --push`.
- **Image too big (1+ GB).** Likely included node_modules dev deps. Use multi-stage `Dockerfile` (build in deps stage, copy `dist/` + `node_modules/` from prod stage).
- **No `/health` endpoint in service.** Phase 4 target group health check will hammer `/health` and tasks will fail health checks. Make sure every service responds 200 on `GET /health`.
- **Hardcoded `localhost` URLs in source.** Services that talk to other services should use `process.env.<OTHER_SERVICE>_URL` (set in Phase 4 task definition env), not `localhost`.
- **ECR auth token expires after 12 hours.** If a build runs that long, re-run the login command.

## Rollback
ECR images can be deleted by tag:
```bash
aws ecr batch-delete-image \
  --repository-name reelmart/catalog-service \
  --image-ids imageTag=dev-<sha>
```

## Next: Phase 4
Once secrets are populated (see end of Phase 1 agent), hand off to `05_ecs_services.md`.
