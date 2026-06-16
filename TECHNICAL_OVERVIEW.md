# ReelMart — Complete Technical Overview

> **Audience:** New engineers joining the ReelMart team.
> **Goal:** Read this one document and understand the whole system — what it does, how it's built, where it runs, how it's secured, how it's deployed, and how a single order flows end-to-end from seller registration to delivery.
> **Status snapshot:** 2026-06-16. Code lives in `reelmart/`; infra-as-code in `reelmart-infra/infra/terraform/`. The canonical "what's done vs pending" file is [`agents_reports/AUDIT_gaps.md`](agents_reports/AUDIT_gaps.md) — when this doc and that one disagree, trust the more recent one and the code.

---

## 1. What ReelMart Is

ReelMart is a **unified social-commerce platform for Indian micro-sellers** who sell on WhatsApp and Instagram. It gives each seller a hosted **storefront, catalogue, order management, payments, and courier delivery** behind a single shareable link. Buyers browse a marketplace (web + mobile), place orders, pay (COD or online), and track delivery; sellers manage everything from a dashboard; admins moderate sellers and run the platform.

**Three actors / roles:** `buyer`, `seller`, `admin`.

**India-specific by design:** prices in ₹, phone numbers in `+91XXXXXXXXXX`, 6-digit pincodes, GST/PAN KYC, phone-OTP-first auth, Hindi text supported.

---

## 2. High-Level Architecture

```
                          ┌──────────────────────────────────────────────┐
   Buyers / Sellers /     │  Clients                                     │
   Admins                 │  • Web (Next.js 14, Vercel)  dev.reelmart.in │
                          │  • Mobile (Expo/React Native, buyer-app)     │
                          └───────────────┬──────────────────────────────┘
                                          │ HTTPS
                   ┌──────────────────────┼───────────────────────────────┐
                   │                      │                               │
        ┌──────────▼─────────┐  ┌─────────▼───────────┐      ┌────────────▼───────────┐
        │ Supabase (managed) │  │ AWS (ap-south-1)    │      │ Third-party APIs       │
        │ • Postgres + RLS   │  │ ALB api-dev.reelmart│      │ • Razorpay (payments)  │
        │ • Auth (sessions)  │  │  .in → 10 ECS        │      │ • NimbusPost (courier) │
        │ • Storage (buckets)│  │  Fargate services    │      │ • Gupshup (WhatsApp)   │
        │ • Realtime         │  │ ECR · Secrets Mgr ·  │      │ • Firebase FCM (push)  │
        │ • Edge Functions   │  │ IAM · Terraform IaC  │      │ • MSG91 (OTP/SMS)      │
        └────────────────────┘  └─────────────────────┘      │ • Google Maps (Places) │
                                                              └────────────────────────┘
```

- **The backend is 10 independent microservices**, not a monolith. They share one Supabase project as their database/auth and talk to the third-party APIs.
- **The web app and mobile app talk to two things:** the Supabase project directly (for RLS-protected reads/writes and auth sessions) and the backend ALB (`https://api-dev.reelmart.in`) for anything needing privileged logic or a third-party integration.
- **Infrastructure is 100% Terraform-managed.** Change infra in Terraform, then apply — never via raw AWS CLI (avoids drift).

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| **Web** | Next.js 14 (App Router), TypeScript, Tailwind CSS, Zustand, React Hook Form + Zod, hosted on **Vercel** (`dev.reelmart.in`, Vercel project `shopidea`) |
| **Mobile** | React Native + **Expo SDK 54**, TypeScript, React Navigation, Zustand, built via **EAS** (`buyer-app`; `seller-app` is parked) |
| **Backend** | 10 × Node.js + **Express** + TypeScript microservices, each on port 3000 with a `/health` endpoint |
| **Backend hosting** | **AWS ECS Fargate** (cluster `reelmart-dev`, `ap-south-1`, account `632127307144`), images in ECR, behind ALB |
| **Database / Auth / Storage / Realtime** | **Supabase** (Postgres + RLS + Auth + Storage + Realtime + Edge Functions), project `nysgwdpmpxqmfwelfaxo` |
| **IaC** | **Terraform** (S3 + DynamoDB state backend) |
| **CI/CD** | **GitHub Actions** (OIDC to AWS), Vercel deploy, `supabase db push`, EAS for mobile |
| **Payments** | **Razorpay** (orders, signature verification, refunds, webhooks); RazorpayX payouts pending |
| **Courier** | **NimbusPost** (v1 email/password API; per-seller inline pickup) |
| **Messaging** | WhatsApp via **Gupshup**, push via **Firebase FCM**, SMS + login OTP via **MSG91** |
| **Maps** | **Google Maps Places** (autocomplete, details, reverse-geocode) via server-side proxy |

