# ReelMart — Security Audit & Findings

**Audit date:** 2026-06-08 · **Auditor:** `security-engineer` (whole-project, read-only) · **Status:** findings open, no code changed.
**Scope:** 10 backend services, Next.js web, Expo buyer-app, Supabase migrations (001–020), Terraform infra, GitHub Actions CI.

> All findings confirmed against actual code (file:line). This is the canonical tracker — update **Status** as items are fixed.
> Severity counts at audit time: **4 Critical · 9 High · 9 Medium · 5 Low.**

## Status tracker

| ID | Severity | Title | Owner | Status |
|----|----------|-------|-------|--------|
| CRIT-1 | Critical | `ALLOWED_ORIGINS="*"` — wildcard CORS on all services | infra/backend | Open |
| CRIT-2 | Critical | Admin layout auth bypass in `NODE_ENV=development` | ui/app-sec | Open |
| CRIT-3 | Critical | `test-login` enabled on live dev (admin session to anyone) | backend/infra | Open |
| CRIT-4 | Critical | catalog product delete/availability — no ownership check (IDOR) | backend | Open |
| HIGH-1 | High | payment `/verify` marks any order paid (no buyer check) | backend | Open |
| HIGH-2 | High | `/create-order` trusts client `amount` | backend | Open |
| HIGH-3 | High | analytics & payout list — no store ownership check (IDOR) | backend | Open |
| HIGH-4 | High | `GET /orders` & `/orders/:id` — no ownership check (IDOR) | backend | Open |
| HIGH-5 | High | `PUT /orders/:id/status` — no seller ownership check (IDOR) | backend | Open |
| HIGH-6 | High | public store endpoints `select('*')` leak PAN/GST/Aadhaar | backend | Open |
| HIGH-7 | High | Next.js 14.1.0 — multiple critical CVEs | ui/app-sec | Open |
| HIGH-8 | High | coupon delete — no ownership check (IDOR) | backend | Open |
| HIGH-9 | High | `/notifications/register-token` unauthenticated | backend | Open |
| MED-1 | Medium | `stores` RLS can't restrict PII columns (anon `select('*')`) | database | Open |
| MED-2 | Medium | `users` "public names" policy exposes `phone` | database | Open |
| MED-3 | Medium | CORS code fallback allows-all when unset | backend | Open |
| MED-4 | Medium | returns get/list — no ownership check (IDOR) | backend | Open |
| MED-5 | Medium | signature compare not timing-safe | backend | Open |
| MED-6 | Medium | `test-login` second enable path via `SITE_URL` | backend | Open |
| MED-7 | Medium | Fargate tasks have public IPs in public subnets | infra-sec | Open |
| MED-8 | Medium | bank-account GET accepts arbitrary `sellerId` (IDOR) | backend | Open |
| MED-9 | Medium | operator IP committed in bootstrap `terraform.tfvars` | infra-sec | Open (verify) |
| LOW-1 | Low | `followed_stores` publicly enumerable (buyer_ids) | database | Open |
| LOW-2 | Low | admin settings GET is public | backend | Open |
| LOW-3 | Low | whatsapp webhook has no Gupshup signature check | backend | Open |
| LOW-4 | Low | stale Shiprocket secrets shipped to delivery-service | infra | Open |
| LOW-5 | Low | `recovery_window_in_days=0` on all secrets | infra | Open |

---

## CRITICAL

### CRIT-1 — `ALLOWED_ORIGINS="*"` wildcard CORS on all 10 services
**Location:** `reelmart-infra/infra/terraform/environments/dev/services/main.tf:52` (`base_env`).
Each service does `cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins })`; with `"*"` it reflects any `Origin` with `Access-Control-Allow-Credentials: true`.
**Impact:** any web page can make credentialed cross-origin calls to every endpoint. *Nuance:* these APIs authenticate via **Bearer tokens (Authorization header), not cookies**, so the cross-site-credential/CSRF risk is materially lower than a cookie-auth app — but it should still be locked down.
**Fix:** set `ALLOWED_ORIGINS` to `https://dev.reelmart.in,https://reelmart.in` in Terraform (mirror `AUTH_BRIDGE_ALLOWED_ORIGINS`); redeploy. **Owner:** infra-engineer (+ MED-3 code fallback).

### CRIT-2 — Admin dashboard auth bypass under `NODE_ENV=development`
**Location:** `reelmart/apps/web/app/admin/(dashboard)/layout.tsx:7–16`.
The dev branch renders the full admin dashboard without the `getUser()` / `is_admin` check.
**Impact:** not exploitable on Vercel prod (NODE_ENV=production), but full admin exposure on local/preview and one env-var away from prod. **Fix:** remove the bypass; use the (scoped) test-login for a real dev admin session. **Owner:** ui-engineer.

