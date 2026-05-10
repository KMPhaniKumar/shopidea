# ReelMart — Deployment Plan
> ECS on EC2 + Auto Scaling | Region: ap-south-1 (Mumbai) | IaC: Terraform
> Environments: **dev** (this round) → **prod** (later)

---

## Live Status (last updated 2026-05-10)

> Phase 5 complete — services reachable at `https://api-dev.reelmart.in`. Razorpay + Supabase secrets are real; remaining provider secrets (Gupshup, Twilio, Shiprocket, Firebase) still placeholders.

| Phase | Status | Notes |
|------:|:------:|---|
| 0 — AWS bootstrap | ✅ done | S3 state `reelmart-tf-state-632127307144`, DynamoDB `reelmart-tf-locks`, OIDC + `reelmart-gha-deploy` role |
| 1 — Network + ALB + ECR + cluster + secrets containers + log groups | ✅ done | 74 resources. ALB DNS: `reelmart-dev-alb-1685112985.ap-south-1.elb.amazonaws.com` |
| 2 — EC2 ASG (3× t3.small) + capacity provider | ✅ done | Bumped from 1 → 3 instances; 10 tasks need ~3 instances at 384 MB each |
| 3 — Build & push 10 images | ✅ done | All 10 ECR repos have `dev-latest` + `dev-4dc7faa` (rebuilt on `node:22-alpine` after Node 20 WebSocket crash) |
| 4 — ECS task defs + services | ✅ done | 40 TF resources; all 10 services healthy in their ALB target groups |
| 5 — DNS + SSL (GoDaddy + ACM) | ✅ done | DNS stays on GoDaddy; ACM cert for `api-dev.reelmart.in` validated via CNAME at GoDaddy; ALB has HTTPS listener (TLS 1.2/1.3) + HTTP→HTTPS 301 redirect |
| 6 — GitHub Actions OIDC + workflows | ⏸ pending | Role already exists from Phase 0 |
| 7 — Web on Vercel | ⏸ pending | |
| 8 — Buyer mobile dev build | ⏸ pending | |
| 9 — CloudWatch alarms + SNS | ⏸ pending | |

### Secret population progress

| Secret | Status |
|---|---|
| `reelmart/dev/supabase` | ✅ real (reusing existing project `nysgwdpmpxqmfwelfaxo` for now) |
| `reelmart/dev/razorpay` | ✅ real test keys (`rzp_test_SnGliiDxDCbZDA`) |
| `reelmart/dev/jwt` | ✅ real (random 32-byte hex) |
| `reelmart/dev/gupshup` | ⏸ placeholder |
| `reelmart/dev/twilio` | ⏸ placeholder |
| `reelmart/dev/shiprocket` | ⏸ placeholder |
| `reelmart/dev/firebase` | ⏸ placeholder |

```bash
# Refresh AWS SSO creds first if expired (ASIA tokens last 1–12h)
# Then run the interactive populate script with --force to overwrite placeholders:
AWS_PROFILE=reelmart-admin AWS_REGION=ap-south-1 \
  ./infra/scripts/populate-secrets.sh dev --force
# After populating, force-redeploy services so tasks pull the new env.
# Only the services that actually consume the secret need a redeploy:
#   gupshup    → whatsapp
#   twilio     → notification, whatsapp
#   shiprocket → delivery
#   firebase   → notification
```

### Recurring AWS spend now on the meter
~$65/mo: ALB ($17) + 3× t3.small ($45) + Secrets Manager containers ($2.80) + Container Insights (~$0.50) + S3/DynamoDB/CloudWatch (~$1).