---

## 4. Repository Layout

```
shopidea/                          (git root)
├── reelmart/
│   ├── services/                  10 backend microservices
│   │   ├── admin-service/         auth bridge + platform admin
│   │   ├── analytics-service/
│   │   ├── catalog-service/       products, stores, reviews
│   │   ├── delivery-service/      NimbusPost
│   │   ├── notification-service/  WhatsApp/SMS/push
│   │   ├── order-service/         cart + orders
│   │   ├── payment-service/       Razorpay
│   │   ├── payout-service/        seller settlements
│   │   ├── return-service/        returns/refunds
│   │   └── whatsapp-service/      Gupshup broadcasts + inbound webhook
│   ├── apps/
│   │   ├── web/                   Next.js 14 (storefront + seller + admin)
│   │   ├── buyer-app/             Expo mobile (active)
│   │   └── seller-app/            parked
│   ├── supabase/migrations/       001 … 032 SQL migrations (source of truth for schema)
│   └── shared/types/              generated Supabase types
├── reelmart-infra/
│   └── infra/terraform/           bootstrap / modules / environments/dev/{network,cluster,services}
├── agents_reports/                AUDIT_gaps.md, SECURITY_AUDIT.md, ADRs
├── .github/workflows/             CI/CD pipelines
├── .claude/                       AI-maintenance skills + agents + conventions (CLAUDE.md)
├── README.md · MAINTENANCE.md · TRACKER.md · FLOWS.md · TECHNICAL_OVERVIEW.md (this file)
```

---

## 5. Backend Microservices

All services share these conventions:
- **Port 3000**, `GET /health` returns `{ status: 'ok', service }`.
- **Build:** `npm run build` (tsc → `dist/`). **Run:** `node dist/index.js`. Two-stage `node:22-alpine` Dockerfile.
- **Response shape:** `{ success: true, data }` or `{ success: false, error, code? }`.
- **Validation:** Zod on every request body.
- **DB access:** Supabase **service-role** client (`SUPABASE_SERVICE_KEY`) — bypasses RLS, so services enforce ownership *in code*.
- **User auth:** `requireAuth` validates the caller's Supabase JWT via `supabaseAdmin.auth.getUser(token)` and sets `req.user.id`. `requireAdmin` additionally checks `users.is_admin`.
- **Service-to-service auth:** `requireInternalKey` checks the shared `x-internal-key` (`INTERNAL_API_KEY`) header.
- **Config/secrets:** environment variables injected from AWS Secrets Manager at task start.

| Service | ALB path | Responsibility | Key endpoints (representative) |
|---|---|---|---|
| **admin** | `/api/admin/*` | **Auth bridge** + platform admin (users, stores, coupons, settings) | `POST /auth/msg91-exchange`, `POST /auth/check-phone`, `GET/PUT /users`, `GET /stores`, `*/coupons`, `GET/PUT /settings` |
| **catalog** | `/api/catalog/*` | Products, stores/storefront, reviews, follow | `GET /stores`, `GET /stores/:slug`, `POST/PUT /products`, `POST /reviews`, `GET /my-store` |
| **order** | `/api/orders/*` | Cart + order lifecycle | `POST /orders`, `GET /orders`, `PUT /orders/:id/status`, `POST /orders/:id/cancel`, `*/cart/*` |
| **payment** | `/api/payments/*` | Razorpay | `POST /create-order`, `POST /confirm`, `POST /verify`, `POST /webhook`, `POST /refund` |
| **delivery** | `/api/delivery/*` | NimbusPost courier | `POST /rates`, `POST /create-shipment`, `POST /track`, `POST /pickup/register` (internal), NDR endpoints |
| **notification** | `/api/notifications/*` | WhatsApp + SMS + FCM push | `POST /register-token`, `POST /order-update` (internal), `POST /order-placed`, `POST /push/whatsapp` |
| **payout** | `/api/payouts/*` | Seller settlements, bank accounts | `GET /payouts`, `GET /summary`, `POST /process` (admin), `GET/POST /bank-account` |
| **return** | `/api/returns/*` | Returns + refund kickoff | `POST /returns`, `PUT /returns/:id/approve|reject` |
| **analytics** | `/api/analytics/*` | Store + platform analytics | `GET /store`, `GET /store/top-products`, `GET /platform` (admin) |
| **whatsapp** | `/api/whatsapp/*` | Gupshup broadcasts + inbound webhook | `POST /broadcast`, `POST /webhook?store=<slug>` |

