import { Router } from 'express'
import Razorpay from 'razorpay'
import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const paymentsRouter = Router()

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

// Create Razorpay order for checkout
paymentsRouter.post('/create-order', requireAuth, async (req: AuthRequest, res) => {
  const { orderId, amount } = req.body
  if (!orderId || !amount) {
    return res.status(400).json({ success: false, error: 'orderId and amount required' })
  }
  try {
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: 'INR',
      receipt: orderId,
      notes: { order_id: orderId, buyer_id: req.userId! },
    })
    await supabaseAdmin
      .from('orders')
      .update({ razorpay_order_id: rzpOrder.id })
      .eq('id', orderId)
    res.json({ success: true, data: { razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount } })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create payment order' })
  }
})

// Verify payment signature after successful payment
paymentsRouter.post('/verify', requireAuth, async (req: AuthRequest, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  if (expectedSignature !== razorpaySignature) {
    return res.status(400).json({ success: false, error: 'Invalid payment signature', code: 'INVALID_SIGNATURE' })
  }

  await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      status: 'pending',
    })
    .eq('id', orderId)
    .eq('buyer_id', req.userId!)

  res.json({ success: true, message: 'Payment verified' })
})

// Razorpay webhook (server-to-server, no auth needed — verified by signature)
paymentsRouter.post('/webhook', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'] as string
  const body = JSON.stringify(req.body)
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex')

  if (signature !== expectedSig) {
    return res.status(400).json({ error: 'Invalid webhook signature' })
  }

  const { event, payload } = req.body
  if (event === 'payment.captured') {
    const receipt = payload.payment.entity.notes?.order_id
    if (receipt) {
      await supabaseAdmin
        .from('orders')
        .update({ payment_status: 'paid' })
        .eq('id', receipt)
    }
  }
  res.json({ received: true })
})
