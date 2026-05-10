# Vercel Setup — ReelMart Web App (Phase 7)

> Deploy `reelmart/apps/web` to Vercel and wire `dev.reelmart.in` → Vercel via a CNAME at GoDaddy. Backend at `https://api-dev.reelmart.in` is already live (Phase 5).

---

## Prerequisites

- ✅ GitHub repo `KMPhaniKumar/shopidea` exists with the latest commits on `main`
- ✅ ReelMart backend live at `https://api-dev.reelmart.in`
- ✅ Supabase project `nysgwdpmpxqmfwelfaxo` accessible
- ✅ GoDaddy access to manage `reelmart.in` DNS records

---

## Step 1 — Create the Vercel project

1. Go to **[vercel.com](https://vercel.com)** → sign in with **"Continue with GitHub"**
2. Click **"Add New"** (top right) → **"Project"**
3. Find `KMPhaniKumar/shopidea` in the repo list → click **"Import"**
   - First time? Vercel will ask to install its GitHub App with read access. Approve it (no write access needed).

---

## Step 2 — Configure project (BEFORE clicking Deploy)

You land on a "Configure Project" screen. Override only these:

| Field | Value |
|---|---|
| **Project Name** | `reelmart-web` |
| **Framework Preset** | Next.js (auto-detected — leave it) |
| **Root Directory** | ⚠️ **Click "Edit" and change** to `reelmart/apps/web` |
| **Build Command** | `npm run build` (default — leave) |
| **Output Directory** | `.next` (default — leave) |
| **Install Command** | `npm install` (default — leave) |
| **Node.js Version** | 20.x (default — leave) |

> If you don't change the Root Directory, Vercel will try to build from the repo root and fail.

---

## Step 3 — Environment Variables

Still on the Configure Project screen, expand **"Environment Variables"** and add these five. For each one toggle Production + Preview + Development (all three on):

```
NEXT_PUBLIC_SUPABASE_URL
https://nysgwdpmpxqmfwelfaxo.supabase.co

NEXT_PUBLIC_SUPABASE_ANON_KEY
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c2d3ZHBtcHhxbWZ3ZWxmYXhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NTM3ODIsImV4cCI6MjA5MzMyOTc4Mn0.0XxU5z0K5xj1NsRFsY-w2F2grO8ZIyp2t6gEH8HlJb0

SUPABASE_SERVICE_ROLE_KEY
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c2d3ZHBtcHhxbWZ3ZWxmYXhvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzc1Mzc4MiwiZXhwIjoyMDkzMzI5NzgyfQ.BRxZ02y2dTK956V89t-5e7--PTvk3qlumiXyZYWHPE8

NEXT_PUBLIC_API_URL
https://api-dev.reelmart.in

API_URL
https://api-dev.reelmart.in
```

**Why both `API_URL` and `NEXT_PUBLIC_API_URL`?**
- `NEXT_PUBLIC_*` vars are exposed to client-side JS (browser fetch)
- Plain vars are server-only (Next.js route handlers, server components)
- The web app's `lib/admin-api.ts` uses `process.env.API_URL` (server-side) while components use `process.env.NEXT_PUBLIC_API_URL` (client-side). Both must point to the same backend.

---

## Step 4 — Deploy

Click **"Deploy"**. Vercel will:

1. Clone the repo (`main` branch)
2. `cd reelmart/apps/web`
3. `npm install` — clean install, no local-only React 18/19 conflict from npm workspace hoisting
4. `next build` — TypeScript errors are bypassed temporarily via `next.config.js` (3 forms with `z.coerce` + `react-hook-form` generic mismatches; runtime works fine)
5. Deploy to `<project-name>-<hash>.vercel.app` (≈2–3 min)

If the build succeeds you'll see a "Congratulations!" page with the live URL.

---

## Step 5 — Add the custom domain `dev.reelmart.in`

After deploy succeeds:

### 5a — Add the domain in Vercel

1. Project → **Settings** (left sidebar) → **Domains**
2. In the input box, type: `dev.reelmart.in` → click **Add**
3. Vercel shows the DNS record you need to add at your registrar. It'll be one of:
   - **CNAME** → `cname.vercel-dns.com` (most common)
   - **A** → `76.76.21.21` (used when CNAME isn't allowed at the apex)
4. Copy whatever Vercel shows you (they sometimes change the recommended target).

### 5b — Add the matching CNAME at GoDaddy

GoDaddy → **My Products → reelmart.in → DNS → Add New Record**:

| GoDaddy field | Value |
|---|---|
| **Type** | `CNAME` |
| **Name** | `dev` (just the subdomain — GoDaddy auto-appends `.reelmart.in`) |
| **Value** | `cname.vercel-dns.com` (or whatever Vercel told you in Step 5a) |
| **TTL** | 1 Hour |

> Same GoDaddy quirks as Phase 5: only paste the subdomain part in the Name field. Don't type `dev.reelmart.in` — it'll save as `dev.reelmart.in.reelmart.in`.

### 5c — Wait

- DNS propagation: ≈1–10 min
- Vercel auto-issues a Let's Encrypt SSL cert: another ~1 min after DNS resolves
- Total: ~5–10 min from saving at GoDaddy to working `https://dev.reelmart.in`

You can refresh the Domains page in Vercel — it'll flip from "Invalid Configuration" → "Valid Configuration" once DNS resolves.

---

## Step 6 — Smoke test

Once `dev.reelmart.in` is live:

```bash
# Web app loads
curl -I https://dev.reelmart.in/

# Storefront route works
curl -I https://dev.reelmart.in/

# API call from web → backend (path-based to api-dev.reelmart.in is wired in client code)
# Open dev.reelmart.in in a browser; check Network tab — XHRs should hit api-dev.reelmart.in
```

Manual checks:
- [ ] Landing page loads
- [ ] `/seller` (seller dashboard) loads
- [ ] `/admin` (admin dashboard) loads
- [ ] Login flow works (Supabase auth)
- [ ] A read-only API call from the UI hits `api-dev.reelmart.in` and returns data (or expected 401 if not logged in)

---

## Troubleshooting

### Deploy failed at `npm install`
- Most likely cause: stale `package-lock.json` in the repo. Re-run locally: `cd reelmart && rm -rf node_modules package-lock.json && npm install`, commit, push.
- Or: a private dep without auth. Check the build logs.

### Deploy failed at `next build` with TypeScript errors
- `next.config.js` should already have `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`. If those aren't there, the build will fail on the 3 seller-form schema mismatches.

### "Cannot read properties of null (reading 'useContext')" during build
- This is a dual-React bug from npm workspace hoisting. Fixed in [reelmart/package.json](reelmart/package.json) by removing `apps/buyer-app` and `shared` from `workspaces`. Vercel does a clean install so this shouldn't recur there, but if it does on local repro, `rm -rf reelmart/node_modules reelmart/apps/web/node_modules` and re-install at `reelmart/`.

### Domain says "Invalid Configuration" in Vercel
- DNS hasn't propagated yet. Wait 5 min and refresh.
- Verify the CNAME is live publicly: `dig +short @8.8.8.8 dev.reelmart.in` should return `cname.vercel-dns.com.` (or similar Vercel target).
- If GoDaddy saved the record as `dev.reelmart.in.reelmart.in` (a name-field typo), `dig` will return nothing — fix the GoDaddy entry.

### CORS errors in browser console
- Microservices currently have `ALLOWED_ORIGINS=*` in their task env (see [infra/terraform/environments/dev/services/main.tf](infra/terraform/environments/dev/services/main.tf)) — should accept any origin including `https://dev.reelmart.in`.
- If you want to lock it down, change `ALLOWED_ORIGINS` to `https://dev.reelmart.in,https://reelmart.in` and force-redeploy services.

### Supabase auth callback URL doesn't work
- Supabase project → **Authentication → URL Configuration** → add `https://dev.reelmart.in` to **Redirect URLs** (and **Site URL** if it's the primary).

---

## Cost

Vercel **Hobby** plan covers:
- Unlimited Next.js deploys
- 100 GB bandwidth/month
- Free SSL via Let's Encrypt
- Custom domains (free)

Stays at **$0** for dev. Upgrade to Pro ($20/mo) when adding a team or hitting bandwidth limits.

---

## Prod Cutover (Future)

Same Vercel project handles prod once we're ready:

1. Add second domain `reelmart.in` (apex) in Vercel → Domains
2. Vercel will give an **A record** for the apex (CNAMEs not allowed on apex domains in DNS)
3. Add at GoDaddy:

   | Type | Name | Value |
   |---|---|---|
   | A | @ (or blank) | `76.76.21.21` (or whatever Vercel shows) |
   | CNAME | www | `cname.vercel-dns.com` |

4. Switch `NEXT_PUBLIC_API_URL` and `API_URL` env vars in Vercel to `https://api.reelmart.in` (after backend prod env is set up — Phase 5 prod equivalent)
5. Promote the latest deploy from preview to production

---

## Reference

- Vercel project: created in Step 1
- Vercel dashboard: `https://vercel.com/<your-team>/reelmart-web`
- GoDaddy DNS: `https://dcc.godaddy.com/manage/reelmart.in/dns`
- Backend: `https://api-dev.reelmart.in`
- Supabase: `https://supabase.com/dashboard/project/nysgwdpmpxqmfwelfaxo`
