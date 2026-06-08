---
name: web-admin-dashboard
description: Deep context + dev guide for ReelMart's admin portal on web — seller approval/management, buyers, orders, payments, payouts, returns, analytics, platform settings. Use for any admin-dashboard work. Read web-foundation first.
---

# web-admin-dashboard — admin portal (/admin)

**Dir:** `reelmart/apps/web/app/admin` · read **web-foundation** first.

## Routes
- **(auth)**: `/admin/login`.
- **(dashboard)**: `/admin/dashboard`, `/admin/sellers` (+ `/sellers/[id]`), `/admin/buyers`, `/admin/orders` (+ `/orders/[id]`), `/admin/payments`, `/admin/payouts`, `/admin/returns`, `/admin/analytics`, `/admin/settings`.

## Structure
- `components/admin/TopBar.tsx`; admin calls go through `lib/admin-api.ts`.
- **Server route handler `app/api/admin/stores/[id]`** — the **canonical store-approval path** (approve/ban/suspend a seller's store). This is the real approval, NOT admin-service `stores.ts` (stale). See memory `project_store_approval_path`.
- Data: Supabase (admin reads) + microservice APIs (analytics, payments, payouts, returns).

## Auth & safety
- Admin-only: every admin route/handler must verify the session role is **admin** (don't rely on UI hiding alone — enforce server-side). Service-role/Supabase bypass means authorization must be explicit.
- Don't expose buyer/seller PII or KYC beyond what admin needs; never log secrets.

## Key flows
- **Seller approval** (sellers/[id] → `app/api/admin/stores/[id]`): approve → store goes live → seller dashboard unlocks (`SellerGate`). Also registers per-seller NimbusPost pickup where wired.
- **Orders/payments/payouts/returns:** read-only oversight + actions (refund/return approval ties to payment-service / return-service).
- **Settings:** platform settings (`platform_settings`).

## Dev / deploy
`npm run dev` / `npm run build`; ship via git push → Vercel. Test-login admin (`+919999900003`).

See **web-foundation**, `admin-service` · `payout-service` · `return-service` · `analytics-service` skills, memory `project_store_approval_path`.
