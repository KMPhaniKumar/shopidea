import { Router } from 'express'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import axios from 'axios'

export const payoutsRouter = Router()

// Trigger weekly payout for all sellers (admin only)
payoutsRouter.post('/process-weekly', requireAdmin, async (req: AuthRequest, res) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const today = new Date().toISOString()

  // Get all delivered, paid orders from the past week grouped by store
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('store_id, total_amount, stores(seller_id, store_name)')
    .eq('status', 'delivered')
    .eq('payment_status', 'paid')
    .gte('delivered_at', oneWeekAgo)

  if (!orders) return res.json({ success: true, data: { processed: 0 } })

  const sellerTotals = new Map<string, { sellerId: string; amount: number; orderCount: number }>()

  for (const order of orders) {
    const store = order.stores as any
    const existing = sellerTotals.get(order.store_id)
    const commission = order.total_amount * 0.02
    const netAmount = order.total_amount - commission
    if (existing) {
      existing.amount += netAmount
      existing.orderCount += 1
    } else {
      sellerTotals.set(order.store_id, {
        sellerId: store.seller_id,
        amount: netAmount,
        orderCount: 1,
      })
    }
  }

  const results = await Promise.allSettled(
    Array.from(sellerTotals.values()).map(async ({ sellerId, amount, orderCount }) => {
      await supabaseAdmin.from('payouts').insert({
        seller_id: sellerId,
        amount,
        status: 'pending',
        period_start: oneWeekAgo.split('T')[0],
        period_end: today.split('T')[0],
        order_count: orderCount,
      })
    })
  )

  res.json({ success: true, data: { processed: sellerTotals.size } })
})
