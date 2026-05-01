# Shopidea — Development Tracker
### Social Commerce Platform for Indian Micro-Sellers
### Last Updated: 2026-05-01

---

## Overall Progress

```
Total Agents:     17
Completed:         4  (Agent 00 — Setup, Agent 01 — Auth, Agent 02 — Onboarding, Agent 03 — Products)
In Progress:       1  (Agent 04/05/06 — Orders + Payments + Delivery, next)
Pending:          12

Progress: █████░░░░░░░░░░░░░░░ ~24%
```

---

## Daily Log

| Date       | What Was Built | Agent | Files Created |
|------------|----------------|-------|---------------|
| 2026-05-01 | Full monorepo structure, all 12 DB migrations, backend Express app (payments, delivery, WhatsApp, push, payouts), Next.js web base, seller+buyer app scaffolding, shared TypeScript types | Agent 00 | 35+ files |
| 2026-05-01 | Complete auth system both apps — PhoneScreen, OTPScreen, ProfileSetupScreen, authStore (Zustand), RootNavigator with auth guard, session persistence, OTP countdown, 3-attempt lockout | Agent 01 | 16 files |
| 2026-05-01 | Seller onboarding — StoreNameScreen (live URL preview), CategoryScreen (7-category grid), LocationScreen (city autocomplete), LogoScreen (gallery pick + compress + upload), StoreReadyScreen (WhatsApp share), storeService, sellerStore, EditStoreScreen, full 4-step RootNavigator flow | Agent 02 | 10 files |
| 2026-05-01 | Products — ProductListScreen (grid, 4 filters, toggle, long-press delete, FAB), AddProductScreen (5 photos, price+compare, unlimited/counted stock, low stock threshold), EditProductScreen (edit + delete), VariantBuilder component (size/color/flavor/weight, per-option pricing), productService, productStore, RootNavigator updated | Agent 03 | 7 files |

---

## Agent Status Board

| # | Agent | Feature | Est. Days | Status | Started | Done |
|---|-------|---------|-----------|--------|---------|------|
| 0 | agent_00 | Project setup + Supabase init | 0.25 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 1 | agent_01 | Phone OTP auth (seller + buyer) | 1 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 2 | agent_02 | Seller onboarding + store creation | 2 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 3 | agent_03 | Products + variants + images | 2 | ✅ DONE | 2026-05-01 | 2026-05-01 |
| 4 | agent_04_05_06 | Orders + Razorpay + Shiprocket | 5 | 🔄 NEXT | — | — |
| 5 | agent_07_08_09_10 | WhatsApp alerts + search + reviews + analytics | 4 | ⬜ PENDING | — | — |
| 6 | agent_11 | Seller dashboard + payouts + bank | 2 | ⬜ PENDING | — | — |
| 7 | agent_12 | Buyer cart + addresses + wishlist | 3 | ⬜ PENDING | — | — |
| 8 | agent_13_17 | WhatsApp bot + coupons + returns + admin + infra | 5 | ⬜ PENDING | — | — |
| 9 | agent_00 (storefront) | Buyer web storefront (Next.js) | 3 | ⬜ PENDING | — | — |

**Total Estimated: ~27 days**

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

### Agent 01 — Authentication ⬜ NOT STARTED
- [ ] Phone number input screen
- [ ] OTP verification screen
- [ ] Supabase phone auth (Twilio SMS)
- [ ] Auth state persistence (SecureStore)
- [ ] New user profile creation
- [ ] Role detection (seller vs buyer flow)
- [ ] Logout + session clear
- [ ] Auth guard HOC / hook

### Agent 02 — Seller Onboarding ⬜ NOT STARTED
- [ ] Store name + category selection
- [ ] City and area entry
- [ ] Logo photo upload (store-logos bucket)
- [ ] Auto-generated unique slug (yourstore.platform.com)
- [ ] Share to WhatsApp button
- [ ] Share to Instagram / copy link
- [ ] Edit store profile screen
- [ ] Store open/close toggle
- [ ] Store hours configuration
- [ ] Aadhaar upload for verification (seller-documents bucket)

