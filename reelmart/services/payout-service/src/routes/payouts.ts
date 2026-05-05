import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireAdmin } from '../middleware/auth'

export const payoutsRouter = Router()

const PLATFORM_FEE_PCT = 0.05

// GET /api/payouts?storeId= — seller lists own payouts
payoutsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })
  const { data } = await supabaseAdmin.from('payouts').select('*').eq('store_id', storeId as string).order('created_at', { ascending: false }).limit(20)
  res.json({ success: true, data: data ?? [] })
})

// GET /api/payouts/summary?storeId= — seller payout summary
payoutsRouter.get('/summary', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const [ordersRes, payoutsRes] = await Promise.all([
    supabaseAdmin.from('orders').select('total_amount, delivery_fee').eq('store_id', storeId as string).eq('payment_status', 'paid'),
    supabaseAdmin.from('payouts').select('amount, status').eq('store_id', storeId as string),
  ])

  const totalEarned = (ordersRes.data ?? []).reduce((s, o) => s + (o.total_amount - o.delivery_fee) * (1 - PLATFORM_FEE_PCT), 0)
  const totalPaid = (payoutsRes.data ?? []).filter(p => p.status === 'done').reduce((s, p) => s + p.amount, 0)

  res.json({ success: true, data: { totalEarned: Math.round(totalEarned), totalPaid: Math.round(totalPaid), pending: Math.round(totalEarned - totalPaid) } })
})

// POST /api/payouts/process — admin triggers weekly payout
payoutsRouter.post('/process', requireAdmin, async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: orders } = await supabaseAdmin
      .from('orders').select('id, store_id, total_amount, delivery_fee')
      .eq('status', 'delivered').eq('payment_status', 'paid').is('payout_id', null).lte('delivered_at', sevenDaysAgo)

    if (!orders || orders.length === 0) return res.json({ success: true, data: { processed: 0, totalAmount: 0 } })

    const byStore = new Map<string, { orderIds: string[]; gross: number }>()
    for (const order of orders) {
      const e = byStore.get(order.store_id) ?? { orderIds: [], gross: 0 }
      e.orderIds.push(order.id)
      e.gross += order.total_amount - order.delivery_fee
      byStore.set(order.store_id, e)
    }

    let processed = 0, totalAmount = 0
    for (const [storeId, { orderIds, gross }] of byStore) {
      const netAmount = gross * (1 - PLATFORM_FEE_PCT)
      const { data: payout } = await supabaseAdmin.from('payouts').insert({
        store_id: storeId, amount: netAmount, order_count: orderIds.length,
        status: 'pending', period_start: sevenDaysAgo, period_end: new Date().toISOString(),
      }).select('id').single()
      if (!payout) continue
      await supabaseAdmin.from('orders').update({ payout_id: payout.id }).in('id', orderIds)
      processed++; totalAmount += netAmount
    }

    res.json({ success: true, data: { processed, totalAmount: Math.round(totalAmount) } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
