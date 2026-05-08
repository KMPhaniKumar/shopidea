# Phase 7 — Web on Vercel

> Deploy the single Next.js app at `reelmart/apps/web/` to Vercel: landing + seller dashboard + admin dashboard + storefront, all path-based on one domain.

## Goal
- One Vercel project hooked to the GitHub repo.
- Production target: `reelmart.in` (kept off until prod cutover).
- Preview / dev target: `dev.reelmart.in`.
- Vercel auto-deploys on every push to `main` (preview deployments on branches/PRs).

## Prerequisites
- Phase 5 (DNS hosted zone exists; we'll add CNAMEs/aliases pointing at Vercel)
- Backend reachable at `https://api-dev.reelmart.in` (Phase 5 outcome)
- Supabase **dev** project created (separate URL + anon key)

## Inputs
- `VERCEL_TEAM_OR_USER` — your Vercel scope
- `SUPABASE_DEV_URL`
- `SUPABASE_DEV_ANON_KEY`
- `DEV_API_URL = https://api-dev.reelmart.in`

## Steps

### 7.1 — Create the Vercel project (manual, web UI)
1. https://vercel.com → New Project → import the GitHub repo.
2. **Root Directory**: `reelmart/apps/web`
3. Framework preset: Next.js (auto-detected).
4. Install command: leave default (`npm install`).
5. Build command: leave default (`next build`).
6. Output directory: leave default (`.next`).

### 7.2 — Set environment variables (in the Vercel project settings)
Mark each one for the right environments (Production / Preview / Development):

| Key                              | Value                       | Environments        |
|----------------------------------|-----------------------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL`       | `<dev project url>`         | Preview, Dev        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | `<dev anon key>`            | Preview, Dev        |
| `NEXT_PUBLIC_API_URL`            | `https://api-dev.reelmart.in` | Preview, Dev      |
| `SUPABASE_SERVICE_KEY`           | `<dev service key>`         | Preview, Dev (secret) |

Do NOT set Production values yet — that environment is dormant until prod cutover.

### 7.3 — Wire up dev domain
1. Vercel project → Settings → Domains → add `dev.reelmart.in`.
2. Vercel shows you a CNAME target (something like `cname.vercel-dns.com`).
3. Add to Route 53:
```hcl
# environments/dev/dns.tf
resource "aws_route53_record" "dev_web" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "dev.reelmart.in"
  type    = "CNAME"
  ttl     = 300
  records = ["cname.vercel-dns.com"]   # or whatever Vercel told you
}
```
```bash
terraform apply
```
4. In Vercel, click "Refresh" on the domain — it'll show "Valid Configuration" within a minute.

### 7.4 — Trigger first deploy
```bash
# A push to any branch triggers a Preview deploy on Vercel
git commit --allow-empty -m "ci: kick first vercel preview"
git push
```

## Deliverables
- Vercel project linked to the repo, root `reelmart/apps/web`
- `dev.reelmart.in` resolving to a Vercel deployment of `main`
- Auto-deploy: every PR creates a preview URL; merge to `main` updates `dev.reelmart.in`

## Validation
```bash
# DNS resolves
dig dev.reelmart.in +short
# → CNAME chain ending at a Vercel IP

# App responds
curl -I https://dev.reelmart.in/
# → HTTP/2 200, x-vercel-cache header

# API connectivity from the deployed app:
# Open https://dev.reelmart.in/seller/login and watch the network tab —
# OTP/login request should hit api-dev.reelmart.in
```

Path-based surfaces all reachable:
- `https://dev.reelmart.in/`               → landing page
- `https://dev.reelmart.in/seller/login`   → seller login
- `https://dev.reelmart.in/admin`          → admin dashboard (if seller has admin claim)
- `https://dev.reelmart.in/s/<slug>`       → public storefront

## Common pitfalls
- **Wrong root directory.** If the project root is the repo root instead of `reelmart/apps/web`, Vercel installs the entire monorepo and may build the wrong thing or hit rate limits.
- **Missing env vars at build time.** `NEXT_PUBLIC_*` vars are baked at build, not runtime. Forget one and the deployed bundle fetches `undefined/api/...`.
- **Service key exposed.** Never set `SUPABASE_SERVICE_KEY` in the **client** (`NEXT_PUBLIC_*`). Only in server-side code (Route Handlers / Server Components).
- **CORS issues hitting api-dev.** The microservices need to allow the dev origin. Set `ALLOWED_ORIGINS=https://dev.reelmart.in` in the relevant service env (via Secrets/plain task env in Phase 4).
- **Stale Vercel cache.** When you change env vars, redeploy — Vercel doesn't auto-rebuild on env-var change.
- **CNAME at apex.** `reelmart.in` apex must be an ALIAS (Route 53 supports this for Vercel via the `cname.vercel-dns.com` ALIAS workaround, or use Vercel's IP A-record per their docs). For dev we only use `dev.` subdomain so this doesn't bite yet.

## Rollback
- Vercel → Deployments → Promote a previous deployment to `dev.reelmart.in`.
- Or remove the domain from the Vercel project; the Route 53 CNAME still resolves to `cname.vercel-dns.com` but Vercel returns 404 unmatched.

## Next: Phase 8
Hand off to `09_mobile_dev.md`.
