# MS-04: Payment Service
> Razorpay integration — create payment orders, verify signatures, handle webhooks, process refunds.

**Port (local):** 3003 | **Docker:** 3000  
**Prefix:** `/api/payments`

---

## Step 1: Directory Structure

```
services/payment-service/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   └── payments.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── rawBody.ts    ← preserve raw body for webhook signature
│   └── lib/
│       ├── supabase.ts
│       └── razorpay.ts
├── Dockerfile
├── package.json
└── .env.example
```

---

## Step 2: src/middleware/rawBody.ts

```typescript
import { Request, Response, NextFunction } from 'express'

// Must be applied BEFORE express.json() on the webhook route
export function rawBodyMiddleware(req: Request, _res: Response, next: NextFunction) {
  let data = ''
  req.setEncoding('utf8')
  req.on('data', chunk => { data += chunk })
  req.on('end', () => {
    ;(req as any).rawBody = data
    next()
  })
}
```

---

## Step 3: src/lib/razorpay.ts

```typescript
import crypto from 'crypto'

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID!
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!
const AUTH = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64')

export async function createRazorpayOrder(amount: number, currency = 'INR', receipt: string) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amount * 100), currency, receipt }),
  })
  if (!res.ok) throw new Error(`Razorpay error: ${await res.text()}`)
  return res.json()
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  return expected === signature
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')
  return expected === signature
}

export async function createRefund(paymentId: string, amountPaise: number) {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise }),
  })
  if (!res.ok) throw new Error(`Refund error: ${await res.text()}`)
  return res.json()
}
```

---

## Step 4: src/routes/payments.ts

```typescript
import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { rawBodyMiddleware } from '../middleware/rawBody'
import { createRazorpayOrder, verifySignature, verifyWebhookSignature, createRefund } from '../lib/razorpay'

export const paymentsRouter = Router()

// POST /api/payments/create-order — auth, create Razorpay order
paymentsRouter.post('/create-order', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    orderId: z.string().uuid(),   // ReelMart order ID
    amount: z.number().positive(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  try {
    const rzOrder = await createRazorpayOrder(parsed.data.amount, 'INR', parsed.data.orderId)

    // Save Razorpay order ID against our order
    await supabaseAdmin
      .from('orders')
      .update({ razorpay_order_id: rzOrder.id })
      .eq('id', parsed.data.orderId)

    res.json({
      success: true,
      data: {
        razorpayOrderId: rzOrder.id,
        amount: rzOrder.amount,
        currency: rzOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/payments/verify — auth, verify Razorpay payment
paymentsRouter.post('/verify', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    orderId: z.string().uuid(),
    razorpay_order_id: z.string(),
    razorpay_payment_id: z.string(),
    razorpay_signature: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const valid = verifySignature(
    parsed.data.razorpay_order_id,
    parsed.data.razorpay_payment_id,
    parsed.data.razorpay_signature
  )

  if (!valid) return res.status(400).json({ success: false, error: 'Invalid payment signature' })

  const { data } = await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_id: parsed.data.razorpay_payment_id,
      status: 'pending',
    })
    .eq('id', parsed.data.orderId)
    .select('*').single()

  res.json({ success: true, data })
})

// POST /api/payments/webhook — PUBLIC, Razorpay webhook
paymentsRouter.post('/webhook', rawBodyMiddleware, async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'] as string
  const rawBody = (req as any).rawBody as string

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ success: false, error: 'Invalid webhook signature' })
  }

  const event = JSON.parse(rawBody)
  const { event: eventType, payload } = event

  if (eventType === 'payment.captured') {
    const payment = payload.payment.entity
    await supabaseAdmin
      .from('orders')
      .update({ payment_status: 'paid', payment_id: payment.id, status: 'pending' })
      .eq('razorpay_order_id', payment.order_id)
  }

  if (eventType === 'refund.processed') {
    const refund = payload.refund.entity
    await supabaseAdmin
      .from('returns')
      .update({ razorpay_refund_id: refund.id, status: 'refunded', resolved_at: new Date().toISOString() })
      .eq('razorpay_refund_id', refund.id)
  }

  res.json({ success: true })
})

// POST /api/payments/refund — auth, initiate refund
paymentsRouter.post('/refund', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    orderId: z.string().uuid(),
    returnId: z.string().uuid(),
    amount: z.number().positive(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data: order } = await supabaseAdmin
    .from('orders').select('payment_id').eq('id', parsed.data.orderId).single()
  if (!order?.payment_id) return res.status(400).json({ success: false, error: 'No payment ID found' })

  try {
    const refund = await createRefund(order.payment_id, Math.round(parsed.data.amount * 100))
    await supabaseAdmin.from('returns').update({
      razorpay_refund_id: refund.id,
      refund_amount: parsed.data.amount,
      status: 'refund_initiated',
    }).eq('id', parsed.data.returnId)

    res.json({ success: true, data: { refundId: refund.id } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
```

---

## Step 5: src/index.ts (webhook route needs raw body BEFORE express.json)

```typescript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { paymentsRouter } from './routes/payments'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))

// Webhook must use raw body — register before express.json()
app.post('/api/payments/webhook', express.raw({ type: '*/*' }), async (req, res, next) => {
  ;(req as any).rawBody = req.body.toString('utf8')
  next()
})

app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'payment-service' }))
app.use('/api/payments', paymentsRouter)

app.listen(PORT, () => console.log(`payment-service running on :${PORT}`))
```

---

## Step 6: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in
```

---

## Done When

- [ ] `POST /api/payments/create-order` returns `{ razorpayOrderId, amount, keyId }`
- [ ] `POST /api/payments/verify` marks order as paid in DB
- [ ] `POST /api/payments/webhook` with valid Razorpay signature updates order
- [ ] `POST /api/payments/refund` initiates Razorpay refund and updates returns table
- [ ] Webhook rejects invalid signatures with 400
