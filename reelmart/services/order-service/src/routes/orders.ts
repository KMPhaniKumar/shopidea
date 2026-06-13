import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { notifyOrderUpdate } from '../lib/notify'

export const ordersRouter = Router()

const ORDER_STATUS_FLOW = ['pending', 'accepted', 'packed', 'shipped', 'delivered']

// POST /api/orders — buyer creates order
ordersRouter.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    items: z.array(z.object({
      productId: z.string(),
      name: z.string(),
      image: z.string().optional(),
      price: z.number(),
      qty: z.number().int().positive(),
    })),
    subtotal: z.number().positive(),
    delivery_fee: z.number().default(60),
    discount: z.number().default(0),
    coupon_code: z.string().optional(),
    delivery_address: z.object({
      name: z.string(),
      phone: z.string(),
      address: z.string(),
      city: z.string(),
      pincode: z.string(),
    }),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const total = parsed.data.subtotal + parsed.data.delivery_fee - parsed.data.discount
  const orderNumber = `RM${Date.now().toString(36).toUpperCase()}`

  const { data, error } = await supabaseAdmin.from('orders').insert({
    buyer_id: (req as any).user.id,
    store_id: parsed.data.store_id,
    order_number: orderNumber,
    items: parsed.data.items,
    subtotal: parsed.data.subtotal,
    delivery_fee: parsed.data.delivery_fee,
    discount: parsed.data.discount,
    coupon_code: parsed.data.coupon_code,
    total_amount: total,
    delivery_address: parsed.data.delivery_address,
    status: 'pending',
    payment_status: 'pending',
  }).select('*, stores(store_name)').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// GET /api/orders?storeId=&status= — list orders
// HIGH-4 fix: scope list to the calling user — buyers see only their own orders;
// sellers may filter by storeId but only for a store they own.
ordersRouter.get('/', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const userId = authReq.user!.id
  const { storeId, status } = req.query

  let query = supabaseAdmin
    .from('orders')
    .select('*, stores(store_name, store_slug)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (storeId) {
    // Caller wants orders for a store — verify they own it
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('id', storeId as string)
      .eq('seller_id', userId)
      .single()
    if (!store) return res.status(403).json({ success: false, error: 'Forbidden' })
    query = query.eq('store_id', storeId as string)
  } else {
    // Default: buyer view — only their orders
    query = query.eq('buyer_id', userId)
  }

  if (status) query = query.eq('status', status as string)

  const { data, error } = await query
  if (error) return res.status(500).json({ success: false, error: error.message })
  res.json({ success: true, data: data ?? [] })
})

// GET /api/orders/:id — get order detail
// HIGH-4 fix: post-fetch ownership check — caller must be the buyer OR own the store
ordersRouter.get('/:id', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const userId = authReq.user!.id

  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*, stores(store_name, store_slug, whatsapp_number, seller_id)')
    .eq('id', req.params.id)
    .single()
  if (error || !data) return res.status(404).json({ success: false, error: 'Order not found' })

  const isBuyer = data.buyer_id === userId
  const isSeller = (data as any).stores?.seller_id === userId
  if (!isBuyer && !isSeller) return res.status(403).json({ success: false, error: 'Forbidden' })

  res.json({ success: true, data })
})

// PUT /api/orders/:id/status — seller updates status
// HIGH-5 fix: verify the order's store belongs to the calling user before update
ordersRouter.put('/:id/status', requireAuth, async (req, res) => {
  const authReq = req as AuthRequest
  const userId = authReq.user!.id

  const { status, tracking_number, awb_code } = req.body
  if (!ORDER_STATUS_FLOW.includes(status) && !['rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' })
  }

  // Verify the order exists and the caller owns the associated store
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('orders')
    .select('id, store_id, stores!inner(seller_id)')
    .eq('id', req.params.id)
    .single()
  if (fetchErr || !existing) return res.status(404).json({ success: false, error: 'Order not found' })
  if ((existing as any).stores?.seller_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' })

  const updates: any = { status }
  if (status === 'delivered') updates.delivered_at = new Date().toISOString()
  if (tracking_number) updates.tracking_number = tracking_number
  if (awb_code) updates.awb_code = awb_code

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', req.params.id)
    .select('*, stores(store_name), users!buyer_id(phone)')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })

  notifyOrderUpdate(
    req.params.id,
    status,
    (data as any).users?.phone,
    (data as any).stores?.store_name,
    (data as any).buyer_id,
  )

  res.json({ success: true, data })
})

// POST /api/orders/:id/cancel — buyer cancels
ordersRouter.post('/:id/cancel', requireAuth, async (req, res) => {
  const { data: order } = await supabaseAdmin.from('orders').select('status, buyer_id').eq('id', req.params.id).single()
  if (!order) return res.status(404).json({ success: false, error: 'Not found' })
  if (order.buyer_id !== (req as any).user.id) return res.status(403).json({ success: false, error: 'Forbidden' })
  if (!['pending', 'accepted'].includes(order.status)) {
    return res.status(400).json({ success: false, error: 'Cannot cancel at this stage' })
  }

  const { data } = await supabaseAdmin
    .from('orders').update({ status: 'cancelled' }).eq('id', req.params.id).select('*').single()
  res.json({ success: true, data })
})
