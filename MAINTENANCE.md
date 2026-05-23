# ReelMart — AI-assisted maintenance

How this solo-maintained project stays healthy with Claude. The setup has four layers: **context** Claude reads automatically, **skills** you invoke, **agents** Claude delegates to, and **guardrails + automation** that run with little/no input.

> Canonical project status is always [`agents/AUDIT_gaps.md`](agents/AUDIT_gaps.md). Coding conventions are in [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

---

## 1. Context (auto-loaded)
- `.claude/CLAUDE.md` — root conventions + "start here" pointer.
- `agents/AUDIT_gaps.md` — canonical current status (architecture, features, gaps, test accounts).
- Nested `CLAUDE.md` files load when you work in that area:
  - `reelmart/services/CLAUDE.md` (backend microservices)
  - `infra/terraform/CLAUDE.md` (IaC rules)
  - `reelmart/apps/web/CLAUDE.md` (Next.js app)
- Long-term facts live in Claude's memory (`~/.claude/.../memory/`).

## 2. Skills — your runbooks (`/<name>`)
| Skill | Use it to |
|---|---|
| `/deploy-service <svc>` | Build → ECR → roll out a backend service to Fargate, then verify |
| `/health-check` | All 10 services: launch type, counts, target health, ALB probe |
| `/db-migrate` | See applied vs pending Supabase migrations and apply safely |
| `/tf-drift` | `terraform plan` all layers, summarize drift (read-only) |
| `/triage` | Investigate a failing service (events + logs + target health) |
| `/aws-session` | Check/refresh AWS SSO creds when commands expire |
| `/refresh-status` | Regenerate `agents/AUDIT_gaps.md` from live reality |

## 3. Agents — specialists Claude delegates to (`.claude/agents/`)
- **deployer** — ships service images to Fargate.
- **infra-guardian** — read-only Terraform/AWS drift review; never applies.
- **db-keeper** — Supabase schema/migration safety; never destructive.
- **ops-triage** — read-only incident investigation.

## 4. Guardrails + automation
- **Permissions** (`.claude/settings.json`): read-only `aws describe/list`, `terraform plan`, `git`, `gh`, `curl api-dev` are auto-approved; destructive ones still prompt; a few (`terraform destroy`, `apply -auto-approve`, `delete-cluster`, `db reset`, force-push, reading `.env`) are denied.
- **Hooks** (`.claude/hooks/`): `guard.sh` (PreToolUse) blocks catastrophic/secret commands; `stop-reminder.sh` nudges to refresh `AUDIT_gaps.md` after code/infra changes.
- **CI** (`.github/workflows/`):
  - `deploy.yml` — on push to `main`: build each service image → ECR → `ecs update-service`, deploy web to Vercel, `supabase db push` (needs secret `AWS_DEPLOY_ROLE_ARN`).
  - `maintenance.yml` — nightly **Terraform drift** check + weekly **dependency audit** via the OIDC role; failures notify you.

## Cadence
- **On change:** PR → `/review` (or `/security-review`) → merge → CI deploys → `/health-check`.
- **Daily (auto):** Terraform drift; (optional) a scheduled Claude agent for log triage via `/triage`.
- **Weekly (auto):** dependency audit; run `/refresh-status` to keep the canonical doc honest.
- **Monthly:** `/security-review`, dependency upgrades, secret rotation, a restore-from-backup test.

## One-time setup to finish
- Add GitHub Actions secret **`AWS_DEPLOY_ROLE_ARN`** = `arn:aws:iam::632127307144:role/reelmart-gha-deploy` (role already exists) — enables `deploy.yml` + `maintenance.yml`.
- Optional: schedule recurring Claude agents (log triage, weekly `/refresh-status`) with the `/schedule` skill.

## Extending
- New runbook → add `.claude/skills/<name>/SKILL.md`.
- New specialist → add `.claude/agents/<name>.md` (keep maintenance agents read-only by default).
- New guardrail → extend `.claude/hooks/guard.sh` or `.claude/settings.json`.
