# ReelMart

Social commerce platform for Indian micro-sellers — sell on WhatsApp / Instagram with a real storefront, order management, payments, and delivery.

> **Status (2026-05):** feature-complete platform live on AWS. Backend = 10 microservices on **ECS Fargate** (`api-dev.reelmart.in`), web on **Vercel** (`dev.reelmart.in`), DB on **Supabase**, infra in **Terraform**.
> **👉 Read [`agents_reports/AUDIT_gaps.md`](agents_reports/AUDIT_gaps.md) first** — it's the canonical current status (real architecture, what's built, what's pending, test accounts).

---

## Project layout

```
shopidea/
├── reelmart/                         # all source code lives here
│   ├── apps/
│   │   ├── buyer-app/                # React Native (Expo) — buyer mobile app (active)
│   │   ├── seller-app/               # React Native (Expo) — parked; web is the seller surface
│   │   └── web/                      # Next.js 14 — marketplace home + storefront + seller dashboard + admin
│   ├── services/                     # 10 Node + Express microservices (ECS Fargate). NOTE: old reelmart/backend is gone
│   │   ├── admin-service/            # incl. MSG91 auth-bridge (/api/admin/auth/*)
│   │   ├── catalog/order/payment/delivery(NimbusPost)/notification/whatsapp/payout/return/analytics-service/
│   ├── supabase/
│   │   ├── migrations/               # 001-020 — schema + RLS + Realtime + storage
│   │   └── functions/                # Edge Functions
│   └── shared/                       # cross-package TypeScript types
│
├── infra/terraform/                  # IaC: VPC/ALB/ECS-Fargate/ECR/IAM (layers: network, cluster, services)
├── agents_reports/                   # project status & reports — AUDIT_gaps.md is canonical, SECURITY_AUDIT.md
├── .github/workflows/deploy.yml      # CI: build→ECR→ECS update + Vercel + supabase db push
├── TRACKER.md   FLOWS.md   DEPLOYMENT_PLAN.md   DLT_SETUP.md
└── README.md                         # ← you are here
```

---

## Quick start

```bash
# Web (seller dashboard + admin + public storefront)
cd reelmart/apps/web && npm install && npm run dev      # localhost:3000

# Backend microservices (run all locally via docker-compose, or one at a time)
cd reelmart/services && docker compose up --build       # or: cd reelmart/services/<svc> && npm install && npm run dev

# Buyer mobile app
cd reelmart/apps/buyer-app && npm install && npx expo start
```

The web app normally talks to the **deployed** API (`api-dev.reelmart.in`) — its `apps/web/.env.local` mostly comes from Vercel. Supabase is hosted (project `nysgwdpmpxqmfwelfaxo`); no local Supabase needed.

**Deploy:** push to `main` → `.github/workflows/deploy.yml` builds each service image → ECR → `ecs update-service` on Fargate, deploys web to Vercel, and runs `supabase db push`. Infra changes go through Terraform in `infra/terraform/`.

---

## Surfaces

| URL / App | Audience | Purpose |
|-----------|----------|---------|
| **Buyer mobile app** (Expo) | Buyers | Browse stores, order, track, wishlist, profile |
| **`/store/[slug]`** | Public buyers | Storefront a seller shares on Instagram/WhatsApp — no login to browse |
| **`/store/[slug]/checkout`** | Public buyers | Phone-OTP checkout: cart → OTP → address → payment |
| **`/order/[id]`** | Public buyers | Order confirmation + "download app" prompt |
| **`/seller/*`** | Sellers | Dashboard, products, orders, coupons, broadcast, payouts, settings |
| **`/admin/*`** | Platform admin | Approve sellers, manage orders, returns, payouts |
| **Seller mobile app** (Expo) | Sellers on the go | Same as web seller dashboard, mobile-optimized |

---

## Key user journeys

1. **Seller signs up** (web) → creates store → uploads logo → adds products → shares `reelmart.in/store/<slug>` link
2. **Buyer clicks Instagram link** → lands on `/store/<slug>` → adds to cart → checkout → enters phone → OTP → address → payment → sees confirmation with "Download app" CTA
3. **Buyer installs app + logs in with same phone** → sees their previous orders + addresses (cross-device sync via Supabase RLS keyed by `user_id`)
4. **Seller gets the order** in dashboard (realtime toast) → accepts → packs → ships
5. **Buyer sees status updates live** in the Orders tab (realtime channel UPDATE filter)

Every screen's full data flow is documented in [`FLOWS.md`](FLOWS.md).

---

## Tech stack (canonical — see `.claude/CLAUDE.md` for full conventions)

- **DB / Auth / Storage / Realtime:** Supabase (Postgres + RLS + Edge Functions), project `nysgwdpmpxqmfwelfaxo`
- **Login auth:** MSG91 OTP widget → auth-bridge in `admin-service` → Supabase session (NOT Supabase Phone/Twilio)
- **Backend:** 10 Node + Express/TS microservices (`reelmart/services/*`) on **AWS ECS Fargate** (ap-south-1), ALB `api-dev.reelmart.in`, Terraform-managed
- **Web:** Next.js 14 App Router on **Vercel** (`dev.reelmart.in`)
- **Mobile:** React Native (Expo), React Navigation, Zustand
- **Payments:** Razorpay (web checkout + RazorpayX payouts still PENDING)
- **Delivery:** **NimbusPost** (per-seller pickup registration)
- **WhatsApp:** Gupshup · **Push:** Firebase FCM · **SMS:** MSG91 (DLT pending)

---

## Development conventions

- Read [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for coding standards (TypeScript, error handling, RLS, file naming, Indian-market specifics).
- Read [`agents_reports/AUDIT_gaps.md`](agents_reports/AUDIT_gaps.md) before starting new work — it's the source of truth for what's done vs pending.
- Update [`TRACKER.md`](TRACKER.md) at the end of every coding session (daily log + agent status).
- Update [`FLOWS.md`](FLOWS.md) when adding a new screen or changing a user flow.

---

## Dev-mode shortcuts

| Surface | Shortcut |
|---------|----------|
| Buyer mobile login | Tap yellow DEV banner → autofills `9999999999`, OTP `123456` |
| Seller web login | "Dev Login (skip OTP)" button → goes straight to `/seller/dashboard` |
| Admin web | Auth middleware bypassed in dev — visit `/admin/dashboard` directly |

For real OTP testing the test phone number must be configured in **Supabase Dashboard → Auth → Phone → Test OTPs**.

---

## Production blockers

See [`agents_reports/AUDIT_gaps.md`](agents_reports/AUDIT_gaps.md) for the full list. Headlines:

1. **DB migrations 014/015/019/020 not applied to the dev Supabase** — KYC/approval/pickup columns missing until applied (verify + `supabase db push`)
2. **Razorpay web checkout** + **RazorpayX payouts** — PAUSED; not wired
3. **`delivery-service` task def lacks `NIMBUS_AUTH_TOKEN`** — NimbusPost no-ops until set
4. **App store submission** — buyer-app APK (`eas.json` ready) + listings; DLT registration for +91 SMS
