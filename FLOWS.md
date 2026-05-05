# ReelMart — Functionality Flow Guide

## Architecture Overview

```
Browser/App → Supabase (DB + Auth + Storage + Realtime)
Browser/App → Backend API (localhost:3001) → Razorpay / Shiprocket / Gupshup / FCM
```

---

## 1. SELLER WEB DASHBOARD (`localhost:3000/seller`)

### 1.1 Login Flow
```
/seller/login
  → Enter 10-digit phone number
  → Click "Send OTP"
      → supabase.auth.signInWithOtp({ phone: "+91XXXXXXXXXX" })
      → Supabase sends SMS via Twilio
  → Enter 6-digit OTP
  → Click "Verify OTP"
      → supabase.auth.verifyOtp({ phone, token, type: "sms" })
      → Session created in Supabase
      → router.push("/seller/dashboard")

DEV MODE: Click "Dev Login (skip OTP)" → goes straight to dashboard
```

### 1.2 Dashboard (`/seller/dashboard`)
```
Page loads
  → supabase.auth.getUser() → get current seller
  → supabase.from("stores").select("*").eq("seller_id", user.id) → get store
  → Parallel queries:
      - Today's revenue   → orders (payment_status=paid, today)
      - Week revenue      → orders (payment_status=paid, last 7 days)
      - Month revenue     → orders (payment_status=paid, last 30 days)
      - Pending orders    → orders (status=pending, last 5)
      - Low stock items   → products (stock_quantity ≤ 3)
  → Build 7-day revenue chart data
  → Build top 5 products by quantity sold
  → Realtime: supabase.channel("dashboard-orders")
      → listens for new INSERT on orders table
      → shows toast notification on new order
      → reloads dashboard data

Actions:
  Accept order → supabase.from("orders").update({ status: "accepted" })
  Reject order → supabase.from("orders").update({ status: "rejected" })
```

### 1.3 Products (`/seller/products`)
```
Page loads
  → get store_id for current seller
  → supabase.from("products").select("*").eq("store_id", store.id)
  → renders table with: photo, name, category, price, stock, status

Actions:
  Toggle visibility → supabase.from("products").update({ is_available: !current })
  Edit product      → navigate to /seller/products/[id]
  Delete product    → supabase.from("products").delete().eq("id", id)
  Bulk delete       → supabase.from("products").delete().in("id", selectedIds)
  Export Excel      → downloads .xlsx using SheetJS

Add Product (/seller/products/new):
  → Fill form: name, description, price, compare_price, category, stock, images
  → Upload images → supabase.storage.from("product-images").upload()
  → supabase.from("products").insert({ ...formData, store_id })
```

### 1.4 Orders (`/seller/orders`)
```
Page loads
  → get store_id for current seller
  → supabase.from("orders").select("*").eq("store_id", store.id)
  → Filter tabs: all | pending | accepted | packed | shipped | delivered | cancelled | rejected
  → Realtime: listens for new orders → shows toast

Order detail panel (click any row):
  → shows customer name, address, items, total

Order status flow:
  pending → accepted → packed → shipped → delivered
  pending → rejected (if seller rejects)

Actions:
  Accept/Reject    → supabase.from("orders").update({ status })
  Mark as packed   → update status to "packed"
  Mark as shipped  → update status to "shipped"
  Mark delivered   → update status + delivered_at timestamp
  Print Invoice    → opens browser print dialog with HTML invoice
  WhatsApp buyer   → opens wa.me link with buyer phone
  Export Excel     → downloads .xlsx of current filtered orders
```

### 1.5 Customers (`/seller/customers`)
```
Page loads
  → get store_id for current seller
  → supabase.from("orders").select(buyer_id, total_amount, users!buyer_id(name, phone))
      .eq("payment_status", "paid")
  → Aggregates per buyer:
      - total orders count
      - total amount spent
      - first order date
      - last order date
  → sorted by total spent (highest first)
  → phone shown as masked: +91XXXXX12345

Actions:
  Search by name
  WhatsApp customer → opens wa.me link
  Export Excel      → downloads customer list .xlsx
```

