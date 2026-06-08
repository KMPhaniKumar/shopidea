#!/usr/bin/env bash
# Build and push all 10 service images to ECR.
# Usage: ./build-and-push.sh <env>
#   env: dev | prod
#
# Requires: aws CLI v2, docker with buildx, jq.
set -euo pipefail

ENV="${1:-}"
if [[ -z "$ENV" ]]; then
  echo "usage: $0 <env>"
  exit 1
fi

AWS_REGION="${AWS_REGION:-ap-south-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
GIT_SHA=$(git rev-parse --short HEAD)

REPO_HOST="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

SERVICES=(catalog order payment delivery notification whatsapp payout analytics return admin)

# Repo root: this script lives in <repo>/infra/scripts/
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVICES_DIR="${REPO_ROOT}/reelmart/services"

echo "==> ECR login"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$REPO_HOST"

for SVC in "${SERVICES[@]}"; do
  CTX="${SERVICES_DIR}/${SVC}-service"
  if [[ ! -f "${CTX}/Dockerfile" ]]; then
    echo "WARN: ${CTX}/Dockerfile not found, skipping ${SVC}"
    continue
  fi

  REPO="${REPO_HOST}/reelmart/${SVC}-service"
  echo ""
  echo "==> Build & push ${SVC} → ${REPO}:${ENV}-${GIT_SHA}, ${REPO}:${ENV}-latest"

  docker buildx build \
    --platform linux/amd64 \
    --tag "${REPO}:${ENV}-${GIT_SHA}" \
    --tag "${REPO}:${ENV}-latest" \
    --push \
    "${CTX}"
done

echo ""
echo "==> Done. Pushed ${#SERVICES[@]} services with git SHA ${GIT_SHA}."