### The Authentication Bridge (critical to understand)

Login is **not** Supabase Phone/Twilio. It is MSG91 OTP → a bridge in **admin-service** → a real Supabase session:

1. **Web:** the MSG91 **widget** (`lib/msg91-otp.ts`) collects the phone, sends/verifies the OTP, and returns a short-lived MSG91 `accessToken`. **Mobile:** uses Supabase native phone OTP directly (same phone identity).
2. Client `POST /api/admin/auth/msg91-exchange { accessToken, role?, createIfMissing? }`.
3. admin-service verifies the token with MSG91, extracts the phone, then **finds-or-creates** an `auth.users` record using a **synthetic email** (`<digits>@reelmart.local`) and a **deterministic password** `HMAC-SHA256(phone, AUTH_BRIDGE_SECRET)`.
4. It mirrors the user into `public.users` (`phone_verified=true`, role), calls `signInWithPassword` server-side, and returns the Supabase session tokens.
5. The client calls `supabase.auth.setSession(...)` and is now logged in. All subsequent calls carry the Supabase JWT.
6. Hardening: origin allow-list (`AUTH_BRIDGE_ALLOWED_ORIGINS`, fail-closed), `createIfMissing:false` on login so unknown numbers can't auto-register, self-heal of orphaned `auth.users`.

**Admins** log in differently — email + password (native Supabase) at `/admin/login`, gated on `users.is_admin`.

### Inter-service calls