### 1.6 Analytics (`/seller/analytics`)
```
Page loads
  → get store_id
  → Queries last 30 days of paid orders
  → Calculates:
      - Total revenue
      - Average order value
      - Order count
      - Revenue by day (bar chart)
      - Top products by quantity
      - Category breakdown (pie chart)
```

### 1.7 Payouts (`/seller/payouts`)
```
Page loads
  → supabase.from("payouts").select("*").eq("store_id", store.id)
  → shows payout history: amount, status, date, UTR number
  → shows pending balance (total paid orders - total payouts)

Payouts are processed by admin — sellers cannot trigger manually
```

### 1.8 Marketing (`/seller/marketing`)
```
  → View store shareable link: reelmart.in/s/{slug}
  → Copy link to clipboard
  → Download QR code (PNG) for the store link
  → Share on WhatsApp / Instagram
```

### 1.9 Settings (`/seller/settings`)
```
Page loads
  → supabase.from("stores").select("*").eq("seller_id", user.id)
  → pre-fills form with existing store data

Editable fields:
  - Store name
  - Store URL slug (reelmart.in/s/{slug})
      → checks slug availability in real time (debounced 500ms)
  - Description
  - Category
  - City
  - WhatsApp number
  - Instagram handle

Save → supabase.from("stores").update({ ...fields })

Store link section:
  → Copy link button
  → Open link in new tab
  → Download QR code (PNG, 512x512)
```

---

## 2. BUYER STOREFRONT (`localhost:3000/s/[slug]`)

### 2.1 Store Page Flow
```
/s/{store-slug}
  → Server-side fetch:
      - supabase.from("stores").select("*").eq("store_slug", slug)
      - supabase.from("products").select("*").eq("store_id", store.id).eq("is_available", true)
      - supabase.from("reviews").select("*").eq("store_id", store.id).limit(10)
  → Renders StorefrontClient (client component) with all data
  → SEO: generateMetadata() sets title, description, og:image from store data

Page sections:
  - Store header: logo, name, city, verified badge, open/closed status
  - Average rating
  - Product grid
  - Reviews section
```

### 2.2 Checkout Flow
```
Buyer clicks product → add to cart (local state)
  → Cart shows items, quantities, total
  → Click Checkout
      → Enter delivery details: name, phone, address, city, pincode
      → Razorpay payment widget opens
          → POST /api/payments/create-order → backend → Razorpay API
          → Buyer completes payment on Razorpay
          → Razorpay calls webhook → backend verifies signature
          → supabase.from("orders").insert({ buyer_id, store_id, items, total, payment_status: "paid" })
          → WhatsApp notification sent to seller via Gupshup
          → FCM push notification sent to seller app
      → Buyer sees order confirmation
```

---

## 3. ADMIN PANEL (`localhost:3000/admin`)

### 3.1 Login Flow
```
/admin/login
  → Enter email + password
  → supabase.auth.signInWithPassword({ email, password })
  → Check users table: is_admin = true
  → If not admin → sign out + show error
  → If admin → router.push("/admin")

DEV MODE: auth is bypassed, goes directly to dashboard
```

### 3.2 Admin Dashboard (`/admin/dashboard`)
```
Page loads
  → Tries backend API: GET /api/analytics/platform?period=7
      → If backend down → fallback to direct Supabase queries:
          - stores count
          - users count (role=buyer)
          - paid orders last 7 days

Shows:
  - GMV (last 7 days)
  - Platform revenue
  - New sellers
  - New buyers
  - Open return requests (badge)
  - Quick links to all sections
  - Platform health status (static indicators)
```

### 3.3 Sellers (`/admin/sellers`)
```
Page loads
  → supabase.from("stores").select("*, users!seller_id(name, phone)")
  → shows all stores: name, seller, city, verified status, created date

Actions (via backend API with admin auth token):
  Verify seller   → PATCH /api/admin/sellers/{id}/verify
  Suspend seller  → PATCH /api/admin/sellers/{id}/suspend
```

### 3.4 Orders (`/admin/orders`)
```
Page loads
  → supabase.from("orders").select("*, stores(store_name)").order("created_at")
  → shows all orders across all stores
  → filter by status

No order modification from admin — orders managed by sellers
```