### CRIT-3 — `test-login` active on the live dev API (mints admin sessions)
**Location:** `reelmart/services/admin-service/src/routes/auth.ts:204–208` + `reelmart-infra/infra/terraform/.../services/main.tf:151–153` (`ALLOW_TEST_LOGIN=true`).
Enabled by `ALLOW_TEST_LOGIN=true` **and** by `SITE_URL` containing `dev.reelmart.in`; the `requireAllowedOrigin` guard only checks the `Origin` header (spoofable via curl).
**Impact:** anyone who can reach `api-dev.reelmart.in` can mint a full **admin** Supabase session (test account `+919999900003`) with no OTP.
**Fix options:** (a) **harden** — require a shared secret header, not just Origin; remove the `SITE_URL` enable path; (b) leave as-is (accept dev risk); (c) remove test-login. **Decision pending (product/owner call).** **Owner:** backend-engineer + infra-engineer.

### CRIT-4 — catalog product delete / availability: no ownership check (IDOR)
**Location:** `reelmart/services/catalog-service/src/routes/products.ts` — `DELETE /products/:id` (75–78), `PUT /products/:id/availability` (82–91), `GET /products?storeId=` (9–18).
`PUT /products/:id` correctly checks `stores.seller_id == req.user.id`; the others don't.
**Impact:** any authenticated user can delete or toggle any seller's product, or enumerate any store's products.
**Fix:** apply the same ownership pre-check to DELETE and availability; gate or remove the open `GET ?storeId=`. **Owner:** backend-engineer.

---

## HIGH

### HIGH-1 — payment `/verify` marks any order paid without buyer check
**Location:** `reelmart/services/payment-service/src/routes/payments.ts:80–100`. Update is `.eq('id', orderId)` with no `buyer_id`. **Fix:** add `.eq('buyer_id', req.user.id)` and confirm the DB `razorpay_order_id` matches. (New `/confirm` flow is safer; harden or retire `/verify`.) **Owner:** backend-engineer.

### HIGH-2 — `/create-order` trusts client `amount`
**Location:** `payment-service/src/routes/payments.ts:13–32`. **Fix:** when `orderId` given, verify buyer ownership and use `order.total_amount` as the Razorpay amount. **Owner:** backend-engineer.

### HIGH-3 — analytics & payout list endpoints: no store ownership check (IDOR)
**Location:** `analytics-service/src/routes/analytics.ts:8–51`; `payout-service/src/routes/payouts.ts:9–30`. Accept `storeId` and query `supabaseAdmin` without verifying `req.user.id` owns the store. **Impact:** read any seller's revenue/payouts. **Fix:** verify `stores.seller_id == req.user.id` (admin path via `requireAdmin`). **Owner:** backend-engineer.