| Caller | Callee | Purpose | Auth |
|---|---|---|---|
| order-service | notification-service | order status change → notify buyer | `x-internal-key` |
| return-service | payment-service | approve return → issue refund | Bearer (caller's token) |
| web admin route | delivery-service | approve store → register pickup | `x-internal-key` |
| web admin route | notification-service | address-change approved/rejected | `x-internal-key` |
| seller dashboard | delivery-service | mark packed → create shipment | Bearer (seller's token) |

---

## 6. Web App (`reelmart/apps/web`)

Next.js 14 App Router, one deployment serving **three surfaces**:

**Public storefront / marketplace:** `/` (marketplace home, stores by category + auto-scroll product carousels), `/stores`, `/stores/[category]`, `/store/[slug]`, `/store/[slug]/product/[id]`, `/store/[slug]/checkout`, `/order/[id]` (confirmation), `/track/[awb]`, plus buyer `/profile`, `/addresses`, `/orders`.

**Seller dashboard** `/seller/*`: `(auth)` register/login (MSG91 OTP), `(dashboard)` gated by `components/seller/SellerGate.tsx` (approval status) — dashboard, products CRUD + variants + images, orders (realtime), analytics, customers, marketing/coupons, payouts, settings (store info, **pickup address with Google Places + current location**, KYC view, Open/Closed toggle).

**Admin dashboard** `/admin/*`: login (email/password, `is_admin`), sellers list + `/admin/sellers/[id]` (KYC review, approve/reject/suspend), orders + `/admin/orders/[id]` (NimbusPost tracking timeline), payments, payouts, returns, **address-changes** (approve/reject), analytics, settings, and a **live notification popup** for new seller registrations / address changes.

**Next.js API route handlers** (`app/api/*`) run server-side (often with the **service-role** key, never shipped to the browser):
- `places/autocomplete`, `places/details`, `places/reverse` — Google Maps proxy (keeps the key server-side, avoids CORS).
- `admin/login`, `admin/pending-approvals`, `admin/stores/[id]` (**the real store-approval path** — triggers NimbusPost pickup registration on approve), `admin/stores/[id]/address-change|suspend|verify-gst|pan-verify`.
- `seller/onboard`, `seller/address-change`, `seller/my-store`, `seller/pickup/sync`, `seller/signature`.

**Auth/session libs:** `lib/supabase/client.ts` (browser, anon key), `lib/supabase/server.ts` (SSR, cookie-based), service-role client in route handlers; `middleware.ts` refreshes session cookies on `/admin/*` and `/seller/*`. **Gotcha:** `next.config.js` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` = true, so **run `npx tsc --noEmit` yourself** before pushing.

---

## 7. Mobile App (`reelmart/apps/buyer-app`)

Expo SDK 54 / React Native, package id `in.reelmart.buyer`, EAS project `8c61695c-…`.

- **Navigation:** native stack + bottom tabs (Home, Cart, Orders, Profile) plus Storefront, Checkout, Payment, OrderTracking, Addresses, LocationPicker, Wishlist, Reviews, Returns.
- **Auth:** Supabase native phone OTP (`authStore`), session persisted to AsyncStorage; FCM token registered on login.
- **Services/libs:** `cartService`, `orderService`, `discoveryService`, `returnService`, `reviewService`, `profileService`; `lib/api.ts` (Bearer-attaching fetch wrapper), `lib/supabase.ts`, `lib/savedAddresses.ts` (mirrors the web address lib; guest addresses in AsyncStorage merge into Supabase on login), `lib/geocode.ts` (GPS + reverse geocode for "use current location").
- **Realtime:** order status subscriptions for live tracking.
- **Build/deploy:** `eas.json` profiles — `development` (dev client), `preview` (installable **APK** / iOS **simulator** build, internal), `production` (store). Env (`EXPO_PUBLIC_*`) carries Supabase, API URL, and Google Maps key. Mobile is **not** part of the web deploy — it ships via `eas build`.

---

## 8. Data Model (Supabase Postgres)

Schema is defined by **sequential SQL migrations `001`–`032`** in `reelmart/supabase/migrations/` (the source of truth). Highlights:

| Table | Purpose / key columns |
|---|---|
| `users` | `id` (=`auth.users.id`), `phone` (unique), `role` (buyer/seller/admin), `is_admin`, KYC/login fields (`full_name`, `email`, `password_hash`, `phone_verified`), loyalty/referral |
| `stores` | one per seller (`seller_id` unique). `store_slug` (auto), `category`, address (`address/area/city/state/pincode`), `is_active`, `is_open` (+ hours), `approval_status` (pending/approved/rejected), `suspended`, ratings, `pickup_*` (NimbusPost lifecycle), `pickup_contact_name/phone/email`, `pan_number`/`gst_number` (+ `*_verified`), `signature_path`. *(`pan_doc_path`/`selfie_path` were dropped in migration 032.)* |
| `products` (+ `product_variants`) | `store_id`, `price`, `compare_price`, `images[]`, `stock_type`/`stock_count`, `is_available`, full-text `search_vector` |
| `orders` | `order_number` (`ORD-<seq>`), `store_id`, `buyer_id`, `status` (pending→accepted→packed→shipped→delivered, +rejected/cancelled/return_*), `payment_status`/`payment_method`, Razorpay ids, `items` (JSONB snapshot), money columns, `delivery_address` (JSONB snapshot), `awb_code`/`tracking_url`/`label_url`/`courier_name`, `notification_sent` |
| `addresses` | buyer delivery addresses: `user_id`, `label`, `name`, `phone`, `line1/line2/area/city/state/pincode`, `is_default` |
| `store_address_changes` | seller address-change requests pending admin approval (`proposed` JSONB, `status`, one open per store) |
| `reviews` | per delivered order, auto-updates store rating; seller can reply |
| `returns` | buyer-initiated, seller/admin approve→refund via payment-service |
| `bank_accounts`, `payouts` | seller settlement (5% platform fee; RazorpayX disbursement pending) |
| `coupons` (+ `coupon_uses`), `coin_transactions`, `wishlists`, `followed_stores`, `cart_items` | marketing + buyer features |
| `platform_settings`, `announcements` | admin-managed key/values + broadcasts |
| `seller_verification` (view) | `SECURITY DEFINER` view scoped to `auth.uid()`; exposes verification flags and the master gate `features_unlocked = approval_status='approved' AND NOT suspended` |

**Triggers worth knowing:** order status → stock adjust (deduct on accept, restore on cancel/reject), delivered → award loyalty coins, review insert/update → recompute store rating, store insert → auto-slug.

---

## 9. Security Model

Security is layered: **RLS (rows) + column grants (columns) + application ownership checks + signed URLs + signature verification + secret hygiene.**

**1. Row-Level Security (RLS)** is on for every public table. Typical pattern:
- Public read only of *safe* rows: active approved non-suspended stores/products.
- Owners: `seller_id = auth.uid()` (stores/products/orders-as-seller), `buyer_id = auth.uid()` (orders/returns), `user_id = auth.uid()` (addresses/cart).
- Admin: `EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin)`.

**2. Column-level GRANT/REVOKE hardening** (migrations 022–025, 030). RLS controls *rows*, not *columns* — and in Postgres a table-level `SELECT` overrides a column `REVOKE`. So those migrations **revoke table-level SELECT/UPDATE from `anon`/`authenticated`, then re-grant column-by-column**:
- `stores`: KYC/PII columns (`pan_number`, `gst_number`, `aadhaar_url`, …) are **not** SELECTable by clients; address columns are **not** directly UPDATEable (must go through the address-change approval route); admin columns (`approval_status`, `suspended`, `is_active`) excluded.
- `users`: clients can't read `password_hash` and can only UPDATE a few safe columns — **prevents `role`/`is_admin` privilege escalation from the browser**.
- Practical consequence devs hit constantly: **`select('*')` on `stores` 401s for the authenticated role** — select explicit safe columns, or read KYC fields via a server route using the service-role key (e.g. `/api/seller/my-store`).

**3. service_role bypass.** The `service_role` key bypasses RLS and column grants. It is used **only server-side** — microservices, Next.js route handlers, Edge Functions — and **never shipped to the browser/mobile**. Clients use the anon/authenticated keys.

**4. Authentication & RBAC.** MSG91 OTP → Supabase session (section 5). Three roles via `users.role` + `users.is_admin`. Services validate the Supabase JWT on every authenticated call.

**5. Payment security (Razorpay).** Server creates the Razorpay order (amount taken from the DB order, not the client). Payment confirmation **verifies the HMAC-SHA256 signature** with `RAZORPAY_KEY_SECRET` before creating/flipping an order to paid; the **webhook** verifies its own signature; refunds are capped at the order total. (The "create-after-payment" `/confirm` flow is preferred over trusting client-reported success.)

**6. Inter-service auth.** Internal endpoints require the shared `x-internal-key`.

**7. Secrets management.** No secrets in git. Backend secrets live in **AWS Secrets Manager** and are injected into Fargate tasks as env vars; web secrets live in **Vercel env**; mobile build secrets in **EAS**. The Supabase service-role key, `AUTH_BRIDGE_SECRET`, Razorpay secret, etc. are server-only.

**8. PII & storage.** KYC docs / signatures live in the **private** `seller-documents` bucket, accessed only via short-lived **signed URLs** (seller for their own, admin via service-role). Aadhaar is intentionally not collected. Delivery addresses are snapshotted onto the order at purchase time.

**9. Delivery serviceability gating.** Checkout calls NimbusPost serviceability (`/api/delivery/rates`); a non-serviceable pincode now **hard-blocks** placing the order (web + mobile), with a graceful-degrade fallback when the courier API is unreachable.

> **Known open security findings** are tracked in [`agents_reports/SECURITY_AUDIT.md`](agents_reports/SECURITY_AUDIT.md). At time of writing these include: wildcard CORS (`ALLOWED_ORIGINS="*"`), an admin-layout auth bypass under `NODE_ENV=development`, missing ownership checks (IDOR) on some catalog/order/coupon endpoints, and a non-timing-safe signature compare in one payment path. Treat that file as the live backlog; new engineers picking up backend work should read it first.

---

## 10. Third-Party Integrations

| Integration | Used by | Notes |
|---|---|---|
| **Supabase** | everything | Postgres + Auth + Storage + Realtime + Edge Functions; project `nysgwdpmpxqmfwelfaxo` |
| **Razorpay** | payment-service, payout-service | order create, signature verify, webhook, refund. RazorpayX seller payouts are **pending** (payout rows written, no disbursement yet) |
| **NimbusPost** | delivery-service | **v1 email/password** API; **no warehouse pre-registration** — the seller's pickup address is sent **inline on each Create Shipment**; "pickup verification" = a pincode-serviceability probe. JWT cached/auto-refreshed; 15s timeout; graceful stub when unconfigured |
| **Gupshup** | notification-service, whatsapp-service | outbound WhatsApp + inbound webhook (HMAC-verified) |
| **Firebase FCM** | notification-service | push via `firebase-admin`, tokens in `fcm_tokens`/`device_tokens` |
| **MSG91** | admin-service (login OTP widget), notification-service (SMS) | DLT registration for transactional SMS is pending |
| **Google Maps Places** | web + mobile address forms | autocomplete/details/reverse-geocode, proxied server-side on web; key in env |

---

## 11. Infrastructure (AWS, Terraform)

**Account `632127307144`, region `ap-south-1` (Mumbai), environment `dev`.**

- **Networking:** VPC `10.0.0.0/16`, two **public** subnets (AZs a/b), Internet Gateway, **no NAT** (Fargate tasks get public IPs — acceptable for dev). Security groups: ALB allows 80/443 from the internet; task SG allows 3000 only from the ALB SG.
- **Compute:** ECS **Fargate** cluster `reelmart-dev`, **FARGATE_SPOT** by default (~70% cheaper). Each of the 10 services = one task definition + service, **256 CPU / 384–512 MB**, `awsvpc` networking, container port 3000.
- **Images:** ECR `632127307144.dkr.ecr.ap-south-1.amazonaws.com/reelmart/<svc>-service`, tags `:dev-latest` (rolling) and per-commit; image scanning + lifecycle policy.
- **Load balancer:** internet-facing **ALB** `reelmart-dev-alb` → `https://api-dev.reelmart.in`. HTTP→HTTPS redirect; HTTPS:443 with an **ACM** cert; **path-based routing** (`/api/<area>/*` → that service's **IP target group** `reelmart-dev-tgip-<svc>`), health checks on `/health`.
- **DNS:** managed at **GoDaddy** (no Route 53). `api-dev.reelmart.in`→ALB (CNAME), `dev.reelmart.in`→Vercel, ACM validation CNAME kept permanently.
- **Secrets:** **AWS Secrets Manager** (`reelmart/dev/<name>`) — Supabase, Razorpay, JWT/internal key are real; NimbusPost/Gupshup/Firebase/MSG91 may be placeholders per env. Injected into task defs as env vars by ARN+key.
- **IAM:** `reelmart-dev-ecs-task-execution` (pull images, read secrets, logs), `reelmart-dev-ecs-task` (app role), and `reelmart-gha-deploy` (GitHub **OIDC** deploy role — no long-lived AWS keys).
- **Cost controls:** Fargate Spot; per-service CPU target-tracking autoscaling (min 1, max 1–2); **scheduled scale-to-zero 22:00–08:00 IST** — so a night-time 503 on `api-dev.reelmart.in` is expected, not an incident. CloudWatch logs / Container Insights are disabled by default to save cost (re-enable if debugging).
- **Terraform layout:** `bootstrap/` (S3 state bucket `reelmart-tf-state-632127307144` + DynamoDB locks + OIDC), reusable `modules/` (network, ecs-cluster, alb, ecr, ecs-service, iam, secrets), and `environments/dev/{network,cluster,services}`. **Apply order: network → cluster → services** (services reads the others via remote state). `apply -auto-approve` and `destroy` are policy-blocked; always `plan` first.

---

## 12. CI/CD & Deployment

**GitHub Actions** drive everything; AWS auth is via OIDC (role `arn:aws:iam::632127307144:role/reelmart-gha-deploy`).

- **`.github/workflows/deploy.yml`** (push to `main`):
  - `build-services` (matrix over the 10 services, `npm run build`) and `lint-web` (Next build) run on PRs **and** push.
  - On push to main: `deploy-services` builds each service's `linux/amd64` image → pushes to ECR `:dev-latest` → `aws ecs update-service --force-new-deployment` → waits for stable (matrix, `fail-fast:false`, so one bad service doesn't block the others); `deploy-web` → Vercel `--prod`; `deploy-supabase` → `supabase db push` + functions deploy.
