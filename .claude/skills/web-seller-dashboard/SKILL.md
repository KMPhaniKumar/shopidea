---
name: web-seller-dashboard
description: Deep context + dev guide for ReelMart's seller portal on web — seller auth/registration, approval gating, products, orders, payouts, analytics, customers, marketing, settings. Use for any seller-dashboard work. Read web-foundation first.
---

# web-seller-dashboard — seller portal (/seller)

**Dir:** `reelmart/apps/web/app/seller` · read **web-foundation** first.

## Routes
- **(auth)**: `/seller/login`, `/seller/register` (store onboarding + KYC via `lib/kyc.ts`).
- **(dashboard)**: `/seller/dashboard`, `/seller/products` (+ `/products/new`, `/products/[id]`), `/seller/orders`, `/seller/payouts`, `/seller/analytics`, `/seller/customers`, `/seller/marketing`, `/seller/settings`.

## Structure
- `components/seller/SellerGate.tsx` — **gates the dashboard on store approval status** (a seller can't reach full features until approved). `Sidebar.tsx`, `TopBar.tsx`.
- `store/sellerStore.ts` — Zustand seller state.
- Data: Supabase directly (RLS) for store/products/orders; microservice API for payouts/analytics/delivery.

## Key flows & gotchas
- **Approval:** new seller registers → store pending → admin approves (the **real approval path is the Next.js admin route `app/api/admin/stores/[id]`**, NOT admin-service; see memory `project_store_approval_path`). `SellerGate` reflects `approval_status` — note migration drift has bitten this column before (`/db-migrate` to verify it exists).
- **Orders:** a seller sees only their store's orders; **online orders appear only after payment is verified** (payment-service `/confirm`) — don't show unpaid/ghost orders.
- **Products:** create/edit/availability; ownership enforced server-side.
- **Payouts:** settlement summary (TCS/commission) — RazorpayX disbursement still pending.
- **Marketing:** WhatsApp broadcast (ties to whatsapp-service); per-seller pickup sync via `app/api/seller/pickup/sync` (`lib/pickup.ts`).

## Dev / deploy
`npm run dev` / `npm run build`; ship via git push → Vercel. Test-login seller (`+919999900002`, has an approved test store).

See **web-foundation**, `order-service` · `payout-service` · `catalog-service` · `whatsapp-service` skills, `FLOWS.md`.
