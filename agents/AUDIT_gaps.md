# ReelMart — Current Status & Gaps (canonical truth)
### Last reviewed: 2026-05-23

This is the single source of truth for **what exists, where it runs, and what's pending**.
A new engineer or LLM should be able to read this file + `.claude/CLAUDE.md` and start working immediately. Code lives in `reelmart/` and infra-as-code in `infra/terraform/`.

---

## 1. Architecture (as actually deployed — read this first)

**The backend is 10 microservices, NOT the old `reelmart/backend` monolith (that directory is gone).**

| Layer | Reality | Notes |
|---|---|---|
| **Backend** | 10 Express/TypeScript microservices in `reelmart/services/*` | admin, analytics, catalog, delivery, notification, order, payment, payout, return, whatsapp. Each has its own `Dockerfile`, `package.json` (`build`=tsc, `start`=node dist), port 3000. |
| **Backend hosting** | **AWS ECS Fargate** | Cluster `reelmart-dev`, region `ap-south-1`, account `632127307144`. Images in ECR `reelmart/<svc>:dev-latest`. 256 CPU / 512 MB, awsvpc, public subnets + public IP, CloudWatch logs `/ecs/reelmart-dev-<svc>`. (Migrated off EC2 launch type 2026-05-23.) |
| **API gateway** | ALB `reelmart-dev-alb` → `https://api-dev.reelmart.in` | Path-routed on the `:443` listener to IP target groups `reelmart-dev-tgip-<svc>` (e.g. `/api/catalog/*`→catalog, `/api/admin/*`→admin). |
| **Infra-as-code** | **Terraform** in `infra/terraform/` | S3 backend `reelmart-tf-state-632127307144`, layers `environments/dev/{network,cluster,services}`. All layers `plan` clean. **Make infra changes in Terraform, then apply — not via raw AWS CLI** (avoids drift). |
| **Web** | Next.js 14 (App Router) on **Vercel** | `https://dev.reelmart.in` (Vercel project `shopidea`). `reelmart/apps/web`. |
| **Buyer mobile** | React Native / **Expo** SDK 54 | `reelmart/apps/buyer-app`. APK via EAS (`eas.json` `preview` profile). |
| **Seller mobile** | Parked | `apps/seller-app` exists but the web seller dashboard is the active surface. |
| **DB / Auth / Storage / Realtime** | **Supabase** project `nysgwdpmpxqmfwelfaxo` | Postgres + RLS + Storage + Realtime + Edge Functions. |

**Auth:** MSG91 OTP **widget** (web) → auth-bridge endpoint in **admin-service** (`/api/admin/auth/msg91-exchange`, `/check-phone`) → mints a Supabase session via synthetic email/`HMAC(phone, AUTH_BRIDGE_SECRET)` password. **Not** Supabase Phone provider / Twilio for login.

**Courier:** **NimbusPost** (`delivery-service`). Shiprocket is dead (stale env/columns only).

**Deploy a backend service:** build linux/amd64 → push ECR `:dev-latest` → `aws ecs update-service --cluster reelmart-dev --service <svc> --force-new-deployment`. CI: `.github/workflows/deploy.yml` does this on push to `main` (needs GitHub secret `AWS_DEPLOY_ROLE_ARN` = `arn:aws:iam::632127307144:role/reelmart-gha-deploy`, which already exists) + Vercel + `supabase db push`.

---

## 2. ✅ Built & working

### Seller (web `apps/web/app/seller/`)
- Register: phone → OTP (MSG91) → profile → store, with **full pickup address + Google Maps autocomplete** and **KYC** (PAN number + PAN card upload, shop selfie, optional GST). Submits as `approval_status='pending'`.
- **Login rejects unregistered numbers** (calls `/check-phone` before OTP, shows "please sign up"); login never auto-creates accounts (`createIfMissing:false`).
- **Dashboard approval gating** (`components/seller/SellerGate.tsx`): pending/rejected sellers see a waiting screen; only approved sellers reach the dashboard.
- Products CRUD + variants + images; enable/disable visibility; **share product to WhatsApp + Instagram** + copy link.
- Settings: store info + address (Maps autocomplete) + KYC view/replace (private docs via signed URLs) + pickup-status banner.
- Dashboard, orders (realtime), coupons, broadcast, customers, analytics, marketing, payouts.

### Admin (web `apps/web/app/admin/`)
- Email+password login (`is_admin` guard).
- **Sellers list + detail page** (`/admin/sellers/[id]`) showing business details + KYC doc previews (signed URLs), approve/reject/activate/deactivate. **The real approval path is the Next.js route `app/api/admin/stores/[id]`** (the `admin-service/stores.ts` route is stale — ignore).
- **Orders list + detail** (`/admin/orders/[id]`) with items, address, payment, **live NimbusPost courier tracking timeline**.
- **Payments page** (`/admin/payments`) — collected total + paid/pending/refunded + transactions.
- Returns, payouts.