- **`.github/workflows/test.yml`** (push/PR): `api-tests` (Vitest + Supertest), `typecheck-services` (matrix tsc), summarized by an `all-tests-pass` gate used as the **required status check** on `main`. (Playwright e2e / k6 perf are placeholders, not yet wired.)
- **`.github/workflows/maintenance.yml`** (cron): nightly Terraform **drift** plan across the 3 layers, weekly `npm audit`.

**Deploying each surface manually:**
- **A backend service:** the [`/deploy-service`](.claude) skill (build amd64 → push ECR `:dev-latest` → force-new-deployment) — or just merge to `main`.
- **Web:** push to `main` → Vercel auto-builds `dev.reelmart.in`. Track the Vercel deployment (it posts a commit status you can poll via `gh`).
- **DB migration:** add a numbered file in `reelmart/supabase/migrations/`, then `supabase db push` (CI does this on main). The [`/db-migrate`](.claude) skill checks applied-vs-pending.
- **Mobile:** `eas build -p android --profile preview` (APK) or `eas build -p ios --profile preview` (simulator). Production/TestFlight needs an Apple Developer account + interactive Apple login.

**Ops skills (Claude Code harness, see `MAINTENANCE.md`):** `/deploy-service`, `/health-check`, `/tf-drift`, `/triage`, `/aws-session`, `/db-migrate`, `/refresh-status`.

