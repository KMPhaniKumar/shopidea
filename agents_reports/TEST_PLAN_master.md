# ReelMart — Master Test Plan
**Version:** 1.0  
**Date:** 2026-06-23  
**Author:** qa-lead  
**Inputs:** QA_test_run_2026-06-23.md · AUDIT_gaps.md · FLOWS.md · SECURITY_AUDIT.md · live code survey (web/mobile/services)

---

## 0. Harness Snapshot (as of 2026-06-23)

| Harness | Framework | Location | Status |
|---|---|---|---|
| API / unit | Vitest 1.6.1 + Supertest | `tests/` | Running — 3 failures (known), 117 passes |
| Service-level | Vitest 4.1.8 | `reelmart/services/notification-service/tests/` · `whatsapp-service/tests/` | Clean (44 tests) |
| E2E / UI | Playwright 1.61.0 | `tests/` | Partially built — 1 spec (seller-register), WebKit broken |
| DB integrity | — | `tests/db/` (dir exists, no files) | Not started |
| Performance | k6 | `tests/performance/k6.config.ts` (scaffold only) | Not started |
| Mobile | — | `reelmart/apps/buyer-app/` | Zero tests, no harness |
| CI gate | GitHub Actions | `.github/workflows/test.yml` | API + typecheck jobs live; e2e/perf commented out |

**Infra bugs to fix before scaling (Wave 0):**

| Bug | Fix | Owner |
|---|---|---|
| INFRA-01: `npm run test:api` path filter `tests/api` (resolves to `tests/tests/api`) | Change to `vitest run api` in `tests/package.json` | qa-lead |
| INFRA-02: Vitest 1.6.1 CJS deprecation warning on Node 25 | Upgrade `vitest` to `^4.1.8` in `tests/package.json` | qa-lead |
| INFRA-03: WebKit binary not installed (mobile-safari Playwright project fails) | `npx playwright install webkit`; add `playwright install --with-deps` to `test.yml` | e2e-test-engineer |

---

## 1. Feature Inventory

### 1A. Web — Storefront / Public Buyer (`/store/[slug]`, `/order`, `/track`, `/stores`)

| # | Feature / Flow | Key Paths / Actions |
|---|---|---|
| WS-01 | Marketplace home | `GET /` — all-stores grid, category groups, product carousels, auto-scroll |
| WS-02 | Store listing by category | `GET /stores` · `GET /stores/[category]` |
| WS-03 | Storefront page (RSC + ISR) | `GET /store/[slug]` — store header, product grid, reviews, search filter |
| WS-04 | Product detail page | `GET /store/[slug]/product/[productId]` — images, variants, add-to-cart |
| WS-05 | Cart state | Add/remove/qty-change persisted in localStorage, sticky footer total |
| WS-06 | Legacy redirect | `GET /s/[slug]` → 308 → `/store/[slug]` |
| WS-07 | Checkout — cart step | Summary, subtotal, delivery fee (₹60 / free ≥ ₹500) |
| WS-08 | Checkout — phone step (unauthenticated) | Enter +91 number → send OTP via admin-service |
| WS-09 | Checkout — OTP step | 6-digit verify → Supabase session minted → `users` upsert as buyer |
| WS-10 | Checkout — address step (saved) | List saved addresses, radio select, auto-default first |
| WS-11 | Checkout — address step (new) | Inline add-address form, pincode 6-digit validation |
| WS-12 | Checkout — review + COD | Place order (COD) → order row `payment_status=pending` → clear cart → `/order/[id]` |
| WS-13 | Checkout — review + Pay Online | Razorpay modal (NOT WIRED YET — PAUSED) |
| WS-14 | Order confirmation page | `GET /order/[id]` — summary, address, "Download app" CTA, Play Store link |
| WS-15 | Shipment tracking page | `GET /track/[awb]` — NimbusPost tracking timeline |
| WS-16 | Buyer orders list (web) | `GET /orders` — buyer's order history |
| WS-17 | Buyer profile (web) | `GET /profile` — name, phone |
| WS-18 | Buyer addresses (web) | `GET /addresses` — manage saved addresses |
| WS-19 | Inactive / non-existent store | `/store/[slug]` returns 404 when store not active |
| WS-20 | Empty store (no products) | Empty-state rendered on product grid |
| WS-21 | OTP checkout: already-authenticated buyer | Skip phone/OTP steps — jump to address |
| WS-22 | Checkout pincode validation edge cases | 5-digit, 7-digit, non-numeric rejected |
| WS-23 | Cross-device sync prompt | After order, "login with same number" prompt visible |
| WS-24 | Interstate demand capture | `POST /api/store/interstate-demand` — demand signal when out-of-delivery-area |

### 1B. Web — Seller Dashboard (`/seller/*`)

| # | Feature / Flow | Key Paths / Actions |
|---|---|---|
| SD-01 | Seller login — registered number | `/seller/login` → MSG91 OTP → check-phone → session → dashboard |
| SD-02 | Seller login — unregistered number | `/check-phone` rejects → "please sign up" error shown |
| SD-03 | Seller registration — new number | `/seller/register` → OTP → profile → store details + address + KYC → `pending` screen |
| SD-04 | Seller registration — pending re-register | OTP verify → toast "already registered" → redirect to dashboard |
| SD-05 | Seller registration — approved re-register | OTP verify → toast "already registered" → redirect to dashboard |
| SD-06 | Seller registration — rejected re-register | OTP verify → enters edit mode with rejection notes banner pre-filled |
| SD-07 | Seller re-submit after rejection | Edit form pre-filled → resubmit → `pending` status → `/api/seller/resubmit` |
| SD-08 | SellerGate — pending seller | Sees waiting screen, NOT dashboard content |
| SD-09 | SellerGate — approved seller | Full dashboard rendered |
| SD-10 | SellerGate — rejected seller | Sees rejection screen, NOT dashboard content |
| SD-11 | Dashboard home | Revenue stats, pending orders, low-stock items, realtime toast on new order |
| SD-12 | Realtime new-order notification | Supabase Realtime INSERT → toast + data reload |
| SD-13 | Products list | Paginated table, toggle availability, edit, delete, bulk delete |
| SD-14 | Product add | Form: name, description, price, compare_price, category, stock, images → upload to storage |
| SD-15 | Product edit | Pre-filled form, update |
| SD-16 | Product image upload | `supabase.storage.from('product-images').upload()` |
| SD-17 | Product share to WhatsApp / Instagram | Share link + copy-to-clipboard |
| SD-18 | Orders list | Filter tabs: all/pending/accepted/packed/shipped/delivered/cancelled/rejected |
| SD-19 | Order detail panel | Items, address, total; accept/reject/pack/ship/deliver actions |
| SD-20 | Order status workflow | `pending → accepted → packed → shipped → delivered`; `pending → rejected` |
| SD-21 | Print invoice | Browser print dialog with HTML invoice |
| SD-22 | WhatsApp buyer (from order) | `wa.me` link opens |
| SD-23 | Orders export Excel | `.xlsx` download |
| SD-24 | Customers list | Aggregated by buyer: orders count, total spend, masked phone |
| SD-25 | Customer WhatsApp | `wa.me` link |
| SD-26 | Customers export Excel | `.xlsx` download |
| SD-27 | Analytics dashboard | Revenue chart (30d), top products, category pie |
| SD-28 | Payouts list | History: amount, status, date, UTR; pending balance |
| SD-29 | Marketing page | Store link, copy, QR download (512×512 PNG), share WhatsApp/Instagram |
| SD-30 | Settings — store info | Edit store name, slug (debounced uniqueness check), description, category, city, WhatsApp, Instagram |
| SD-31 | Settings — address + Maps | Google Maps autocomplete, address update → triggers NimbusPost pickup sync |
| SD-32 | Settings — KYC view/replace | PAN, GST, selfie — signed URLs for private docs |
| SD-33 | Settings — pickup status banner | Shows `none/pending/verified/failed` from `stores.pickup_status` |
| SD-34 | Slug uniqueness check | Debounced 500ms real-time availability |
| SD-35 | Session expiry | Auth session timeout → redirect to login |
| SD-36 | Address change pending approval | UI reflects `address_pending_approval` state |

