# ReelMart — AI-assisted maintenance

How this solo-maintained project stays healthy with Claude. The setup has four layers: **context** Claude reads automatically, **skills** you invoke, **agents** Claude delegates to, and **guardrails + automation** that run with little/no input.

> Canonical project status is always [`agents_reports/AUDIT_gaps.md`](agents_reports/AUDIT_gaps.md). Coding conventions are in [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

---

## 1. Context (auto-loaded)
- `.claude/CLAUDE.md` — root conventions + "start here" pointer.
- `agents_reports/AUDIT_gaps.md` — canonical current status (architecture, features, gaps, test accounts).
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
| `/refresh-status` | Regenerate `agents_reports/AUDIT_gaps.md` from live reality |

**Per-service knowledge skills** (one per backend service — deep context: endpoints, owned tables, integrations, auth/ownership, gotchas). The `backend-engineer` invokes the matching one before working on a service:
`/admin-service` · `/analytics-service` · `/catalog-service` · `/delivery-service` · `/notification-service` · `/order-service` · `/payment-service` · `/payout-service` · `/return-service` · `/whatsapp-service`

**UI knowledge skills** (front-end surfaces — routes, components, design tokens, flows, gotchas). The `ui-engineer` invokes the relevant one:
`/web-foundation` (read first: tokens, Supabase SSR, auth, deploy) · `/web-storefront` (public buyer) · `/web-seller-dashboard` · `/web-admin-dashboard` · `/buyer-app` (Expo mobile)

Agents↔skills: `backend-engineer`→`<svc>-service` · `ui-engineer`→web-*/`buyer-app` · `infra-engineer`→`tf-drift`/`aws-session`/`health-check` · `devops-engineer`→`deploy-service`/`health-check`/`triage` · `database-engineer`→`db-migrate`.

## 3. Agents — your team (`.claude/agents/<team>/`)
Organized into teams (folders are organizational — Claude delegates by agent **name**). Architects design & write ADRs; engineers implement; security reviews & fixes.

**architects/** — design & advise
- **product-architect** — end-to-end system design & technical strategy
- **infrastructure-architect** — AWS/Terraform target-state, scaling, cost, DR
- **devops-architect** — CI/CD, environments, release/rollback, observability strategy
- **infra-security-architect** — IAM / network / secrets / encryption design
- **app-security-architect** — authn/authz, API, payment, threat models
- **data-architect** — Supabase data model, indexing, migrations governance
- **data-security-architect** — RLS strategy, PII/KYC, retention, compliance

**development/** — build
- **backend-engineer** — the 10 Express/TS microservices
- **ui-engineer** — Next.js web + Expo buyer-app
- **database-engineer** — Supabase schema/migrations/RLS/data (+ read-only migration-sync check)

**ops/** — operate & ship
- **infra-engineer** — Terraform/AWS infra changes (+ read-only drift review)
- **devops-engineer** — CI/CD, deploys, releases, observability, rollback
- **ops-triage** — read-only incident investigation

**security/** — review & fix
- **security-engineer** — whole-project security (app + infra + data); reviews, threat-models, coordinates
- **app-security-engineer** — finds & fixes app/service vulnerabilities
- **infra-security-engineer** — audits & hardens AWS via Terraform

**testing/** — write, run & maintain tests *(framework is greenfield — agents bootstrap it: Vitest+Supertest / Playwright / k6)*
- **qa-lead** — testing strategy, framework setup, CI test pipeline, coverage; coordinates the specialists
- **api-test-engineer** — backend endpoint tests (incl. authz/ownership)
- **ui-test-engineer** — Playwright web screens (mobile-first)
- **e2e-test-engineer** — full seller→buyer→delivery lifecycle
- **performance-test-engineer** — k6 load/spike (read paths only; dev env)
- **db-integrity-test-engineer** — atomicity, calc correctness, RLS isolation
- **notification-test-engineer** — Gupshup/FCM/MSG91 (mocked, never real sends)

> Supersedes the earlier flat set: `deployer`→**devops-engineer**, `db-keeper`→**database-engineer**, `infra-guardian`→**infra-engineer** (drift-review mode).

## 4. Guardrails + automation
- **Permissions** (`.claude/settings.json`): read-only `aws describe/list`, `terraform plan`, `git`, `gh`, `curl api-dev` are auto-approved; destructive ones still prompt; a few (`terraform destroy`, `apply -auto-approve`, `delete-cluster`, `db reset`, force-push, reading `.env`) are denied.
- **Hooks** (`.claude/hooks/`): `guard.sh` (PreToolUse) blocks catastrophic/secret commands; `stop-reminder.sh` nudges to refresh `AUDIT_gaps.md` after code/infra changes.
- **CI** (`.github/workflows/`):
  - `deploy.yml` — on push to `main`: build each service image → ECR → `ecs update-service`, deploy web to Vercel, `supabase db push`. Assumes the OIDC role via its hardcoded ARN (`reelmart-gha-deploy`); each service deploys independently (a single failed build no longer blocks the rest).
  - `maintenance.yml` — nightly **Terraform drift** check + weekly **dependency audit** via the OIDC role; failures notify you.

## Cadence
- **On change:** PR → `/review` (or `/security-review`) → merge → CI deploys → `/health-check`.
- **Daily (auto):** Terraform drift; (optional) a scheduled Claude agent for log triage via `/triage`.
- **Weekly (auto):** dependency audit; run `/refresh-status` to keep the canonical doc honest.
- **Monthly:** `/security-review`, dependency upgrades, secret rotation, a restore-from-backup test.

## One-time setup to finish
- `deploy.yml` now uses the OIDC role's **hardcoded** ARN (`reelmart-gha-deploy`), so no `AWS_DEPLOY_ROLE_ARN` secret is needed for it. (`maintenance.yml` may still reference that secret — set it if you enable that workflow.) Web/DB jobs still need `VERCEL_*` / `SUPABASE_*` secrets.
- Optional: schedule recurring Claude agents (log triage, weekly `/refresh-status`) with the `/schedule` skill.

## Extending
- New runbook → add `.claude/skills/<name>/SKILL.md`.
- New specialist → add `.claude/agents/<team>/<name>.md` under the right team (architects / development / ops / security).
- New guardrail → extend `.claude/hooks/guard.sh` or `.claude/settings.json`.
