# ReelMart — Current Gaps vs Built Functionality
### Last reviewed: 2026-05-08

This file tracks the delta between what is *built and working* in `reelmart/` vs what is still pending. Anything not listed here is considered done.

---

## ✅ BUILT & WORKING

### Mobile (buyer-app — React Native / Expo)
- Phone OTP auth (Supabase) with dev test number `+919999999999 / OTP 123456`
- Profile setup → role detection (buyer/seller/both)
- Home screen: hero header, search, address bar, categories, Top Rated / New Arrivals, **colored seller-group sections** (Clothing → orange, Jewellery → green, Beauty → blue), per-category lists
- LocationPromptModal — search + saved addresses + new address form (Google Places autocomplete; manual fallback)
- Storefront screen — products with **wishlist heart** overlay, add-to-cart with qty controls
- Cart store + checkout (uses LocationPromptModal for address selection)
- Orders: list + tracking with **realtime status updates** + **order date/time displayed**
- Wishlist screen, Profile, Saved Addresses (synced via Supabase `addresses` table)
- Realtime order subscription on Orders tab — buyer sees status changes instantly when seller accepts/packs/ships
- Pull-to-refresh on order history

### Public Web (apps/web)
- **`/store/[slug]`** — public storefront (RSC, ISR `revalidate: 60`, OG metadata, mobile-first)
  - product grid + search + add-to-cart (cart persists in localStorage, scoped per store)
  - sticky cart footer → "Proceed to Checkout"
- **`/store/[slug]/checkout`** — multi-step web checkout
  - Cart review → Phone OTP login → Address selection (or new address form) → Payment method → Place order
  - Reuses Supabase `orders` + `addresses` tables; same RLS as mobile
- **`/order/[id]`** — order confirmation
  - Order summary, delivery address
  - Prominent "Track in ReelMart app" CTA with Play Store / App Store links
  - Tagline: "Login with same number — your order and addresses are already there"
- **`/s/[slug]`** legacy URL → redirects to `/store/[slug]`

### Seller Web (apps/web)
- Phone OTP login + dev "Skip OTP" button (dev mode only)
- Seller registration (phone → profile → store)
- Dashboard (greeting, today/week/month revenue, pending alerts, low stock, realtime new-order toast)
- Products CRUD + variants + image upload
- Orders page with **fixed realtime subscription** (separate `useEffect`, proper cleanup), refresh button, status filter tabs, status update actions, invoice print, Excel export
- Coupons, Broadcast, Customers, Analytics, Marketing, Payouts, Settings
- Auth middleware redirects to `/seller/register` if user has no seller role; bypassed in dev mode

### Admin Web
- `/admin/login` (email + password + `is_admin` guard)
- Dashboard (GMV, seller/buyer counts, returns alert)
- Sellers (verify / suspend), Orders (paginated + filtered), Returns (approve / reject / refund), Payouts

### Backend (`backend/`)
- Express + Supabase + Sentry
- Routes: payments (Razorpay create/verify/refund), delivery (Shiprocket), whatsapp (Gupshup webhook + bot + broadcast), notifications (FCM), payouts
- Rate limiting, health check
- WhatsApp bot — full menu → product → variant → quantity → address → Razorpay payment-link flow

### Database (Supabase)
Migrations 001–015 deployed:
| # | File | Purpose |
|---|------|---------|
| 001 | users.sql | users + role + is_admin |
| 002 | stores.sql | stores + slug + RLS |
| 003 | products.sql | products + variants |
| 004 | orders.sql | orders + status flow + RLS |
| 005 | reviews.sql | reviews + photos |
| 006 | seller_payouts.sql | bank accounts + payouts |
| 007 | buyer_features.sql | addresses, wishlist, cart_items, coins, referrals |
| 008 | marketing.sql | coupons + broadcasts |
| 009 | returns.sql | returns + refunds |
| 010 | followed_stores.sql | follow/unfollow |
| 011 | admin_platform.sql | admin tables + audit |
| 012 | rls_fixes.sql | RLS gaps + Realtime publication + storage buckets + policies |
| 013 | cart_selected_variant.sql | variant_id on cart_items |
| 014 | stores_address_category.sql | additional store fields |
| 015 | store_approval.sql | approval_status workflow |