---

## 13. End-to-End Workflow: Seller Registers → Buyer Buys → Order Delivered

This is the single golden path that ties every component together.

**A. Seller onboarding & approval**
1. Seller opens `/seller/register` (web), enters phone → MSG91 OTP → the auth bridge mints a Supabase session (`role=seller`).
2. They fill store details and KYC (PAN, optional GST) and a **pickup address** (Google Places search or "use current location"; flat/building, contact name, 10-digit phone, pincode). The store row is created `approval_status='pending'`, `is_active=false`. Address writes go through `/api/seller/address-change` (service-role) because address columns are revoked from the client.
3. `SellerGate` shows a "pending approval" screen — the dashboard is locked.
4. **Admin** sees a live popup + the `/admin/sellers` queue, opens `/admin/sellers/[id]`, reviews KYC (signed-URL docs), and approves via `PUT /api/admin/stores/[id]?action=approve`. Approval sets `approval_status='approved'`, `is_active=true`, and calls delivery-service to verify/register the **NimbusPost pickup** for that store.
5. The seller is notified (WhatsApp/push); `seller_verification.features_unlocked` flips true; the dashboard unlocks.

**B. Catalogue**
6. Seller adds products (name, price, images to `product-images` bucket, stock, category from the business-type list). `is_available=true` products on an approved/active/non-suspended store become publicly visible (RLS).
7. Seller can toggle the store **Open/Closed** (top-bar switch). A closed store shows a banner and pauses ordering.

