# Master Agent Guide — Complete Platform Development
### Version 2.0 — Full Feature Coverage
### How to use Claude Code + VS Code to build this platform feature by feature

---

## 1. Your Development Setup

```
Mac
├── VS Code (editor)
├── Claude Code — npm install -g @anthropic-ai/claude-code
├── Node.js 20+
├── Git
├── Supabase CLI — npm install -g supabase
└── EAS CLI — npm install -g eas-cli (for app store builds)
```

---

## 2. Complete Build Order — All 17 Agents

Follow this exact sequence. Each agent depends on the previous.

| Step | Agent File | Feature | Time |
|---|---|---|---|
| 0 | agent_00_setup_and_storefront.md | Project setup + Supabase init | 2 hrs |
| 1 | agent_01_auth.md | Phone OTP login (seller + buyer) | 1 day |
| 2 | agent_02_seller_onboarding.md | Store creation + share link | 2 days |
| 3 | agent_03_products.md | Product catalogue + images + variants | 2 days |
| 4 | agent_04_05_06_orders_payments_delivery.md | Orders + Razorpay + Shiprocket | 5 days |
| 5 | agent_07_08_09_10_notifications_discovery_reviews_analytics.md | WhatsApp alerts + search + reviews + charts | 4 days |
| 6 | agent_11_seller_dashboard_payouts.md | Seller home + profile + bank + payouts | 2 days |
| 7 | agent_12_buyer_profile_cart.md | Cart + addresses + wishlist + reorder | 3 days |
| 8 | agent_13_14_15_16_17_remaining.md | WhatsApp bot + coupons + returns + admin + infra | 5 days |
| 9 | agent_00_setup_and_storefront.md (storefront section) | Buyer web storefront (Next.js) | 3 days |
| **Total** | | **Complete platform** | **~27 days** |

---

## 3. Complete Feature Checklist

### ✅ Auth
- [x] Phone OTP login — seller and buyer
- [x] Session persistence across app restarts
- [x] New user profile creation
- [x] Logout

### ✅ Seller — Store Management
- [x] Store creation in 2 minutes
- [x] Auto-generated unique store URL
- [x] Store logo upload
- [x] Share link to WhatsApp and Instagram
- [x] Edit store profile, city, description
- [x] Store open/close toggle
- [x] Store hours configuration
- [x] Seller verification (Aadhaar upload)

### ✅ Seller — Products
- [x] Add product with up to 5 photos
- [x] Product variants (size, color, flavor, weight)
- [x] Stock management (unlimited or specific)
- [x] Low stock alerts
- [x] Hide/show products instantly
- [x] Edit and delete products

### ✅ Seller — Orders
- [x] Real-time new order notification
- [x] Accept / reject orders with reason
- [x] Order status management
- [x] Customer details per order
- [x] Order history with filters

### ✅ Seller — Payments & Payouts
- [x] Payment auto-collected from buyer
- [x] Bank account setup (IFSC validation)
- [x] Weekly payout to bank account
- [x] Payout history
- [x] Pending balance dashboard
- [x] COD order handling

### ✅ Seller — Marketing
- [x] Create discount coupons (% or fixed)
- [x] Coupon usage tracking
- [x] Broadcast WhatsApp message to all customers
- [x] Broadcast history

### ✅ Seller — Analytics
- [x] Today's revenue and order count
- [x] Daily revenue chart (7 days)
- [x] Top selling products
- [x] Repeat vs new customer breakdown
- [x] Referral stats (how many installs my link drove)

### ✅ Seller — Settings
- [x] Notification preferences (WhatsApp + push)
- [x] Auto-accept orders toggle
- [x] Account management
- [x] Delete account

### ✅ Buyer — Discovery
- [x] Personalized home feed
- [x] Search by product or seller name
- [x] Browse by category
- [x] Top rated sellers in city
- [x] New sellers in area
- [x] Hyperlocal filter (by distance)
- [x] Follow / unfollow sellers
- [x] Occasion-based recommendations

### ✅ Buyer — Shopping
- [x] Beautiful storefront view
- [x] Product detail with photos
- [x] Variant selection
- [x] Add to cart (persisted)
- [x] Cart from one store at a time
- [x] Coupon code application
- [x] Wishlist (save for later)

### ✅ Buyer — Checkout
- [x] Saved addresses
- [x] Add new address with Google autocomplete
- [x] Delivery fee shown before payment
- [x] UPI / card / netbanking payment
- [x] COD option
- [x] Order confirmation WhatsApp

### ✅ Buyer — Order Management
- [x] Real-time order tracking
- [x] Order history
- [x] Reorder in one tap
- [x] Return request (within 24 hours)
- [x] Refund tracking

### ✅ Buyer — Loyalty & Referrals
- [x] Coins earned per order
- [x] Coins earned for photo reviews
- [x] Coins earned for referrals
- [x] Coin balance display
- [x] Coin transaction history
- [x] Referral link generation
- [x] App install offer (free delivery + coins)