### Divergences from the original phase docs
- **Phase 2 instance count = 3, not 1.** 10 tasks at 256 CPU / 384 MB each don't fit on one t3.small (1913 MB usable). Bumped ASG desired to 3 (max stays at 3); capacity provider managed scaling will adjust within [1, 3].
- **Phase 3 base image: `node:22-alpine`** (was `node:20-alpine`). Required because `@supabase/supabase-js@2.39+` calls `realtime-js`, which throws on Node 20 without an explicit `ws` shim. Node 22 has stable native WebSocket so the SDK works without changes.
- **Phase 4 task memory: 384 MB** (was 512 MB in `default_memory`). 384 MB still has ~3× headroom over actual Express RSS (~80 MB) and lets 4 tasks bin-pack onto a t3.small if needed during rolling deploys.
- **Phase 5 DNS stays on GoDaddy** instead of migrating to Route 53. ACM cert is validated via a CNAME at GoDaddy; `api-dev.reelmart.in` CNAME also lives at GoDaddy and points to the ALB DNS. No nameserver migration, no Route 53 hosted zone cost.
- **Bootstrap state backend** uses `dynamodb_table` (not the new `use_lockfile`); functional, deprecation warning only.

---

## Architecture Overview

```
                                USERS
                  ┌──────────────┼──────────────┐
                  │              │              │
             Sellers          Buyers         Admins
            (browser)        (mobile)       (browser)
                  │              │              │
                  ▼              │              ▼
                Vercel CDN       │       Vercel CDN
       reelmart.in (one Next.js app: /seller, /admin, /s/<slug>, /)
                  │              │              │
                  └──────────────┼──────────────┘
                                 │
                                 │ HTTPS
                                 ▼
                  Route 53 (api-dev.reelmart.in / api.reelmart.in)
                                 │
                                 ▼
                       ALB (HTTPS:443)  ← path-based routing
                                 │
                  ┌──────────────┼──────────────────────┐
                  │              │                      │
                  ▼              ▼                      ▼
          /api/catalog    /api/orders          /api/payments
          /api/admin      /api/returns         /api/payouts
                          /api/delivery        /api/whatsapp
                                               /api/notifications
                                               /api/analytics
                                 │
                                 ▼
                  ECS Cluster (EC2 launch type, ap-south-1)
                  ┌───────────────────────────────────────┐
                  │ dev:  1× t3.small  (ASG min=1, max=3) │
                  │ prod: 2× t3.medium (ASG min=2, max=5) │
                  └───────────────────────────────────────┘
                                 │
                                 ▼
                  Supabase Cloud (DB + Auth + Storage + Realtime)
                  dev project — separate from prod project
```

### Decisions locked in
- **Backend service:** the 10 microservices in `reelmart/services/` are the deployment target. `reelmart/backend/` (Express) is retired — it duplicates payments/delivery/whatsapp/notifications/payouts routes already implemented in the microservices.
- **Web routing:** single domain `reelmart.in`, path-based — `/seller`, `/admin`, `/s/<slug>`, `/` (landing). One Vercel project (`reelmart/apps/web`).
- **Mobile:** only `reelmart/apps/buyer-app/` (Expo). `apps/seller-app` is parked.
- **Dev Supabase:** separate Supabase project from prod (separate URL + keys, free tier).
- **CI auth:** GitHub OIDC + IAM role. No long-lived AWS keys in GitHub.
- **IaC:** Terraform with S3 remote state + DynamoDB lock table. One root module, two workspaces (`dev`, `prod`).

### Why ECS on EC2 (not Fargate)?
EC2 launch type is cheaper at our task density and skips the NAT Gateway. EC2 in **public subnets** with locked-down SGs (no NAT = $0 vs ~$32/mo). Trade-off: EC2 instances have public IPs — acceptable for dev, revisit for prod (move to private subnets + NAT or VPC endpoints when traffic justifies it).

---

## Cost Breakdown

### Dev (this round)
```
EC2 t3.small × 1            $15/month   (2 vCPU, 2 GB)
ALB                         $17/month   (~$16 fixed + small LCU)
ECR (10 repos)              $1/month
CloudWatch Logs             $1/month
Secrets Manager (~12)       $5/month
Route 53 hosted zone        $1/month (already paying if domain hosted)
ACM Certificate             $0
─────────────────────────────────────
AWS Dev Total:             ~$40/month

Supabase Free tier          $0
Vercel Hobby                $0
Twilio / Gupshup test       $0–5
─────────────────────────────────────
Dev Grand Total:           ~$40/month
```
> ALB is the floor — most of dev cost is ALB. If we want sub-$20 dev, drop ALB and expose ECS service ports through one EC2 + nginx (the `infra/test/` path). Keeping ALB so dev mirrors prod.