**C. Buyer discovery & cart**
8. Buyer (web `/` or mobile Home) browses the marketplace — stores by category, auto-scroll product carousels — opens `/store/[slug]`, views a product, adds to cart (cart persists locally / in `cart_items`).

**D. Checkout**
9. Buyer hits checkout. If not logged in: phone → MSG91 OTP (web) / Supabase OTP (mobile) → session.
10. **New buyer** → add-address form (search → Area/Locality, or use current location; flat/building, name, mobile, editable pincode). **Returning buyer** → pick a saved address. City/state/pincode are derived from Google.
11. Checkout calls `/api/delivery/rates` → NimbusPost serviceability (store pincode → buyer pincode) for fee + ETA. **If non-serviceable, checkout is hard-blocked.**
12. Buyer picks **COD** or **Online**:
    - **COD:** order inserted immediately (`status='pending'`, `payment_status='pending'`).
    - **Online:** payment-service mints a Razorpay order → Razorpay modal → on success, `/api/payments/confirm` **verifies the signature** and creates the order `payment_status='paid'`.
13. On placement, notification-service fires WhatsApp/SMS to the buyer (idempotent). Buyer lands on `/order/[id]` with a prominent **"View My Orders"** button and (later) a tracking link.

**E. Fulfilment & delivery**
14. Seller sees the new order (realtime) and **accepts** it (`pending→accepted`); the stock trigger deducts inventory.
15. Seller marks the order **packed** → the dashboard calls `POST /api/delivery/create-shipment`. delivery-service books **NimbusPost** (pickup sent inline), writes back `awb_code`/`tracking_url`/`label_url`/`courier_name`, and flips the order to **`shipped`**. (If booking fails — e.g. courier not configured — the order stays `packed` for retry.)
16. The buyer's order page and the admin order page now show a **live NimbusPost tracking timeline**; the buyer can also use `/track/[awb]`. Notifications fire on each status change.
17. On **delivery** (`delivered`), `delivered_at` is set, the buyer is awarded loyalty coins, and the return window opens.

