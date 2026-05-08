#!/usr/bin/env bash
# Hit /health on every service via the public ALB hostname.
# Usage: ./smoke-test.sh [hostname]
#   default hostname: api-dev.reelmart.in
set -euo pipefail

HOST="${1:-api-dev.reelmart.in}"

# service short name → API path prefix
declare -A PATHS=(
  [catalog]=catalog
  [order]=orders
  [payment]=payments
  [delivery]=delivery
  [notification]=notifications
  [whatsapp]=whatsapp
  [payout]=payouts
  [analytics]=analytics
  [return]=returns
  [admin]=admin
)

FAIL=0
echo "Smoke test against https://${HOST}"
echo

for SVC in "${!PATHS[@]}"; do
  P="${PATHS[$SVC]}"
  CODE=$(curl -sk -o /dev/null -w "%{http_code}" "https://${HOST}/api/${P}/health" || echo "000")
  if [[ "$CODE" =~ ^2 ]]; then
    printf "  ✓ %-15s %s\n" "$SVC" "$CODE"
  else
    printf "  ✗ %-15s %s\n" "$SVC" "$CODE"
    FAIL=$((FAIL+1))
  fi
done

echo
if [[ $FAIL -eq 0 ]]; then
  echo "All services healthy."
else
  echo "${FAIL} service(s) unhealthy."
  exit 1
fi