### 1C. Web — Admin Dashboard (`/admin/*`)

| # | Feature / Flow | Key Paths / Actions |
|---|---|---|
| AD-01 | Admin login | `/admin/login` → email + password → Supabase `signInWithPassword` → `is_admin=true` check |
| AD-02 | Admin login — non-admin email | Logs out + shows error |
| AD-03 | Admin dashboard overview | GMV (7d), platform revenue, new sellers/buyers, open returns badge |
| AD-04 | Admin fallback to Supabase | If analytics-service down → direct Supabase query (no 500) |
| AD-05 | Sellers list | All stores with seller name, city, status, created date |
| AD-06 | Seller detail | Business info, KYC doc previews (signed URLs), approval/rejection controls |
| AD-07 | Seller approve | Sets `approval_status=approved` via `app/api/admin/stores/[id]` route |
| AD-08 | Seller reject with comment | `approval_status=rejected`, `rejection_notes` set; seller notified |
| AD-09 | Seller activate / deactivate | `is_active` toggle |
| AD-10 | Seller suspend / unsuspend | `suspended` flag via `app/api/admin/stores/[id]/suspend` |
| AD-11 | PAN verify | `app/api/admin/stores/[id]/pan-verify` |
| AD-12 | GST verify | `app/api/admin/stores/[id]/verify-gst` |
| AD-13 | Pending approvals count | `GET /api/admin/pending-approvals` |
| AD-14 | Address change approval | `app/api/admin/stores/[id]/address-change` — approve/reject seller address changes |
| AD-15 | Admin orders list | All orders across stores, filter by status |
| AD-16 | Admin order detail | Items, address, payment, NimbusPost tracking timeline |
| AD-17 | Admin payments page | Collected total, paid/pending/refunded totals, transactions |
| AD-18 | Admin returns list | All return requests: order, buyer, reason, status |
| AD-19 | Admin approve return | `approval_status=approved` → triggers refund |
| AD-20 | Admin reject return | `approval_status=rejected` |
| AD-21 | Admin payouts list | Pending + completed payouts per store |
| AD-22 | Admin process payouts | `POST /api/payouts/process` (writes DB row; RazorpayX NOT wired) |
| AD-23 | Admin analytics — platform | GET `/api/analytics/platform` — GMV, revenue, top stores |
| AD-24 | Admin buyers list | All registered buyers: name, phone, joined, order count |
| AD-25 | Admin settings | Commission rate, feature flags — saved to config table |
| AD-26 | Admin guard — non-admin blocked | `is_admin=false` user → kicked back to login |

### 1D. Web — Next.js API Route Handlers (`app/api/**`)

| # | Route | Purpose |
|---|---|---|
| AR-01 | `POST /api/admin/login` | Admin email+password → Supabase session |
| AR-02 | `GET /api/admin/pending-approvals` | Count of pending stores |
| AR-03 | `GET/PATCH /api/admin/stores/[id]` | Seller approval/rejection (real approval path) |
| AR-04 | `POST /api/admin/stores/[id]/suspend` | Toggle suspend |
| AR-05 | `POST /api/admin/stores/[id]/pan-verify` | Mark PAN verified |
| AR-06 | `POST /api/admin/stores/[id]/verify-gst` | Mark GST verified |
| AR-07 | `POST /api/admin/stores/[id]/address-change` | Approve/reject address change |
| AR-08 | `POST /api/seller/onboard` | New seller registration → store insert |
| AR-09 | `GET /api/seller/my-store` | Authenticated seller's store data |
| AR-10 | `POST /api/seller/resubmit` | Rejected seller re-submission |
| AR-11 | `POST /api/seller/address-change` | Seller requests address change |
| AR-12 | `POST /api/seller/pickup/sync` | Trigger NimbusPost pickup re-sync |
| AR-13 | `GET /api/seller/signature` | Signed URL for KYC document |
| AR-14 | `GET /api/pincode/[pincode]` | Pincode lookup (6-digit validation) |
| AR-15 | `POST /api/places/autocomplete` | Google Places autocomplete proxy |
| AR-16 | `GET /api/places/details` | Google Places detail proxy |
| AR-17 | `GET /api/places/reverse` | Reverse geocode proxy |
| AR-18 | `POST /api/store/interstate-demand` | Capture out-of-area demand |

### 1E. Mobile — Buyer App (Expo / React Native)

| # | Screen / Flow | Key Behaviors |
|---|---|---|
| MB-01 | Phone entry screen | `+91` number input, send OTP via `admin-service /otp/send` |
| MB-02 | OTP verification screen | 6-digit code, verify via `admin-service /otp/verify`, Supabase session set |
| MB-03 | OTP — wrong code | Error displayed, no session created |
| MB-04 | OTP — expired code | Error displayed |
| MB-05 | Profile setup screen | Name, (avatar); upsert into `users` table as `role=buyer` |
| MB-06 | Home screen — store feed | Stores by category, product carousels (auto-scroll) |
| MB-07 | Home — location prompt | Location permission → state-based store filtering |
| MB-08 | Store discovery | `discoveryService` — category browse, search |
| MB-09 | Storefront screen | Store info, product grid, add-to-cart |
| MB-10 | Cart screen | Items, qty controls, subtotal, "Proceed" CTA |
| MB-11 | Cart — empty state | Appropriate empty-cart UI |
| MB-12 | Checkout — address step | Saved addresses list (radio), add new (with GST pincode modal) |
| MB-13 | Checkout — GST pincode modal | Interstate GST calculation |
| MB-14 | Checkout — payment screen | COD or Razorpay (Razorpay key env mismatch — PENDING) |
| MB-15 | Order placed confirmation | Order summary, order ID |
| MB-16 | Order history screen | All past orders, status chips |
| MB-17 | Order tracking screen | Realtime order timeline (`orderEvents`), NimbusPost AWB status |
| MB-18 | Wishlist screen | Saved products, remove from wishlist |
| MB-19 | Profile screen | Name, phone (masked), logout |
| MB-20 | Addresses screen | Manage saved addresses, add/edit/delete |
| MB-21 | Return request screen | File return for delivered order |
| MB-22 | Write review screen | Star rating + comment for delivered order |
| MB-23 | Location picker screen | Map-based address pin drop |
| MB-24 | Cross-device sync | Guest addresses merged on login (`mergeGuestAddressesIntoAccount`) |
| MB-25 | Auth persistence | App reopen → session restored from SecureStore |
| MB-26 | Push notification tap | FCM tap → navigate to relevant order |
| MB-27 | Realtime order updates | Supabase Realtime channel UPDATE → UI reflects new status |

