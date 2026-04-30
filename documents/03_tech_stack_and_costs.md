# Document 3 — Tech Stack, Integrations & Maintenance Costs (Supabase Edition)
### Version 2.0 | Updated: April 2026

---

## 1. High Level System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTS                              │
│   Seller App (Android/iOS)   │   Buyer App (Android/iOS)    │
│   Buyer Web (storefront)     │   Admin Dashboard (Web)      │
└──────────────┬───────────────────────────┬───────────────────┘
               │                           │
               ▼                           ▼
┌──────────────────────────────────────────────────────────────┐
│                    SUPABASE (Core Backend)                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  Auth       │  │  Database   │  │  Storage             │ │
│  │  Phone OTP  │  │  PostgreSQL │  │  Product Images      │ │
│  │  JWT tokens │  │  Row Level  │  │  Store Logos         │ │
│  │             │  │  Security   │  │  Review Photos       │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │  Realtime   │  │  Auto APIs  │  │  Edge Functions      │ │
│  │  Order      │  │  REST +     │  │  Custom Logic        │ │
│  │  Updates    │  │  GraphQL    │  │  Webhooks            │ │
│  └─────────────┘  └─────────────┘  └──────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
               │
    ┌──────────┴──────────────────────────────┐
    ▼                                         ▼
┌──────────────────────┐         ┌────────────────────────────┐
│  NODE.JS BACKEND     │         │    THIRD PARTY APIS        │
│  (Custom logic only) │         │                            │
│                      │         │  Razorpay (payments)       │
│  Delivery booking    │         │  Shiprocket (delivery)     │
│  WhatsApp bot logic  │         │  Gupshup (WhatsApp)        │
│  Payout processing   │         │  Firebase FCM (push)       │
│  Shiprocket webhooks │         │  Google Maps (location)    │
└──────────────────────┘         └────────────────────────────┘

HOSTING
├── Supabase Cloud (database + auth + storage + realtime)
├── Vercel (Next.js storefront + admin dashboard — free tier)
└── Railway or Render (Node.js custom backend — ₹1,500/month)
```

---

## 2. What Supabase Replaces

| Old Stack | Supabase Replacement | Dev Time Saved | Cost Saved |
|---|---|---|---|
| AWS RDS PostgreSQL | Supabase Database | 1 week setup | ₹3,500/month |
| Custom JWT Auth service | Supabase Auth | 2-3 weeks | ₹2,000/month |
| AWS S3 image storage | Supabase Storage | 3 days | ₹500/month |
| Custom REST API layer | Supabase Auto APIs | 1-2 weeks | Dev cost |
| WebSocket server | Supabase Realtime | 1 week | ₹2,000/month |
| Redis sessions | Supabase Auth sessions | 2 days | ₹2,000/month |
| MSG91 OTP (partially) | Supabase Auth OTP | 1 day | ₹1,000/month |
| **Total savings** | | **6-8 weeks faster** | **₹11,000/month** |

---

## 3. Full Tech Stack

### 3.1 Backend — Supabase (Core)
| Feature | How Supabase Handles It |
|---|---|
| Database | PostgreSQL — same as before, just fully managed |
| Authentication | Built-in phone OTP — no custom code needed |
| File storage | Built-in storage with CDN — replaces AWS S3 |
| REST API | Auto-generated from your database tables |
| Realtime | Postgres changes streamed to clients instantly |
| Row Level Security | Database-level permissions — very secure |
| Edge Functions | Serverless functions for custom logic (Deno runtime) |

### 3.2 Backend — Node.js (Custom Logic Only)
Only needed for things Supabase cannot handle directly:
| Custom Logic | Why Node.js |
|---|---|
| Shiprocket delivery booking | Complex API calls + webhook handling |
| WhatsApp bot conversation flow | Multi-step conversation state management |
| Razorpay payout to sellers | Scheduled weekly payouts logic |
| Seller store subdomain routing | yourstore.platform.com routing logic |

### 3.3 Frontend — Mobile Apps
| Component | Technology | Why |
|---|---|---|
| Framework | React Native | Single codebase Android + iOS |
| Supabase SDK | @supabase/supabase-js | Official SDK, works perfectly |
| State management | Zustand | Lightweight, simple |
| Navigation | React Navigation | Industry standard |
| Alternative | Flutter + supabase-flutter | If team prefers Flutter |

### 3.4 Frontend — Web
| Component | Technology | Why |
|---|---|---|
| Buyer storefront | Next.js + Supabase SDK | SEO friendly, fast, server-side rendering |
| Admin dashboard | Next.js + Supabase SDK | Same codebase, reuse components |
| Styling | Tailwind CSS | Fast UI development |
| Hosting | Vercel | Free tier sufficient for long time |

### 3.5 Infrastructure (Minimal with Supabase)
| Component | Technology | Why |
|---|---|---|
| Core backend | Supabase Cloud | Fully managed, zero DevOps needed |
| Custom backend | Railway or Render | Simple Node.js hosting, cheap |
| Web hosting | Vercel | Free, fast, global CDN |
| DNS | Cloudflare | Free, fast, subdomain management |
| SSL | Cloudflare / Vercel | Free automatic SSL |

**No AWS needed at all for MVP and Phase 2. Saves massive complexity and cost.**

---

## 4. Supabase Feature Implementation Guide

### 4.1 Phone OTP Authentication
```javascript
// Seller / Buyer login — just phone number + OTP, no passwords

