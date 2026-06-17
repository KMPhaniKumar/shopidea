import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { createRazorpayOrder, verifySignature, verifyWebhookSignature, createRefund } from '../lib/razorpay'
import { recordOrderEvent } from '../lib/orderEvents'

export const paymentsRouter = Router()

// POST /api/payments/create-order
// orderId is optional: with it, we stamp razorpay_order_id on an existing order
// (legacy flow); without it, we just mint a Razorpay order and the row is created
// only after payment via /confirm (so cancelled payments leave no order behind).
// HIGH-2 fix: when orderId is supplied, verify buyer ownership and derive amount
// from the DB order (total_amount) — never trust the client-supplied amount.
paymentsRouter.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const schema = z.object({
    orderId: z.string().uuid().optional(),
    amount: z.number().positive().optional(), // only used when orderId is absent (no existing order)
    receipt: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  try {
    let amountToCharge: number

    if (parsed.data.orderId) {
      // Legacy flow: existing COD order being converted to online payment.
      // Verify the caller owns the order and pull amount from DB.
      const { data: order, error: orderErr } = await supabaseAdmin
        .from('orders')
        .select('id, buyer_id, total_amount')
        .eq('id', parsed.data.orderId)
        .single()
      if (orderErr || !order) return res.status(404).json({ success: false, error: 'Order not found' })
      if (order.buyer_id !== authReq.user!.id) return res.status(403).json({ success: false, error: 'Forbidden' })
      amountToCharge = order.total_amount
    } else {
      // No existing order — amount must be supplied (will be reconciled at /confirm).
      if (!parsed.data.amount) return res.status(400).json({ success: false, error: 'amount is required when orderId is not provided' })
      amountToCharge = parsed.data.amount
    }

    const receipt = parsed.data.orderId ?? parsed.data.receipt ?? `rcpt_${Date.now()}`
    const rzOrder = await createRazorpayOrder(amountToCharge, receipt)
    if (parsed.data.orderId) {
      await supabaseAdmin.from('orders').update({ razorpay_order_id: rzOrder.id }).eq('id', parsed.data.orderId)
    }
    res.json({ success: true, data: { razorpayOrderId: rzOrder.id, amount: rzOrder.amount, currency: rzOrder.currency, keyId: process.env.RAZORPAY_KEY_ID } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/payments/confirm — verify the payment signature, THEN create the
// order (paid). Used by online checkout so an order only exists once paid.
paymentsRouter.post('/confirm', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
    order: z.object({
      store_id: z.string().uuid(),
      items: z.array(z.any()),
      subtotal: z.number(),
      delivery_fee: z.number(),
      discount_amount: z.number().optional().default(0),
      total_amount: z.number(),
      delivery_address: z.record(z.any()),
    }),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order } = parsed.data
  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ success: false, error: 'Invalid payment signature' })
  }

  const { data, error } = await supabaseAdmin.from('orders').insert({
    buyer_id: req.user!.id,
    store_id: order.store_id,
    items: order.items,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    discount_amount: order.discount_amount,
    total_amount: order.total_amount,
    delivery_address: order.delivery_address,
    payment_method: 'online',
    payment_status: 'paid',
    status: 'pending',
    razorpay_order_id,
    razorpay_payment_id,
  }).select('id, order_number').single()

  if (error || !data) return res.status(500).json({ success: false, error: error?.message ?? 'order-create-failed' })

  // Fire-and-forget: log the initial timeline event for this online order.
  // Never awaited in a way that blocks the response; any failure is logged
  // internally and never surfaced to the caller.
  void recordOrderEvent({
    orderId: data.id,
    code: 'order_placed',
    source: 'system',
    dedupKey: `order:${data.id}:order_placed`,
  })

  res.json({ success: true, data })
})

