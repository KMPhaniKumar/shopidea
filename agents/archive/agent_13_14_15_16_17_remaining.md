# AGENT 13: WhatsApp Bot (Conversational Ordering)
### File: agents/agent_13_whatsapp_bot.md

---

## What This Does

Buyer messages seller's WhatsApp number → bot handles full order flow
automatically. Zero manual work for seller.

## How It Works

```
Buyer: "Hi"
Bot: Shows catalogue menu
Buyer: Selects product
Bot: Asks variant/quantity
Buyer: Confirms
Bot: Sends payment link
Buyer: Pays
Bot: Confirms order to both seller and buyer
```

## Step 1: Gupshup Webhook Setup

Create `backend/src/whatsapp/bot.ts`:

```typescript
import express from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { sendWhatsApp } from '../notifications/whatsapp'

const router = express.Router()

// Conversation state stored in Redis/memory per phone number
const sessions: Record<string, BotSession> = {}

interface BotSession {
  storeSlug: string
  storeId: string
  step: 'menu' | 'product_selected' | 'variant_selected' | 'address' | 'payment_sent'
  selectedProduct?: any
  selectedVariant?: any
  quantity?: number
  buyerAddress?: any
}

// POST /whatsapp/webhook — Gupshup sends messages here
router.post('/webhook', async (req, res) => {
  const { payload } = req.body
  const buyerPhone = payload.sender.phone
  const message = payload.payload.text?.trim()
  const storeSlug = req.query.store as string  // each store has unique webhook URL

  // Get or create session
  let session = sessions[buyerPhone] || { storeSlug, step: 'menu' }

  // Fetch store
  if (!session.storeId) {
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, store_name')
      .eq('store_slug', storeSlug)
      .single()
    if (!store) return res.send('ok')
    session.storeId = store.id
  }

  session = await handleMessage(buyerPhone, message, session)
  sessions[buyerPhone] = session

  res.send('ok')
})

async function handleMessage(phone: string, message: string, session: BotSession): Promise<BotSession> {

  // STEP: Show menu
  if (session.step === 'menu' || message.toLowerCase() === 'hi' || message === '0') {
    const products = await getStoreProducts(session.storeId)
    const menu = products
      .map((p: any, i: number) => `${i + 1}. ${p.name} — ₹${p.price}`)
      .join('\n')

    await sendWhatsApp(phone, `👋 Welcome!\n\nHere's what we have:\n\n${menu}\n\nReply with a number to order`)
    return { ...session, step: 'product_selected', products }
  }

  // STEP: Product selected
  if (session.step === 'product_selected') {
    const idx = parseInt(message) - 1
    const product = (session as any).products?.[idx]
    if (!product) {
      await sendWhatsApp(phone, 'Please reply with a valid number from the menu')
      return session
    }

    if (product.variants && product.variants.length > 0) {
      const variantGroup = product.variants[0]
      const options = variantGroup.options
        .map((opt: string, i: number) => `${i + 1}. ${opt}`)
        .join('\n')
      await sendWhatsApp(phone, `*${product.name}*\n\nSelect ${variantGroup.name}:\n${options}`)
      return { ...session, step: 'variant_selected', selectedProduct: product }
    }

    // No variants — ask quantity
    await sendWhatsApp(phone, `*${product.name}* — ₹${product.price}\n\nHow many do you want? (Reply with number)`)
    return { ...session, step: 'address', selectedProduct: product }
  }

  // STEP: Confirm and send payment
  if (session.step === 'address') {
    const qty = parseInt(message) || 1
    const product = session.selectedProduct
    const total = product.price * qty

    await sendWhatsApp(phone,
      `✅ *Order Summary*\n\n` +
      `${product.name} x${qty} = ₹${total}\n\n` +
      `Please share your delivery address:\n` +
      `Format: Name, Full address, City, Pincode`
    )
    return { ...session, step: 'payment_sent', quantity: qty }
  }

  // STEP: Address received — send payment link
  if (session.step === 'payment_sent') {
    // Parse address from message
    // Create order in DB
    // Send Razorpay payment link
    const paymentLink = await createPaymentLink(session, message, phone)
    await sendWhatsApp(phone,
      `📦 Almost done!\n\nPay here to confirm your order:\n${paymentLink}\n\n_Link expires in 30 minutes_`
    )
    return { ...session, step: 'menu' }  // reset for next conversation
  }

  return session
}