### 1F. Backend — By Service (10 microservices)

#### admin-service (`/api/admin/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-01 | `POST /api/admin/auth/msg91-exchange` — MSG91 access-token → Supabase session |
| BA-02 | `POST /api/admin/auth/check-phone` — phone lookup; returns approval_status |
| BA-03 | `POST /api/admin/auth/otp/send` — mobile REST OTP send via MSG91 v5 |
| BA-04 | `POST /api/admin/auth/otp/verify` — mobile REST OTP verify → session |
| BA-05 | `POST /api/admin/auth/test-login` — dev-only test session mint (must be CRIT-3 gated) |
| BA-06 | `GET /api/admin/coupons?storeId=` — seller owns store |
| BA-07 | `DELETE /api/admin/coupons/:id` — seller owns coupon (HIGH-8) |
| BA-08 | `GET /api/admin/settings` — auth required (LOW-2) |
| BA-09 | `GET/PATCH /api/admin/stores` — admin-only |
| BA-10 | `GET /api/admin/users` — admin-only |

#### analytics-service (`/api/analytics/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-11 | `GET /api/analytics/store?storeId=` — seller owns store (HIGH-3) |
| BA-12 | `GET /api/analytics/store/top-products?storeId=` — seller owns store |
| BA-13 | `GET /api/analytics/platform?period=` — admin-only |
| BA-14 | `GET /api/analytics/platform/stores` — admin-only, top stores by GMV |

#### catalog-service (`/api/catalog/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-15 | `GET /api/catalog/products?storeId=` — seller owns store (CRIT-4) |
| BA-16 | `POST /api/catalog/products` — seller owns store |
| BA-17 | `PUT /api/catalog/products/:id` — seller owns product |
| BA-18 | `DELETE /api/catalog/products/:id` — seller owns product (CRIT-4) |
| BA-19 | `PUT /api/catalog/products/:id/availability` — seller owns product (CRIT-4) |
| BA-20 | `GET /api/catalog/stores` — public; safe columns only (HIGH-6) |
| BA-21 | `GET /api/catalog/stores/:slug` — public; safe columns only (HIGH-6) |
| BA-22 | `GET /api/catalog/stores/:id/products` — public; store must be active/approved |
| BA-23 | `GET /api/catalog/reviews?storeId=` — public |
| BA-24 | `POST /api/catalog/reviews` — authenticated buyer |
| BA-25 | `POST /api/catalog/stores/follow` — authenticated buyer |
| BA-26 | `DELETE /api/catalog/stores/follow` — authenticated buyer |

#### delivery-service (`/api/delivery/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-27 | `POST /api/delivery/rates` — stub fallback when NIMBUS_AUTH_TOKEN absent; fee = courierFee + commission |
| BA-28 | `GET /api/delivery/track/:awb` — stub when unconfigured; validates AWB format |
| BA-29 | `POST /api/delivery/create-shipment` — seller owns order; 503 when NimbusPost unconfigured |
| BA-30 | `POST /api/delivery/cancel-shipment` — seller owns order |
| BA-31 | `POST /api/delivery/ndr/list` — seller owns AWB |
| BA-32 | `POST /api/delivery/pickup/register` — internal key; per-seller NimbusPost pickup |
| BA-33 | `POST /api/delivery/pickup/refresh` — internal key |

#### notification-service (`/api/notifications/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-34 | `POST /api/notifications/register-token` — auth + userId must match caller (HIGH-9) |
| BA-35 | `POST /api/notifications/push` — internal key |
| BA-36 | `POST /api/notifications/order-placed` — idempotency (notification_sent), 30-min staleness guard |
| BA-37 | `POST /api/notifications/order-update` — per-status WhatsApp + push |
| BA-38 | `POST /api/notifications/address-change-approved` — internal key |
| BA-39 | `POST /api/notifications/address-change-rejected` — internal key |

#### order-service (`/api/orders/*`, `/api/cart/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-40 | `GET /api/orders` — seller (storeId, owned) or buyer (own orders) (HIGH-4) |
| BA-41 | `GET /api/orders/:id` — buyer OR owning seller only (HIGH-4) |
| BA-42 | `POST /api/orders` — authenticated buyer; validates cart |
| BA-43 | `PUT /api/orders/:id/status` — owning seller only (HIGH-5); fires `order_events` insert |
| BA-44 | `POST /api/orders/:id/cancel` — buyer own order |
| BA-45 | `GET /api/cart` — buyer own cart |
| BA-46 | `POST /api/cart/items` — add to cart |
| BA-47 | `PUT /api/cart/items/:id` — update quantity |
| BA-48 | `DELETE /api/cart/items/:id` — remove from cart |

#### payment-service (`/api/payments/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-49 | `POST /api/payments/create-order` — buyer owns orderId; amount from DB not client (HIGH-2) |
| BA-50 | `POST /api/payments/verify` — buyer ownership + razorpay_order_id DB match (HIGH-1) |
| BA-51 | `POST /api/payments/confirm` — create order after payment (post-checkout new flow) |
| BA-52 | `POST /api/payments/webhook` — Razorpay signature verification |
| BA-53 | `POST /api/payments/refund` — buyer or owning seller; amount capped at order total |
| BA-54 | HMAC `verifySignature` — timing-safe equal (MED-5) |

#### payout-service (`/api/payouts/*`, `/api/payouts/bank-account/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-55 | `GET /api/payouts?storeId=` — seller owns store (HIGH-3) |
| BA-56 | `GET /api/payouts/summary?storeId=` — seller owns store |
| BA-57 | `POST /api/payouts/process` — admin-only |
| BA-58 | `GET /api/payouts/bank-account` — scoped to caller's user_id only (MED-8) |
| BA-59 | `POST /api/payouts/bank-account` — create/update bank account |

#### return-service (`/api/returns/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-60 | `GET /api/returns/:id` — buyer or owning seller (MED-4) |
| BA-61 | `GET /api/returns?storeId=` — seller owns store (MED-4) |
| BA-62 | `GET /api/returns` (buyer) — scoped to buyer_id |
| BA-63 | `POST /api/returns` — buyer files return |
| BA-64 | `PUT /api/returns/:id/status` — admin/seller approve or reject |

#### whatsapp-service (`/api/whatsapp/*`)

| # | Endpoint / Behavior |
|---|---|
| BA-65 | `POST /api/whatsapp/webhook` — Gupshup HMAC signature verification (LOW-3) |
| BA-66 | Bot session state machine — buyer conversation flow |
| BA-67 | `POST /api/whatsapp/broadcast` — seller owns store; sends to unique customer phones |

### 1G. Database Integrity (Supabase RLS + Migrations 001–040)

