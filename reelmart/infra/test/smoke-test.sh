#!/bin/bash
# Run this from your LOCAL machine after deployment.
# Usage: ./smoke-test.sh <EC2_PUBLIC_IP>
# Example: ./smoke-test.sh 13.235.100.200

IP="${1:-localhost}"
BASE="http://${IP}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" = "200" ]; then
    echo "  ✅  $name ($code)"
    ((PASS++))
  else
    echo "  ❌  $name ($code) — $url"
    ((FAIL++))
  fi
}

echo ""
echo "ReelMart Smoke Test → $BASE"
echo "──────────────────────────────"
check "nginx /health"              "$BASE/health"
check "catalog-service"            "$BASE/api/catalog/health"
check "order-service"              "$BASE/api/orders/health"
check "payment-service"            "$BASE/api/payments/health"
check "delivery-service"           "$BASE/api/delivery/health"
check "notification-service"       "$BASE/api/notifications/health"
check "whatsapp-service"           "$BASE/api/whatsapp/health"
check "payout-service"             "$BASE/api/payouts/health"
check "analytics-service"          "$BASE/api/analytics/health"
check "return-service"             "$BASE/api/returns/health"
check "admin-service"              "$BASE/api/admin/health"
echo "──────────────────────────────"
echo "  Passed: $PASS / $((PASS + FAIL))"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Some services failed. SSH in and check:"
  echo "  docker-compose -f ~/shopidea/reelmart/services/docker-compose.yml ps"
  echo "  docker-compose -f ~/shopidea/reelmart/services/docker-compose.yml logs <service-name>"
fi
