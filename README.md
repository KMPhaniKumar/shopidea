# ReelMart

Social commerce platform for Indian micro-sellers — sell on WhatsApp / Instagram with a real storefront, order management, payments, and delivery.

> **Status:** all 18/18 agents complete; production-blockers tracked in [`agents/AUDIT_gaps.md`](agents/AUDIT_gaps.md).

---

## Project layout

```
shopidea/
├── reelmart/                         # all source code lives here
│   ├── apps/
│   │   ├── buyer-app/                # React Native (Expo) — buyer mobile app
│   │   ├── seller-app/               # React Native (Expo) — seller mobile app
│   │   └── web/                      # Next.js 14 — public storefront + seller dashboard + admin
│   ├── backend/                      # Node + Express — payments, delivery, WhatsApp, push, payouts
│   ├── supabase/
│   │   ├── migrations/               # 001-015 — full schema + RLS + Realtime publication
│   │   └── functions/                # Edge Functions (order-notifications, store-router, send-sms-msg91)
│   └── shared/                       # cross-package TypeScript types
│
├── agents/                           # implementation guides (reference)
├── documents/                        # idea + tech stack + naming docs
├── TRACKER.md                        # daily log + agent completion board
├── FLOWS.md                          # end-to-end functionality flows for every screen
├── DEPLOYMENT_PLAN.md                # production deploy plan
└── README.md                         # ← you are here
```

---

## Quick start

```bash
# Web (seller dashboard + admin + public storefront)
cd reelmart/apps/web && npm install && npm run dev      # localhost:3000

# Backend (payments, delivery, WhatsApp bot)
cd reelmart/backend && npm install && npm run dev       # localhost:3001

# Buyer mobile app
cd reelmart/apps/buyer-app && npm install && npx expo start

# Seller mobile app
cd reelmart/apps/seller-app && npm install && npx expo start
```

Supabase project is hosted (no local Supabase needed). Env vars are already wired to project `nysgwdpmpxqmfwelfaxo`.

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

- **DB / Auth / Storage / Realtime:** Supabase (Postgres + RLS + Edge Functions)
- **Mobile:** React Native (Expo), React Navigation, Zustand
- **Web:** Next.js 14 App Router, RSC, Tailwind
- **Backend:** Node + Express
- **Payments:** Razorpay (mobile wired; web wiring pending)
- **Delivery:** Shiprocket
- **WhatsApp:** Gupshup (alerts + conversational ordering bot)
- **Push:** Firebase FCM
- **SMS OTP:** Twilio via Supabase Phone provider (DLT pending for India production)

---

## Development conventions

- Read [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for coding standards (TypeScript, error handling, RLS, file naming, Indian-market specifics).
- Read [`agents/AUDIT_gaps.md`](agents/AUDIT_gaps.md) before starting new work — it's the source of truth for what's done vs pending.
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

See [`agents/AUDIT_gaps.md`](agents/AUDIT_gaps.md) for the full list. Headlines:

1. **Razorpay web checkout SDK** — not yet wired (~30 min)
2. **DLT registration** for SMS to Indian numbers (Twilio rejects without it; possible workaround: switch to Indian SMS provider via Supabase Send-SMS Hook)
3. **App store submission** — Play Store + App Store assets, builds, listings