| # | Integrity Concern |
|---|---|
| DB-01 | `orders`: buyer can read own rows only; sellers read their store's rows |
| DB-02 | `products`: public read (is_available=true, store is_active); write restricted to store owner |
| DB-03 | `stores`: public read uses safe-column view (no KYC columns) — migration 023 |
| DB-04 | `users`: phone not exposed to anon/other-role — migration 023 |
| DB-05 | `payouts`: seller reads only own store; admin reads all |
| DB-06 | `returns`: buyer reads own; seller reads own store's |
| DB-07 | `addresses`: user reads/writes own only |
| DB-08 | `bank_accounts`: seller reads/writes own only; no cross-store access |
| DB-09 | `followed_stores`: buyer_id not enumerable to other users — migration 023 |
| DB-10 | `delivery_commission_slabs`: read by service role only |
| DB-11 | `order_events`: write by service role; buyer reads own order's events |
| DB-12 | Stock decrement trigger (migration 016) fires on order insert; no double-decrement |
| DB-13 | `stores_auto_slug` (migration 028): unique slug assignment idempotent |
| DB-14 | `store_approval_notes` (migration 040): rejection_notes stored, visible to seller only |
| DB-15 | KYC columns (`seller-documents` bucket) — private bucket, signed URL required |
| DB-16 | Migration 015 `stores.approval_status` check constraint valid values |
| DB-17 | Cross-role isolation: buyer token cannot read another buyer's orders |
| DB-18 | Anon role cannot INSERT to any core table without auth |

---

## 2. Coverage Matrix

### Web Storefront

| Feature | Current Coverage | Test Type(s) Needed | Owner | Gap? |
|---|---|---|---|---|
| WS-01 Marketplace home | None | ui (component renders), e2e (store cards load) | ui-test-engineer | YES |
| WS-02 Store listing / category | None | ui, e2e | ui-test-engineer | YES |
| WS-03 Storefront page | None | ui (ISR render), e2e (product visible) | ui-test-engineer | YES |
| WS-04 Product detail | None | ui | ui-test-engineer | YES |
| WS-05 Cart state | None | ui (add/remove/persist) | ui-test-engineer | YES |
| WS-06 Legacy redirect | None | api (Next.js route handler) | api-test-engineer | YES |
| WS-07 Checkout cart step | None | e2e (full checkout flow) | e2e-test-engineer | YES |
| WS-08 Checkout phone step | None | e2e | e2e-test-engineer | YES |
| WS-09 Checkout OTP step | None | e2e (mocked OTP) | e2e-test-engineer | YES |
| WS-10 Checkout saved address | None | e2e | e2e-test-engineer | YES |
| WS-11 Checkout new address | None | e2e (pincode validation) | e2e-test-engineer | YES |
| WS-12 Checkout COD + place order | None | e2e (P0) | e2e-test-engineer | YES — P0 |
| WS-13 Checkout Pay Online | None — feature PAUSED | e2e (when wired) | e2e-test-engineer | Deferred |
| WS-14 Order confirmation | None | ui, e2e | ui-test-engineer | YES |
| WS-15 Tracking page | None | ui, e2e (stub AWB) | ui-test-engineer | YES |
| WS-16 Buyer orders list | None | ui, e2e | ui-test-engineer | YES |
| WS-17 Buyer profile | None | ui | ui-test-engineer | YES |
| WS-18 Buyer addresses | None | ui, e2e | ui-test-engineer | YES |
| WS-19 Inactive store 404 | None | ui | ui-test-engineer | YES |
| WS-20 Empty store | None | ui | ui-test-engineer | YES |
| WS-21 Already-auth checkout | None | e2e | e2e-test-engineer | YES |
| WS-22 Pincode validation edges | None | ui | ui-test-engineer | YES |
| WS-23 Cross-device sync prompt | None | ui | ui-test-engineer | YES |
| WS-24 Interstate demand | None | api (route handler) | api-test-engineer | YES |

### Web Seller Dashboard

| Feature | Current Coverage | Test Type(s) Needed | Owner | Gap? |
|---|---|---|---|---|
| SD-01 Seller login registered | None | e2e (P0) | e2e-test-engineer | YES — P0 |
| SD-02 Seller login unregistered | None | ui (P1) | ui-test-engineer | YES — P1 |
| SD-03 Registration new number | Partial — `seller-register-flow.spec.ts` (untracked, scenario 1) | e2e (P0) | ui-test-engineer | YES — P0 |
| SD-04 Reg pending re-register | Partial — spec written, 6 fails (fix not deployed) | e2e (P0) | ui-test-engineer | YES — P0 |
| SD-05 Reg approved re-register | Partial — spec written, 6 fails (fix not deployed) | e2e (P0) | ui-test-engineer | YES — P0 |
| SD-06 Reg rejected re-register | Partial — scenario 4 written | e2e (P1) | ui-test-engineer | Partial |
| SD-07 Resubmit after rejection | None | e2e (P1) | e2e-test-engineer | YES — P1 |
| SD-08 SellerGate pending | None | ui (P1) | ui-test-engineer | YES — P1 |
| SD-09 SellerGate approved | None | ui (P1) | ui-test-engineer | YES — P1 |
| SD-10 SellerGate rejected | None | ui (P1) | ui-test-engineer | YES — P1 |
| SD-11 Dashboard home | None | ui, e2e | ui-test-engineer | YES |
| SD-12 Realtime new order | None | e2e (hard — needs live channel) | e2e-test-engineer | YES |
| SD-13 Products list | None | ui | ui-test-engineer | YES |
| SD-14 Product add | None | e2e | e2e-test-engineer | YES |
| SD-15 Product edit | None | ui, e2e | ui-test-engineer | YES |
| SD-16 Product image upload | None | e2e (storage) | e2e-test-engineer | YES |
| SD-17 Product share | None | ui | ui-test-engineer | YES |
| SD-18 Orders list + filters | None | ui | ui-test-engineer | YES |
| SD-19 Order detail + actions | None | e2e | e2e-test-engineer | YES |
| SD-20 Order status workflow | Partial — `api/order-service/authz.test.ts` (backend) | e2e (full flow) | e2e-test-engineer | Partial |
| SD-21 Print invoice | None | ui (window.print mock) | ui-test-engineer | YES |
| SD-22 WhatsApp buyer link | None | ui | ui-test-engineer | YES |
| SD-23 Orders export Excel | None | ui | ui-test-engineer | YES |
| SD-24 Customers list | None | ui | ui-test-engineer | YES |
| SD-25 Customer WhatsApp | None | ui | ui-test-engineer | YES |
| SD-26 Customers export | None | ui | ui-test-engineer | YES |
| SD-27 Analytics | None | ui | ui-test-engineer | YES |
| SD-28 Payouts list | None | ui | ui-test-engineer | YES |
| SD-29 Marketing / QR | None | ui | ui-test-engineer | YES |
| SD-30 Settings store info | None | ui, e2e | ui-test-engineer | YES |
| SD-31 Settings address + Maps | None | e2e | e2e-test-engineer | YES |
| SD-32 Settings KYC | None | ui | ui-test-engineer | YES |
| SD-33 Pickup status banner | None | ui | ui-test-engineer | YES |
| SD-34 Slug uniqueness | None | ui (debounce test) | ui-test-engineer | YES |
| SD-35 Session expiry | None | e2e | e2e-test-engineer | YES |
| SD-36 Address change pending | None | ui | ui-test-engineer | YES |

