---
name: deploy-service
description: Build, push, and roll out one or more ReelMart backend microservices to AWS ECS Fargate. Use when asked to deploy / ship / release / update a backend service (admin, analytics, catalog, delivery, notification, order, payment, payout, return, whatsapp).
allowed-tools: Bash, Read
---

# Deploy a backend microservice to ECS Fargate

**Constants** — Region `ap-south-1`, Account `632127307144`, ECR `632127307144.dkr.ecr.ap-south-1.amazonaws.com`, Cluster `reelmart-dev`.
**Naming is uniform:** dir `reelmart/services/<svc>-service`, ECR repo `reelmart/<svc>-service`, ECS service `<svc>-service`, task family `reelmart-dev-<svc>`, IP target group `reelmart-dev-tgip-<svc>`.
Services: `admin analytics catalog delivery notification order payment payout return whatsapp`.

## Steps (per requested service)
1. **Creds**: `aws sts get-caller-identity`. If `ExpiredToken`, run the **/aws-session** skill first.
2. **Docker up**: `docker info` — if no daemon, `open -a Docker` and wait until it responds.
3. **Build check**: `cd reelmart/services/<svc>-service && npm install && npm run build` (catches TS errors before shipping).
4. **ECR login**: `aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 632127307144.dkr.ecr.ap-south-1.amazonaws.com`
5. **Build for Fargate's arch** (local Docker is arm64; Fargate is amd64):
   `docker build --platform linux/amd64 -t 632127307144.dkr.ecr.ap-south-1.amazonaws.com/reelmart/<svc>-service:dev-latest reelmart/services/<svc>-service`
6. **Push**: `docker push 632127307144.dkr.ecr.ap-south-1.amazonaws.com/reelmart/<svc>-service:dev-latest`
7. **Roll out**: `aws ecs update-service --cluster reelmart-dev --service <svc>-service --force-new-deployment` then `aws ecs wait services-stable --cluster reelmart-dev --services <svc>-service`
8. **Verify**: run the **/health-check** skill (or curl the service path via `https://api-dev.reelmart.in`). Report result.

## Guardrails
- Only the **image** rolls here. Task-def config, env/secrets, ALB, scaling are **Terraform-managed** (`infra/terraform`) — for those use **/tf-drift** then a reviewed `terraform apply`, never raw CLI.
- CI (`.github/workflows/deploy.yml`) does this same flow on push to `main` via the `reelmart-gha-deploy` OIDC role — prefer that for normal releases; use this skill for hotfixes/manual rollouts.
- `delivery-service` needs `NIMBUS_AUTH_TOKEN` on its task def for NimbusPost to work (known gap).