async function getStoreProducts(storeId: string) {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, price, variants')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .limit(10)
  return data ?? []
}

export default router
```

## Step 2: Razorpay Payment Link

```typescript
// Create shareable payment link (no checkout page needed)
async function createPaymentLink(session: BotSession, addressText: string, phone: string): Promise<string> {
  const product = session.selectedProduct
  const total = product.price * (session.quantity ?? 1)

  // Create order in Supabase first
  const { data: order } = await supabaseAdmin.from('orders').insert({
    store_id: session.storeId,
    items: [{ product_id: product.id, name: product.name, qty: session.quantity, price: product.price }],
    subtotal: total,
    delivery_fee: 60,
    total_amount: total + 60,
    delivery_address: { raw: addressText, phone },
    payment_status: 'pending',
    status: 'pending',
  }).select('id, order_number').single()

  // Create Razorpay payment link
  const response = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: (total + 60) * 100,
      currency: 'INR',
      description: `Order ${order?.order_number}`,
      customer: { contact: phone },
      notify: { sms: false, email: false },
      reminder_enable: false,
      callback_url: `${process.env.BACKEND_URL}/payments/whatsapp-callback?orderId=${order?.id}`,
    }),
  })
  const data = await response.json()
  return data.short_url
}
```

---

# AGENT 14: Seller Marketing (Coupons + Broadcasts)
### File: agents/agent_14_seller_marketing.md

---

## Step 1: Database

Create `supabase/migrations/008_marketing.sql`:

```sql
-- Discount coupons
CREATE TABLE public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  code TEXT NOT NULL,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL,
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_discount DECIMAL(10,2),
  total_uses INT DEFAULT 0,
  max_uses INT,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own coupons"
ON public.coupons FOR ALL
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Coupons are publicly readable"
ON public.coupons FOR SELECT TO anon, authenticated USING (is_active = true);

-- Broadcast messages sent by sellers
CREATE TABLE public.broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  message TEXT NOT NULL,
  recipient_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Step 2: Coupon Service

Create `apps/seller-app/src/services/couponService.ts`:

```typescript
// Create coupon
export async function createCoupon(storeId: string, data: {
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  minOrderAmount?: number
  maxDiscount?: number
  maxUses?: number
  validUntil?: Date
}) {
  const { error } = await supabase.from('coupons').insert({
    store_id: storeId,
    code: data.code.toUpperCase(),
    discount_type: data.discountType,
    discount_value: data.discountValue,
    min_order_amount: data.minOrderAmount ?? 0,
    max_discount: data.maxDiscount,
    max_uses: data.maxUses,
    valid_until: data.validUntil,
  })
  if (error) throw error
}

// Validate coupon (buyer side)
export async function validateCoupon(storeId: string, code: string, orderAmount: number) {
  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .eq('code', code.toUpperCase())
    .eq('is_active', true)
    .single()

  if (!coupon) return { valid: false, error: 'Invalid coupon code' }
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date())
    return { valid: false, error: 'Coupon expired' }
  if (coupon.max_uses && coupon.total_uses >= coupon.max_uses)
    return { valid: false, error: 'Coupon usage limit reached' }
  if (orderAmount < coupon.min_order_amount)
    return { valid: false, error: `Minimum order ₹${coupon.min_order_amount} required` }

  let discount = coupon.discount_type === 'percentage'
    ? orderAmount * (coupon.discount_value / 100)
    : coupon.discount_value

  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount)

  return { valid: true, discount, coupon }
}
```

## Step 3: Broadcast Service

```typescript
// Send message to all store customers via WhatsApp
export async function sendBroadcast(storeId: string, message: string): Promise<number> {
  // Get all unique buyers who ordered from this store
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('buyer_id, users!buyer_id(phone)')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')

  const uniquePhones = [...new Set(orders?.map((o: any) => o.users.phone) ?? [])]

  // Send WhatsApp to each (rate limited — 1 per second)
  let sent = 0
  for (const phone of uniquePhones) {
    await sendWhatsApp(phone, message)
    await new Promise(r => setTimeout(r, 1000))  // 1 second delay
    sent++
  }

  // Log broadcast
  await supabaseAdmin.from('broadcasts').insert({
    store_id: storeId,
    message,
    recipient_count: sent,
  })

  return sent
}
```