// Step 1: Send OTP
const { error } = await supabase.auth.signInWithOtp({
  phone: '+919876543210'
})

// Step 2: Verify OTP entered by user
const { data, error } = await supabase.auth.verifyOtp({
  phone: '+919876543210',
  token: '123456',
  type: 'sms'
})
// User is now logged in — JWT token auto-managed by Supabase
```

### 4.2 Product Image Upload
```javascript
// Upload product photo directly from mobile app
const { data, error } = await supabase.storage
  .from('product-images')
  .upload(`stores/${storeId}/${productId}_1.jpg`, imageFile, {
    contentType: 'image/jpeg',
    upsert: true
  })

// Get public URL for displaying image
const { data: urlData } = supabase.storage
  .from('product-images')
  .getPublicUrl(`stores/${storeId}/${productId}_1.jpg`)

const imageUrl = urlData.publicUrl
// Store this URL in products table
```

### 4.3 Realtime Order Notifications (Seller App)
```javascript
// Seller app listens for new orders the moment buyer places them
// No polling — instant push via WebSocket

useEffect(() => {
  const channel = supabase
    .channel('new-orders')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: `store_id=eq.${storeId}`
    }, (payload) => {
      showNewOrderNotification(payload.new)
      playNotificationSound()
      refreshOrdersList()
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [storeId])
```

### 4.4 Realtime Order Status (Buyer App)
```javascript
// Buyer sees order status update in realtime
// Seller accepts → buyer screen updates instantly

const channel = supabase
  .channel('my-order')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: `order_id=eq.${orderId}`
  }, (payload) => {
    updateOrderStatus(payload.new.status)
    // "Your order has been accepted!" — instant
  })
  .subscribe()
```

### 4.5 Row Level Security (Data Privacy)
```sql
-- Sellers can only see their own orders
CREATE POLICY "Sellers see own orders"
ON orders FOR SELECT
USING (
  store_id IN (
    SELECT store_id FROM stores
    WHERE seller_id = auth.uid()
  )
);

-- Buyers can only see their own orders
CREATE POLICY "Buyers see own orders"
ON orders FOR SELECT
USING (buyer_id = auth.uid());

-- Products are public for reading
CREATE POLICY "Products are publicly readable"
ON products FOR SELECT
USING (is_available = true);
```

### 4.6 Seller Store Subdomain (Edge Function)
```javascript
// Supabase Edge Function handles yourstore.platform.com routing