### 3.5 Returns (`/admin/returns`)
```
Page loads
  → supabase.from("returns").select("*, orders(*), users!buyer_id(name)")
  → shows return requests: order, buyer, reason, status

Actions:
  Approve return → supabase.from("returns").update({ status: "approved" })
                 → triggers refund via backend
  Reject return  → supabase.from("returns").update({ status: "rejected" })
```

### 3.6 Payouts (`/admin/payouts`)
```
Page loads
  → supabase.from("payouts").select("*, stores(store_name)")
  → shows pending and completed payouts per store

Process Payouts button:
  → POST /api/payouts/process (backend)
      → backend calculates: paid orders - previous payouts = due amount
      → creates payout record in Supabase
      → triggers bank transfer (manual/Razorpay X)
```

### 3.7 Analytics (`/admin/analytics`)
```
Page loads (needs backend running at localhost:3001)
  → GET /api/analytics/platform?period={7|30|90}
      → returns: GMV, platform fee, order counts, new users
  → GET /api/analytics/platform/stores?limit=10
      → returns: top stores by GMV

Charts:
  - Top stores bar chart (horizontal)
  - GMV share pie chart
  - Revenue breakdown (GMV vs platform fee vs payouts)
  - Growth summary grid
```

### 3.8 Buyers (`/admin/buyers`)
```
  → supabase.from("users").select("*").eq("role", "buyer")
  → shows all registered buyers: name, phone, joined date, order count
```

### 3.9 Settings (`/admin/settings`)
```
  → Platform-level settings: commission rate, feature flags
  → Saved to Supabase config table
```

---

## 4. BACKEND API (`localhost:3001`)

| Route | What it does |
|-------|-------------|
| `POST /api/payments/create-order` | Creates Razorpay order, returns order_id |
| `POST /api/payments/verify` | Verifies Razorpay signature after payment |
| `POST /api/payments/webhook` | Receives Razorpay webhook, updates order status |
| `POST /api/payouts/process` | Calculates and processes seller payouts |
| `GET /api/analytics/platform` | Platform-wide GMV, orders, user stats |
| `GET /api/analytics/platform/stores` | Top stores by GMV |
| `POST /api/whatsapp/webhook` | Receives WhatsApp messages from buyers |
| `POST /api/notifications/send` | Sends FCM push notification |
| `POST /api/delivery/create` | Creates Shiprocket shipment |
| `GET /api/delivery/track/:id` | Tracks shipment status |

---

## 5. DATA FLOW SUMMARY

```
Buyer places order:
  Buyer → Razorpay (payment) → Backend webhook
       → Supabase orders table (insert)
       → Gupshup (WhatsApp to seller)
       → FCM (push to seller mobile app)
       → Realtime event → Seller dashboard updates live

Seller processes order:
  Seller → Supabase orders table (update status)
         → Shiprocket (create shipment via backend)
         → WhatsApp to buyer (tracking link)

Admin processes payout:
  Admin → Backend /api/payouts/process
        → Supabase payouts table (insert)
        → Bank transfer (Razorpay X or manual)
```

---

## 6. KEY TABLES IN SUPABASE

| Table | Purpose |
|-------|---------|
| `users` | All users (sellers, buyers, admins) with role field |
| `stores` | Seller store details, slug, settings |
| `products` | Product catalogue per store |
| `orders` | All orders with items (JSONB), status, payment info |
| `payouts` | Payout records per store |
| `returns` | Return requests from buyers |
| `reviews` | Buyer reviews per store |

---

## 7. LOCAL DEV SETUP

```bash
# Terminal 1 — Web app
cd reelmart/apps/web
npm run dev                  # runs on localhost:3000

# Terminal 2 — Backend API
cd reelmart/backend
npm run dev                  # runs on localhost:3001

# Supabase — Cloud (no local setup needed)
# Auth, DB, Storage all on Supabase Cloud
```

**Dev shortcuts:**
- Seller login: click "Dev Login (skip OTP)" at `/seller/login`
- Admin: auth bypassed in dev, go directly to `/admin/dashboard`
- Analytics page needs backend (Terminal 2) running to show data
