import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireAdmin } from '../middleware/auth'

export const analyticsRouter = Router()

// GET /api/analytics/store?storeId=&period=7|30|90
analyticsRouter.get('/store', requireAuth, async (req, res) => {
  const { storeId, period = '30' } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const days = parseInt(period as string) || 30
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, reviewsRes, productsRes] = await Promise.all([
    supabaseAdmin.from('orders').select('total_amount, delivery_fee, status, created_at').eq('store_id', storeId as string).eq('payment_status', 'paid').gte('created_at', since),
    supabaseAdmin.from('reviews').select('rating').eq('store_id', storeId as string),
    supabaseAdmin.from('products').select('id, is_available').eq('store_id', storeId as string),
  ])

  const orders = ordersRes.data ?? []
  const totalRevenue = orders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.95, 0)
  const avgOrderValue = orders.length > 0 ? orders.reduce((s, o) => s + o.total_amount, 0) / orders.length : 0
  const reviews = reviewsRes.data ?? []
  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0
  const products = productsRes.data ?? []

  // Daily revenue for chart
  const dailyRevenue: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dailyRevenue[d.toISOString().split('T')[0]] = 0
  }
  for (const o of orders) {
    const key = o.created_at.split('T')[0]
    if (key in dailyRevenue) dailyRevenue[key] += (o.total_amount - o.delivery_fee) * 0.95
  }

  res.json({
    success: true,
    data: {
      totalRevenue: Math.round(totalRevenue),
      totalOrders: orders.length,
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
  const { data: orders } = await supabaseAdmin.from('orders').select('items').eq('store_id', storeId as string).eq('payment_status', 'paid').gte('created_at', since)

  const pMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const order of orders ?? []) {
    for (const item of (order.items ?? []) as any[]) {
      const e = pMap.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0 }
      e.qty += item.qty; e.revenue += item.price * item.qty
      pMap.set(item.productId, e)
    }
  }

  const top = [...pMap.entries()].map(([productId, d]) => ({ productId, ...d }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, parseInt(limit as string))

  res.json({ success: true, data: top })
})

// GET /api/analytics/platform — admin only
analyticsRouter.get('/platform', requireAdmin, async (req, res) => {
  const { period = '30' } = req.query
  const since = new Date(Date.now() - parseInt(period as string) * 24 * 60 * 60 * 1000).toISOString()

  const [ordersRes, storesRes, usersRes] = await Promise.all([
    supabaseAdmin.from('orders').select('total_amount, delivery_fee, payment_status').gte('created_at', since),
    supabaseAdmin.from('stores').select('id').gte('created_at', since),
    supabaseAdmin.from('users').select('id, role').gte('created_at', since),
  ])

  const paid = (ordersRes.data ?? []).filter(o => o.payment_status === 'paid')
  const gmv = paid.reduce((s, o) => s + o.total_amount, 0)
  const platformFee = paid.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.05, 0)
  const users = usersRes.data ?? []

  res.json({
    success: true,
    data: {
      gmv: Math.round(gmv),
      platformFee: Math.round(platformFee),
      totalOrders: (ordersRes.data ?? []).length,
      paidOrders: paid.length,
      newStores: (storesRes.data ?? []).length,
      newBuyers: users.filter(u => u.role === 'buyer').length,
      newSellers: users.filter(u => u.role === 'seller').length,
    },
  })
})
