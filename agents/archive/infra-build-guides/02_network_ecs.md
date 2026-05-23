# Phase 1 — Network + ECS Foundation

> VPC, public subnets, ALB, ECS cluster, ECR repos, IAM, Secrets Manager containers, CloudWatch log groups.

## Goal
A working ECS cluster fronted by an ALB, with all the supporting plumbing in place. No EC2 instances yet (Phase 2). No tasks yet (Phase 4).

## Prerequisites
Phase 0 complete:
- S3 state bucket + Dynamo lock table exist
- IAM `reelmart-gha-deploy` role exists
- AWS CLI configured as `reelmart-admin`

## Inputs
- `AWS_ACCOUNT_ID`
- `OPERATOR_IP_CIDR`
- Environment: `dev` (Phase 1 always starts with dev)

## Layer

This phase creates the `network` state file: `infra/dev/network.tfstate`.

## Modules used
- `modules/network/`     — VPC, subnets, IGW, route tables, security groups
- `modules/ecs-cluster/` — ECS cluster + capacity provider
- `modules/alb/`         — ALB, listeners, target groups, listener rules
- `modules/ecr/`         — 10 repositories
- `modules/iam/`         — task execution role, task role
- `modules/secrets/`     — 7 Secrets Manager containers (no values yet)

## Steps

### 1.1 — Create env composition file
```bash
cd infra/terraform/environments/dev

# Confirm backend.tf points to S3 bucket created in Phase 0
cat backend.tf

# Set inputs
cat > terraform.tfvars <<EOF
aws_account_id     = "${AWS_ACCOUNT_ID}"
operator_ip_cidr   = "${OPERATOR_IP_CIDR}/32"
environment        = "dev"
vpc_cidr           = "10.0.0.0/16"
azs                = ["ap-south-1a", "ap-south-1b"]
public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
EOF
```

### 1.2 — Init + plan + apply
```bash
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

Expect ~60 resources. Apply takes ~3 min (ALB takes the longest).

### 1.3 — Capture outputs (used by later phases)
```bash
terraform output -json > /tmp/dev-network-outputs.json

# Key outputs you'll reference:
#   vpc_id
#   public_subnet_ids
#   alb_dns_name
#   alb_arn
#   alb_listener_arn          (HTTPS)
#   ecs_cluster_name          ("reelmart-dev")
#   ecr_repo_urls             (map: catalog → URI, ...)
#   target_group_arns         (map: catalog → arn, ...)
#   task_execution_role_arn
#   task_role_arn
```

## Deliverables

### Network
- VPC `10.0.0.0/16`
- Public subnets in AZ-a (`10.0.1.0/24`) and AZ-b (`10.0.2.0/24`)
- Internet Gateway + public route table
- Security groups: `alb-sg`, `ec2-sg`, `ecs-sg`

### ALB
- Internet-facing ALB across both public subnets
- HTTP:80 listener → 301 redirect to HTTPS
- HTTPS:443 listener — **no certificate attached yet** (default action: 503 fixed-response). Phase 5 attaches the cert.
- 10 target groups (one per service):
  - `reelmart-dev-tg-catalog`, `reelmart-dev-tg-order`, ... (one per service)
  - Health check path: `/health`, healthy threshold: 2, interval: 15s
- 10 listener rules on the HTTPS listener (path-based, priority 100..190)

### ECR
- 10 repositories: `reelmart/catalog-service`, `reelmart/order-service`, ..., `reelmart/admin-service`
- Image tag mutability: `IMMUTABLE` for `<env>-<sha>` (enforced via repository policy via lifecycle rules; `<env>-latest` mutable allowed)
- Lifecycle: keep last 20 untagged + 20 tagged

### ECS
- Cluster `reelmart-dev`, capacity providers configured (added in Phase 2)
- Container Insights: `enabled` (dev) — costs $0.50/cluster/mo

### IAM
- `ecsTaskExecutionRole` — pulls from ECR, reads secrets, writes logs
- `ecsTaskRole` — base role; service-specific permissions added in `modules/ecs-service` per service

### Secrets Manager (containers only — no values yet)
- `reelmart/dev/supabase`
- `reelmart/dev/razorpay`
- `reelmart/dev/gupshup`
- `reelmart/dev/twilio`
- `reelmart/dev/shiprocket`
- `reelmart/dev/firebase`
- `reelmart/dev/jwt`

### CloudWatch
- 10 log groups `/ecs/reelmart/dev/<service>`, retention 14 days

## Validation

```bash
# Cluster exists
aws ecs describe-clusters --clusters reelmart-dev --query 'clusters[0].status'
# → "ACTIVE"

# ALB reachable on HTTPS (returns 503 default action — that's expected pre-phase-5)
ALB_DNS=$(terraform output -raw alb_dns_name)
curl -sk -o /dev/null -w "%{http_code}\n" https://$ALB_DNS
# → 503  (because no cert yet — connection might fail with TLS error; that's also fine)

curl -sk -o /dev/null -w "%{http_code}\n" http://$ALB_DNS
# → 301  (redirect to HTTPS)

# ECR repos exist
aws ecr describe-repositories \
  --repository-names reelmart/catalog-service reelmart/order-service \
                     reelmart/payment-service reelmart/delivery-service \
                     reelmart/notification-service reelmart/whatsapp-service \
                     reelmart/payout-service reelmart/analytics-service \
                     reelmart/return-service reelmart/admin-service \
  --query 'repositories[].repositoryUri' --output table

# Secrets containers exist (empty)
aws secretsmanager list-secrets --query 'SecretList[?starts_with(Name, `reelmart/dev/`)].Name'
# → 7 entries
```

## Populate secret values (one-time, manual)

```bash
cd infra/scripts
./populate-secrets.sh dev
# Interactive: prompts for each secret's keys; uses aws secretsmanager put-secret-value.
# Re-runnable: skips secrets that already have values unless you pass --force.
```

> Service tasks won't start in Phase 4 if the secrets are still empty. Do this **before** Phase 4.

## Common pitfalls
- **Target group name length.** `reelmart-dev-tg-notification` is 28 chars — fine. The 32-char ceiling bites if you rename services.
- **AZ count.** Mumbai has 3 AZs (`a`, `b`, `c`). We use 2 for cost. ALB requires ≥ 2.
- **ALB without cert in HTTPS listener.** Use a fixed-response default action until Phase 5; do NOT attach an unrelated cert as a placeholder.
- **Security group circular references.** `ec2-sg` references `alb-sg` for inbound; module declares both in the same file to avoid the dependency cycle.
- **Tag your subnets.** `Name=reelmart-dev-public-a` makes the AWS console useful.
- **Container Insights costs.** $0.50/cluster/mo + log volume — fine for dev, watch in prod.

## Rollback
```bash
cd infra/terraform/environments/dev
terraform destroy
# Confirms by listing all 60 resources. Type "yes".
# Note: ECR repos with images can't destroy — delete images first or set force_delete=true on the repo.
```

## Next: Phase 2
Hand off to `03_ec2_asg.md`.
