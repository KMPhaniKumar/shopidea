# Phase 4 — ECS Task Definitions + Services + Auto Scaling

> Bring the cluster to life: 10 services running, each behind its target group, auto-scaling on CPU.

## Goal
For each of the 10 services: a task definition, an ECS service registered to the right target group, and an Application Auto Scaling policy.

## Prerequisites
- Phase 1 (cluster, ALB, target groups, secrets containers, log groups)
- Phase 2 (EC2 instance(s) running, joined to cluster)
- Phase 3 (images pushed to ECR with `dev-latest` tag)
- **Secrets populated** in Secrets Manager (run `infra/scripts/populate-secrets.sh dev` before this phase)

## Layer
This phase writes to `infra/dev/services.tfstate`.

## Module used
`modules/ecs-service/` — instantiated 10 times in `environments/dev/services.tf`.

## Per-service spec

| Service              | Path prefix              | Min/Max | CPU/Mem (dev) | Notes                       |
|----------------------|--------------------------|---------|---------------|-----------------------------|
| catalog-service      | `/api/catalog/*`         | 1 / 2   | 256 / 512     | most reads, cache later     |
| order-service        | `/api/orders/*`          | 1 / 2   | 256 / 512     |                             |
| payment-service      | `/api/payments/*`        | 1 / 2   | 256 / 512     | webhook from Razorpay       |
| delivery-service     | `/api/delivery/*`        | 1 / 2   | 256 / 512     | Shiprocket calls            |
| notification-service | `/api/notifications/*`   | 1 / 2   | 256 / 512     | Twilio + FCM                |
| whatsapp-service     | `/api/whatsapp/*`        | 1 / 2   | 256 / 512     | bot state machine           |
| payout-service       | `/api/payouts/*`         | 1 / 1   | 256 / 512     | batch / cron-like           |
| analytics-service    | `/api/analytics/*`       | 1 / 2   | 256 / 512     | read heavy                  |
| return-service       | `/api/returns/*`         | 1 / 2   | 256 / 512     |                             |
| admin-service        | `/api/admin/*`           | 1 / 1   | 256 / 512     | low traffic, gated by JWT   |

(Prod values are double the dev `max` and 512/1024 for cpu/memory.)

## Steps

### 4.1 — Compose the services
`environments/dev/services.tf` instantiates `module.ecs_service` 10 times, looping over a local `services` map. Each iteration passes:
- service name
- container image: `${ecr_repo_urls[service]}:dev-latest` (Phase 3 already pushed)
- container port: `3000`
- target group ARN from Phase 1 outputs
- env vars (plain) from per-service definitions in `services.tf`
- env vars (secret refs) from Phase 1 secret ARNs
- log group: `/ecs/reelmart/dev/<service>`

### 4.2 — Apply
```bash
cd infra/terraform/environments/dev
terraform plan -out=tfplan
terraform apply tfplan
```

Expect ~50 resources (5 per service × 10 services). Apply takes ~5 min as ECS waits for each service to reach steady state.

### 4.3 — Watch services come up
```bash
watch -n 5 'aws ecs list-services --cluster reelmart-dev --query serviceArns --output table'
# All 10 should show within 30s; tasks transition pending → running over ~2 min
```

## Deliverables (per service, ×10)
- `aws_ecs_task_definition` — container with image, env, secrets, port mapping, log driver=awslogs
- `aws_ecs_service`:
  - `launch_type = EC2`
  - `desired_count = 1` (dev)
  - `deployment_controller = ECS` (rolling)
  - `health_check_grace_period_seconds = 60`
  - Linked to target group from Phase 1
- `aws_appautoscaling_target` (ECS service)
- `aws_appautoscaling_policy`:
  - Scale up: target tracking, target = 60 (CPU avg)
  - Scale down: target tracking, target = 30 (CPU avg)
- IAM policy attached to task role (per-service: e.g., S3 access for image upload, etc.)

## Validation

```bash
# All 10 services healthy
aws ecs describe-services --cluster reelmart-dev \
  --services catalog-service order-service payment-service delivery-service \
             notification-service whatsapp-service payout-service \
             analytics-service return-service admin-service \
  --query 'services[].{Name:serviceName,Desired:desiredCount,Running:runningCount,Status:status}' \
  --output table
# All Running == Desired, Status == ACTIVE

# Hit /health on each service via ALB (will be 503 until Phase 5 attaches cert + HTTP→HTTPS works,
# but you can hit the ALB DNS directly on HTTPS with -k)
ALB_DNS=$(cd infra/terraform/environments/dev && terraform output -raw alb_dns_name)
for s in catalog orders payments delivery notifications whatsapp payouts analytics returns admin; do
  printf "%-15s " "$s"
  curl -sk -o /dev/null -w "%{http_code}\n" https://$ALB_DNS/api/$s/health
done
# Each should be 200 (or 401 if /health is auth-gated)

# CloudWatch logs flowing
aws logs tail /ecs/reelmart/dev/catalog-service --since 5m --follow
# Should see boot messages from the running task
```

## Common pitfalls
- **Task immediately stops** — almost always a missing/wrong env var or a missing secret value. Check `aws ecs describe-tasks` `stoppedReason` first.
- **Health check failing** — service needs to bind to `0.0.0.0:3000` not `127.0.0.1:3000`; check the listening port matches container port.
- **`CannotPullContainerError`** — task execution role missing ECR pull permission, or ECR repo policy denying. Re-check IAM module attached `AmazonECSTaskExecutionRolePolicy`.
- **`ResourceInitializationError: failed to retrieve secret`** — task execution role doesn't have `secretsmanager:GetSecretValue` for that secret ARN. The `secrets/` module emits these ARNs as outputs; thread them into the task exec role policy.
- **Image not found.** Phase 3 must have pushed `dev-latest`. If you only pushed `dev-<sha>`, edit the task def to that tag.
- **Deploying with desired=0.** Common debugging trick — but services won't appear "healthy" with no tasks. Don't leave it that way.
- **Service deletion order.** When destroying, ECS services must drain before target groups can be deleted. Terraform handles this with `depends_on`; if you bypass it, you'll see a 5-minute timeout on tg delete.

## Rollback
```bash
# Single service
terraform plan -destroy -target='module.ecs_service["catalog"]' -out=tfplan
terraform apply tfplan

# All services
terraform plan -destroy -target=module.ecs_service -out=tfplan
terraform apply tfplan
```

## Next: Phase 5
Hand off to `06_dns_ssl.md`.
