# DNS Records — `reelmart.in`

> Source of truth for every DNS-bound service in the ReelMart platform.
> Domain is registered + managed at **GoDaddy**. Nameservers stay on GoDaddy
> (no Route 53 migration). All records live in the GoDaddy DNS panel.

---

## Quick map

```
reelmart.in (GoDaddy DNS)
│
├── @ / apex          ──► AWS (Amplify/Route53 anycast IPs)   [legacy marketing — TBD]
├── www               ──► CNAME apex
│
├── dev               ──► Vercel        (Next.js web: seller + admin + storefront)
├── (reelmart.in)     ──► Vercel        (prod web — not wired yet)
│
├── api-dev           ──► AWS ALB       (10 ECS microservices, dev env)
├── (api)             ──► AWS ALB       (prod backend — not wired yet)
│
└── _acm-validation-* ──► AWS ACM       (CNAMEs proving domain ownership for SSL certs)
```

Supabase is **not** in DNS — it lives on its own `*.supabase.co` host that
clients hit directly (no GoDaddy record needed). Same goes for Razorpay,
Shiprocket, Gupshup — they're third-party APIs called from our backend.

---

## Active records (verified live, 2026-05-11)

| Name | Type | TTL | Points to | Purpose |
|---|---|---|---|---|
| `reelmart.in` (apex) | `A` | 3600 | `76.223.105.230`, `13.248.243.5` | Currently AWS Amplify/Global-Accelerator anycast — likely an old marketing landing or placeholder. Needs review before prod cutover (Phase 8). |
| `www.reelmart.in` | `CNAME` | 3600 | `reelmart.in` | Standard www → apex alias |
| `dev.reelmart.in` | `CNAME` | 3600 | `cname.vercel-dns.com` | **Vercel web app** (`shopidea` project). Added 2026-05-11. SSL auto-issued by Vercel via Let's Encrypt. |
| `api-dev.reelmart.in` | `CNAME` | 3600 | `reelmart-dev-alb-1685112985.ap-south-1.elb.amazonaws.com` | **AWS ALB** fronting 10 ECS microservices (catalog, orders, payments, delivery, whatsapp, etc.). SSL: ACM cert on the ALB. |
| `_acm-validation-*.reelmart.in` | `CNAME` | 3600 | `*.acm-validations.aws` | One per ACM cert — proves to AWS we own the domain so it can issue/renew SSL. Leave forever. |
| `reelmart.in` NS | `NS` | 3600 | `ns59.domaincontrol.com`, `ns60.domaincontrol.com` | GoDaddy's nameservers — domain is managed at GoDaddy. |

> No MX records currently. Email (`hello@reelmart.in`) is not yet configured.

---

## Per-service breakdown

### 1. `dev.reelmart.in` → Vercel (web frontend, dev)

**What lives here:** Next.js app from [`reelmart/apps/web`](reelmart/apps/web/) — the seller dashboard, admin console, public storefront `/s/<slug>`, and marketing landing.

**Vercel project:**
- Project name: `shopidea`
- Team scope: `reelmart`
- Project ID: `prj_if3bC7Hobe17HEsRMzRf6VmfW9hI`
- Default URL: `https://shopidea.vercel.app`
- Custom domain: `dev.reelmart.in`
- Root Directory: `reelmart/apps/web`
- Framework: `nextjs`
- Auto-deploys: `main` branch

**DNS record to add at GoDaddy:**

| Type | Name | Value | TTL |
|---|---|---|---|
| `CNAME` | `dev` | `cname.vercel-dns.com` | 1 Hour |

**Why CNAME and not A:** Vercel runs an anycast edge — their IPs change. A CNAME lets them rotate IPs without us touching DNS.

**SSL:** Vercel auto-issues a Let's Encrypt cert when the CNAME first resolves. No action needed. Cert auto-renews every 60 days.

**Verify it's working:**
```bash
dig +short dev.reelmart.in @8.8.8.8
# should return: cname.vercel-dns.com. + Vercel IPs

curl -I https://dev.reelmart.in/
# should return: HTTP/2 200
```

---

### 2. `api-dev.reelmart.in` → AWS ALB (backend microservices, dev)

**What lives here:** 10 Node.js/Express microservices running on ECS (EC2 launch type) in `ap-south-1`. Path-based routing on the ALB sends `/api/catalog/*` to catalog service, `/api/orders/*` to orders service, etc.

**AWS setup:**
- ALB DNS: `reelmart-dev-alb-1685112985.ap-south-1.elb.amazonaws.com`
- Listener: HTTPS:443 (TLS 1.2/1.3) + HTTP:80 → 301 redirect
- SSL: AWS ACM cert (free), validated via DNS CNAME at GoDaddy
- ECS cluster: 3× t3.small EC2 instances, 10 services × 1 task each

**DNS records at GoDaddy:**

| Type | Name | Value | Purpose |
|---|---|---|---|
| `CNAME` | `api-dev` | `reelmart-dev-alb-1685112985.ap-south-1.elb.amazonaws.com` | Routes traffic to the ALB |
| `CNAME` | `_<random>.api-dev` | `_<random>.acm-validations.aws` | Proves to ACM we own the domain (needed once, kept forever for cert renewal) |

**Why CNAME and not A:** AWS ALB IPs are dynamic — they scale with load and can change without notice. CNAME to the AWS-assigned ALB DNS name is the only supported pattern.