### Prod (later, normal load)
```
EC2 t3.medium × 2           $66/month
ALB                         $21/month
ECR / Logs / Secrets        $9/month
Route 53                    $1/month
─────────────────────────────────────
AWS Prod Total:            ~$97/month

Supabase Pro (when needed)  $25/month
Twilio + Gupshup            $10/month
─────────────────────────────────────
Prod Grand Total:          ~$132/month
```

---

## Auto Scaling Rules

### EC2 ASG
```
dev:   min=1  max=3  desired=1
prod:  min=2  max=5  desired=2

Scale OUT when CPU reservation > 70% for 2 min
Scale IN  when CPU reservation < 30% for 10 min (never below min)
```

### Per-service ECS auto scaling (prod values; dev = min=1, max=2 across the board)
```
catalog-service:       min=1, max=5
order-service:         min=1, max=5
payment-service:       min=1, max=3
whatsapp-service:      min=1, max=3
notification-service:  min=1, max=3
delivery-service:      min=1, max=3
analytics-service:     min=1, max=2
return-service:        min=1, max=2
payout-service:        min=1, max=1   (batch)
admin-service:         min=1, max=1   (low traffic)

Scale up:   CPU > 60% for 60 s  → +1 task
Scale down: CPU < 30% for 300 s → -1 task
```

---

## Phases

### Phase 0 — AWS Bootstrap (one-time, ~1 hr)
> Prep the AWS account so Terraform can run safely.

```
1. AWS account: enable MFA on root, create an admin IAM user for Terraform local apply.
2. Region: lock to ap-south-1.
3. Create Terraform state backend (manually, one-time):
     - S3 bucket: reelmart-tf-state-<account-id>  (versioned, encrypted)
     - DynamoDB table: reelmart-tf-locks (LockID partition key)
4. Create GitHub OIDC identity provider in AWS IAM.
5. Create IAM role `reelmart-gha-deploy` trusted by the OIDC provider, scoped to:
     - ECR push to reelmart/* repos
     - ECS UpdateService/DescribeServices
     - Read Secrets Manager
6. Install Terraform locally (≥ 1.7) and AWS CLI v2; aws configure SSO/credentials.
```

**Deliverable:** state bucket + lock table + OIDC provider + deploy role exist in AWS.

---

### Phase 1 — Terraform: Network + ECS Foundation (Day 1, ~3 hr)
> VPC, subnets, ALB, ECS cluster, ECR, IAM (task), Secrets Manager.

**What gets created (per workspace — dev first):**
```
VPC (10.0.0.0/16 dev | 10.10.0.0/16 prod)
├── Public Subnet AZ-a
├── Public Subnet AZ-b
Internet Gateway + public route table
Security Groups:
  ├── alb-sg   (in: 80, 443 from 0.0.0.0/0)
  ├── ec2-sg   (in: 32768-65535 from alb-sg, 22 from operator IP allowlist)
  └── ecs-sg   (within-cluster traffic)
ECR repositories × 10 (reelmart/<service>)
ECS Cluster (EC2 launch type) — name: reelmart-<env>
ALB + HTTP→HTTPS redirect + HTTPS listener (cert from ACM)
10 target groups (one per service) + listener rules per /api/<path>
IAM:
  - ecsTaskExecutionRole (pull from ECR, read secrets, write logs)
  - ecsTaskRole (per-service permissions)
Secrets Manager — 1 secret per concern (Supabase, Razorpay, Gupshup, Twilio, Shiprocket, Firebase, JWT)
CloudWatch log groups × 10 (/ecs/reelmart/<service>)
```

**Files:** `reelmart/infra/terraform/modules/{network,ecs-cluster,alb,ecr,iam,secrets}/` + `environments/dev/main.tf`.

