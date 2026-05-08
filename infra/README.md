# ReelMart Infrastructure

Terraform + AWS infra for the ReelMart platform. Two environments: `dev` and `prod`. Region: `ap-south-1` (Mumbai).

> This folder is intentionally self-contained so it can be lifted into its own repo (`reelmart-infra`) later without surgery.

## Folder layout

```
infra/
├── README.md                  ← you are here
├── DIAGRAM.md                 ← full architecture diagram
├── agents/                    ← phase-by-phase execution playbooks
│   ├── 00_master.md           ← index + execution order + global conventions
│   ├── 01_aws_bootstrap.md    ← Phase 0  (one-time AWS account prep)
│   ├── 02_network_ecs.md      ← Phase 1  (VPC, ALB, cluster, ECR, IAM, secrets)
│   ├── 03_ec2_asg.md          ← Phase 2  (launch template + ASG)
│   ├── 04_build_push.md       ← Phase 3  (build + push 10 service images)
│   ├── 05_ecs_services.md     ← Phase 4  (task definitions + services + autoscaling)
│   ├── 06_dns_ssl.md          ← Phase 5  (Route 53 + ACM)
│   ├── 07_cicd_oidc.md        ← Phase 6  (GitHub Actions OIDC + matrix workflow)
│   ├── 08_vercel_web.md       ← Phase 7  (web on Vercel)
│   ├── 09_mobile_dev.md       ← Phase 8  (buyer app dev build via EAS)
│   └── 10_monitoring.md       ← Phase 9  (CloudWatch alarms + SNS)
├── terraform/
│   ├── bootstrap/             ← state bucket + lock table + OIDC provider (run ONCE, manually)
│   ├── modules/               ← reusable modules
│   │   ├── network/           ← VPC, subnets, IGW, SGs
│   │   ├── ecs-cluster/       ← ECS cluster + capacity provider
│   │   ├── ec2-asg/           ← launch template, ASG, scaling policies
│   │   ├── alb/               ← ALB, listeners, target groups, rules
│   │   ├── ecr/               ← 10 repositories
│   │   ├── ecs-service/       ← task def + service + autoscaling (per-service)
│   │   ├── iam/               ← task exec role, task role, OIDC role
│   │   ├── secrets/           ← Secrets Manager containers (values populated manually)
│   │   └── monitoring/        ← CloudWatch alarms + SNS topics
│   └── environments/
│       ├── dev/               ← composes modules with dev-sized inputs
│       └── prod/              ← later
├── scripts/
│   ├── build-and-push.sh      ← build + push all service images for an env
│   ├── populate-secrets.sh    ← guided one-time secret value population
│   └── smoke-test.sh          ← curl /health on every service via ALB
└── .github-workflows/         ← workflow files to drop into .github/workflows/ at repo root
    ├── infra.yml              ← terraform fmt/validate/plan on PR; apply on main (dev)
    ├── deploy.yml             ← matrix build+push+deploy across 10 services, path-filtered
    └── _build-push.yml        ← reusable workflow called by deploy.yml
```

## Execution order

Follow [agents/00_master.md](agents/00_master.md). Phases must run in order — each one depends on the previous.

## Local prerequisites

- Terraform ≥ 1.7
- AWS CLI v2, configured with an IAM user that has admin (for bootstrap) — later swapped for an SSO profile
- Docker (with `linux/amd64` build support — `docker buildx` is included on Docker Desktop)
- `jq`, `gh` (GitHub CLI)

## State

- Backend: S3 bucket `reelmart-tf-state-<account-id>` (versioned, encrypted)
- Lock: DynamoDB table `reelmart-tf-locks` (LockID partition key)
- Workspaces: `dev`, `prod` (separated by state key, not just workspace, to avoid accidental cross-env applies)

## Conventions

- All resources tagged: `Project=reelmart`, `Environment=<env>`, `ManagedBy=terraform`
- All names prefixed: `reelmart-<env>-<resource>` (e.g., `reelmart-dev-alb`)
- All ALB target groups: `reelmart-<env>-tg-<service>` (max 32 chars)
- ECR repositories: `reelmart/<service>-service` (e.g., `reelmart/order-service`)
- Image tags: `<env>-<git-sha>` (immutable) plus `<env>-latest` (rolling)

## What's NOT in this repo

- The 10 microservice source code (lives in `reelmart/services/<service>-service/`)
- The web app (`reelmart/apps/web/` — deploys to Vercel, no AWS)
- The buyer mobile app (`reelmart/apps/buyer-app/` — deploys via Expo EAS, no AWS)
- Supabase project config (managed in the Supabase dashboard for each env)

When this folder is moved to its own `reelmart-infra` repo, the GitHub Actions workflows here will need to be configured to access the application repo via deploy keys or `repository_dispatch` events to push images on app commits.
