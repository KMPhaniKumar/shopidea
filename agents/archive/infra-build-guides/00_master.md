# Master Agent — Deployment Index & Conventions

> Read this first. Then execute phases in order.

## How to use these agents

Each phase agent is self-contained. Hand any one of them to a fresh Claude Code session along with this master file and the parent `infra/` directory; the session has everything it needs to execute that phase.

Each agent has the same structure:
1. **Goal** — what success looks like.
2. **Prerequisites** — the previous phase that must be complete.
3. **Inputs** — values the operator must provide (account ID, domain, etc.).
4. **Steps** — exact commands, in order. Idempotent where possible.
5. **Deliverables** — the resources / files that exist after success.
6. **Validation** — the checks that prove the phase is done.
7. **Common pitfalls** — mistakes seen elsewhere; avoid these.
8. **Rollback** — how to undo if you have to.

## Phase order (do not skip)

| Phase | Agent file                       | Title                          | ~Time |
|-------|----------------------------------|--------------------------------|-------|
| 0     | `01_aws_bootstrap.md`            | AWS account bootstrap          | 1 hr  |
| 1     | `02_network_ecs.md`              | Network + ECS foundation       | 2 hr  |
| 2     | `03_ec2_asg.md`                  | EC2 Auto Scaling Group         | 1 hr  |
| 3     | `04_build_push.md`               | Build & push 10 service images | 1 hr  |
| 4     | `05_ecs_services.md`             | ECS task defs + services       | 2 hr  |
| 5     | `06_dns_ssl.md`                  | Route 53 + ACM (HTTPS)         | 1 hr  |
| 6     | `07_cicd_oidc.md`                | GitHub Actions OIDC + workflows| 2 hr  |
| 7     | `08_vercel_web.md`               | Web on Vercel                  | 1 hr  |
| 8     | `09_mobile_dev.md`               | Buyer mobile dev build         | 1 day |
| 9     | `10_monitoring.md`               | CloudWatch alarms + SNS        | 1 hr  |

Phases 0–4 are blocking — you can't start phase N until phase N-1 has been validated. Phases 5+ can be parallelized (DNS, CI/CD, web, mobile, monitoring don't depend on each other).

## Global conventions

### Environments
- `dev` — first target of every phase. Smaller sizing, looser security (SSH from operator IPs allowed).
- `prod` — applied later by re-running the same phases against `environments/prod/`.

### Naming
- All resources prefixed `reelmart-<env>-<resource>` (e.g., `reelmart-dev-alb`).
- ECR repos: `reelmart/<service>-service`.
- ALB target groups: `reelmart-<env>-tg-<service>` (must be ≤ 32 chars).
- Image tags: `<env>-<git-sha>` (immutable) plus `<env>-latest` (rolling).

### Tags (every resource)
```
Project     = reelmart
Environment = dev | prod
ManagedBy   = terraform
Owner       = platform
```

### Region
- `ap-south-1` (Mumbai). Hardcoded — do not parameterize. If we ever need a second region we'll fork.

### Terraform layout
- Bootstrap (state bucket + lock + OIDC) lives in `infra/terraform/bootstrap/`. Run **once per AWS account**, manually, with local state initially, then migrate to S3 backend.
- Modules in `infra/terraform/modules/` — all reusable, all documented with input/output blocks.
- Environments in `infra/terraform/environments/<env>/` — compose modules with env-specific inputs.

### State key convention (S3 backend)
```
infra/<env>/<layer>.tfstate
```
where `<layer>` is one of: `network`, `cluster`, `services`, `dns`, `monitoring`. Splitting reduces blast radius.

### Secrets
- All secrets live in AWS Secrets Manager.
- Terraform creates the **container** (`aws_secretsmanager_secret`).
- Values are populated **once, manually** via `infra/scripts/populate-secrets.sh` (interactive). Terraform never sees the secret value.
- Service tasks read via `secrets:` block in the task definition (env vars injected by ECS at startup).

### CI auth
- GitHub OIDC + IAM role (`reelmart-gha-deploy`). No long-lived AWS keys in GitHub.

## Required tools (operator's machine)

```
aws --version          # AWS CLI v2
terraform version      # >= 1.7
docker --version       # 24+ with buildx
gh --version           # GitHub CLI
jq --version           # 1.6+
```

## Required external accounts

- AWS (with billing alerts set up — $50 dev, $200 prod)
- A domain registered: `reelmart.in` (via any registrar; we host DNS in Route 53)
- Supabase Cloud (free tier — one project per env)
- Vercel (Hobby — one project total)
- Razorpay, Shiprocket, Gupshup, Twilio, Firebase — credentials needed by Phase 1 (containers created) and populated before Phase 4 (services start consuming).

## Inputs the operator must produce before Phase 0

| Variable                     | Where to find it                                  |
|------------------------------|---------------------------------------------------|
| `AWS_ACCOUNT_ID`             | AWS Console → top-right                          |
| `OPERATOR_IP_CIDR`           | `curl ifconfig.me` + `/32`                        |
| `GITHUB_REPO`                | `<owner>/<repo>` (e.g., `KMPhaniKumar/shopidea`)  |
| `DOMAIN_NAME`                | `reelmart.in`                                     |
| `DEV_API_SUBDOMAIN`          | `api-dev.reelmart.in`                             |
| `DEV_WEB_SUBDOMAIN`          | `dev.reelmart.in`                                 |
| `SUPABASE_DEV_PROJECT`       | created in Supabase dashboard                     |

Once those exist, start Phase 0.
