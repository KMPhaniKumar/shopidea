# EXTRACT_INFRA — splitting infra into its own repo (do this later)

ReelMart is a **single monorepo** (`shopidea`). All infrastructure + ops is now
consolidated into the **self-contained `reelmart-infra/` folder** (its own
`infra/terraform`, ops docs, `.claude` agents/skills, and `.github/workflows`
ready to activate). So the future split is a **single-prefix extraction** — no
re-sorting needed. **Once the app is stable**, run this; until then, do nothing.

## Recipe (history-preserving)
```bash
pip3 install --user git-filter-repo      # one-time
FR=~/Library/Python/3.9/bin/git-filter-repo

# 1) Build the standalone infra repo: keep only reelmart-infra/, hoist it to root
git clone --no-local <this-repo> ~/Documents/GitHub/reelmart-infra
cd ~/Documents/GitHub/reelmart-infra
python3 "$FR" --path reelmart-infra/ --path-rename reelmart-infra/:
#   → infra/, .claude/, .github/workflows/{infra,maintenance}.yml, DEPLOYMENT_PLAN.md,
#     DNS_RECORDS.md, README/MAINTENANCE are now at the repo root, with history.
# create the GitHub repo + push:
#   git remote add origin https://github.com/KMPhaniKumar/reelmart-infra.git && git push -u origin main

# 2) Remove the module from THIS (app) repo
cd <this-repo>
git rm -r reelmart-infra
# remove the tf-drift job from .github/workflows/maintenance.yml (it now lives in the infra repo); commit.
```

## Critical cutover (don't skip)
1. **OIDC trust** — role `reelmart-gha-deploy` trusts `repo:KMPhaniKumar/shopidea:*`
   in `reelmart-infra/infra/terraform/bootstrap/main.tf` (~line 83: `values = ["repo:${var.github_repo}:*"]`).
   Set `github_repo = "KMPhaniKumar/reelmart*"` (wildcard matches the app + infra repos) or use a
   list, then **apply the bootstrap layer**. Both repos' CI fail OIDC until this is done.
2. **Secrets/vars** — app repo (shopidea→reelmart): `VERCEL_TOKEN`, `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`.
   infra repo: vars `AWS_DEPLOY_ROLE`, `AWS_REGION`; secret `AWS_DEPLOY_ROLE_ARN`. (The infra repo's
   `.github/workflows/{infra,maintenance}.yml` activate automatically once it's a repo root.)
3. **Terraform state is unchanged** (same S3 bucket + DynamoDB lock) — no state migration.
4. Branch protection + `CODEOWNERS` on the infra repo; consider a manual approval gate before `terraform apply`.

## Day-2 seam
`deploy-service` (build image) needs the app Dockerfiles in `reelmart/`; routine app deploys run from
the app repo's CI. The infra repo owns the cluster/task-defs/secrets they run on. When an app change
needs a new env var/secret/service, make the Terraform change in the infra repo first.
