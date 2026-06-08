#!/usr/bin/env bash
# Interactive: populate the AWS Secrets Manager containers created by Phase 1.
# Skips secrets that already have a value unless --force is passed.
#
# Usage: ./populate-secrets.sh <env> [--force]
set -euo pipefail

ENV="${1:-}"
FORCE=false
[[ "${2:-}" == "--force" ]] && FORCE=true

if [[ -z "$ENV" ]]; then
  echo "usage: $0 <env> [--force]"
  exit 1
fi

AWS_REGION="${AWS_REGION:-ap-south-1}"

# secret-name : space-separated keys
declare -a SPECS=(
  "reelmart/${ENV}/supabase   url anon_key service_key"
  "reelmart/${ENV}/razorpay   key_id key_secret webhook_secret"
  "reelmart/${ENV}/gupshup    api_key sender_number app_name"
  "reelmart/${ENV}/twilio     sid token phone_number"
  "reelmart/${ENV}/shiprocket email password"
  "reelmart/${ENV}/firebase   service_account_json"
  "reelmart/${ENV}/jwt        secret"
)

read_secret_value() {
  local prompt="$1"
  local val=""
  read -rsp "$prompt: " val
  echo
  echo "$val"
}

has_value() {
  local name="$1"
  aws secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$name" \
    --query SecretString --output text 2>/dev/null | grep -q '[^[:space:]]'
}

for SPEC in "${SPECS[@]}"; do
  read -r NAME KEYS <<<"$SPEC"

  if ! aws secretsmanager describe-secret --region "$AWS_REGION" --secret-id "$NAME" >/dev/null 2>&1; then
    echo "✗ Secret '$NAME' does not exist. Run Phase 1 (Terraform apply) first."
    exit 1
  fi

  if [[ "$FORCE" == "false" ]] && has_value "$NAME"; then
    echo "✓ $NAME already populated, skipping (use --force to overwrite)"
    continue
  fi

  echo ""
  echo "→ Populating $NAME"
  JSON="{"
  FIRST=true
  for KEY in $KEYS; do
    VAL=$(read_secret_value "  $KEY")
    [[ "$FIRST" == "true" ]] || JSON+=","
    JSON+="\"$KEY\":$(printf '%s' "$VAL" | jq -Rs .)"
    FIRST=false
  done
  JSON+="}"

  aws secretsmanager put-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$NAME" \
    --secret-string "$JSON" >/dev/null

  echo "  ✓ stored"
done

echo ""
echo "Done. To verify:"
echo "  aws secretsmanager list-secrets --query 'SecretList[?starts_with(Name, \`reelmart/${ENV}/\`)].Name'"