---

# AGENT 15: Returns + Refunds + Disputes
### File: agents/agent_15_returns_refunds.md

---

## Step 1: Database

Create `supabase/migrations/009_returns.sql`:

```sql
CREATE TYPE return_status AS ENUM (
  'requested', 'approved', 'rejected', 'pickup_scheduled',
  'picked_up', 'refund_initiated', 'refunded'
);

CREATE TABLE public.returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) UNIQUE NOT NULL,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  reason TEXT NOT NULL,
  description TEXT,
  photos TEXT[],
  status return_status DEFAULT 'requested',
  admin_notes TEXT,
  refund_amount DECIMAL(10,2),
  razorpay_refund_id TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage own returns"
ON public.returns FOR ALL
USING (buyer_id = auth.uid());

CREATE POLICY "Sellers see returns for their stores"
ON public.returns FOR SELECT
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));
```

## Step 2: Return Flow

```typescript
// Buyer initiates return (within 24 hours of delivery)
export async function requestReturn(data: {
  orderId: string
  buyerId: string
  storeId: string
  reason: string
  description?: string
  photos?: string[]
}): Promise<{ success: boolean; error?: string }> {
  // Check if within 24 hour window
  const { data: order } = await supabase
    .from('orders')
    .select('delivered_at, status')
    .eq('id', data.orderId)
    .single()

  if (order?.status !== 'delivered') return { success: false, error: 'Order not yet delivered' }

  const deliveredAt = new Date(order.delivered_at)
  const hoursSinceDelivery = (Date.now() - deliveredAt.getTime()) / 36e5
  if (hoursSinceDelivery > 24) return { success: false, error: 'Return window of 24 hours has passed' }

  await supabase.from('returns').insert({
    order_id: data.orderId,
    buyer_id: data.buyerId,
    store_id: data.storeId,
    reason: data.reason,
    description: data.description,
    photos: data.photos ?? [],
  })

  // Notify seller
  // Notify admin

  return { success: true }
}

// Process refund via Razorpay
export async function processRefund(
  orderId: string,
  refundAmount: number,
  returnId: string
): Promise<void> {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('payment_id')
    .eq('id', orderId)
    .single()

  const response = await fetch(`https://api.razorpay.com/v1/payments/${order?.payment_id}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: refundAmount * 100 }),
  })
  const refund = await response.json()

  await supabaseAdmin.from('returns').update({
    status: 'refunded',
    razorpay_refund_id: refund.id,
    refund_amount: refundAmount,
    resolved_at: new Date().toISOString(),
  }).eq('id', returnId)

  await supabaseAdmin.from('orders').update({
    payment_status: 'refunded',
    status: 'refunded',
  }).eq('id', orderId)
}
```

---

# AGENT 16: Admin Panel
### File: agents/agent_16_admin_panel.md

---

## What This Covers

Full admin dashboard at admin.platform.com for platform management.

## Pages to Build

### Dashboard (home)
- Total sellers, buyers, orders, GMV — today / week / month
- Revenue chart
- New signups today
- Pending actions (unresolved returns, suspended sellers)

### Seller Management
- List all sellers with search and filter
- View seller details, store, orders, payouts
- Verify seller (Aadhaar check)
- Suspend / reactivate seller
- Manually trigger payout

### Buyer Management
- List all buyers
- View buyer order history
- Issue manual refund
- Suspend buyer account

### Order Management
- All orders across platform with filters
- Intervene in disputes
- Override order status
- View payment details

### Returns Management
- All return requests
- Approve / reject returns
- Trigger refund
- Add admin notes

### Payout Management
- Pending payouts list
- Process weekly payouts
- Payout history
- Failed payout retry

### Platform Settings
- Delivery fee configuration
- Platform commission rate
- Maintenance mode toggle
- Announcement banner

## Step 1: Admin Auth

```typescript
// Admin uses email + password (not OTP — more secure)
// Add is_admin column to users table