### Agent 03 — Products ⬜ NOT STARTED
- [ ] Product list screen (seller view)
- [ ] Add product form
- [ ] Photo upload — up to 5 photos (product-images bucket)
- [ ] Product variants (size, color, flavor, weight)
- [ ] Variant-level pricing
- [ ] Stock quantity (or unlimited)
- [ ] Low stock threshold + alert
- [ ] Hide/show product toggle
- [ ] Edit product screen
- [ ] Delete product (with confirm)

### Agent 04 — Orders ⬜ NOT STARTED
- [ ] Buyer: checkout flow (address → payment → confirm)
- [ ] Order creation in database
- [ ] Realtime new order notification (seller app)
- [ ] Accept order (with prep time)
- [ ] Reject order (with reason)
- [ ] Order status: pending → accepted → packed → shipped → delivered
- [ ] Order detail screen (seller + buyer views)
- [ ] Order history with filters

### Agent 05 — Payments ⬜ NOT STARTED
- [ ] Razorpay SDK integration (buyer app)
- [ ] Create Razorpay order from backend
- [ ] Payment verification (signature check)
- [ ] Mark order as paid in database
- [ ] COD option (no payment required upfront)
- [ ] Refund trigger on return approval

### Agent 06 — Delivery ⬜ NOT STARTED
- [ ] Shiprocket API integration (backend)
- [ ] Delivery fee calculation
- [ ] Auto-create shipment on order accept
- [ ] AWB tracking number stored
- [ ] Realtime tracking URL in buyer app
- [ ] Delivery webhook → update order status

### Agent 07 — Notifications ⬜ NOT STARTED
- [ ] Gupshup WhatsApp integration
- [ ] WhatsApp: new order alert to seller
- [ ] WhatsApp: order confirmation to buyer
- [ ] WhatsApp: order status updates
- [ ] Firebase FCM setup (seller + buyer apps)
- [ ] Push: new order (seller)
- [ ] Push: order status update (buyer)
- [ ] Device token registration + storage
- [ ] Notification preferences screen

### Agent 08 — Discovery ⬜ NOT STARTED
- [ ] Buyer home feed (personalized)
- [ ] Search: products + sellers (full-text)
- [ ] Category browse grid
- [ ] Top rated sellers by city
- [ ] Hyperlocal filter (by area/pincode)
- [ ] Follow / unfollow stores
- [ ] Followed stores feed
- [ ] Occasion-based recommendations

### Agent 09 — Reviews & Ratings ⬜ NOT STARTED
- [ ] Star rating (1–5) screen
- [ ] Review text input
- [ ] Photo upload for review (review-photos bucket)
- [ ] Verified purchase badge (only delivered orders)
- [ ] Store average rating auto-updated (DB trigger)
- [ ] Seller reply to review
- [ ] Loyalty coins awarded on review

### Agent 10 — Analytics ⬜ NOT STARTED
- [ ] Today's revenue + order count widget
- [ ] 7-day revenue chart
- [ ] Top 5 selling products list
- [ ] Repeat vs new customer breakdown
- [ ] Referral link install tracking
- [ ] All-time totals

### Agent 11 — Seller Dashboard & Payouts ⬜ NOT STARTED
- [ ] Seller home screen (summary: today orders, revenue, pending)
- [ ] Seller profile edit (name, WhatsApp, city)
- [ ] Bank account setup (IFSC validation)
- [ ] Bank account verification
- [ ] Payout history screen
- [ ] Pending balance display
- [ ] Customer list (all buyers who ordered)
- [ ] Seller settings screen
- [ ] Weekly auto-payout Edge Function
- [ ] Manual payout trigger (admin)

### Agent 12 — Buyer Cart & Profile ⬜ NOT STARTED
- [ ] Add to cart (one store at a time)
- [ ] Cart screen (qty change, remove, total)
- [ ] Persistent cart (Supabase cart_items)
- [ ] Coupon code apply in cart
- [ ] Delivery fee preview in cart
- [ ] Saved addresses list
- [ ] Add new address (Google Maps autocomplete)
- [ ] Wishlist (save product for later)
- [ ] Buyer profile screen (name, avatar, phone)
- [ ] Reorder in one tap
- [ ] Loyalty coins balance + transaction history
- [ ] Referral link generation
- [ ] Referral tracking (which seller link drove install)