Deno.serve(async (req) => {
  const hostname = req.headers.get('host') // priya-cakes.platform.com
  const storeSlug = hostname.split('.')[0]  // priya-cakes

  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('store_slug', storeSlug)
    .single()

  return new Response(JSON.stringify(store))
})
```

---

## 5. Database Schema in Supabase (PostgreSQL)

```sql
-- USERS TABLE
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  city TEXT,
  role TEXT DEFAULT 'buyer',     -- 'seller', 'buyer', 'both'
  referral_store_id UUID,        -- which seller link brought them
  loyalty_coins INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- STORES TABLE
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES users(id),
  store_name TEXT NOT NULL,
  store_slug TEXT UNIQUE NOT NULL,  -- for yourstore.platform.com
  category TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  city TEXT,
  area TEXT,
  rating_avg DECIMAL DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_reviews INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCTS TABLE
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL NOT NULL,
  compare_price DECIMAL,            -- original price for strikethrough
  stock_quantity INT DEFAULT -1,    -- -1 means unlimited
  images TEXT[],                    -- array of Supabase storage URLs
  variants JSONB,                   -- [{name:"Size", options:["500g","1kg"]}]
  is_available BOOLEAN DEFAULT true,
  total_sold INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS TABLE
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES users(id),
  store_id UUID REFERENCES stores(id),
  items JSONB NOT NULL,             -- [{product_id, name, variant, qty, price}]
  subtotal DECIMAL NOT NULL,
  delivery_fee DECIMAL NOT NULL,
  total_amount DECIMAL NOT NULL,
  status TEXT DEFAULT 'pending',    -- pending/accepted/preparing/shipped/delivered/cancelled
  delivery_address JSONB,           -- {name, phone, line1, city, pincode}
  payment_status TEXT DEFAULT 'pending',
  payment_id TEXT,                  -- Razorpay payment ID
  tracking_id TEXT,                 -- Shiprocket tracking ID
  tracking_url TEXT,
  notes TEXT,                       -- buyer special instructions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- REVIEWS TABLE
CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) UNIQUE,
  buyer_id UUID REFERENCES users(id),
  store_id UUID REFERENCES stores(id),
  rating INT CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PAYOUTS TABLE
CREATE TABLE payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  amount DECIMAL NOT NULL,
  orders_included UUID[],
  status TEXT DEFAULT 'pending',    -- pending/processing/completed
  razorpay_payout_id TEXT,
  settlement_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- REFERRALS TABLE (track which seller brought which buyer)
CREATE TABLE referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id),
  buyer_id UUID REFERENCES users(id),
  installed_at TIMESTAMPTZ DEFAULT NOW()
);

-- WISHLISTS TABLE
CREATE TABLE wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES users(id),
  product_id UUID REFERENCES products(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(buyer_id, product_id)
);

