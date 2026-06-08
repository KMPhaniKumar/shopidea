import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { createRazorpayOrder, verifySignature, verifyWebhookSignature, createRefund } from '../lib/razorpay'

export const paymentsRouter = Router()

// POST /api/payments/create-order
// orderId is optional: with it, we stamp razorpay_order_id on an existing order
// (legacy flow); without it, we just mint a Razorpay order and the row is created
// only after payment via /confirm (so cancelled payments leave no order behind).
paymentsRouter.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    orderId: z.string().uuid().optional(),
    amount: z.number().positive(),
    receipt: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  try {
    const receipt = parsed.data.orderId ?? parsed.data.receipt ?? `rcpt_${Date.now()}`
    const rzOrder = await createRazorpayOrder(parsed.data.amount, receipt)
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
  res.json({ success: true, data })
})

// POST /api/payments/verify
paymentsRouter.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    orderId: z.string().uuid(),
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const valid = verifySignature(parsed.data.razorpay_order_id, parsed.data.razorpay_payment_id, parsed.data.razorpay_signature)
  if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' })

  const { data, error } = await supabaseAdmin.from('orders')
    .update({ payment_status: 'paid', razorpay_payment_id: parsed.data.razorpay_payment_id, status: 'pending' })
    .eq('id', parsed.data.orderId).select('*').single()

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
paymentsRouter.post('/refund', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({ orderId: z.string().uuid(), returnId: z.string().uuid(), amount: z.number().positive() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data: order } = await supabaseAdmin.from('orders').select('razorpay_payment_id').eq('id', parsed.data.orderId).single()
  if (!order?.razorpay_payment_id) return res.status(400).json({ success: false, error: 'No payment ID found' })

  try {
    const refund = await createRefund(order.razorpay_payment_id, Math.round(parsed.data.amount * 100))
    await supabaseAdmin.from('returns').update({ razorpay_refund_id: refund.id, refund_amount: parsed.data.amount, status: 'refund_initiated' }).eq('id', parsed.data.returnId)
    res.json({ success: true, data: { refundId: refund.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
