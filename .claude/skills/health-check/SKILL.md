---
name: health-check
description: Check the health of all ReelMart backend services on ECS Fargate — launch type, running/desired counts, rollout state, target-group health, and a live ALB probe. Use to verify a deploy or investigate "is the API up?".
allowed-tools: Bash
---

# Health check — ReelMart backend (ECS Fargate, cluster `reelmart-dev`, ap-south-1)

Services: `admin analytics catalog delivery notification order payment payout return whatsapp` (ECS service `<svc>-service`, IP target group `reelmart-dev-tgip-<svc>`).

1. **Service status** (all 10):
   `aws ecs describe-services --cluster reelmart-dev --services admin-service analytics-service catalog-service delivery-service notification-service order-service payment-service payout-service return-service whatsapp-service --query 'services[].{n:serviceName,launch:launchType,run:runningCount,desired:desiredCount,roll:deployments[0].rolloutState}' --output table`
2. **Target health** per service:
   for each `<svc>`: `aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups --names reelmart-dev-tgip-<svc> --query 'TargetGroups[0].TargetGroupArn' --output text) --query 'TargetHealthDescriptions[].TargetHealth.State' --output text`
3. **Live ALB probe** (through `api-dev.reelmart.in`):
   - `curl -s -o /dev/null -w '%{http_code}' -X POST https://api-dev.reelmart.in/api/admin/auth/check-phone -H 'Content-Type: application/json' -H 'Origin: https://dev.reelmart.in' -d '{"phone":"+919999999999"}'` → expect `200`
   - `curl -s -o /dev/null -w '%{http_code}' https://api-dev.reelmart.in/api/catalog/stores` → expect `200`

Report a table: **service | launchType (should be FARGATE) | running/desired | rollout | target health**, and flag anything not `healthy`/`COMPLETED`. If a service is unhealthy, suggest the **/triage** skill.
