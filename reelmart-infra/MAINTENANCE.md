# reelmart-infra — AI-assisted maintenance

Ops for the infra module. App-side maintenance is at the repo root (`reelmart/`).

## Skills (`/<name>`)
| Skill | Use it to |
|---|---|
| `/deploy-service <svc>` | Build → ECR → roll out a backend service to Fargate (needs the app code in `reelmart/`; routine deploys go via the app CI) |
| `/tf-drift` | `terraform plan` all layers, summarize drift (read-only) |
| `/health-check` | All 10 services: launch type, counts, target health, ALB probe |
| `/triage` | Investigate a failing service (events + logs + target health) |
| `/aws-session` | Check/refresh AWS SSO creds |

## Agents (`.claude/agents/<team>/`)
- **ops/** — `infra-engineer` (Terraform plan→review→apply + drift), `devops-engineer` (CI/CD, deploys, rollbacks), `ops-triage` (read-only incidents).
- **security/** — `infra-security-engineer` (audit & harden AWS via Terraform).
- **architects/** — `infrastructure-architect`, `devops-architect`, `infra-security-architect`.

## Guardrails
- `.claude/hooks/guard.sh` blocks `terraform destroy`, `terraform apply -auto-approve`, `aws ecs delete-cluster`, deleting the deploy role, and modifying the TF state bucket.
- `settings.json` allows read-only AWS + `terraform plan/validate/fmt`; denies destructive ops.

## CI
- `.github/workflows/infra.yml` + `maintenance.yml` activate **once this is its own repo**. While nested in `shopidea`, drift runs from the monorepo's root `.github/workflows/maintenance.yml`.

## Extraction
To split this module into its own repo later, see `../EXTRACT_INFRA.md` (it's now a single-prefix split — `git filter-repo --path reelmart-infra/`).
