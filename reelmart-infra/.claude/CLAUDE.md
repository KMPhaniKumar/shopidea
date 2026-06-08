# CLAUDE.md — reelmart-infra (infrastructure + ops)

This is ReelMart's **infrastructure-as-code and ops** module. It currently lives as the `reelmart-infra/` folder inside the `shopidea` monorepo and is **self-contained so it can be lifted out into its own repo later** (see `MIGRATION.md`). Open this folder as its own workspace to use the ops agents/skills here. The application (services, web, mobile, Supabase) is in the repo's `reelmart/` folder; canonical project status is `agents_reports/AUDIT_gaps.md` at the repo root.

## What's here
- `infra/terraform/` — **source of truth** for AWS. ECS Fargate cluster `reelmart-dev` (ap-south-1, account `632127307144`), ALB `api-dev.reelmart.in`, ECR, IAM, Secrets Manager, networking. Layers `environments/dev/{network,cluster,services}` (+ `modules/`, `bootstrap/`). S3 backend `reelmart-tf-state-632127307144`, DynamoDB locks `reelmart-tf-locks`.
- `infra/scripts/`, `infra/.github-workflows/` (templates), `.github/workflows/infra.yml` + `maintenance.yml` (activate when this becomes its own repo).
- Ops docs: `DEPLOYMENT_PLAN.md`, `DNS_RECORDS.md`.

## Rules (important)
- **Change infra in Terraform here, then apply — never via raw AWS CLI** (out-of-band changes cause drift). Always `terraform plan` and review; for risky changes `terraform plan -out=tfplan` → review → `terraform apply tfplan`. `terraform apply -auto-approve` / `terraform destroy` are blocked by the guard.
- Apply order: **network → cluster → services**. `cluster` is near-empty post EC2→Fargate migration.
- **Secrets:** AWS Secrets Manager `reelmart/dev/<name>`. Terraform owns the secret **shells**; values are set out-of-band and must **never** be committed or printed.
- AWS creds via SSO (`/aws-session`); automation uses GitHub OIDC role `reelmart-gha-deploy`.
- Dev cost controls are live (Fargate Spot + nightly scale-to-zero 22:00–08:00 IST). A night-time 503 from `api-dev.reelmart.in` is expected, not an incident.

## Agents & skills (this module)
- **Agents:** `ops/{infra-engineer, devops-engineer, ops-triage}`, `security/infra-security-engineer`, `architects/{infrastructure-architect, devops-architect, infra-security-architect}`.
- **Skills:** `/deploy-service` (build→ECR→roll a service; needs the app code in `reelmart/`), `/tf-drift`, `/health-check`, `/triage`, `/aws-session`.

## Cross-module
App code, DB migrations, and the app CI live in the repo's `reelmart/` (+ root `.claude`). This module owns the cluster/task-defs/secrets they run on.
