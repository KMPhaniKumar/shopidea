# Shopidea — Development Tracker
### Social Commerce Platform for Indian Micro-Sellers
### Last Updated: 2026-05-09

---

## Overall Progress

```
Total Agents:     18
Completed:        18  (ALL AGENTS COMPLETE ✅)
In Progress:       0
Pending:           0

Progress: ████████████████████ 100%
```

**Production-blockers remaining (see [`agents/AUDIT_gaps.md`](agents/AUDIT_gaps.md) for the full list):**
- Razorpay web checkout SDK wiring (~30 min)
- DLT/SMS provider for production OTP delivery to +91 numbers
- App store submission (Play Store + App Store)

---

## Daily Log

| Date       | What Was Built | Agent | Files Created |
|------------|----------------|-------|---------------|
| 2026-05-01 | Full monorepo structure, all 12 DB migrations, backend Express app (payments, delivery, WhatsApp, push, payouts), Next.js web base, seller+buyer app scaffolding, shared TypeScript types | Agent 00 | 35+ files |
| 2026-05-01 | Complete auth system both apps — PhoneScreen, OTPScreen, ProfileSetupScreen, authStore (Zustand), RootNavigator with auth guard, session persistence, OTP countdown, 3-attempt lockout | Agent 01 | 16 files |
| 2026-05-01 | Seller onboarding — StoreNameScreen (live URL preview), CategoryScreen (7-category grid), LocationScreen (city autocomplete), LogoScreen (gallery pick + compress + upload), StoreReadyScreen (WhatsApp share), storeService, sellerStore, EditStoreScreen, full 4-step RootNavigator flow | Agent 02 | 10 files |
| 2026-05-01 | Products — ProductListScreen (grid, 4 filters, toggle, long-press delete, FAB), AddProductScreen (5 photos, price+compare, unlimited/counted stock, low stock threshold), EditProductScreen (edit + delete), VariantBuilder component (size/color/flavor/weight, per-option pricing), productService, productStore, RootNavigator updated | Agent 03 | 7 files |
| 2026-05-01 | Orders+Payments+Delivery — seller: OrderListScreen (3 tabs, realtime, accept/reject), OrderDetailScreen (full detail + status progression), orderService + orderStore; buyer: CheckoutScreen (address form, COD/online), PaymentScreen (Razorpay SDK open, backend verify), OrderTrackingScreen (realtime timeline), OrderHistoryScreen, both RootNavigators updated | Agent 04/05/06 | 11 files |
| 2026-05-01 | Notifications — whatsapp.ts (notify object, order event templates), push.ts (pushNotify object), notifications route (new-order/status-change endpoints, register-token), order-notifications Edge Function (Supabase → backend trigger); Discovery — discoveryService.ts (search, follow/unfollow, city/category filters), HomeScreen (city picker, category chips, top-rated, new stores, search), StorefrontScreen (product grid, in-component cart, checkout nav, WhatsApp link, follow); Reviews — reviewService.ts (submit+photos+loyalty coins, get reviews), WriteReviewScreen (star rating, photo upload, coin hint), StoreReviewsScreen (seller view + inline reply); Analytics — analyticsService.ts (revenue summary, daily chart, top products, customer insights), AnalyticsScreen (stat cards, 7-day bar chart, top products, repeat rate bar); seller ProductListScreen updated with nav buttons | Agent 07/08/09/10 | 16 files |
| 2026-05-01 | Seller Dashboard+Payouts — payoutService.ts (getPayoutSummary, getBankAccount, saveBankAccount, getSellerPreferences, saveSellerPreferences), DashboardScreen (greeting, today stats, open/close toggle, quick actions grid, pending orders alert, low stock alert, recent orders, realtime subscription), BankAccountScreen (IFSC validation, account number masking, verified badge), PayoutHistoryScreen (orange balance card, total earned/paid, payout list with status badges), SettingsScreen (profile card, auto-accept toggle, notification prefs with live save, nav rows, sign out); seller RootNavigator updated with Dashboard as entry + Payouts+Settings screens | Agent 11 | 6 files |
| 2026-05-03 | Buyer Cart+Profile — cartService.ts (addToCart single-store enforce, calculateCartTotals, cartItemsToCheckout, validateCoupon), cartStore.ts (Zustand: items/itemCount/subtotal/storeId, addItem/removeItem/updateQty/fetchCart), profileService.ts (saveAddress, toggleWishlist, getCoinBalance, getCoinHistory, buildReferralLink), CartScreen.tsx (delivery fee logic, store banner, qty controls, coupon input+validation, summary, fixed checkout footer), ProfileScreen.tsx (avatar, coins card, referral card, stats row, nav sections), AddressesScreen.tsx (address cards, inline AddAddressForm, phone+pincode validation), WishlistScreen.tsx (2-col grid, remove with optimistic UI, unavailable badge), buyer RootNavigator updated (Cart/Profile/Addresses/Wishlist/Payment/WriteReview/ReturnRequest screens), HomeScreen updated (cart badge, fetchCart on mount) | Agent 12+14 | 9 files |
| 2026-05-03 | WhatsApp Bot — backend/src/whatsapp/bot.ts (in-memory sessions with 30-min TTL, handleBotMessage: menu→product→variant→quantity→address→Razorpay payment link flow), whatsapp route updated (POST /webhook + GET /payment-callback + POST /broadcast with requireAuth); Coupons+Broadcast — seller couponService.ts (CRUD coupons, sendBroadcast via backend), CouponsScreen.tsx (create form with %, ₹ types; toggle active/inactive; delete), BroadcastScreen.tsx (compose WhatsApp blast to all past customers, history list); Returns — returnService.ts (requestReturn with 24h window validation, getReturnForOrder), ReturnRequestScreen.tsx (reason picker, photo upload, 24h warning), backend /api/payments/refund endpoint (Razorpay refund + DB update, admin-only); Admin Panel — Next.js /admin/* pages: login (email+password+is_admin guard), layout (SSR auth check), AdminNav, Dashboard (GMV, seller/buyer counts), Sellers (verify/suspend actions), Orders (paginated with status filter), Returns (approve/reject/refund actions), Payouts (pending by store, process button); CI/CD — .github/workflows/deploy.yml (lint+build+deploy backend/web/supabase on main push); Web Storefront — /s/[slug] with SSR metadata, StorefrontClient (product grid, in-page cart, WhatsApp order, app install banner, reviews) | Agents 13-17 + Storefront | 26 files |
| 2026-05-09 | **AWS deployment kickoff (paused mid-flight)**. Wrote Terraform for all infra modules and dev environment compositions. **Phases 0–3 applied** to AWS account `632127307144` / ap-south-1: state backend (S3 + DynamoDB), GitHub OIDC + `reelmart-gha-deploy` role, VPC + 2 public subnets + ALB (HTTP-only, 10 path-based rules) + 10 ECR repos + 7 Secrets Manager containers + IAM task roles + 10 CloudWatch log groups, ECS cluster `reelmart-dev` with 1× t3.small registered via capacity provider, all 10 service images built (linux/amd64) and pushed as `dev-latest` + `dev-4dc7faa`. **Phase 4 blocked** on populating real secret values via `infra/scripts/populate-secrets.sh dev`. ALB DNS: `reelmart-dev-alb-1685112985.ap-south-1.elb.amazonaws.com`. Recurring spend ~$35/mo already on. See `DEPLOYMENT_PLAN.md` "Live Status" for resume steps. | Deployment Phase 0–3 | infra/terraform/modules/{network,ecs-cluster,alb,ecr,iam,secrets,ec2-asg,ecs-service}/, infra/terraform/environments/dev/{network,cluster,services}/ |
| 2026-05-08 | **Buyer experience polish + Public Web Buyer Flow**. Mobile: header redesign (orange hero, circular logo, white categories, search + address bar), seller-group sections (Clothing/Jewellery/Beauty with colored backgrounds), wishlist heart overlay on product cards, order date/time everywhere, **realtime status updates on Orders tab** (useFocusEffect + Supabase channel UPDATE filter), pull-to-refresh, address-id-based default tracking, RootNavigator waits for profile load before routing (no banner flicker post-login). LocationPromptModal: custom Places API search (replaced component), 2-step search→form, manual entry fallback, Swiggy-style form. Address persistence migrated from AsyncStorage to Supabase `addresses` table — guest addresses auto-merge into account on login (cross-device sync). **Public Web Buyer Flow**: `/store/[slug]` storefront (RSC + ISR `revalidate:60`), `/store/[slug]/checkout` (multi-step: cart → phone OTP → address selection → payment), `/order/[id]` confirmation with prominent "Track in ReelMart app" CTA, `/s/[slug]` legacy redirect. Seller orders page realtime subscription rewritten (proper cleanup, refresh button, error states). Auth: dev OTP banner (9999999999 / 123456) on buyer + seller; middleware redirects to `/seller/register` if no seller role; dev-mode bypass. | Web Storefront v2 + Buyer Polish | ~20 files |

---

## Agent Status Board

| # | Agent | Feature | Est. Days | Status | Started | Done |
|---|-------|---------|-----------|--------|---------|------|
| 0 | agent_00 | Project setup + Supabase init | 0.25 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 1 | agent_01 | Phone OTP auth (seller + buyer) | 1 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 2 | agent_02 | Seller onboarding + store creation | 2 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 3 | agent_03 | Products + variants + images | 2 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 4 | agent_04_05_06 | Orders + Razorpay + Shiprocket | 5 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 5 | agent_07_08_09_10 | WhatsApp alerts + search + reviews + analytics | 4 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 6 | agent_11 | Seller dashboard + payouts + bank | 2 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 7 | agent_12 | Buyer cart + addresses + wishlist | 3 | ✅ DONE | 2026-05-03 | 2026-05-03 |
| 8 | agent_13_17 | WhatsApp bot + coupons + returns + admin + infra | 5 | ✅ DONE | 2026-05-03 | 2026-05-03 |
| 9 | agent_00 (storefront v1) | Buyer web storefront (Next.js) — `/s/[slug]` with WhatsApp checkout | 3 | ✅ DONE | 2026-05-03 | 2026-05-03 |
| 10 | agent_18 (storefront v2) | Public web buyer flow at `/store/[slug]` — full checkout (phone OTP + addresses + place order), order confirmation page with app download CTA, cross-device address sync, realtime order updates on buyer Orders tab | 2 | ✅ DONE | 2026-05-08 | 2026-05-08 |

**Total Estimated: ~29 days**

---

## Deployment Phase Board (AWS dev environment)

> Runs alongside the Agent board above. Phases mirror `infra/agents/` and `DEPLOYMENT_PLAN.md`. Authoritative status lives in `DEPLOYMENT_PLAN.md` "Live Status".

| # | Phase                              | Status      | Notes |
|---|------------------------------------|-------------|---|
| 0 | AWS bootstrap                      | ✅ DONE     | Account 632127307144, profile `reelmart-admin` (SSO temp creds), state in `s3://reelmart-tf-state-632127307144` |
| 1 | Network + ALB + ECR + cluster      | ✅ DONE     | 74 resources. ALB on HTTP-only until Phase 5 attaches the cert |
| 2 | EC2 ASG (1× t3.small)              | ✅ DONE     | Capacity provider `reelmart-dev-cp`, 1 container instance ACTIVE |
| 3 | Build & push 10 images             | ✅ DONE     | `dev-latest` + `dev-4dc7faa` in all 10 ECR repos |
| 4 | ECS task defs + services           | 🔴 BLOCKED  | Composition ready in `environments/dev/services/`; needs secrets populated first |
| 5 | DNS + SSL (Route 53 + ACM)         | ⏸ pending  | Hosted zone for `reelmart.in` may need creation/import |
| 6 | GitHub Actions OIDC + workflows    | ⏸ pending  | OIDC provider + role already created in Phase 0 |
| 7 | Web on Vercel                      | ⏸ pending  | Single project at `reelmart/apps/web` |
| 8 | Buyer mobile dev build (EAS)       | ⏸ pending  | `reelmart/apps/buyer-app` |
| 9 | CloudWatch alarms + SNS            | ⏸ pending  | |

**Recurring AWS spend live now:** ~$35/mo (ALB $17, t3.small $15, Secrets containers $2.80, Container Insights $0.50).

**Resume:** see "Resume here" block in `DEPLOYMENT_PLAN.md` — refresh SSO creds → `populate-secrets.sh dev` → `terraform apply` in `environments/dev/services/`.

---

## Feature Checklist — What's Built vs Pending

### Agent 00 — Project Setup ✅ DONE (2026-05-01)
- [x] Monorepo folder structure (apps/seller-app, apps/buyer-app, apps/web, backend, shared)
- [x] Supabase config.toml + local dev setup
- [x] React Native base app (seller) — package.json + Supabase client
- [x] React Native base app (buyer) — package.json + Supabase client
- [x] Next.js 14 web app — package.json + Supabase server+client libs + layout
- [x] Node.js + Express backend — full routes: payments, delivery, WhatsApp, push, payouts
- [x] Shared TypeScript types — all tables typed
- [x] Environment variable template (.env.example)
- [x] VS Code workspace config (extensions + settings)
- [x] Database migrations 001–012 (users, stores, products, orders, reviews, payouts, buyer features, marketing, returns, followed_stores, admin, RLS+storage+realtime)

### Agent 01 — Authentication ✅ DONE (2026-05-01)
- [x] Phone number input screen
- [x] OTP verification screen
- [x] Supabase phone auth (Twilio SMS)
- [x] Auth state persistence (AsyncStorage)
- [x] New user profile creation
- [x] Role detection (seller vs buyer flow)
- [x] Logout + session clear
- [x] Auth guard in RootNavigator (4-state guard)

### Agent 02 — Seller Onboarding ✅ DONE (2026-05-01)
- [x] Store name + category selection
- [x] City and area entry
- [x] Logo photo upload (store-logos bucket)
- [x] Auto-generated unique slug (reelmart.in/s/slug)
- [x] Share to WhatsApp button
- [x] Share via share sheet / copy link
- [x] Edit store profile screen
- [x] Store open/close toggle

### Agent 03 — Products ✅ DONE (2026-05-01)
- [x] Product list screen (seller view)
- [x] Add product form
- [x] Photo upload — up to 5 photos (product-images bucket)
- [x] Product variants (size, color, flavor, weight, other)
- [x] Variant-level pricing
- [x] Stock quantity (or unlimited)
- [x] Low stock threshold + alert
- [x] Hide/show product toggle
- [x] Edit product screen
- [x] Delete product (with confirm)

### Agent 04/05/06 — Orders + Payments + Delivery ✅ DONE (2026-05-01)
- [x] Buyer: checkout flow (address → payment → confirm)
- [x] Order creation in database
- [x] Realtime new order notification (seller app — subscribeToNewOrders)
- [x] Accept order (with confirmation)
- [x] Reject order (with reason modal)
- [x] Order status: pending → accepted → packed → shipped → delivered
- [x] OrderDetailScreen (seller) — full detail + status progression buttons
- [x] OrderListScreen (seller) — 3 tabs (New/Active/Completed), realtime
- [x] OrderHistoryScreen (buyer) — FlatList with reorder button
- [x] OrderTrackingScreen (buyer) — realtime timeline + tracking URL
- [x] CheckoutScreen — address form (validated), COD/online selector
- [x] PaymentScreen — Razorpay SDK, backend create-order + verify calls
- [x] Shiprocket rates endpoint (backend routes/delivery.ts)
- [x] Delivery fee: ₹60, free above ₹500
- [x] Both RootNavigators updated with order + checkout screens

### Agent 07 — Notifications ✅ DONE (2026-05-01)
- [x] Gupshup WhatsApp integration (sendWhatsApp, notify object)
- [x] WhatsApp: new order alert to seller
- [x] WhatsApp: order confirmation to buyer
- [x] WhatsApp: order status updates (accepted/packed/shipped/delivered/rejected)
- [x] Firebase FCM push (pushNotify.newOrder, pushNotify.orderStatusUpdate)
- [x] Push: new order (seller), order status update (buyer)
- [x] Device token registration endpoint (/api/notifications/register-token)
- [x] order-notifications Edge Function (Supabase webhook → backend)

### Agent 08 — Discovery ✅ DONE (2026-05-01)
- [x] discoveryService.ts (getStoresByCity, getTopRated, getNewStores, search, follow/unfollow)
- [x] HomeScreen (city picker, search bar, category chips, followed/top-rated/new sections)
- [x] StorefrontScreen (store info, product grid, in-screen cart, checkout nav, WhatsApp, follow toggle)
- [x] Buyer RootNavigator updated (Home, Storefront, WriteReview screens added)

### Agent 09 — Reviews & Ratings ✅ DONE (2026-05-01)
- [x] reviewService.ts (submitReview with photo upload, getStoreReviews, hasReviewedOrder)
- [x] WriteReviewScreen (1–5 star tap, text input, up to 3 photos, loyalty coin hint)
- [x] Loyalty coins awarded on submit (10 text-only, 20 with photos)
- [x] StoreReviewsScreen (seller — view all reviews, inline reply, avg rating)
- [x] Seller reply to review (stored in DB, shown to buyer)

### Agent 10 — Analytics ✅ DONE (2026-05-01)
- [x] analyticsService.ts (revenue summary today/week/month, getDailyRevenue, getTopProducts, getCustomerInsights)
- [x] AnalyticsScreen (stat cards, custom 7-day bar chart with no external deps, top products with sold count, repeat vs new customer bar)
- [x] Seller ProductListScreen updated with nav buttons (Orders, Analytics ⭐, Reviews, Settings)

### Agent 11 — Seller Dashboard & Payouts ✅ DONE (2026-05-01)
- [x] DashboardScreen — greeting, today's revenue/orders/pending, store open/close toggle
- [x] Quick actions grid (Products, Orders, Analytics, Payouts)
- [x] Pending orders alert section with time-ago stamps
- [x] Low stock + out of stock alerts with tap-to-edit
- [x] Recent orders list with color-coded status dots
- [x] Realtime new order subscription on dashboard
- [x] payoutService.ts — getPayoutSummary, getBankAccount, saveBankAccount, preferences
- [x] BankAccountScreen — IFSC validation, account masking, verification badge, edit mode
- [x] PayoutHistoryScreen — pending balance, next payout date, total earned/paid, payout list
- [x] SettingsScreen — profile card, auto-accept toggle, 5 notification prefs (live save), nav links, sign out
- [x] Seller RootNavigator — Dashboard as entry point, all new screens registered

### Agent 12 — Buyer Cart & Profile ✅ DONE (2026-05-03)
- [x] Add to cart (single-store enforcement with error message)
- [x] Cart screen (qty change, remove, delivery fee logic, summary, fixed footer)
- [x] Persistent cart (Supabase cart_items with upsert)
- [x] Delivery fee: ₹60, free above ₹500
- [x] Saved addresses list with label/default badges
- [x] Add new address (label picker, phone + pincode validation)
- [x] Set default / delete address
- [x] Wishlist (toggle save, optimistic remove, unavailable badge)
- [x] Buyer profile screen (avatar, coins card, referral, stats, nav)
- [x] Loyalty coins balance display (with ≈ rupee value)
- [x] Referral link generation (buildReferralLink, Share.share)
- [x] HomeScreen: cart badge + fetchCart on mount

### Agent 13 — WhatsApp Bot ✅ DONE (2026-05-03)
- [x] Gupshup webhook endpoint (POST /api/whatsapp/webhook?store=slug)
- [x] Conversation session management (in-memory per phone, 30-min TTL)
- [x] Bot: show catalogue menu (numbered list, top 10 products)
- [x] Bot: product selection flow
- [x] Bot: variant + quantity selection
- [x] Bot: address collection (free-form text)
- [x] Bot: create order in Supabase + send Razorpay payment link (30-min expiry)
- [x] Payment callback (GET /api/whatsapp/payment-callback) marks order paid
- [x] Broadcast WhatsApp (POST /api/whatsapp/broadcast, rate-limited 1/sec)

### Agent 14 — Coupons & Marketing ✅ DONE (2026-05-03)
- [x] couponService.ts — getStoreCoupons, createCoupon, toggleCoupon, deleteCoupon
- [x] CouponsScreen.tsx — create form (% or ₹ discount, min order, max cap, max uses), toggle active, delete
- [x] Buyer-side validateCoupon in cartService.ts — checks validity, expiry, usage limit, min order
- [x] CartScreen.tsx — coupon input row, applies discount to total
- [x] sendBroadcast backend route (POST /api/whatsapp/broadcast)
- [x] BroadcastScreen.tsx — compose message, send to all past customers, history list
- [x] Seller RootNavigator updated (Coupons + Broadcast screens)

### Agent 15 — Returns & Refunds ✅ DONE (2026-05-03)
- [x] returnService.ts — RETURN_REASONS array, requestReturn (24h window validation), getReturnForOrder
- [x] ReturnRequestScreen.tsx (buyer) — reason picker, description, up to 3 photo uploads, 24h warning
- [x] Buyer RootNavigator updated (ReturnRequest as modal)
- [x] Admin returns page — list all returns, approve/reject buttons, refund amount input + Issue Refund
- [x] POST /api/payments/refund — Razorpay partial/full refund, admin-only, updates DB

### Agent 16 — Admin Panel ✅ DONE (2026-05-03)
- [x] Admin login page (email+password, is_admin guard, auto sign-out if not admin)
- [x] Admin layout with SSR auth check + redirect
- [x] AdminNav sidebar (Dashboard, Sellers, Orders, Returns, Payouts)
- [x] Dashboard page — today/week GMV, seller/buyer counts, open returns alert, platform health
- [x] Sellers page — table with verify/suspend actions (client component)
- [x] Orders page — paginated, filterable by status
- [x] Returns page — list with approve/reject/refund actions
- [x] Payouts page — pending by store, process all button, recent payout history

### Agent 17 — Infrastructure ✅ DONE (2026-05-03)
- [x] Sentry integration in backend (Sentry.init, requestHandler, errorHandler)
- [x] Health check endpoint enhanced — /health with Supabase connectivity check
- [x] GitHub Actions CI/CD — .github/workflows/deploy.yml (lint+tsc on PR, deploy to Railway+Vercel+Supabase on main)
- [x] Rate limiting already in place (express-rate-limit, 100 req/15min)
- [ ] Sentry in mobile apps (seller app, buyer app) — needs @sentry/react-native install
- [ ] App store assets — needs design work
- [ ] Google Play Store submission — needs developer account
- [ ] Apple App Store submission — needs developer account

### Buyer Web Storefront (Next.js) ✅ DONE (2026-05-03)
- [x] /s/[slug] — public store page with SSR + generateMetadata
- [x] Product grid with search (client-side filter)
- [x] Open Graph metadata per store (store name, description, logo)
- [x] App install banner (₹100 off offer)
- [x] In-page cart with qty controls
- [x] WhatsApp order button (pre-fills cart summary in message)
- [x] Store header with logo, rating, verified badge, open/closed status
- [x] Reviews section
- [x] Mobile-first responsive design (max-w-2xl centered)

---

## Database Migrations Status

All migrations live in `reelmart/supabase/migrations/`. Current actual files (deployed against project `nysgwdpmpxqmfwelfaxo`):

| Migration | File | Purpose | Status |
|-----------|------|---------|--------|
| 001 | users.sql | users + role + is_admin | ✅ DEPLOYED |
| 002 | stores.sql | stores + slug + RLS | ✅ DEPLOYED |
| 003 | products.sql | products + variants | ✅ DEPLOYED |
| 004 | orders.sql | orders + status flow + RLS | ✅ DEPLOYED |
| 005 | reviews.sql | reviews + photos | ✅ DEPLOYED |
| 006 | seller_payouts.sql | bank accounts + payouts | ✅ DEPLOYED |
| 007 | buyer_features.sql | addresses, wishlist, cart_items, coins, referrals | ✅ DEPLOYED |
| 008 | marketing.sql | coupons + broadcasts | ✅ DEPLOYED |
| 009 | returns.sql | returns + refunds | ✅ DEPLOYED |
| 010 | followed_stores.sql | follow/unfollow | ✅ DEPLOYED |
| 011 | admin_platform.sql | admin tables + audit | ✅ DEPLOYED |
| 012 | rls_fixes.sql | RLS gaps + Realtime publication + storage buckets | ✅ DEPLOYED |
| 013 | cart_selected_variant.sql | variant_id on cart_items | ✅ DEPLOYED |
| 014 | stores_address_category.sql | additional store fields | ✅ DEPLOYED |
| 015 | store_approval.sql | approval_status workflow | ✅ DEPLOYED |

---

## Third-Party Integrations Status

| Service | Purpose | Status |
|---------|---------|--------|
| Supabase | DB + Auth + Storage + Realtime + Edge Functions | ✅ LIVE (project `nysgwdpmpxqmfwelfaxo`) |
| Twilio | SMS OTP via Supabase Phone provider | ⚠️ CONNECTED — DLT not registered, +91 SMS blocked. Dev uses test number `+919999999999 / 123456` |
| Razorpay | Payments | ⚠️ MOBILE ONLY — web checkout still COD-only (frontend wiring pending) |
| Shiprocket | Delivery | ✅ Backend wired |
| Gupshup | WhatsApp | ✅ Backend wired (webhook + bot + broadcast) |
| Firebase FCM | Push notifications | ✅ Backend wired (mobile-side hook not finalized) |
| Google Maps Places | Address autocomplete in LocationPromptModal | ✅ Working in mobile |
| Sentry | Error logging | ✅ Backend / ⬜ Mobile pending |
| Vercel | Web hosting | ⬜ Local dev only |
| Railway | Backend hosting | ⬜ Local dev only |
| MSG91 | Alternative SMS provider for India | ⬜ Edge Function scaffolded; not deployed (IP whitelist constraint) |

---

## How Daily Development Works

Each session:
1. Check this file — see current status
2. Pick up where we left off (or start next agent)
3. Tell Claude Code: *"Read TRACKER.md and continue from where we stopped. Today's agent: agentXX"*
4. After session, update this file — mark tasks ✅, add to daily log

Status legend:
- ⬜ PENDING — not started
- 🔄 IN PROGRESS — currently being built
- ✅ DONE — complete and tested
- ❌ BLOCKED — needs external setup (API keys, etc.)