**F. Post-order**
18. **Returns:** buyer requests a return (within the window, delivered + paid) → seller/admin approve → return-service calls payment-service to issue a **Razorpay refund**.
19. **Payouts:** payout-service aggregates delivered+paid orders per seller (minus the 5% platform fee), creating settlement rows. *(Actual RazorpayX disbursement is the main pending piece.)*
20. **Reviews/analytics:** buyer reviews the delivered order (updates store rating); seller and admin analytics dashboards aggregate revenue/orders/ratings.

---

## 14. Local Development

> Exact env values come from the team's secret store / Vercel / Supabase — never commit them.

**Backend service (any of the 10):**
```bash
cd reelmart/services/<svc>-service
npm install
# create .env with SUPABASE_URL, SUPABASE_SERVICE_KEY, INTERNAL_API_KEY, + service-specific keys
npm run build        # tsc → dist
node dist/index.js   # serves on :3000, GET /health
```

**Web:**
```bash
cd reelmart/apps/web
npm install
# .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#             NEXT_PUBLIC_API_URL=https://api-dev.reelmart.in, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_MAPS_KEY
npm run dev
npx tsc --noEmit     # ALWAYS run — Next build ignores TS errors
```

**Mobile:**
```bash
cd reelmart/apps/buyer-app
npm install
npx expo start       # Expo Go / dev client
# build: eas build -p android --profile preview
```

**Database:** edit/add migrations under `reelmart/supabase/migrations/`, then `supabase db push` (or the `/db-migrate` skill). Generated types in `reelmart/shared/types/`.

**Conventions** (from `.claude/CLAUDE.md`): TypeScript everywhere; `async/await`; explicit error handling; Zod validation on every endpoint; RLS on every table; consistent `{success, data|error}`; Tailwind (web) / StyleSheet (mobile); Zustand for global state; ₹ / +91 / 6-digit pincode / GST conventions; never hardcode secrets; verify resource ownership before mutate.

---

## 15. Known Gaps / Roadmap (as of this snapshot)

- **RazorpayX seller payouts** — settlement rows are computed but no real disbursement yet.
- **Online checkout** — Razorpay backend is wired; COD is the most-exercised path. Verify the online flow in dev before relying on it.
- **NimbusPost task config** — ensure `NIMBUS_*` creds are present on the delivery-service task def for real bookings (otherwise it degrades to stub).
- **Security backlog** — see `agents_reports/SECURITY_AUDIT.md` (CORS, dev admin bypass, IDOR sweep, timing-safe compare).
- **Testing** — API + typecheck CI exists; Playwright e2e and k6 perf are not wired yet.
- **DLT SMS registration**, **app-store submission**, and **mobile edit-existing-address parity** are pending.
- **Observability** — CloudWatch logs/alarms are off by default for cost; add them for production.

---

## 16. Quick Reference

| Thing | Value |
|---|---|
| Web (dev) | `https://dev.reelmart.in` (Vercel project `shopidea`) |
| Backend API (dev) | `https://api-dev.reelmart.in` (ALB → ECS) |
| Supabase project | `nysgwdpmpxqmfwelfaxo` |
| AWS account / region | `632127307144` / `ap-south-1` |
| ECS cluster | `reelmart-dev` |
| Mobile package id | `in.reelmart.buyer` (EAS project `8c61695c-…`) |
| Canonical status | `agents_reports/AUDIT_gaps.md` |
| Security backlog | `agents_reports/SECURITY_AUDIT.md` |
| Conventions / skills | `.claude/CLAUDE.md`, `MAINTENANCE.md` |
| Screen-by-screen flows | `FLOWS.md` |
| Test accounts (dev) | admin `admin@reelmart.test`; seller/buyer via MSG91 test number (see AUDIT_gaps) |

> **Golden rules:** change infra in Terraform (not raw AWS CLI); never ship the service-role key to a client; `select('*')` on `stores` will 401 for clients — use explicit safe columns or a server route; run `npx tsc --noEmit` before pushing web; a 22:00–08:00 IST API 503 is the cost-saver, not an outage.

---

*Maintained by the ReelMart platform team. When the architecture changes, update this file and `agents_reports/AUDIT_gaps.md` together.*
