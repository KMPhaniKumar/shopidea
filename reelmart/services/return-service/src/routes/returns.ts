import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const returnsRouter = Router()

const RETURN_WINDOW_DAYS = 7

returnsRouter.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    order_id: z.string().uuid(),
    reason: z.enum(['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'other']),
    description: z.string().max(500).optional(),
    images: z.array(z.string()).max(5).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const buyerId = (req as any).user.id
  const { data: order } = await supabaseAdmin.from('orders')
    .select('id, buyer_id, status, payment_status, total_amount, delivery_fee, delivered_at, store_id')
    .eq('id', parsed.data.order_id).single()

  if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
  if (order.buyer_id !== buyerId) return res.status(403).json({ success: false, error: 'Forbidden' })
  if (order.status !== 'delivered') return res.status(400).json({ success: false, error: 'Order must be delivered to return' })
  if (order.payment_status !== 'paid') return res.status(400).json({ success: false, error: 'Order must be paid to return' })

  if (order.delivered_at) {
    const windowEnd = new Date(new Date(order.delivered_at).getTime() + RETURN_WINDOW_DAYS * 864e5)
    if (new Date() > windowEnd) return res.status(400).json({ success: false, error: `Return window of ${RETURN_WINDOW_DAYS} days has expired` })
  }

  const { data: existing } = await supabaseAdmin.from('returns').select('id, status').eq('order_id', parsed.data.order_id).maybeSingle()
  if (existing && existing.status !== 'rejected') return res.status(400).json({ success: false, error: 'Return request already exists for this order' })

  const { data, error } = await supabaseAdmin.from('returns').insert({
    order_id: parsed.data.order_id,
    store_id: order.store_id,
    buyer_id: buyerId,
    reason: parsed.data.reason,
    description: parsed.data.description,
    images: parsed.data.images ?? [],
    refund_amount: order.total_amount - order.delivery_fee,
    status: 'requested',
  }).select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

returnsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId, buyerId, status } = req.query
  let query = supabaseAdmin.from('returns').select('*, orders(order_number, total_amount)').order('created_at', { ascending: false }).limit(50)
  if (storeId) query = query.eq('store_id', storeId as string)
  if (buyerId) query = query.eq('buyer_id', buyerId as string)
  if (status) query = query.eq('status', status as string)
  const { data } = await query
  res.json({ success: true, data: data ?? [] })
})

returnsRouter.get('/:id', requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin.from('returns').select('*, orders(order_number, total_amount, payment_id)').eq('id', req.params.id).single()
  if (!data) return res.status(404).json({ success: false, error: 'Return not found' })
  res.json({ success: true, data })
})

returnsRouter.put('/:id/approve', requireAuth, async (req, res) => {
  const { data: returnReq } = await supabaseAdmin.from('returns').select('*, orders(payment_id, stores(seller_id))').eq('id', req.params.id).single()
  if (!returnReq) return res.status(404).json({ success: false, error: 'Return not found' })
  if (returnReq.status !== 'requested') return res.status(400).json({ success: false, error: 'Can only approve requested returns' })
  if ((returnReq as any).orders?.stores?.seller_id !== (req as any).user.id) return res.status(403).json({ success: false, error: 'Forbidden' })

  await supabaseAdmin.from('returns').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', req.params.id)

  try {
    const refundRes = await fetch(`${process.env.PAYMENT_SERVICE_URL}/api/payments/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: (req as any).headers.authorization },
      body: JSON.stringify({ orderId: returnReq.order_id, returnId: returnReq.id, amount: returnReq.refund_amount }),
    })
    const refundData = await refundRes.json() as any
    if (!refundData.success) throw new Error(refundData.error)
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Approved but refund initiation failed: ' + err.message })
  }

  const { data } = await supabaseAdmin.from('returns').select('*').eq('id', req.params.id).single()
  res.json({ success: true, data })
})

returnsRouter.put('/:id/reject', requireAuth, async (req, res) => {
  const { reason } = req.body
  if (!reason?.trim()) return res.status(400).json({ success: false, error: 'Rejection reason required' })

  const { data: returnReq } = await supabaseAdmin.from('returns').select('status, orders(stores(seller_id))').eq('id', req.params.id).single()
  if (!returnReq) return res.status(404).json({ success: false, error: 'Return not found' })
  if (returnReq.status !== 'requested') return res.status(400).json({ success: false, error: 'Can only reject requested returns' })
  if ((returnReq as any).orders?.stores?.seller_id !== (req as any).user.id) return res.status(403).json({ success: false, error: 'Forbidden' })

  const { data } = await supabaseAdmin.from('returns').update({ status: 'rejected', rejection_reason: reason, resolved_at: new Date().toISOString() }).eq('id', req.params.id).select('*').single()
  res.json({ success: true, data })
})