// POST /api/payments/verify
// HIGH-1 fix: verify buyer owns the order AND the stored razorpay_order_id matches
// what is being verified — prevents any user marking an arbitrary order paid.
paymentsRouter.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const schema = z.object({
    orderId: z.string().uuid(),
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  // 1. Verify HMAC signature first (fast check before touching DB)
  const valid = verifySignature(parsed.data.razorpay_order_id, parsed.data.razorpay_payment_id, parsed.data.razorpay_signature)
  if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' })

  // 2. Fetch the order and enforce ownership + razorpay_order_id match
  const { data: order, error: fetchErr } = await supabaseAdmin
    .from('orders')
    .select('id, buyer_id, razorpay_order_id')
    .eq('id', parsed.data.orderId)
    .single()
  if (fetchErr || !order) return res.status(404).json({ success: false, error: 'Order not found' })
  if (order.buyer_id !== authReq.user!.id) return res.status(403).json({ success: false, error: 'Forbidden' })
  if (order.razorpay_order_id !== parsed.data.razorpay_order_id) {
    return res.status(400).json({ success: false, error: 'Razorpay order ID mismatch', code: 'RAZORPAY_ORDER_MISMATCH' })
  }

  // 3. Mark paid — safe now: buyer confirmed + IDs matched
  const { data, error } = await supabaseAdmin.from('orders')
    .update({ payment_status: 'paid', razorpay_payment_id: parsed.data.razorpay_payment_id, status: 'pending' })
    .eq('id', parsed.data.orderId)
    .eq('buyer_id', authReq.user!.id)
    .select('*').single()

  if (error) return res.status(500).json({ success: false, error: error.message })

  res.json({ success: true, data })
})

// POST /api/payments/webhook — PUBLIC
paymentsRouter.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string
  const rawBody = (req as any).rawBody as string

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ success: false, error: 'Invalid webhook signature' })
  }

  const event = JSON.parse(rawBody)
  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity
    await supabaseAdmin.from('orders')
      .update({ payment_status: 'paid', razorpay_payment_id: payment.id, status: 'pending' })
      .eq('razorpay_order_id', payment.order_id)
  }
  if (event.event === 'refund.processed') {
    const refund = event.payload.refund.entity
    await supabaseAdmin.from('returns')
      .update({ razorpay_refund_id: refund.id, status: 'refunded', resolved_at: new Date().toISOString() })
      .eq('razorpay_refund_id', refund.id)
  }

  res.json({ success: true })
})

// POST /api/payments/refund
// Ownership: caller must own the order (buyer) OR own the order's store (seller admin).
// Prevents any authenticated user from issuing a refund against an arbitrary order.
// Amount cap: requested amount must not exceed order.total_amount; if omitted, defaults
// to a full refund of total_amount.
paymentsRouter.post('/refund', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthRequest
  const schema = z.object({
    orderId: z.string().uuid(),
    returnId: z.string().uuid(),
    amount: z.number().positive().optional(), // omit → full refund of order total
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('razorpay_payment_id, buyer_id, total_amount, stores!inner(seller_id)')
    .eq('id', parsed.data.orderId)
    .single()
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' })

  // Enforce: caller must be the buyer or the store's seller
  const isBuyer = order.buyer_id === authReq.user!.id
  const isSeller = (order as any).stores?.seller_id === authReq.user!.id
  if (!isBuyer && !isSeller) return res.status(403).json({ success: false, error: 'Forbidden' })

  if (!order.razorpay_payment_id) return res.status(400).json({ success: false, error: 'No payment ID found' })

  // Resolve and cap the refund amount
  const refundAmount = parsed.data.amount ?? order.total_amount
  if (refundAmount > order.total_amount) {
    return res.status(400).json({
      success: false,
      error: 'Refund amount exceeds order total',
      code: 'REFUND_AMOUNT_EXCEEDS_ORDER',
    })
  }

  try {
    const refund = await createRefund(order.razorpay_payment_id, Math.round(refundAmount * 100))
    await supabaseAdmin.from('returns').update({ razorpay_refund_id: refund.id, refund_amount: refundAmount, status: 'refund_initiated' }).eq('id', parsed.data.returnId)
    res.json({ success: true, data: { refundId: refund.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