---

### Phase 2 — Terraform: EC2 ASG (Day 1, ~1 hr)
```
Launch Template:
  AMI: latest Amazon ECS-optimized AMI (data source: ssm parameter)
  Instance type: dev=t3.small | prod=t3.medium
  IAM role: ec2InstanceProfileForECS
  User data: registers to ECS cluster, enables IMDSv2 only
  Security group: ec2-sg

Auto Scaling Group:
  Multi-AZ across both public subnets
  Health check: EC2 + ELB
  Capacity Provider linked to ECS cluster (managed scaling on)
```

**Files:** `reelmart/infra/terraform/modules/ec2-asg/`.

---

### Phase 3 — Build & Push Service Images (Day 2, ~2 hr)
> Build the 10 microservice images and push to ECR.

```bash
# reelmart/infra/scripts/build-and-push.sh — first run manual, later GHA

ENV=dev
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-south-1

aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

for s in catalog order payment delivery notification whatsapp payout analytics return admin; do
  docker build --platform linux/amd64 -t reelmart/${s}-service ./reelmart/services/${s}-service
  docker tag  reelmart/${s}-service $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/reelmart/${s}-service:dev-latest
  docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/reelmart/${s}-service:dev-latest
done
```

> Build platform pinned to `linux/amd64` so images run on EC2 even when built on Apple Silicon.

---

### Phase 4 — Terraform: ECS Task Definitions + Services (Day 2, ~3 hr)
```
For each of the 10 services:
  - aws_ecs_task_definition: cpu=256, memory=512 (dev); env from Secrets Manager
  - aws_ecs_service: desired_count=1, deployment_controller=ECS (rolling), 
                    health check via target group /health
  - aws_appautoscaling_target + policy: per-service min/max from table above
```

**Files:** `reelmart/infra/terraform/modules/ecs-service/` + 10 instances in `environments/dev/services.tf`.

---

### Phase 5 — DNS + SSL (Day 3, ~1 hr)
```
1. Confirm reelmart.in zone exists in Route 53 (or import).
2. ACM cert for api-dev.reelmart.in (and api.reelmart.in for prod) — DNS validation.
3. Attach cert to ALB HTTPS listener (Terraform).
4. Route 53 alias:  api-dev.reelmart.in → ALB DNS name.
5. Update web env vars: NEXT_PUBLIC_API_URL=https://api-dev.reelmart.in
6. Update buyer-app config: API_BASE_URL=https://api-dev.reelmart.in
```

---

### Phase 6 — CI/CD via GitHub Actions OIDC (Day 3, ~2 hr)
> One reusable matrix workflow, path-filtered.

```
.github/workflows/
  ├── infra.yml         — terraform fmt/validate/plan on PR; apply on main (dev workspace)
  ├── deploy.yml        — matrix over the 10 services; only services with changed paths run
  └── _build-push.yml   — reusable: docker build, ECR push, ECS update-service

Auth: aws-actions/configure-aws-credentials@v4 with role-to-assume=arn:aws:iam::<acct>:role/reelmart-gha-deploy
Tag strategy: <env>-<git-sha> (immutable) + <env>-latest (rolling) per push to main.
```

**GitHub repo settings:**
```
Variables (not secrets):
  AWS_REGION         = ap-south-1
  AWS_ACCOUNT_ID     = <12-digit>
  AWS_DEPLOY_ROLE    = arn:aws:iam::<acct>:role/reelmart-gha-deploy
  ECS_CLUSTER_DEV    = reelmart-dev
```

---

### Phase 7 — Web App on Vercel (Day 4, ~1 hr)
> Single Vercel project for `reelmart/apps/web` (seller + admin + storefront + landing).

```
Vercel project root: reelmart/apps/web
Build env (dev):
  NEXT_PUBLIC_SUPABASE_URL=<dev project url>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<dev anon key>
  NEXT_PUBLIC_API_URL=https://api-dev.reelmart.in
Custom domains:
  - dev.reelmart.in   → dev branch / preview env
  - reelmart.in       → main branch / prod (Phase 7 prod cutover later)
```

