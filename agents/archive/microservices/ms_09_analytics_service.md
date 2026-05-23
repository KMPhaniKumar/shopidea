# MS-09: Analytics Service
> Store-level and platform-level analytics. Read-only queries against Supabase.

**Port (local):** 3008 | **Docker:** 3000  
**Prefix:** `/api/analytics`

---

## Step 1: src/routes/analytics.ts

```typescript
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireAdmin } from '../middleware/auth'

export const analyticsRouter = Router()

// GET /api/analytics/store?storeId=&period=7|30|90 — seller dashboard stats
analyticsRouter.get('/store', requireAuth, async (req, res) => {
  const { storeId, period = '30' } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const days = parseInt(period as string) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, revenueRes, reviewsRes, productsRes] = await Promise.all([
    // Order counts by status
    supabaseAdmin
      .from('orders')
      .select('status, total_amount, delivery_fee, created_at')
      .eq('store_id', storeId as string)
      .gte('created_at', since),

    // Paid orders for revenue
    supabaseAdmin
      .from('orders')
      .select('total_amount, delivery_fee, created_at')
      .eq('store_id', storeId as string)
      .eq('payment_status', 'paid')
      .gte('created_at', since),

    // Review stats
    supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('store_id', storeId as string),

    // Product count
    supabaseAdmin
      .from('products')
      .select('id, is_available')
      .eq('store_id', storeId as string),
  ])

  const orders = ordersRes.data ?? []
  const paidOrders = revenueRes.data ?? []
  const reviews = reviewsRes.data ?? []
  const products = productsRes.data ?? []

  const totalRevenue = paidOrders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.95, 0)
  const totalOrders = orders.length
  const pendingOrders = orders.filter(o => o.status === 'pending').length
  const deliveredOrders = orders.filter(o => o.status === 'delivered').length
  const avgOrderValue = paidOrders.length > 0 ? paidOrders.reduce((s, o) => s + o.total_amount, 0) / paidOrders.length : 0
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0

  // Daily revenue for chart (last N days)
  const dailyRevenue: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().split('T')[0]
    dailyRevenue[key] = 0
  }
  for (const o of paidOrders) {
    const key = o.created_at.split('T')[0]
    if (key in dailyRevenue) {
      dailyRevenue[key] += (o.total_amount - o.delivery_fee) * 0.95
    }
  }

  res.json({
    success: true,
    data: {
      totalRevenue: Math.round(totalRevenue),
      totalOrders,
      pendingOrders,
      deliveredOrders,
      avgOrderValue: Math.round(avgOrderValue),
      avgRating: Math.round(avgRating * 10) / 10,
      reviewCount: reviews.length,
      productCount: products.length,
      activeProductCount: products.filter(p => p.is_available).length,
      dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount: Math.round(amount) })),
    },
  })
})

// GET /api/analytics/store/top-products?storeId=&limit=5
analyticsRouter.get('/store/top-products', requireAuth, async (req, res) => {
  const { storeId, limit = '5' } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('items')
    .eq('store_id', storeId as string)
    .eq('payment_status', 'paid')
    .gte('created_at', since)

  // Aggregate items across orders
  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const order of orders ?? []) {
    for (const item of (order.items ?? []) as any[]) {
      const existing = productMap.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0 }
      existing.qty += item.qty
      existing.revenue += item.price * item.qty
      productMap.set(item.productId, existing)
    }
  }

  const topProducts = [...productMap.entries()]
    .map(([productId, data]) => ({ productId, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, parseInt(limit as string))

  res.json({ success: true, data: topProducts })
})

// GET /api/analytics/platform — admin platform-wide GMV stats
analyticsRouter.get('/platform', requireAdmin, async (req, res) => {
  const { period = '30' } = req.query
  const days = parseInt(period as string) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, storesRes, usersRes, payoutsRes] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('total_amount, delivery_fee, payment_status, created_at')
      .gte('created_at', since),

    supabaseAdmin.from('stores').select('id, created_at').gte('created_at', since),

    supabaseAdmin
      .from('users')
      .select('id, role, created_at')
      .gte('created_at', since),

    supabaseAdmin
      .from('payouts')
      .select('amount, status')
      .gte('created_at', since),
  ])

  const orders = ordersRes.data ?? []
  const paidOrders = orders.filter(o => o.payment_status === 'paid')
  const gmv = paidOrders.reduce((s, o) => s + o.total_amount, 0)
  const platformFee = paidOrders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.05, 0)
  const newStores = (storesRes.data ?? []).length
  const newBuyers = (usersRes.data ?? []).filter(u => u.role === 'buyer').length
  const newSellers = (usersRes.data ?? []).filter(u => u.role === 'seller').length
  const payoutsPaid = (payoutsRes.data ?? []).filter(p => p.status === 'done').reduce((s, p) => s + p.amount, 0)

  res.json({
    success: true,
    data: {
      gmv: Math.round(gmv),
      platformFee: Math.round(platformFee),
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      newStores,
      newBuyers,
      newSellers,
      payoutsPaid: Math.round(payoutsPaid),
    },
  })
})

// GET /api/analytics/platform/stores — top stores by GMV (admin)
analyticsRouter.get('/platform/stores', requireAdmin, async (req, res) => {
  const { limit = '10' } = req.query
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('store_id, total_amount, stores(store_name, store_slug)')
    .eq('payment_status', 'paid')
    .gte('created_at', since)

  const storeMap = new Map<string, { name: string; slug: string; gmv: number; orderCount: number }>()
  for (const o of orders ?? []) {
    const existing = storeMap.get(o.store_id) ?? {
      name: (o as any).stores?.store_name ?? '',
      slug: (o as any).stores?.store_slug ?? '',
      gmv: 0,
      orderCount: 0,
    }
    existing.gmv += o.total_amount
    existing.orderCount++
    storeMap.set(o.store_id, existing)
  }

  const topStores = [...storeMap.entries()]
    .map(([storeId, data]) => ({ storeId, ...data, gmv: Math.round(data.gmv) }))
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, parseInt(limit as string))

  res.json({ success: true, data: topStores })
})
```

---

## Step 2: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
```

---

## Done When

- [ ] `GET /api/analytics/store?storeId=&period=30` returns revenue, order counts, avg rating, dailyRevenue chart data
- [ ] `GET /api/analytics/store/top-products?storeId=` returns top 5 products by revenue
- [ ] `GET /api/analytics/platform` (admin) returns GMV, platform fee, new users, new stores
- [ ] `GET /api/analytics/platform/stores` (admin) returns top stores by GMV
- [ ] Non-admin calling `/platform` endpoints gets 403
