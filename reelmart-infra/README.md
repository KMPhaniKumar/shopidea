# reelmart-infra

Infrastructure-as-code and ops for **ReelMart**. This is a **self-contained module** currently living as the `reelmart-infra/` folder inside the `shopidea` monorepo — designed to be lifted out into its own repo once the app is stable (see `../EXTRACT_INFRA.md`). The application lives in the repo's `reelmart/` folder.

## Layout
```
reelmart-infra/
├── infra/
│   ├── terraform/             # source of truth (see infra/terraform/CLAUDE.md)
│   │   ├── bootstrap/         # state bucket + lock table + OIDC (run ONCE)
│   │   ├── modules/           # network, ecs-cluster, ecs-service, iam, secrets, alb, ecr, monitoring
│   │   └── environments/dev/  # network → cluster → services
│   ├── scripts/               # build-push / populate-secrets / smoke-test
│   └── .github-workflows/     # workflow templates
├── .github/workflows/         # infra.yml + maintenance.yml (activate after extraction)
├── .claude/                   # ops/infra agents + skills (deploy-service, tf-drift, …)
├── DEPLOYMENT_PLAN.md  DNS_RECORDS.md
```

## Cloud (current)
AWS `632127307144` / `ap-south-1`. ECS **Fargate** cluster `reelmart-dev` (10 services, **Fargate Spot**, **nightly scale-to-zero 22:00–08:00 IST**), ALB `api-dev.reelmart.in`, ECR, Secrets Manager `reelmart/dev/*`. State: S3 `reelmart-tf-state-632127307144` + DynamoDB `reelmart-tf-locks`.

## Working here
- **Change infra in Terraform, apply via TF — never raw AWS CLI.** Always `terraform plan` + review. Apply order **network → cluster → services**.
- AWS creds via SSO (`/aws-session`); CI uses OIDC role `reelmart-gha-deploy`.
- See `infra/terraform/CLAUDE.md` for detailed rules; `.claude/` for ops agents & skills.

> ⚠️ A night-time 503 from `api-dev.reelmart.in` is expected (scale-to-zero), not an incident.