### Web Admin Dashboard

| Feature | Current Coverage | Test Type(s) Needed | Owner | Gap? |
|---|---|---|---|---|
| AD-01 Admin login | None | ui (P0) | ui-test-engineer | YES — P0 |
| AD-02 Admin login non-admin | None | ui | ui-test-engineer | YES |
| AD-03 Admin dashboard | None | ui | ui-test-engineer | YES |
| AD-04 Admin analytics fallback | None | ui | ui-test-engineer | YES |
| AD-05 Sellers list | None | ui | ui-test-engineer | YES |
| AD-06 Seller detail | None | ui | ui-test-engineer | YES |
| AD-07 Seller approve | None | e2e (P0 — approval unlocks SellerGate) | e2e-test-engineer | YES — P0 |
| AD-08 Seller reject + comment | None | e2e (P0) | e2e-test-engineer | YES — P0 |
| AD-09 Activate / deactivate | None | ui | ui-test-engineer | YES |
| AD-10 Suspend / unsuspend | None | ui | ui-test-engineer | YES |
| AD-11 PAN verify | None | ui | ui-test-engineer | YES |
| AD-12 GST verify | None | ui | ui-test-engineer | YES |
| AD-13 Pending approvals count | None | api (route handler) | api-test-engineer | YES |
| AD-14 Address change approval | None | ui, e2e | ui-test-engineer | YES |
| AD-15 Admin orders list | None | ui | ui-test-engineer | YES |
| AD-16 Admin order detail + tracking | None | ui (stub AWB) | ui-test-engineer | YES |
| AD-17 Admin payments page | None | ui | ui-test-engineer | YES |
| AD-18 Admin returns list | None | ui | ui-test-engineer | YES |
| AD-19 Approve return | None | e2e | e2e-test-engineer | YES |
| AD-20 Reject return | None | ui | ui-test-engineer | YES |
| AD-21 Admin payouts list | None | ui | ui-test-engineer | YES |
| AD-22 Process payouts | None | api + ui (P1 — money) | api-test-engineer | YES — P1 |
| AD-23 Admin analytics | None | ui | ui-test-engineer | YES |
| AD-24 Admin buyers list | None | ui | ui-test-engineer | YES |
| AD-25 Admin settings | None | ui | ui-test-engineer | YES |
| AD-26 Admin guard | None | ui (P0 — auth boundary) | ui-test-engineer | YES — P0 |

### Web API Route Handlers

| Feature | Current Coverage | Test Type(s) Needed | Owner | Gap? |
|---|---|---|---|---|
| AR-01 to AR-18 (all routes) | None | api (Next.js route handler unit tests) | api-test-engineer | ALL YES |

### Mobile — Buyer App

| Feature | Current Coverage | Test Type(s) Needed | Owner | Gap? |
|---|---|---|---|---|
| MB-01 to MB-27 (all screens) | **ZERO — no test harness** | component (Jest+RNTL) + mobile-e2e (Maestro/Detox) | **mobile-test-engineer (NEW)** | ALL YES |

### Backend Services

| Service | Current API Tests | Gaps |
|---|---|---|
| admin-service | 13 tests (coupons, settings) | Missing: auth bridge flows (msg91-exchange, check-phone, otp/send, otp/verify, test-login guard), stores CRUD, users CRUD |
| analytics-service | 7 tests (store + platform ownership) | Missing: top-products by category, date-range params, admin store rankings |
| catalog-service | 10 tests (products authz, stores public, KYC leak) | 2 failing (PRODUCT-02, PRODUCT-03 mock bugs); missing: reviews CRUD, store follow, product create/update, store not-approved 404 |
| delivery-service | 9 tests (rates, track, create/cancel shipment, NDR) | 1 failing (PRODUCT-01 fee=80 vs 60); missing: pickup/register, pickup/refresh, commission calculation unit tests |
| notification-service | 33 tests (service-level) + 7 (api) | Good coverage; missing: SMS fallback path, FCM graceful failure |
| order-service | 9 tests (list/get authz, status update) | 1 warning (order_events insert mock); missing: order create, cart CRUD, cancel endpoint, order status event chain |
| payment-service | 14 tests (create-order, verify, refund, HMAC) | Missing: webhook handler, confirm (new flow), payment method fetch |
| payout-service | 8 tests (list, summary, bank-account) | Missing: process payout (admin-only, money), bank-account create/update, TCS/commission calculation |
| return-service | 9 tests (get, list, buyer path) | Missing: file return (POST), approve/reject return, refund trigger |
| whatsapp-service | 11 tests (service-level) + 5 (api) | Missing: bot session state machine (conversation flows), Razorpay checkout via WhatsApp |

### Database Integrity

| Concern | Current Coverage | Gap? |
|---|---|---|
| DB-01 to DB-18 (all RLS) | **ZERO — `tests/db/` is empty** | ALL YES |

---

## 3. Gaps and Priorities

### P0 — Block deploy; must ship with any production cut

These are money-critical paths, auth boundaries, and approval-gate logic. A bug in any of these has direct financial, security, or UX-blocking impact.

| # | Gap | Surface | Type | Owner |
|---|---|---|---|---|
| P0-1 | Commit + run: pending seller re-register toast + redirect (scenario 2) | Web-Seller e2e | e2e | ui-test-engineer |
| P0-2 | Commit + run: approved seller re-register toast + redirect (scenario 3) | Web-Seller e2e | e2e | ui-test-engineer |
| P0-3 | Commit + run: logged-in pending seller → `/seller/register` redirect (scenario 5) | Web-Seller e2e | e2e | ui-test-engineer |
| P0-4 | Admin login success/failure (auth boundary) | Web-Admin ui | ui | ui-test-engineer |
| P0-5 | Admin guard: non-admin blocked from dashboard | Web-Admin ui | ui | ui-test-engineer |
| P0-6 | Seller login registered → dashboard | Web-Seller e2e | e2e | e2e-test-engineer |
| P0-7 | Buyer checkout: cart → OTP (mocked) → address → COD order → confirmation | Web-Storefront e2e | e2e | e2e-test-engineer |
| P0-8 | Admin approves seller → SellerGate unlocks | Cross-role e2e | e2e | e2e-test-engineer |
| P0-9 | Admin rejects seller with comment → seller sees rejection screen | Cross-role e2e | e2e | e2e-test-engineer |
| P0-10 | Payment create-order ownership (HIGH-2) — already tested; keep green | Backend api | api | api-test-engineer |
| P0-11 | Payment verify ownership + signature (HIGH-1) — already tested; keep green | Backend api | api | api-test-engineer |
| P0-12 | Payment refund buyer/seller + amount cap — already tested; keep green | Backend api | api | api-test-engineer |
| P0-13 | RLS: buyer cannot read another buyer's orders | DB integrity | db | db-integrity-test-engineer |
| P0-14 | RLS: seller cannot read another seller's products or orders | DB integrity | db | db-integrity-test-engineer |
| P0-15 | RLS: anon cannot write to orders/users | DB integrity | db | db-integrity-test-engineer |
| P0-16 | Fix INFRA-01 (`test:api` script path) | Infra | - | qa-lead |
| P0-17 | Fix INFRA-03 (install WebKit) and add to `test.yml` | Infra | - | e2e-test-engineer |
| P0-18 | Fix PRODUCT-01 delivery fee mock (80 not 60) | Backend api | api | api-test-engineer |
| P0-19 | Fix PRODUCT-02/03 catalog mock (stores→products two-query) | Backend api | api | api-test-engineer |