### HIGH-4 — `GET /orders` & `GET /orders/:id`: no ownership check (IDOR)
**Location:** `order-service/src/routes/orders.ts:60–85`. Returns any/all orders incl. `delivery_address` (name/phone/address). **Fix:** force `buyer_id = req.user.id` (or seller's store); post-fetch ownership check on `/:id`. **Owner:** backend-engineer.

### HIGH-5 — `PUT /orders/:id/status`: no seller ownership check (IDOR)
**Location:** `order-service/src/routes/orders.ts:88–117`. Any user can set any order's status; leaks buyer phone via notify. **Fix:** verify the order's store belongs to `req.user.id`. **Owner:** backend-engineer.

### HIGH-6 — public store endpoints `select('*')` leak KYC/PII
**Location:** `catalog-service/src/routes/stores.ts:37–55` (`/stores/:slug`, `/stores/:id/products`, `/stores`). Returns `pan_number`, `aadhaar_url`, `gst_number`, `selfie_path`, `pan_doc_path` to unauthenticated callers. **Fix:** explicit safe-column allowlist. **Owner:** backend-engineer (DB view → MED-1).

### HIGH-7 — Next.js 14.1.0 critical CVEs
**Location:** `reelmart/apps/web/package.json` (`next 14.1.0`). `npm audit` flags middleware authz bypass (GHSA-f82v-jwr5-mffw), SSRF in Server Actions, redirect SSRF, etc. **Fix:** upgrade Next.js (run `tsc --noEmit` after). **Owner:** ui-engineer.

### HIGH-8 — coupon delete: no ownership check (IDOR)
**Location:** `admin-service/src/routes/coupons.ts:54–57`. Create checks ownership; delete doesn't. **Fix:** verify the coupon's store belongs to `req.user.id`. **Owner:** backend-engineer.

### HIGH-9 — `/notifications/register-token` unauthenticated
**Location:** `notification-service/src/routes/notifications.ts:31–41`. Anyone can register an FCM token for any `userId` → notification interception. **Fix:** add `requireAuth`; require `req.user.id === userId`. **Owner:** backend-engineer.

---

## MEDIUM

### MED-1 — `stores` RLS can't restrict PII columns
`supabase/migrations/002_stores.sql:33–35`. Row policy `is_active=true` can't hide KYC columns from anon `select('*')`. **Fix:** safe-column **view**; revoke direct table read. **Owner:** database-engineer. (Pairs with HIGH-6.)

### MED-2 — `users` "Public user names visible" policy exposes `phone`
`supabase/migrations/001_users.sql:28–32` — `USING (true)` SELECT policy makes `users.phone` publicly readable via any direct client (permissive policies OR together). **Fix:** drop it; own-profile `USING (id = auth.uid())`; expose only `id,name` via a view if needed. **Owner:** database-engineer.

### MED-3 — CORS code fallback allows-all when unset
All 10 `index.ts`: `!allowedOrigins ? true …`. **Fix:** deny-all fallback: `origin: allowedOrigins?.length ? allowedOrigins : false`. **Owner:** backend-engineer.

### MED-4 — returns get/list: no ownership check (IDOR)
`return-service/src/routes/returns.ts:53–67`. **Fix:** check `buyer_id == req.user.id || store.seller_id == req.user.id`. **Owner:** backend-engineer.

### MED-5 — signature compare not timing-safe
`payment-service/src/lib/razorpay.ts:17–19` uses `===`. **Fix:** `crypto.timingSafeEqual(...)` in `verifySignature` + `verifyWebhookSignature`. **Owner:** backend-engineer.

### MED-6 — `test-login` second enable path via `SITE_URL`
`admin-service/src/routes/auth.ts:204–208`. Can't be disabled by env alone. **Fix:** only enable via explicit `ALLOW_TEST_LOGIN`; remove `SITE_URL`/`localhost` conditions. **Owner:** backend-engineer. (Pairs with CRIT-3.)

### MED-7 — Fargate tasks have public IPs in public subnets
`modules/ecs-service/variables.tf:63–67`, `.../services/main.tf:173`. SG limits :3000 to the ALB, but a future SG slip exposes services directly. **Fix:** private subnets + NAT, or explicit deny-all ingress from `0.0.0.0/0`. **Owner:** infra-security-engineer.

### MED-8 — bank-account GET accepts arbitrary `sellerId` (IDOR)
`payout-service/src/routes/bankAccounts.ts:9–12`. **Fix:** drop the `sellerId` query param; always use `req.user.id`. **Owner:** backend-engineer.

### MED-9 — operator IP committed in bootstrap tfvars
`reelmart-infra/infra/terraform/bootstrap/terraform.tfvars:3` (`operator_ip_cidr`). **Verify** whether it's git-tracked; if so, scrub history, use a `.example`, gitignore `terraform.tfvars`. **Owner:** infra-security-engineer.

---

## LOW

### LOW-1 — `followed_stores` publicly enumerable
`supabase/migrations/010_followed_stores.sql:15–16` `USING (true)` exposes all `buyer_id`s. **Fix:** aggregate count via function/column, or restrict to `buyer_id = auth.uid()`. **Owner:** database-engineer.

### LOW-2 — admin settings GET is public
`admin-service/src/routes/settings.ts:7–11` — fees/commission/flags readable unauthenticated. **Fix:** add `requireAuth`. **Owner:** backend-engineer.

### LOW-3 — whatsapp webhook lacks Gupshup signature verification
`whatsapp-service/src/routes/whatsapp.ts:10–21`. **Fix:** verify `X-Gupshup-Signature` before processing. **Owner:** backend-engineer.

### LOW-4 — stale Shiprocket secrets shipped to delivery-service
`.../services/main.tf:73–75,117` + secrets module default. Unused (NimbusPost is live). **Fix:** remove from `delivery-service.extra_secrets` and the secrets list. **Owner:** infra-engineer.

### LOW-5 — `recovery_window_in_days=0` on all secrets
`modules/secrets/main.tf:6`. Instant unrecoverable deletion. **Fix:** set `7` even in dev. **Owner:** infra-engineer.

---

## Top 5 to fix first
1. **CRIT-1** — lock `ALLOWED_ORIGINS` to real domains (one-line Terraform + redeploy).
2. **CRIT-3 / MED-6** — close the `test-login` exposure (harden with a secret, drop the `SITE_URL` path).
3. **CRIT-2** — remove the admin `NODE_ENV=development` auth bypass.
4. **CRIT-4 + HIGH-4/5 (+HIGH-3/8, MED-4/8, HIGH-9)** — add ownership/auth checks across catalog/order/analytics/payout/returns/coupons/bank-account + auth on register-token (the IDOR sweep).
5. **HIGH-6** — column allowlist on public store endpoints (stop PAN/Aadhaar leakage).

## Notes
- Auth is **Bearer-token** based (not cookies), which lowers real-world severity of CORS (CRIT-1) and some CSRF angles — still fix, but prioritize the **IDOR** and **PII-leak** items, which are directly exploitable.
- The new payment `/confirm` flow already creates orders only after server-side signature verification; HIGH-1/HIGH-2 concern the legacy `/create-order`+`/verify` path.