ALTER TABLE public.users ADD COLUMN is_admin BOOLEAN DEFAULT false;

// Admin login — Next.js
async function adminLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  // Verify is_admin
  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', data.user.id)
    .single()

  if (!user?.is_admin) {
    await supabase.auth.signOut()
    throw new Error('Not authorized')
  }
}
```

## Step 2: Admin Supabase Policies

```sql
-- Admin can read everything
CREATE POLICY "Admin reads all"
ON public.orders FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);
-- Repeat for all tables
```

## Step 3: Key Admin Queries

```typescript
// Platform GMV
const { data } = await supabaseAdmin
  .from('orders')
  .select('total_amount, created_at')
  .eq('payment_status', 'paid')
  .gte('created_at', startDate)

// Seller summary
const { data } = await supabaseAdmin
  .from('stores')
  .select('*, users!seller_id(name, phone), orders(count)')
  .order('created_at', { ascending: false })

// Process weekly payouts (run every Monday)
const unpaidOrders = await supabaseAdmin
  .from('orders')
  .select('id, store_id, total_amount')
  .eq('status', 'delivered')
  .eq('payment_status', 'paid')
  .is('payout_id', null)
  .lte('delivered_at', sevenDaysAgo)
```

---

# AGENT 17: Infrastructure + Monitoring + CI/CD
### File: agents/agent_17_infrastructure.md

---

## Step 1: Error Logging — Sentry

```bash
# Install in all apps
npm install @sentry/react-native    # mobile apps
npm install @sentry/nextjs          # web
npm install @sentry/node            # backend
```

```typescript
// Initialize in app entry point
import * as Sentry from '@sentry/react-native'
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
})

// Wrap any async function
try {
  await riskyOperation()
} catch (error) {
  Sentry.captureException(error)
  throw error
}
```

## Step 2: API Health Monitoring

Create `backend/src/health.ts`:

```typescript
router.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    supabaseAdmin.from('users').select('count').limit(1),
    axios.get('https://apiv2.shiprocket.in/v1/external/'),
  ])
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: checks[0].status,
    shiprocket: checks[1].status,
  })
})
```

## Step 3: CI/CD — GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '20' }
      - run: cd backend && npm ci
      - run: cd backend && npm test
      - name: Deploy to Railway
        run: railway up --service backend
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  deploy-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with: { node-version: '20' }
      - run: cd apps/web && npm ci && npm run build
      - name: Deploy to Vercel
        run: vercel --prod --token ${{ secrets.VERCEL_TOKEN }}

  deploy-supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: supabase/setup-cli@v1
      - run: supabase db push --db-url ${{ secrets.SUPABASE_DB_URL }}
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
```

## Step 4: App Store Submission Checklist

### Google Play Store
```
1. Create developer account — $25 one-time fee
2. Generate signed APK:
   cd apps/seller-app
   npx eas build --platform android --profile production
3. Play Console → Create app → Upload AAB
4. Fill: App description, screenshots (min 2), feature graphic
5. Content rating questionnaire
6. Pricing: Free
7. Countries: India (start)
8. Submit for review — takes 3-7 days
```

### Apple App Store
```
1. Apple Developer Program — $99/year
2. Generate IPA:
   npx eas build --platform ios --profile production
3. App Store Connect → New App
4. Fill metadata: name, description, keywords, screenshots
5. Privacy policy URL (required)
6. Submit for review — takes 1-3 days
```

## Step 5: Performance Checklist

```typescript
// Lazy load screens in React Native
const OrdersScreen = React.lazy(() => import('./screens/OrdersScreen'))

// Pagination for lists
const { data } = await supabase
  .from('orders')
  .select('*')
  .range(page * 20, (page + 1) * 20 - 1)  // 20 per page

// Image optimization
// Use Supabase image transforms
const optimizedUrl = `${imageUrl}?width=400&quality=80`

// Memoize expensive components
const OrderCard = React.memo(({ order }) => { ... })
```

---

## Done When

- [ ] Sentry captures errors from all apps
- [ ] Health endpoint responds correctly
- [ ] GitHub Actions deploys on push to main
- [ ] App submitted to Play Store
- [ ] App submitted to App Store
- [ ] Performance metrics acceptable (< 3s load)