### ✅ Buyer — Profile
- [x] Edit name, avatar
- [x] Saved addresses management
- [x] Wishlist screen
- [x] Notification preferences
- [x] Account settings

### ✅ WhatsApp Bot
- [x] Buyer messages seller WhatsApp
- [x] Bot shows catalogue
- [x] Bot handles ordering flow
- [x] Bot sends Razorpay payment link
- [x] Order created automatically on payment

### ✅ Buyer Web Storefront (Next.js)
- [x] SEO optimized store pages
- [x] Works in mobile browser (no app needed)
- [x] Product browsing and cart
- [x] Checkout with phone OTP
- [x] App install banner with offer
- [x] WhatsApp share button
- [x] Rich social media preview (OG tags)

### ✅ Reviews & Ratings
- [x] Star rating + review text
- [x] Photo review upload
- [x] Verified purchase badge
- [x] Store rating auto-updated
- [x] Seller can reply to reviews
- [x] Coins awarded for reviewing

### ✅ Returns & Refunds
- [x] Return request within 24 hours
- [x] Reason + photo submission
- [x] Admin approval flow
- [x] Razorpay automatic refund
- [x] Refund status tracking

### ✅ Admin Panel
- [x] Platform GMV dashboard
- [x] Seller management (verify, suspend)
- [x] Buyer management
- [x] Order management and dispute resolution
- [x] Returns management
- [x] Weekly payout processing
- [x] Platform settings

### ✅ Infrastructure
- [x] Sentry error logging (all apps)
- [x] API health monitoring
- [x] GitHub Actions CI/CD
- [x] Supabase auto migrations on deploy
- [x] Google Play Store submission
- [x] Apple App Store submission
- [x] Performance optimization

---

## 4. Database Migrations — Run Order

```bash
supabase db push  # runs all in order

001_users.sql           — users table + auth trigger
002_stores.sql          — stores + referrals
003_products.sql        — products + search index
004_orders.sql          — orders + order number sequence
005_reviews.sql         — reviews + rating auto-update
006_seller_payouts.sql  — bank accounts + payouts + preferences + device tokens
007_buyer_features.sql  — addresses + wishlists + cart + coins + referrals
008_marketing.sql       — coupons + broadcasts
009_returns.sql         — returns + refund tracking
```

---

## 5. Environment Variables — Complete List

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_X_ACCOUNT=       # for seller payouts

# Shiprocket
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=

# Gupshup (WhatsApp)
GUPSHUP_API_KEY=
GUPSHUP_APP_NAME=
GUPSHUP_SOURCE_NUMBER=

# Firebase
FIREBASE_SERVICE_ACCOUNT=  # JSON string

# Google
GOOGLE_MAPS_API_KEY=

# Sentry
SENTRY_DSN=

# App
BACKEND_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_RAZORPAY_KEY=
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SENTRY_DSN=
```

---

## 6. How to Use Claude Code for Each Agent

```bash
# Start Claude Code
cd platform
claude

# Give it an agent to execute
"Read .claude/CLAUDE.md for project context.
 Then read and execute agents/agent_01_auth.md completely.
 Build everything described, run migrations, create all files."

# After each agent completes
"Review what you built for agent_01_auth.md.
 Check for any missing pieces.
 Write a brief summary of what was built."

# Move to next agent
"Now read and execute agents/agent_02_seller_onboarding.md"
```

---

## 7. VS Code Extensions (Install All)

```
Essential:
├── Supabase (official)
├── ESLint
├── Prettier
├── React Native Tools
├── GitLens
├── Thunder Client (API testing)
└── Tailwind CSS IntelliSense

Helpful:
├── PostgreSQL (view Supabase DB)
├── GitHub Actions (view CI/CD)
└── DotENV (highlight .env files)
```

---

## 8. Testing Checklist Before Launch

```
AUTH
[ ] OTP login works on real device
[ ] Session persists after app kill
[ ] Logout clears all data

SELLER FLOW
[ ] Store created and URL works
[ ] Products added and visible on storefront
[ ] Order received and accepted
[ ] Payment collected and shows in dashboard
[ ] Payout initiated to bank account

BUYER FLOW
[ ] Storefront loads in browser (no app)
[ ] Add to cart and checkout works
[ ] Payment via UPI works
[ ] Order tracking updates in real time
[ ] Review submission works

WHATSAPP
[ ] Seller gets WhatsApp alert on new order
[ ] Buyer gets WhatsApp confirmation
[ ] Bot responds to buyer messages
[ ] Payment link works in WhatsApp

EDGE CASES
[ ] Out of stock product cannot be ordered
[ ] Cart clears if product becomes unavailable
[ ] Return request rejected after 24 hours
[ ] Invalid coupon shows clear error
[ ] Network error shows retry option
```
