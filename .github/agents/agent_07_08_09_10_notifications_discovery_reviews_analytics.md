# AGENT: Notifications (WhatsApp + Push)
### File: agents/agent_07_notifications.md

---

## What This Feature Does

Sends WhatsApp messages and push notifications for every key order event.
Zero manual work for sellers. Buyers always know order status.

## Step 1: Notification Service

Create `backend/src/notifications/whatsapp.ts`:

```typescript
import axios from 'axios'

const GUPSHUP_API = 'https://api.gupshup.io/sm/api/v1/msg'

// Send WhatsApp message via Gupshup
async function sendWhatsApp(phone: string, message: string): Promise<void> {
  await axios.post(GUPSHUP_API, new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SOURCE_NUMBER!,
    destination: phone.replace('+', ''),
    message: JSON.stringify({ type: 'text', text: message }),
    'src.name': process.env.GUPSHUP_APP_NAME!,
  }), {
    headers: {
      apikey: process.env.GUPSHUP_API_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  })
}

// Notification templates
export const notify = {

  // To seller — new order received
  newOrder: (sellerPhone: string, order: any) =>
    sendWhatsApp(sellerPhone, `
🛍️ *New Order Received!*

Order: ${order.order_number}
Amount: ₹${order.total_amount}
Items: ${order.items.map((i: any) => `${i.name} x${i.qty}`).join(', ')}

Open your app to accept ✅
    `.trim()),

  // To buyer — order confirmed
  orderConfirmed: (buyerPhone: string, order: any) =>
    sendWhatsApp(buyerPhone, `
✅ *Order Confirmed!*

Hi ${order.delivery_address.name}!
Your order ${order.order_number} is confirmed.

Amount: ₹${order.total_amount}
Delivery to: ${order.delivery_address.city}

We'll notify you when it ships 📦
    `.trim()),

  // To buyer — order rejected
  orderRejected: (buyerPhone: string, order: any) =>
    sendWhatsApp(buyerPhone, `
❌ *Order Update*

Sorry, your order ${order.order_number} couldn't be processed.
Reason: ${order.rejection_reason}

Your payment will be refunded in 3-5 business days.
    `.trim()),

  // To buyer — order shipped
  orderShipped: (buyerPhone: string, order: any) =>
    sendWhatsApp(buyerPhone, `
📦 *Your Order is on the Way!*

Order: ${order.order_number}
Courier: ${order.courier_name}
Tracking: ${order.tracking_url}

Expected delivery: ${order.estimated_delivery}
    `.trim()),

  // To buyer — order delivered
  orderDelivered: (buyerPhone: string, order: any) =>
    sendWhatsApp(buyerPhone, `
🎉 *Order Delivered!*

Your order ${order.order_number} has been delivered.

Happy with your purchase? Leave a review:
https://platform.com/review/${order.id}

Thank you for shopping! 🙏
    `.trim()),

  // To seller — payment received
  paymentReceived: (sellerPhone: string, order: any) =>
    sendWhatsApp(sellerPhone, `
💰 *Payment Received!*

Order: ${order.order_number}
Amount: ₹${order.total_amount} will be settled in 2 days.
    `.trim()),
}
```

## Step 2: Firebase Push Notifications

Create `backend/src/notifications/push.ts`:

```typescript
import admin from 'firebase-admin'

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  )
})

export async function sendPush(data: {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}): Promise<void> {
  await admin.messaging().send({
    token: data.token,
    notification: { title: data.title, body: data.body },
    data: data.data,
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default' } } },
  })
}

export const pushNotify = {
  newOrder: (token: string, orderNumber: string) =>
    sendPush({
      token,
      title: '🛍️ New Order!',
      body: `Order ${orderNumber} needs your attention`,
      data: { type: 'new_order', order_number: orderNumber }
    }),

  orderStatusUpdate: (token: string, status: string, orderNumber: string) =>
    sendPush({
      token,
      title: 'Order Update',
      body: `Your order ${orderNumber} is now ${status}`,
      data: { type: 'order_status', order_number: orderNumber, status }
    }),
}
```

## Step 3: Supabase Edge Function — Order Event Trigger

