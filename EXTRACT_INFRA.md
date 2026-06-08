# EXTRACT_INFRA — splitting infra into its own repo (do this later)

ReelMart is a **single monorepo** (`shopidea`) for now. Infra is already a clean,
self-contained `infra/` directory, so it's lift-out ready. **Once the app is
stable**, use this recipe to extract infra + ops into a separate `reelmart-infra`
repo with history preserved. Until then, do nothing — everything stays here.

## What moves vs stays
| | stays in this repo (app) | → new `reelmart-infra` |
|---|---|---|
| code/docs | `reelmart/`, `agents_reports/`, `documents/`, `FLOWS/TRACKER/MICROSERVICES_TRACKER/DLT_SETUP` | `infra/`, `DEPLOYMENT_PLAN.md`, `DNS_RECORDS.md` |
| CI | `.github/workflows/{deploy.yml, maintenance.yml(dep-audit)}` | `infra/.github-workflows/infra.yml` → `.github/workflows/`, drift job |
| `.claude/agents` | `development/*`, `testing/*`, `security/{security-engineer, app-security-engineer}`, `architects/{product, data, data-security, app-security}` | `ops/*`, `security/infra-security-engineer`, `architects/{infrastructure, devops, infra-security}` |
| `.claude/skills` | 10 `<svc>-service`, `web-*`, `buyer-app`, `db-migrate`, `refresh-status` | `deploy-service`, `tf-drift`, `health-check`, `triage`, `aws-session` |
| `.claude` other | `guard.sh`, `stop-reminder.sh`, tailored `settings.json`/`CLAUDE.md` | `guard.sh`, tailored `settings.json`/`CLAUDE.md` |

## Recipe (history-preserving)
```bash
pip3 install --user git-filter-repo      # one-time
FR=~/Library/Python/3.9/bin/git-filter-repo

# 1) Build the infra repo from a fresh clone
git clone --no-local <this-repo> ~/Documents/GitHub/reelmart-infra
cd ~/Documents/GitHub/reelmart-infra
python3 "$FR" --path infra/ --path .claude/ --path .gitignore \
  --path README.md --path MAINTENANCE.md --path DEPLOYMENT_PLAN.md --path DNS_RECORDS.md
# then: git rm the app-only .claude agents/skills (see table); promote infra/.github-workflows/infra.yml
#       to .github/workflows/; tailor settings.json/CLAUDE.md/README/MAINTENANCE; commit.

# 2) Remove infra from THIS (app) repo
git rm -r infra DEPLOYMENT_PLAN.md DNS_RECORDS.md
git rm -r .claude/agents/ops .claude/agents/security/infra-security-engineer.md \
  .claude/agents/architects/{infrastructure-architect,devops-architect,infra-security-architect}.md \
  .claude/skills/{deploy-service,tf-drift,health-check,triage,aws-session}
# trim project-brief cross-repo refs; commit.
```

## Critical cutover (don't skip)
1. **OIDC trust** — role `reelmart-gha-deploy` trusts `repo:KMPhaniKumar/shopidea:*`
   in `infra/terraform/bootstrap/main.tf` (~line 83: `values = ["repo:${var.github_repo}:*"]`).
   Set `github_repo = "KMPhaniKumar/reelmart*"` (wildcard matches app + infra repos) or use a
   list, then **apply the bootstrap layer**. Both repos' CI fail OIDC until this is done.
2. **Secrets/vars** — app repo: `VERCEL_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`.
   infra repo: vars `AWS_DEPLOY_ROLE`, `AWS_REGION`; secret `AWS_DEPLOY_ROLE_ARN`.
3. **Terraform state is unchanged** (same S3 bucket + DynamoDB lock) — no state migration.
4. Branch protection + `CODEOWNERS` on the infra repo; consider a manual approval gate before `terraform apply`.

## Day-2 seam
`deploy-service` (build image) needs the app Dockerfiles → routine app deploys run from the
app repo's CI; the infra repo owns the cluster/task-defs/secrets they run on. When an app
change needs a new env var/secret/service, make the Terraform change in the infra repo first.