### P1 — Within one sprint (core flows, security boundaries)

| # | Gap | Surface | Type | Owner |
|---|---|---|---|---|
| P1-1 | SellerGate: pending/approved/rejected variants | Web-Seller ui | ui | ui-test-engineer |
| P1-2 | Seller login unregistered → error | Web-Seller ui | ui | ui-test-engineer |
| P1-3 | Seller rejected → edit form prefilled → resubmit → pending | Web-Seller e2e | e2e | e2e-test-engineer |
| P1-4 | Admin payout process (admin-only gate) | Backend api | api | api-test-engineer |
| P1-5 | Payout bank-account scoped to caller (MED-8) — test it | Backend api | api | api-test-engineer |
| P1-6 | Return file + approve + reject lifecycle | Backend api | api | api-test-engineer |
| P1-7 | Order create (buyer) + cancel | Backend api | api | api-test-engineer |
| P1-8 | Cart CRUD (add/update/remove) | Backend api | api | api-test-engineer |
| P1-9 | Payment webhook Razorpay signature | Backend api | api | api-test-engineer |
| P1-10 | Catalog: store not approved → products endpoint 404 | Backend api | api | api-test-engineer |
| P1-11 | Catalog: product create + update (seller owns) | Backend api | api | api-test-engineer |
| P1-12 | Admin auth bridge: check-phone returns correct approval_status | Backend api | api | api-test-engineer |
| P1-13 | WhatsApp bot session state machine (order query flow) | Backend api | notification-test-engineer | notification-test-engineer |
| P1-14 | Notification: SMS fallback path | Backend notification | notification | notification-test-engineer |
| P1-15 | DB: stock decrement trigger fires on order insert, no double-decrement | DB integrity | db | db-integrity-test-engineer |
| P1-16 | DB: KYC columns not in public store read via safe-column view | DB integrity | db | db-integrity-test-engineer |
| P1-17 | DB: users.phone not visible to anon | DB integrity | db | db-integrity-test-engineer |
| P1-18 | Add order_events insert mock to order-service test | Backend api | api | api-test-engineer |
| P1-19 | Upgrade Vitest to 4.1.8 (INFRA-02) | Infra | - | qa-lead |
| P1-20 | CI: uncomment e2e-tests job in `test.yml`, add WebKit install step | CI | - | e2e-test-engineer |

### P2 — Next sprint (coverage depth)

| # | Gap | Surface | Owner |
|---|---|---|---|
| P2-1 | Dashboard home: stats load, realtime new-order toast | Web-Seller ui | ui-test-engineer |
| P2-2 | Products CRUD: add, edit, toggle visibility, delete | Web-Seller ui | ui-test-engineer |
| P2-3 | Orders list filters + status workflow | Web-Seller e2e | e2e-test-engineer |
| P2-4 | Settings: store info save, slug uniqueness | Web-Seller ui | ui-test-engineer |
| P2-5 | Marketplace home: store cards, carousels | Web-Storefront ui | ui-test-engineer |
| P2-6 | Storefront: product grid, search filter | Web-Storefront ui | ui-test-engineer |
| P2-7 | Order confirmation page: summary + app download CTA | Web-Storefront ui | ui-test-engineer |
| P2-8 | Admin sellers list + detail: KYC doc signed URLs | Web-Admin ui | ui-test-engineer |
| P2-9 | Admin orders + tracking timeline (stub AWB) | Web-Admin ui | ui-test-engineer |
| P2-10 | Admin returns: approve/reject actions | Web-Admin e2e | e2e-test-engineer |
| P2-11 | Delivery: commission calculation unit test | Backend api | api-test-engineer |
| P2-12 | Delivery: pickup register/refresh (internal key) | Backend api | api-test-engineer |
| P2-13 | Analytics: store analytics date-range params | Backend api | api-test-engineer |
| P2-14 | Mobile: harness scaffold (Jest + RNTL) | Mobile | mobile-test-engineer |
| P2-15 | Mobile: auth flow component tests (PhoneScreen, OTPScreen) | Mobile | mobile-test-engineer |
| P2-16 | Mobile: HomeScreen renders store cards | Mobile | mobile-test-engineer |
| P2-17 | Mobile: CartStore state (add/remove/clear) | Mobile | mobile-test-engineer |
| P2-18 | Performance: k6 baseline (storefront GET, order-service GET) | Performance | performance-test-engineer |
| P2-19 | Next.js API route handlers (AR-01 to AR-18) unit tests | Backend api | api-test-engineer |

### P3 — Polish / edge cases

| # | Gap | Owner |
|---|---|---|
| P3-1 | Checkout: already-authenticated buyer skips phone/OTP | e2e-test-engineer |
| P3-2 | Checkout: pincode edge cases (5-digit, non-numeric) | ui-test-engineer |
| P3-3 | Checkout: empty cart state redirect | ui-test-engineer |
| P3-4 | Slug auto-generation (migration 028) idempotent | db-integrity-test-engineer |
| P3-5 | Product share links: WhatsApp / Instagram / copy-to-clipboard | ui-test-engineer |
| P3-6 | QR code download (PNG blob) | ui-test-engineer |
| P3-7 | Excel export: orders, customers | ui-test-engineer |
| P3-8 | Print invoice: window.print called | ui-test-engineer |
| P3-9 | Buyer addresses: add/edit/delete | ui-test-engineer |
| P3-10 | Realtime tracking: order timeline updates | e2e-test-engineer |
| P3-11 | Mobile: OrderTrackingScreen realtime | mobile-test-engineer |
| P3-12 | Mobile: WishlistScreen add/remove | mobile-test-engineer |
| P3-13 | Mobile: ReturnRequestScreen file return | mobile-test-engineer |
| P3-14 | Mobile: WriteReviewScreen submit | mobile-test-engineer |
| P3-15 | Mobile: cross-device sync (mergeGuestAddressesIntoAccount) | mobile-test-engineer |
| P3-16 | k6: ramp / spike test on order creation | performance-test-engineer |
| P3-17 | k6: store listing under 50 VU concurrent | performance-test-engineer |
| P3-18 | DB: RLS on `followed_stores` (buyer_id not enumerable) | db-integrity-test-engineer |
| P3-19 | DB: `interstate_demand` insert isolation | db-integrity-test-engineer |

**Rough test-case counts by surface:**