> Path-based: `/`, `/seller`, `/admin`, `/s/<slug>`. No subdomains needed.

---

### Phase 8 — Buyer Mobile App (Day 5, ~1 day)
**Dev:** Expo internal testing — no store submission yet.
```
1. eas build --profile development --platform ios     → install via Expo dev client
2. eas build --profile preview     --platform android → APK shared internally
3. API_BASE_URL=https://api-dev.reelmart.in
```
**Prod (later):** `eas build --profile production` + `eas submit` to App Store / Play Store.

---

### Phase 9 — Monitoring (Day 5, ~1 hr)
```
CloudWatch alarms (Terraform-managed):
  - ECS service running_count < desired_count → SNS topic
  - ALB 5xx > 1% (5 min) → SNS
  - ALB target response time p95 > 2s → SNS
  - EC2 CPU > 85% (10 min) → SNS
SNS topic → email subscription (and Slack webhook later)
```

---

## Timeline (dev environment)

```
Day 0:  Phase 0       — AWS bootstrap
Day 1:  Phase 1 + 2   — Terraform network/ECS/ASG
Day 2:  Phase 3 + 4   — Build/push images + ECS services
Day 3:  Phase 5 + 6   — DNS/SSL + CI/CD OIDC
Day 4:  Phase 7       — Web on Vercel
Day 5:  Phase 8 + 9   — Mobile dev build + monitoring
────────────────────────────────────────────────────
Total: ~5 working days for dev, fully wired.
```

---

## Repo Layout (what gets added)

```
reelmart/
├── infra/
│   ├── terraform/
│   │   ├── modules/
│   │   │   ├── network/        (VPC, subnets, IGW, SGs)
│   │   │   ├── ecs-cluster/    (cluster, capacity provider)
│   │   │   ├── ec2-asg/        (launch template, ASG, scaling)
│   │   │   ├── alb/            (ALB, listeners, target groups, rules)
│   │   │   ├── ecr/            (10 repositories)
│   │   │   ├── ecs-service/    (task def + service + autoscaling)
│   │   │   ├── iam/            (task exec role, task role, OIDC role)
│   │   │   └── secrets/        (Secrets Manager containers)
│   │   ├── environments/
│   │   │   ├── dev/            (main.tf, services.tf, terraform.tfvars)
│   │   │   └── prod/           (later)
│   │   └── bootstrap/          (S3 state bucket, DynamoDB lock — one-time)
│   ├── scripts/
│   │   ├── build-and-push.sh
│   │   └── smoke-test.sh
│   └── test/                   (legacy CFN single-EC2 sandbox — kept, not used)
│
└── .github/workflows/
    ├── infra.yml
    ├── deploy.yml
    └── _build-push.yml
```

---

## Secrets (populated manually in AWS Secrets Manager once; Terraform creates the containers)

```
reelmart/dev/supabase    {url, anon_key, service_key}
reelmart/dev/razorpay    {key_id, key_secret, webhook_secret}
reelmart/dev/gupshup     {api_key, sender_number, app_name}
reelmart/dev/twilio      {sid, token, phone_number}
reelmart/dev/shiprocket  {email, password}
reelmart/dev/firebase    {service_account_json}
reelmart/dev/jwt         {secret}
```
> Keep the same key names for prod under `reelmart/prod/*`.

---

## Upgrade Path (when traffic grows)

```
Now (dev) → ~$40/mo, 1 EC2, 10 services × 1 task each
Prod cutover → ~$130/mo, 2 EC2 multi-AZ, scaling enabled
50k orders/month → migrate EC2 → private subnets + VPC endpoints; consider Fargate for spiky services
100k+ orders/month → split data plane (read replicas), CDN in front of ALB, Redis cache
```

---

## Ready to Start?

Phase 0 first (AWS bootstrap), then Terraform modules. Say **"start Phase 0"** and I'll lay down the bootstrap module + walk through the manual one-time steps before any Terraform apply.