### Agent 13 — WhatsApp Bot ⬜ NOT STARTED
- [ ] Gupshup webhook endpoint
- [ ] Conversation session management (per phone)
- [ ] Bot: show catalogue menu
- [ ] Bot: product selection flow
- [ ] Bot: variant + quantity selection
- [ ] Bot: address collection
- [ ] Bot: send Razorpay payment link
- [ ] Bot: create order on payment success
- [ ] Bot: order confirmation message

### Agent 14 — Coupons & Marketing ⬜ NOT STARTED
- [ ] Seller: create coupon (% or fixed discount)
- [ ] Coupon code generation (auto or custom)
- [ ] Usage limits (max uses, per-user limit)
- [ ] Coupon validity dates
- [ ] coupon_uses tracking table
- [ ] Seller: broadcast WhatsApp message to all customers
- [ ] Broadcast history screen

### Agent 15 — Returns & Refunds ⬜ NOT STARTED
- [ ] Buyer: return request form (reason + photo)
- [ ] 24-hour return window validation
- [ ] Admin: review return requests
- [ ] Admin: approve or reject return
- [ ] Razorpay auto-refund on approval
- [ ] Refund status tracking (buyer view)

### Agent 16 — Admin Panel ⬜ NOT STARTED
- [ ] Admin dashboard (Next.js web)
- [ ] Platform GMV / revenue metrics
- [ ] Seller list: view, verify, suspend
- [ ] Buyer list: view, disable
- [ ] All orders view + dispute resolution
- [ ] Returns management
- [ ] Weekly payout processing (manual trigger)
- [ ] Platform settings management
- [ ] Announcements management
- [ ] Admin login (is_admin flag)

### Agent 17 — Infrastructure ⬜ NOT STARTED
- [ ] Sentry integration (seller app, buyer app, web, backend)
- [ ] API health check endpoint
- [ ] GitHub Actions CI/CD (lint + build on PR)
- [ ] Auto Supabase migration on deploy
- [ ] App store assets (icons, screenshots)
- [ ] Google Play Store submission
- [ ] Apple App Store submission
- [ ] Rate limiting (Express middleware)
- [ ] Production environment config

### Buyer Web Storefront (Next.js) ⬜ NOT STARTED
- [ ] /s/[slug] — public store page (SSR)
- [ ] Product grid with search
- [ ] Product detail page
- [ ] Cart + checkout (phone OTP)
- [ ] SEO: Open Graph meta tags per store
- [ ] App install banner (with coupon offer)
- [ ] WhatsApp share button
- [ ] Mobile-first responsive design

---

## Database Migrations Status

| Migration | File | Status |
|-----------|------|--------|
| 001 | users.sql | ⬜ PENDING |
| 002 | stores.sql | ⬜ PENDING |
| 003 | products.sql | ⬜ PENDING |
| 004 | orders.sql | ⬜ PENDING |
| 005 | reviews.sql | ⬜ PENDING |
| 006 | seller_payouts.sql | ⬜ PENDING |
| 007 | buyer_features.sql | ⬜ PENDING |
| 008 | marketing.sql | ⬜ PENDING |
| 009 | returns.sql | ⬜ PENDING |
| 010 | followed_stores.sql | ⬜ PENDING |
| 011 | admin_platform.sql | ⬜ PENDING |
| 012 | coupon_uses.sql | ⬜ PENDING |
| 013 | rls_fixes.sql | ⬜ PENDING |
| 014 | storage_buckets.sql | ⬜ PENDING |
| 015 | realtime.sql | ⬜ PENDING |
| 016 | cron_jobs.sql | ⬜ PENDING |

---

## Third-Party Integrations Status

| Service | Purpose | Status |
|---------|---------|--------|
| Supabase | DB + Auth + Storage + Realtime | ⬜ NOT SET UP |
| Razorpay | Payments | ⬜ NOT SET UP |
| Shiprocket | Delivery | ⬜ NOT SET UP |
| Gupshup | WhatsApp | ⬜ NOT SET UP |
| Firebase FCM | Push notifications | ⬜ NOT SET UP |
| Google Maps | Address autocomplete | ⬜ NOT SET UP |
| Sentry | Error logging | ⬜ NOT SET UP |
| Twilio | SMS OTP (via Supabase) | ⬜ NOT SET UP |
| Vercel | Web hosting | ⬜ NOT SET UP |
| Railway | Backend hosting | ⬜ NOT SET UP |

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