### Public web
- **Marketplace home** (`/`): all active stores grouped by category + **auto-scrolling, colored product carousels** (`components/home/Marketplace.tsx` + `ProductCarousel.tsx`); "Seller login" + "Browse stores" CTAs.
- `/store/[slug]` storefront (RSC, ISR), `/store/[slug]/product/[id]`, `/store/[slug]/checkout` (cart → OTP → address → place order), `/order/[id]` confirmation with app-download CTA, `/track/[awb]`.

### Buyer app (Expo)
- Phone OTP, profile setup, **home feed: stores by category + product carousels with descriptions** (auto-scroll), storefront, cart, checkout, orders + **realtime tracking**, wishlist, profile, saved addresses.

### Backend services + pickup
- NimbusPost per-seller **pickup-warehouse registration** (`delivery-service`): registered on admin approval + re-synced on Settings address change (`/api/delivery/pickup/register|refresh`, internal-key); shipments use the seller's verified pickup, else fall back to `NIMBUS_WAREHOUSE_NAME`. Pickup lifecycle on `stores` (`pickup_status` none/pending/verified/failed).
- Order WhatsApp/SMS now include an **app-download link** (`notification-service`, `APP_DOWNLOAD_URL`).

### Database (Supabase)
Migrations through **020** in `reelmart/supabase/migrations/`. Newest: 019 (`stores` pickup_*), 020 (`stores` pan_number/pan_doc_path/gst_number/selfie_path/kyc_submitted_at). KYC docs live in the private `seller-documents` storage bucket keyed by user id.

### Test accounts (seeded in the dev DB)
- **Admin:** `admin@reelmart.test` / `ReelMartAdmin#2026` (email+password at `/admin/login`).
- **Seller:** `+91 99999 99999` (dev OTP `123456`), store `suryaboutiques`.
- **Buyer:** `+91 90000 00007` (has a saved address).
Seed script: `reelmart/apps/web/scripts/seed-test-accounts.mjs`.

---

## 3. ⚠️ Pending / gaps (real, today)

### Blockers
- [ ] **DB migrations 014, 015, 019, 020 are NOT applied to the remote dev Supabase** (016–018 are). Until applied, the `stores` columns the new seller features use (`approval_status`, `address`/`state`, `pickup_*`, KYC) don't exist → KYC/approval/pickup break. Apply via the Supabase SQL editor or `supabase db push`. **Verify current state before relying on it.**
- [ ] **Razorpay web checkout** — PAUSED by request. `CheckoutClient.tsx` still has a `TODO: Razorpay integration`; online orders are inserted `payment_status:'pending'` with no payment modal (effectively COD-only). Backend `/api/payments/create-order|verify` exist.
- [ ] **RazorpayX payouts** — PAUSED by request. `payout-service` only writes DB rows (`razorpay_payout_id=null`), makes no RazorpayX API calls; schema mismatch (`seller_id` vs `store_id`); admin payouts summary/history endpoints don't exist.
- [ ] **delivery-service task def lacks `NIMBUS_AUTH_TOKEN`** (+`NIMBUS_WAREHOUSE_NAME`) — NimbusPost calls degrade gracefully (no-op/fallback) until set on the ECS task def.

### Smaller
- [ ] Buyer app env name mismatch: code reads `EXPO_PUBLIC_RAZORPAY_KEY_ID` + `EXPO_PUBLIC_GOOGLE_MAPS_KEY` but `.env`/`eas.json` have `EXPO_PUBLIC_RAZORPAY_KEY` and no Maps key → payments/maps undefined in the APK.
- [ ] `deploy.yml` needs GitHub secret `AWS_DEPLOY_ROLE_ARN` set (role exists) for the Fargate rollout job to run.
- [ ] App store submission (Play/App Store assets, builds, listings); `APP_DOWNLOAD_URL` defaults to `dev.reelmart.in/app` (page may not exist yet).
- [ ] DLT registration for transactional SMS (real OTP/order SMS to +91) — see `DLT_SETUP.md`.

---

## 4. Deployment status of recent work
- **Backend services:** the session's code is built + pushed to ECR and live on Fargate (verified via ALB).
- **Web:** changes are committed/pushed to `main`; Vercel deploys `dev.reelmart.in` (verify the latest deploy).
- **Buyer app:** code changes are **not** built into an APK yet (`eas.json` ready; run `eas build -p android --profile preview`).
- **Terraform:** code + state reconciled to the Fargate reality; all 3 layers `plan` clean.