| Surface | P0 | P1 | P2 | P3 | Total est. |
|---|---|---|---|---|---|
| Backend API (10 services) | 8 existing + 10 fixes/new | ~25 | ~15 | ~5 | ~60 |
| Web-Storefront (Playwright) | 2 | 5 | 12 | 8 | ~27 |
| Web-Seller (Playwright) | 5 | 8 | 15 | 8 | ~36 |
| Web-Admin (Playwright) | 4 | 4 | 10 | 3 | ~21 |
| Next.js API route handlers | 0 | 2 | 18 | 0 | ~20 |
| DB integrity (Supabase/Vitest) | 3 | 5 | 4 | 4 | ~16 |
| Notification/WhatsApp | 0 (existing good) | 2 | 2 | 0 | ~4 new |
| Mobile (buyer-app) | 0 | 0 | 6 | 8 | ~14 |
| Performance (k6) | 0 | 0 | 2 | 3 | ~5 |
| **TOTAL** | | | | | **~203 net new** |

---

## 4. Mobile Testing Assessment

### Current state

The buyer-app has:
- Zero test files anywhere (confirmed by `find` over `reelmart/apps/buyer-app`)
- No test dependency in `package.json` (no jest, no RNTL, no Detox, no Maestro)
- No test scripts in `package.json`
- 27 distinct screens/flows spanning auth, home, store, cart, checkout, orders, profile, returns, reviews

### Harness recommendation

**Two-tier approach** is correct for an Expo/React Native app:

**Tier 1 — Component tests: Jest + React Native Testing Library (RNTL)**
- Tests individual screens and service modules in isolation (no device/simulator needed)
- Compatible with Expo SDK 54 via `jest-expo` preset
- Covers: auth store logic (Zustand), service modules (`cartService`, `orderService`, `profileService`, `orderPricing`, `interstateGst`), screen render tests (PhoneScreen, OTPScreen, HomeScreen, CartScreen, OrderHistoryScreen)
- Install: `jest-expo`, `@testing-library/react-native`, `@testing-library/jest-native`
- Configuration: `jest.config.js` with `preset: 'jest-expo'`
- Location: `reelmart/apps/buyer-app/__tests__/` (parallel to `src/`)

**Tier 2 — Mobile E2E: Maestro**
- Maestro is YAML-based, requires no code compilation, and runs against a live device or emulator
- Preferred over Detox for Expo SDK 54 because it does not require a native build phase in CI — it runs against a debug build
- Covers: full auth flow (phone → OTP → profile), storefront browse → cart → checkout, order tracking screen
- Location: `reelmart/apps/buyer-app/.maestro/`
- CI note: Maestro requires Android emulator or physical device; on GitHub Actions, use `reactivecircus/android-emulator-runner` action; iOS requires macOS runner

**What NOT to use:**
- Playwright is not suitable for React Native — it does not support the React Native runtime
- Detox is viable but requires native build steps that are expensive in CI and complex with Expo SDK 54's CNG setup; Maestro is simpler for the scope here

### Agent decision: create mobile-test-engineer (new agent — YES)

**Verdict: Create a new `mobile-test-engineer` agent.**

The existing six testing specialists are all web/API scoped:
- `ui-test-engineer` — Playwright web browser
- `e2e-test-engineer` — Playwright cross-role web flows
- `api-test-engineer` — Vitest + Supertest backend
- `db-integrity-test-engineer` — Supabase SQL + RLS
- `notification-test-engineer` — Gupshup/FCM/MSG91 mocks
- `performance-test-engineer` — k6 HTTP

None of them knows the Expo/React Navigation/AsyncStorage/SecureStore environment, can configure `jest-expo`, or can author Maestro flows. Assigning mobile testing to `ui-test-engineer` would be wrong — the toolchain, environment model (device vs. browser), and test authoring patterns are completely different.

**Scope of `mobile-test-engineer`:**
- Owns `reelmart/apps/buyer-app/__tests__/` (Jest + RNTL component tests)
- Owns `reelmart/apps/buyer-app/.maestro/` (Maestro e2e flows)
- Bootstrap: add `jest-expo` + RNTL to `buyer-app/package.json`, create `jest.config.js`
- Coordinates with `e2e-test-engineer` for cross-surface flows (buyer-web → buyer-app login with same number)
- Does NOT own seller-app (parked, out of scope)
- Does NOT own web Playwright (those are `ui-test-engineer` / `e2e-test-engineer`)

**Boundary:** everything under `reelmart/apps/buyer-app/` is `mobile-test-engineer` territory. Everything under `reelmart/apps/web/` stays with `ui-test-engineer` / `e2e-test-engineer`.

---

## 5. Phased Execution Plan

### Wave 0 — Harness repair (prerequisite, ~1 day, before any new tests)

**Goal:** all existing passing tests stay green in CI; no more broken scripts or missing browsers.

| Task | Owner | Artifact |
|---|---|---|
| Fix `test:api` and `test:db` script paths in `tests/package.json` | qa-lead | `tests/package.json` |
| Upgrade `vitest` to `^4.1.8` in `tests/package.json` | qa-lead | `tests/package.json` |
| Install WebKit: `npx playwright install webkit` | e2e-test-engineer | (local + CI) |
| Add `npx playwright install --with-deps` step to `test.yml` | e2e-test-engineer | `.github/workflows/test.yml` |
| Fix PRODUCT-01: delivery mock fee 80 | api-test-engineer | `tests/api/delivery-service/authz.test.ts` |
| Fix PRODUCT-02/03: catalog two-query stores→products mock | api-test-engineer | `tests/api/catalog-service/authz.test.ts` |
| Fix PRODUCT-05: add `order_events.insert` to order-service mock | api-test-engineer | `tests/api/order-service/authz.test.ts` |
| Commit + push `tests/e2e/seller-register-flow.spec.ts` (untracked) | ui-test-engineer | `tests/e2e/` |
| Deploy seller-register fix to Vercel (so e2e scenarios 2/3/5 pass) | devops-engineer / ui-engineer | `dev.reelmart.in` |
| Verify all 120 API tests + 44 service-level tests pass clean | qa-lead | CI `test.yml` |

**Exit criterion:** CI `all-tests-pass` is green with 0 failures; `test.yml` e2e job uncommented and also green for Chrome project.

### Wave 1 — P0 web + API (2–3 days)

**Goal:** every money, auth, and approval-gate path has at minimum one automated test. Deploys are gated on these.

| Task | Owner | Test files |
|---|---|---|
| Admin login success/failure; admin guard (AD-01, AD-02, AD-26) | ui-test-engineer | `tests/ui/admin-auth.spec.ts` |
| Seller login registered → dashboard (SD-01); already-registered paths (SD-04, SD-05 — must be green post-deploy) | ui-test-engineer | `tests/e2e/seller-register-flow.spec.ts` (extend) |
| Full buyer checkout e2e: COD flow (WS-07 → WS-12 → WS-14) | e2e-test-engineer | `tests/e2e/buyer-checkout-flow.spec.ts` |
| Admin approve seller + SellerGate unlock (AD-07, AD-08) | e2e-test-engineer | `tests/e2e/admin-seller-approval.spec.ts` |
| DB RLS isolation P0 (DB-01, DB-14, DB-15, DB-18) | db-integrity-test-engineer | `tests/db/rls-core.test.ts` |
| CI: uncomment e2e job in `test.yml`; add Chrome + WebKit projects | e2e-test-engineer | `.github/workflows/test.yml` |
| Admin-service auth bridge API tests (BA-01 to BA-05) | api-test-engineer | `tests/api/admin-service/authz.test.ts` (extend) |
| Payout process admin-only + bank-account scoping (BA-57, BA-58) | api-test-engineer | `tests/api/payout-service/authz.test.ts` (extend) |

