---
name: triage
description: Investigate a failing or unhealthy ReelMart backend service — pull ECS service events, stopped-task reasons, CloudWatch logs and target health, then summarize the likely root cause and fix. Read-only.
allowed-tools: Bash, Read
---

# Triage a ReelMart service incident (ECS Fargate, cluster `reelmart-dev`)

Given a service `<svc>-service` (or "find what's down"):

1. **Service events** (last ~10): `aws ecs describe-services --cluster reelmart-dev --services <svc>-service --query 'services[0].events[0:10].message' --output text`
2. **Stopped tasks** + why: `aws ecs list-tasks --cluster reelmart-dev --service-name <svc>-service --desired-status STOPPED --query 'taskArns' --output text` → `aws ecs describe-tasks --cluster reelmart-dev --tasks <arn> --query 'tasks[0].{stopped:stoppedReason,code:containers[0].exitCode,reason:containers[0].reason}'`
3. **Logs**: `aws logs tail /ecs/reelmart-dev-<svc> --since 1h` (CloudWatch group is `/ecs/reelmart-dev-<svc>`).
4. **Target health**: `aws elbv2 describe-target-health --target-group-arn $(aws elbv2 describe-target-groups --names reelmart-dev-tgip-<svc> --query 'TargetGroups[0].TargetGroupArn' --output text)`

## Summarize
Root cause + recommended fix. Common ReelMart causes:
- **Missing task-def env/secret** (e.g. `delivery-service` without `NIMBUS_AUTH_TOKEN`) → fix in Terraform `infra/terraform/environments/dev/services`.
- **Image crash on boot** → check logs; likely a bad deploy → roll back by pushing the previous image or fixing + **/deploy-service**.
- **Failing `/health`** → app not listening on 3000 / dependency (Supabase/secret) unavailable.
- **Insufficient capacity** → Fargate shouldn't hit this (no instance limit); if seen, check desired count / quotas.

Hand the fix to the user or the **deployer** agent — triage does not mutate anything.