Create `supabase/functions/order-notifications/index.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

Deno.serve(async (req) => {
  const { record, old_record, type } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Fetch full order with related data
  const { data: order } = await supabase
    .from('orders')
    .select('*, stores(whatsapp_number, store_name), users!buyer_id(phone, name)')
    .eq('id', record.id)
    .single()

  const backendUrl = Deno.env.get('BACKEND_URL')!

  // Trigger correct notification based on status change
  if (type === 'INSERT') {
    // New order — notify seller
    await fetch(`${backendUrl}/notifications/new-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order })
    })
  }

  if (type === 'UPDATE' && record.status !== old_record.status) {
    // Status changed — notify buyer
    await fetch(`${backendUrl}/notifications/status-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order, newStatus: record.status })
    })
  }

  return new Response('ok')
})
```

Deploy: `supabase functions deploy order-notifications`

Set database webhook in Supabase dashboard:
- Table: orders
- Events: INSERT, UPDATE
- URL: your edge function URL

---

# AGENT: Discovery + Search
### File: agents/agent_08_discovery.md

---

## What This Feature Does

Buyers discover sellers by category, location, rating, and AI-powered
recommendations. The home feed is personalized based on past orders.

## Step 1: Discovery Queries

Create `apps/buyer-app/src/services/discoveryService.ts`:

```typescript
import { supabase } from '../lib/supabase'

// Get nearby stores by city
export async function getStoresByCity(city: string, category?: string) {
  let query = supabase
    .from('stores')
    .select(`
      id, store_name, store_slug, category, logo_url,
      city, area, rating_avg, total_orders, is_verified
    `)
    .eq('city', city)
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })

  if (category) query = query.eq('category', category)
  const { data } = await query.limit(20)
  return data ?? []
}

// Get top rated stores
export async function getTopRatedStores(city: string) {
  const { data } = await supabase
    .from('stores')
    .select('id, store_name, store_slug, category, logo_url, rating_avg, total_reviews, is_verified')
    .eq('city', city)
    .eq('is_active', true)
    .gte('rating_avg', 4.0)
    .gte('total_reviews', 5)
    .order('rating_avg', { ascending: false })
    .limit(10)
  return data ?? []
}

// Search stores and products
export async function search(query: string, city: string) {
  const [storeResults, productResults] = await Promise.all([
    supabase
      .from('stores')
      .select('id, store_name, store_slug, category, logo_url, city, rating_avg')
      .eq('city', city)
      .ilike('store_name', `%${query}%`)
      .limit(5),
    supabase
      .from('products')
      .select('id, name, price, images, store_id, stores(store_name, store_slug, city)')
      .ilike('name', `%${query}%`)
      .eq('is_available', true)
      .limit(10),
  ])
  return {
    stores: storeResults.data ?? [],
    products: productResults.data ?? [],
  }
}

// Get followed stores (personalized feed)
export async function getFollowedStores(buyerId: string) {
  const { data } = await supabase
    .from('followed_stores')
    .select('stores(id, store_name, store_slug, logo_url, category, rating_avg)')
    .eq('buyer_id', buyerId)
  return data?.map(d => d.stores) ?? []
}

// Get new stores in city (last 30 days)
export async function getNewStores(city: string) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const { data } = await supabase
    .from('stores')
    .select('id, store_name, store_slug, category, logo_url, rating_avg')
    .eq('city', city)
    .eq('is_active', true)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  return data ?? []
}

// Follow / unfollow store
export async function toggleFollowStore(buyerId: string, storeId: string) {
  const { data: existing } = await supabase
    .from('followed_stores')
    .select('buyer_id')
    .eq('buyer_id', buyerId)
    .eq('store_id', storeId)
    .single()

  if (existing) {
    await supabase.from('followed_stores')
      .delete().eq('buyer_id', buyerId).eq('store_id', storeId)
    return false // unfollowed
  } else {
    await supabase.from('followed_stores')
      .insert({ buyer_id: buyerId, store_id: storeId })
    return true // followed
  }
}
```

## Step 2: Home Screen Layout

```typescript
// Buyer home screen fetches all sections in parallel
const [topRated, newStores, followed, categories] = await Promise.all([
  getTopRatedStores(userCity),
  getNewStores(userCity),
  getFollowedStores(userId),
  getStoresByCity(userCity),
])
```

---

# AGENT: Reviews + Ratings
### File: agents/agent_09_reviews.md

---

## Step 1: Database Migration

Create `supabase/migrations/005_reviews.sql`:

```sql
CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) UNIQUE NOT NULL,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  photos TEXT[] DEFAULT '{}',
  seller_reply TEXT,
  seller_replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are public"
ON public.reviews FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Buyers create review for own order"
ON public.reviews FOR INSERT
WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Sellers reply to their store reviews"
ON public.reviews FOR UPDATE
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
);

-- Auto update store rating when review added
CREATE OR REPLACE FUNCTION update_store_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.stores
  SET
    rating_avg = (
      SELECT ROUND(AVG(rating)::numeric, 1)
      FROM public.reviews WHERE store_id = NEW.store_id
    ),
    total_reviews = (
      SELECT COUNT(*) FROM public.reviews WHERE store_id = NEW.store_id
    )
  WHERE id = NEW.store_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_store_rating();
```

## Step 2: Review Service

```typescript
// Submit review
export async function submitReview(data: {
  orderId: string
  buyerId: string
  storeId: string
  rating: number
  reviewText?: string
  photos?: Blob[]
}): Promise<void> {
  const photoUrls: string[] = []

  if (data.photos && data.photos.length > 0) {
    for (let i = 0; i < data.photos.length; i++) {
      const path = `${data.orderId}/${i}.jpg`
      await supabase.storage
        .from('review-photos')
        .upload(path, data.photos[i], { contentType: 'image/jpeg' })
      const { data: url } = supabase.storage
        .from('review-photos').getPublicUrl(path)
      photoUrls.push(url.publicUrl)
    }
  }

  await supabase.from('reviews').insert({
    order_id: data.orderId,
    buyer_id: data.buyerId,
    store_id: data.storeId,
    rating: data.rating,
    review_text: data.reviewText,
    photos: photoUrls,
  })

  // Award loyalty coins to buyer
  await supabase.rpc('add_loyalty_coins', {
    user_id: data.buyerId,
    coins: photoUrls.length > 0 ? 20 : 10
  })
}

// Get store reviews
export async function getStoreReviews(storeId: string) {
  const { data } = await supabase
    .from('reviews')
    .select('*, users!buyer_id(name, avatar_url)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  return data ?? []
}
```

---

# AGENT: Analytics Dashboard
### File: agents/agent_10_analytics.md

---

## What This Feature Does

Seller sees revenue charts, top products, customer insights.
Simple, actionable data — not overwhelming.

## Step 1: Analytics Queries

Create `apps/seller-app/src/services/analyticsService.ts`:

```typescript
import { supabase } from '../lib/supabase'

// Revenue summary
export async function getRevenueSummary(storeId: string) {
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0]

  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')
    .gte('created_at', monthAgo)

  const orders = data ?? []
  const todayOrders = orders.filter(o => o.created_at.startsWith(today))
  const weekOrders = orders.filter(o => o.created_at >= weekAgo)

  return {
    today: todayOrders.reduce((sum, o) => sum + o.total_amount, 0),
    thisWeek: weekOrders.reduce((sum, o) => sum + o.total_amount, 0),
    thisMonth: orders.reduce((sum, o) => sum + o.total_amount, 0),
    todayOrders: todayOrders.length,
    weekOrders: weekOrders.length,
    monthOrders: orders.length,
  }
}

// Top selling products
export async function getTopProducts(storeId: string) {
  const { data } = await supabase
    .from('products')
    .select('id, name, total_sold, price, images')
    .eq('store_id', storeId)
    .order('total_sold', { ascending: false })
    .limit(5)
  return data ?? []
}

// Daily revenue chart data (last 7 days)
export async function getDailyRevenue(storeId: string) {
  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())

  // Group by date
  const grouped: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 864e5).toISOString().split('T')[0]
    grouped[date] = 0
  }
  data?.forEach(o => {
    const date = o.created_at.split('T')[0]
    if (grouped[date] !== undefined) grouped[date] += o.total_amount
  })
  return Object.entries(grouped).map(([date, revenue]) => ({ date, revenue }))
}

// Repeat vs new customers
export async function getCustomerInsights(storeId: string) {
  const { data } = await supabase
    .from('orders')
    .select('buyer_id')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')

  const buyerCounts: Record<string, number> = {}
  data?.forEach(o => {
    buyerCounts[o.buyer_id] = (buyerCounts[o.buyer_id] ?? 0) + 1
  })
  const total = Object.keys(buyerCounts).length
  const repeat = Object.values(buyerCounts).filter(c => c > 1).length
  return { total, repeat, new: total - repeat }
}
```

## Step 2: Analytics Screen

Create `apps/seller-app/src/screens/analytics/AnalyticsScreen.tsx`:

- Revenue summary cards — Today / This Week / This Month
- Line chart for daily revenue (use `react-native-chart-kit`)
- Top 5 products list with sold count
- Customer pie chart — Repeat vs New
- Referral stats — how many buyers came via your link

## Done When

- Revenue numbers show correctly
- Chart renders with last 7 days data
- Top products update as orders come in
- Customer breakdown is accurate