-- FOLLOWED STORES TABLE
CREATE TABLE followed_stores (
  buyer_id UUID REFERENCES users(id),
  store_id UUID REFERENCES stores(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (buyer_id, store_id)
);
```

---

## 6. Supabase Storage Buckets Setup

```
supabase/storage/
├── product-images/          (public bucket)
│   └── stores/{store_id}/{product_id}_{1,2,3}.jpg
│
├── store-logos/             (public bucket)
│   └── {store_id}/logo.jpg
│
├── review-photos/           (public bucket)
│   └── {review_id}/{1,2,3}.jpg
│
└── seller-documents/        (private bucket — verification only)
    └── {seller_id}/aadhaar.jpg
```

---

## 7. Third Party Integrations (Updated)

### 7.1 Payments — Razorpay
| Feature | Detail |
|---|---|
| What it does | UPI, cards, netbanking, COD, wallet |
| Integration | Razorpay SDK + Supabase Edge Function webhook |
| Payout to sellers | Razorpay X — automated weekly payouts |
| Transaction fee | 2% per order |
| Monthly cost at 5,000 orders | ₹10,000-₹15,000 |

### 7.2 Delivery — Shiprocket
| Feature | Detail |
|---|---|
| What it does | 15+ courier partners aggregated |
| Integration | Node.js backend calls Shiprocket API |
| Webhook flow | Shiprocket → Node.js → Supabase → Realtime to buyer |
| Cost | ₹35-₹80 per shipment (buyer pays) |
| Monthly platform fee | ₹0 |

### 7.3 WhatsApp — Gupshup
| Feature | Detail |
|---|---|
| What it does | Order notifications + WhatsApp bot |
| Integration | Supabase Edge Function triggers on order events |
| Cost per message | ₹0.35-₹0.50 |
| Monthly at 20,000 messages | ₹7,000-₹10,000 |

### 7.4 Push Notifications — Firebase FCM
| Feature | Detail |
|---|---|
| Integration | Supabase Edge Function calls FCM on order events |
| Cost | Free up to 1M/day |

### 7.5 Maps — Google Maps
| Feature | Detail |
|---|---|
| What it does | Address autocomplete, distance, store locator |
| Cost | Free up to $200/month credit (fine for Phase 1-2) |

### 7.6 SMS OTP — Via Supabase Auth + Twilio
| Feature | Detail |
|---|---|
| How it works | Supabase Auth connects to Twilio — 10 min setup |
| Cost | ~₹0.60 per OTP SMS |
| Monthly at 3,000 OTPs | ₹1,800 |
| At scale | Switch to custom MSG91 flow for cheaper rates |

---

## 8. Monthly Cost Estimate (Supabase Stack)

### Phase 1 — MVP (0-1,000 sellers, 10,000 buyers)
| Service | Old Cost | New Cost with Supabase |
|---|---|---|
| Database (RDS → Supabase Free) | ₹3,500 | ₹0 |
| Auth service (→ Supabase) | ₹2,000 | ₹0 |
| Storage (S3 → Supabase) | ₹500 | ₹0 |
| Redis (→ Supabase handles) | ₹2,000 | ₹0 |
| Backend server (Railway) | ₹4,000 | ₹1,500 |
| Web hosting (Vercel free) | ₹1,000 | ₹0 |
| Razorpay | ₹5,000 | ₹5,000 |
| Gupshup WhatsApp | ₹7,000 | ₹7,000 |
| OTP SMS (Twilio via Supabase) | ₹1,000 | ₹1,800 |
| Firebase FCM | ₹0 | ₹0 |
| Google Maps | ₹0 | ₹0 |
| Domain + Cloudflare | ₹500 | ₹500 |
| **Total** | **₹23,500/month** | **₹15,800/month** |

**Monthly saving: ₹7,700 | Annual saving: ₹92,400**

### Phase 2 — Growth (1,000-10,000 sellers, 1L buyers)
| Service | Cost |
|---|---|
| Supabase Pro | ₹2,100 ($25/month) |
| Railway Node.js (scaled) | ₹5,000 |
| Vercel Pro (if needed) | ₹1,700 |
| Razorpay (50,000 orders) | ₹25,000 |
| Gupshup (1,00,000 messages) | ₹35,000 |
| OTP SMS | ₹5,000 |
| Google Maps | ₹5,000 |
| **Total Phase 2** | **~₹78,800/month** |

**Saving vs old stack: ₹32,200/month**

### Phase 3 — Scale (10,000+ sellers, 10L+ buyers)
| Service | Cost |
|---|---|
| Supabase Team OR self-hosted | ₹50,000 |
| Node.js backend (scaled) | ₹20,000 |
| WhatsApp messages | ₹1,50,000+ |
| All other services | ₹30,000 |
| **Total Phase 3** | **~₹2,50,000+/month** |

*At Phase 3 revenue is ₹1-2 Cr/month — infra is less than 3%*

---

## 9. Development Team (Supabase = Faster & Cheaper)

### Why Supabase Reduces Dev Time
- No backend setup for auth — saves 2-3 weeks
- No API development for basic CRUD — saves 1-2 weeks
- No realtime server setup — saves 1 week
- No file storage setup — saves 3 days
- **Total saved: 4-6 weeks of development**

### MVP Build (8-10 weeks instead of 16-20 weeks)
| Role | Count | Monthly Cost | Total for 3 months |
|---|---|---|---|
| Full Stack Developer (React Native + Supabase) | 2 | ₹80,000 each | ₹4,80,000 |
| UI/UX Designer | 1 | ₹50,000 | ₹1,50,000 |
| **Total** | | | **~₹6,30,000** |

### Freelancer Route (Cheapest)
| Role | Fixed Cost |
|---|---|
| React Native developer | ₹2,00,000 |
| Next.js developer | ₹1,00,000 |
| Node.js (custom logic only) | ₹80,000 |
| UI/UX design | ₹80,000 |
| **Total** | **~₹4,60,000** |

---

## 10. Total Initial Investment (Updated with Supabase)

| Category | Old Estimate | New Estimate |
|---|---|---|
| Development (MVP) | ₹6-18 lakhs | ₹4-7 lakhs |
| Infrastructure (6 months) | ₹1.5 lakhs | ₹95,000 |
| Marketing (first 1,000 sellers) | ₹2 lakhs | ₹2 lakhs |
| Legal + registration | ₹50,000 | ₹50,000 |
| Buffer | ₹2 lakhs | ₹1 lakh |
| **Total to launch** | **₹12-24 lakhs** | **₹8-12 lakhs** |

**Supabase saves ₹4-12 lakhs on initial investment.**

---

## 11. Security (Supabase Handles Most Of It)

| Area | How Supabase Handles It |
|---|---|
| Authentication | Built-in JWT, OTP, session management |
| Database security | Row Level Security — users only see their own data |
| API security | Auto rate limiting on all Supabase APIs |
| Storage security | Bucket policies — control who reads/writes |
| HTTPS | Auto SSL on all Supabase endpoints |
| Payment security | Razorpay handles — PCI DSS compliant |

---

## 12. Scalability Plan

| Users | Architecture |
|---|---|
| 0-50,000 | Supabase Free + Railway + Vercel |
| 50,000-5,00,000 | Supabase Pro + scaled Railway + Vercel Pro |
| 5,00,000+ | Supabase Team OR self-host on AWS |

**Supabase scales automatically. You don't touch infrastructure until 5L+ users.**

---

## 13. Supabase Limitations to Know

| Limitation | Impact | Solution |
|---|---|---|
| Free plan: 500MB DB | Fine for MVP | Upgrade to Pro (₹2,100/month) when needed |
| Free plan: 50,000 auth users | Fine for 6-12 months | Upgrade when hitting limit |
| SMS OTP via Twilio only | Slightly expensive | Switch to MSG91 custom flow at scale |
| Vendor lock-in | Medium risk | Supabase is open source — self-hostable anytime |

---

## 14. Local Development Setup

```bash
# Install Supabase CLI
npm install -g supabase

# Start local Supabase (PostgreSQL + Auth + Storage locally)
supabase start

# This gives you:
# DB     → postgresql://localhost:54322/postgres
# Studio → http://localhost:54323 (visual DB editor)
# API    → http://localhost:54321

# Push schema to local DB
supabase db push

# Generate TypeScript types from your schema
supabase gen types typescript --local > types/supabase.ts

# Deploy Edge Functions
supabase functions deploy order-notifications

# Link to production Supabase project
supabase link --project-ref your-project-ref
```

---

*Document 3 of 4 — Updated to Supabase Stack v2.0*