### Third-party integrations
| Service | Status | Notes |
|---------|--------|-------|
| Supabase | ✅ Live | Project `nysgwdpmpxqmfwelfaxo`. Auth + DB + Storage + Realtime + Edge Functions all in use |
| Twilio | ⚠️ Connected | Credentials in Supabase Dashboard, but **DLT not registered** → SMS to +91 numbers blocked (error 30007) |
| Razorpay | ⚠️ Mobile only | Mobile uses Razorpay SDK (test key in `.env`); **web checkout is COD-only** (online radio sets `payment_status: pending` but doesn't open payment yet) |
| Shiprocket | ✅ Backend wired | Rates endpoint working; production API key needed |
| Gupshup | ✅ Backend wired | WhatsApp webhook + bot |
| Firebase FCM | ✅ Backend wired | Token registration endpoint working |
| Google Maps | ✅ In LocationPromptModal | Places Autocomplete API key in mobile app |
| Sentry | ✅ Backend | Mobile Sentry not yet installed |

---

## ⚠️ KNOWN GAPS (real, today)

### Critical for production launch
- [ ] **Razorpay web checkout** — `/store/[slug]/checkout` "Pay Online" radio currently doesn't open Razorpay modal. Backend endpoints exist (`/api/payments/create-order`, `/verify`); needs frontend wiring. ETA ~30–45 min.
- [ ] **DLT registration** for SMS — Twilio rejects +91 SMS without it. Three options:
  - Complete DLT (1–3 days) → keep Twilio
  - Switch to Indian provider (MSG91 / Gupshup / Textlocal) via Supabase Send-SMS Hook
  - `send-sms-msg91` Edge Function scaffolded in `supabase/functions/` but not deployed (MSG91 mandates IP whitelisting which Edge Functions can't satisfy)
- [ ] App store submission — Play Store + App Store assets, builds, listings

### Nice-to-haves / non-blocking
- [ ] Sentry in mobile apps (`@sentry/react-native`)
- [ ] Mobile push notifications wired to FCM token register endpoint (backend exists, mobile-side hook not finalized)
- [ ] App deep-linking — opening `/store/[slug]` should launch the mobile app if installed
- [ ] Onboarding tour for first-time users
- [ ] Email OTP fallback (we tried it once, reverted; could re-add as user-choice)
- [ ] Store image cards on `/store/[slug]` use `<img>` not Next `<Image>` — would benefit from optimization

### Dev / ops cleanup
- [ ] Dev mode currently lets unauthenticated requests load "first store in DB" on seller dashboard — fine for testing, must be removed before prod
- [ ] `console.log` calls in admin/sellers query for diagnostics — remove once stable
- [ ] App download URLs in `OrderConfirmedClient.tsx` are placeholder Play Store / App Store IDs — replace before launch

---

## NEW WORK SINCE LAST AUDIT (2026-05-03 → 2026-05-08)

- Public web storefront moved from `/s/[slug]` → `/store/[slug]` with full checkout + order confirmation
- Address persistence migrated from AsyncStorage to Supabase `addresses` table (cross-device sync; merges guest addresses into account on first login)
- Realtime order updates added to buyer Orders tab (was previously only on tracking detail screen)
- Order date/time now visible on order cards and tracking screen
- Seller-group sections (Clothing/Jewellery/Beauty) with colored backgrounds on Home
- Wishlist heart overlay added to product cards in StorefrontScreen
- Header redesign: orange hero, circular logo, white categories, search + address bar
- LocationPromptModal — full custom search using Places API (replaced GooglePlacesAutocomplete component)
- Saved-address default tracking switched from city-based to **address-id based** (fixed bug where two addresses sharing a city couldn't both be set as default)
- Seller orders page realtime subscription rewritten — proper cleanup, manual refresh button
- Dev OTP banner on both buyer + seller auth pages (fills `9999999999 / 123456`)
- Auth middleware: bypass in dev mode; production redirects unauth'd users to `/seller/register` if they have no seller role (was previously `/seller/login`, causing loops)