**Exit criterion:** `all-tests-pass` gate includes e2e job; full P0 list is covered; no skipped tests.

### Wave 2 — P0 mobile harness + P1 web + API (1 week)

**Goal:** mobile test infrastructure stands up; P1 backend gaps closed; core seller/admin flows covered by Playwright.

| Task | Owner | Test files |
|---|---|---|
| Bootstrap mobile harness: add `jest-expo` + RNTL to buyer-app, create `jest.config.js` | mobile-test-engineer | `reelmart/apps/buyer-app/package.json`, `jest.config.js` |
| Mobile: auth store unit tests (authStore, OTPScreen, PhoneScreen) | mobile-test-engineer | `reelmart/apps/buyer-app/__tests__/auth/` |
| Mobile: CartStore logic (add/remove/clear/persist) | mobile-test-engineer | `reelmart/apps/buyer-app/__tests__/store/cartStore.test.ts` |
| Mobile: orderPricing + interstateGst unit tests | mobile-test-engineer | `reelmart/apps/buyer-app/__tests__/services/` |
| Mobile: HomeScreen renders store cards (RNTL) | mobile-test-engineer | `reelmart/apps/buyer-app/__tests__/screens/HomeScreen.test.tsx` |
| SellerGate variants (pending/approved/rejected) | ui-test-engineer | `tests/ui/seller-gate.spec.ts` |
| Seller login unregistered error | ui-test-engineer | `tests/ui/seller-auth.spec.ts` |
| Seller rejected → resubmit flow | e2e-test-engineer | `tests/e2e/seller-resubmit-flow.spec.ts` |
| Return service: file + approve + reject (BA-60 to BA-64) | api-test-engineer | `tests/api/return-service/authz.test.ts` (extend) |
| Order create + cancel (BA-42, BA-44) | api-test-engineer | `tests/api/order-service/authz.test.ts` (extend) |
| Cart CRUD (BA-45 to BA-48) | api-test-engineer | `tests/api/order-service/cart.test.ts` (new) |
| Payment webhook + confirm (BA-51, BA-52) | api-test-engineer | `tests/api/payment-service/authz.test.ts` (extend) |
| DB RLS P1 (stock trigger, KYC view, users.phone) | db-integrity-test-engineer | `tests/db/rls-p1.test.ts` |
| Notification SMS fallback; FCM graceful failure | notification-test-engineer | service-level test extend |

### Wave 3 — P2 coverage depth + performance baseline (1–2 weeks)

**Goal:** all major screens have at least a smoke Playwright test; k6 baseline established; mobile Maestro e2e harness running.

| Task | Owner |
|---|---|
| Web-Storefront: marketplace home, storefront page, product detail, order confirmation | ui-test-engineer |
| Web-Seller dashboard: products CRUD, orders list, settings, analytics, payouts | ui-test-engineer |
| Web-Admin: sellers list/detail, orders, payments, returns | ui-test-engineer |
| Next.js API route handler tests (AR-01 to AR-18) | api-test-engineer |
| Catalog: product create/update, reviews, store follow (BA-16 to BA-26) | api-test-engineer |
| Delivery: commission unit, pickup register/refresh (BA-32, BA-33) | api-test-engineer |
| k6 baseline: storefront GET, orders GET, 10 VU / 30s | performance-test-engineer |
| Mobile Maestro: phone → OTP → profile → home feed flow | mobile-test-engineer |
| Mobile Maestro: storefront → cart → checkout order flow | mobile-test-engineer |
| DB: remaining RLS checks (payouts, returns, addresses, bank_accounts) | db-integrity-test-engineer |

### Wave 4 — P3 + mobile full coverage + performance spike (ongoing)

| Task | Owner |
|---|---|
| Checkout edge cases: pincode validation, empty cart, already-auth | ui-test-engineer / e2e-test-engineer |
| Seller: QR download, Excel export, print invoice, WhatsApp share | ui-test-engineer |
| Mobile: WishlistScreen, ReturnRequestScreen, WriteReviewScreen, AddressesScreen | mobile-test-engineer |
| Mobile: cross-device sync (mergeGuestAddressesIntoAccount) | mobile-test-engineer |
| Mobile: realtime tracking screen | mobile-test-engineer |
| k6 spike test: 0→50 VU ramp on order create | performance-test-engineer |
| k6 storefront: 50 VU concurrent | performance-test-engineer |
| DB: migration idempotency (slug generation, RLS on followed_stores, interstate_demand) | db-integrity-test-engineer |
| Razorpay web checkout e2e (when wired — DEFERRED until feature shipped) | e2e-test-engineer |
| RazorpayX payout e2e (when wired — DEFERRED) | e2e-test-engineer |

---

## 6. Coverage Targets (to track at end of each wave)

| Metric | After Wave 0 | After Wave 1 | After Wave 2 | After Wave 3 |
|---|---|---|---|---|
| Backend API tests passing | 161/164 (fix 3 failures) | 175+ | 210+ | 240+ |
| Playwright specs (web) | 1 spec / 12 scenarios | 5 specs / ~35 scenarios | 12 specs / ~70 scenarios | 25 specs / ~130 scenarios |
| DB integrity tests | 0 | 5 | 12 | 18 |
| Mobile component tests | 0 | 0 | 12 | 20 |
| Mobile e2e (Maestro) | 0 | 0 | 2 flows | 8 flows |
| Performance k6 scripts | 0 | 0 | 0 | 2 |
| CI gate covers | api+typecheck | api+typecheck+e2e(Chrome) | +e2e(WebKit)+db | +perf baseline |

---

## 7. Agent Ownership Summary

| Agent | Primary test files | Surfaces |
|---|---|---|
| **qa-lead** | `tests/package.json`, `tests/vitest.config.ts`, `tests/playwright.config.ts`, `.github/workflows/test.yml` | Framework, CI, coverage gate |
| **api-test-engineer** | `tests/api/*/authz.test.ts`, `tests/api/*/cart.test.ts` | All 10 backend service endpoints + Next.js API route handlers |
| **ui-test-engineer** | `tests/ui/*.spec.ts` | Web page-level Playwright: seller-auth, seller-gate, admin-auth, product-page, checkout-form, etc. |
| **e2e-test-engineer** | `tests/e2e/*.spec.ts` | Cross-role flows: buyer checkout, seller registration, admin approval, return lifecycle |
| **db-integrity-test-engineer** | `tests/db/*.test.ts` | Supabase RLS, triggers, migration correctness |
| **notification-test-engineer** | `reelmart/services/notification-service/tests/`, `reelmart/services/whatsapp-service/tests/` | Gupshup/FCM/MSG91 (mocked), bot session, SMS fallback |
| **performance-test-engineer** | `tests/performance/*.js` (k6) | Storefront + order read paths under load |
| **mobile-test-engineer (NEW)** | `reelmart/apps/buyer-app/__tests__/`, `reelmart/apps/buyer-app/.maestro/` | All buyer-app screens: Jest+RNTL component tests + Maestro e2e |