**Verify it's working:**
```bash
dig +short api-dev.reelmart.in @8.8.8.8
# returns ALB DNS name + the ALB's current IPs

curl -I https://api-dev.reelmart.in/api/catalog/health
# returns 200 (or 401 if auth required)
```

---

### 3. `reelmart.in` apex + `www` → currently AWS, prod-TBD

**Current state:** The apex resolves to two AWS anycast IPs (`76.223.105.230`, `13.248.243.5`) — probably leftover from an Amplify or other earlier marketing setup. Not currently used by the platform.

**Plan (Phase 8 — prod cutover):** Repoint to Vercel so `reelmart.in` serves the prod build of the same Next.js app. Vercel requires:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `76.76.21.21` (or whatever Vercel shows in the Domains tab) |
| `CNAME` | `www` | `cname.vercel-dns.com` |

Apex (`@`) can't be a CNAME per DNS spec — must be an A record. Vercel exposes a single anycast IP for that case.

---

### 4. Supabase — no DNS record needed

**What it is:** Database + Auth + Storage + Realtime, all on Supabase Cloud.

**Host:** `nysgwdpmpxqmfwelfaxo.supabase.co` (Supabase's own domain).

**How clients reach it:** Hardcoded in env vars on both Vercel and ECS:
- `NEXT_PUBLIC_SUPABASE_URL=https://nysgwdpmpxqmfwelfaxo.supabase.co`
- Used by the web app (browser + server components) and every microservice.

**Why no DNS record here:** Supabase doesn't currently support custom domains on the free tier. Even if it did, exposing the project ref in the URL is acceptable — the security boundary is the anon key + RLS policies, not the hostname.

---

### 5. Third-party APIs (Razorpay, Shiprocket, Gupshup, Firebase)

**No DNS records needed.** All called over HTTPS from our backend microservices using their public domains:

| Service | Host | Used by |
|---|---|---|
| Razorpay | `api.razorpay.com` | `payments` service |
| Shiprocket | `apiv2.shiprocket.in` | `delivery` service |
| Gupshup | `api.gupshup.io` | `whatsapp` service |
| Firebase FCM | `fcm.googleapis.com` | `notification` service |

Credentials live in AWS Secrets Manager (`reelmart/dev/<service>`), not in DNS.

---

## How to add / change a DNS record (GoDaddy)

1. Go to [https://dcc.godaddy.com/manage/reelmart.in/dns](https://dcc.godaddy.com/manage/reelmart.in/dns)
2. Click **Add New Record**
3. Pick **Type** (usually `A` or `CNAME`)
4. **Name field — important:**
   - For a subdomain like `dev.reelmart.in`, type just `dev` (the bare label)
   - GoDaddy auto-appends `.reelmart.in`
   - ❌ Typing `dev.reelmart.in` saves it as `dev.reelmart.in.reelmart.in` (double-suffix bug)
5. **Value:** the target (e.g. `cname.vercel-dns.com` for Vercel, an ALB DNS for AWS)
6. **TTL:** `1 Hour` is fine. Lower (`600`) for frequent changes; longer for stable records.
7. Save.

**Propagation time:** 1–10 min globally. Check from outside your machine:
```bash
dig +short <name>.reelmart.in @8.8.8.8       # Google DNS
dig +short <name>.reelmart.in @1.1.1.1       # Cloudflare DNS
```

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `dig` returns nothing after 10 min | Name field saved with full FQDN → `dev.reelmart.in.reelmart.in` | Edit the record in GoDaddy; Name should be just the subdomain label |
| Vercel says "Invalid Configuration" | DNS hasn't propagated yet | Wait 5 min, then refresh the Vercel Domains page |
| `curl https://...` → SSL error right after CNAME save | Let's Encrypt / ACM hasn't issued the cert yet | Wait ~1 min after DNS resolves; certs auto-issue |
| Cert won't renew automatically | The `_acm-validation-*` CNAME was deleted | Re-add the CNAME ACM emitted; leave it forever |
| Browser still hits old IP | Local DNS cache | `sudo dscacheutil -flushcache` (macOS) or wait for TTL |

---

## Production cutover (Phase 8, future)

When ready to ship prod:

1. Add **prod backend** record: `CNAME api → <prod-alb-dns>`
2. Add **prod web** records:
   - `A @ → 76.76.21.21` (Vercel apex)
   - `CNAME www → cname.vercel-dns.com`
3. In Vercel, add `reelmart.in` and `www.reelmart.in` to the `shopidea` project's Domains.
4. Update Vercel env vars: `NEXT_PUBLIC_API_URL` and `API_URL` → `https://api.reelmart.in`
5. Promote the latest preview deploy to production.
6. Remove the legacy apex A records (`76.223.105.230`, `13.248.243.5`) once Vercel is live and traffic has shifted.

---

## Reference

- GoDaddy DNS panel: [https://dcc.godaddy.com/manage/reelmart.in/dns](https://dcc.godaddy.com/manage/reelmart.in/dns)
- Vercel project: [https://vercel.com/reelmart/shopidea](https://vercel.com/reelmart/shopidea)
- AWS Route53 / ACM console (cert management): ap-south-1
- Backend deployment plan: [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md)
- Vercel CLI: `vercel inspect <url>`, `vercel logs <url>`, `vercel env ls`
