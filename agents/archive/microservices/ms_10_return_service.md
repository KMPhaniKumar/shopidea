# MS-10: Return Service
> Buyer return requests, seller approval/rejection, Razorpay refund initiation.

**Port (local):** 3009 | **Docker:** 3000  
**Prefix:** `/api/returns`

---

## Step 1: src/routes/returns.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const returnsRouter = Router()

const RETURN_WINDOW_DAYS = 7 // configurable

// POST /api/returns — buyer submits return request
returnsRouter.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    order_id: z.string().uuid(),
    reason: z.enum(['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'other']),
    description: z.string().max(500).optional(),
    images: z.array(z.string().url()).max(5).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const buyerId = (req as any).user.id

  // Verify order belongs to buyer and is delivered
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, buyer_id, status, payment_status, total_amount, delivery_fee, delivered_at, store_id')
    .eq('id', parsed.data.order_id)
    .single()

  if (!order) return res.status(404).json({ success: false, error: 'Order not found' })
  if (order.buyer_id !== buyerId) return res.status(403).json({ success: false, error: 'Forbidden' })
  if (order.status !== 'delivered') return res.status(400).json({ success: false, error: 'Order must be delivered to return' })
  if (order.payment_status !== 'paid') return res.status(400).json({ success: false, error: 'Order must be paid to return' })

  // Check return window
  if (order.delivered_at) {
    const deliveredAt = new Date(order.delivered_at)
    const windowEnd = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    if (new Date() > windowEnd) {
      return res.status(400).json({ success: false, error: `Return window of ${RETURN_WINDOW_DAYS} days has expired` })
    }
  }

  // Check no existing pending return
  const { data: existingReturn } = await supabaseAdmin
    .from('returns')
    .select('id, status')
    .eq('order_id', parsed.data.order_id)
    .maybeSingle()

  if (existingReturn && !['rejected'].includes(existingReturn.status)) {
    return res.status(400).json({ success: false, error: 'A return request already exists for this order' })
  }

  const refundAmount = order.total_amount - order.delivery_fee // exclude delivery fee

  const { data, error } = await supabaseAdmin
    .from('returns')
    .insert({
      order_id: parsed.data.order_id,
      store_id: order.store_id,
      buyer_id: buyerId,
      reason: parsed.data.reason,
      description: parsed.data.description,
      images: parsed.data.images ?? [],
      refund_amount: refundAmount,
      status: 'requested',
    })
    .select('*')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// GET /api/returns?storeId=&buyerId=&status= — list returns
returnsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId, buyerId, status } = req.query
  let query = supabaseAdmin
    .from('returns')
    .select('*, orders(order_number, items, total_amount)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (storeId) query = query.eq('store_id', storeId as string)
  if (buyerId) query = query.eq('buyer_id', buyerId as string)
  if (status) query = query.eq('status', status as string)

  const { data } = await query
  res.json({ success: true, data: data ?? [] })
})

// GET /api/returns/:id — get return detail
returnsRouter.get('/:id', requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('returns')
    .select('*, orders(order_number, items, total_amount, payment_id)')
    .eq('id', req.params.id)
    .single()
  if (!data) return res.status(404).json({ success: false, error: 'Return not found' })
  res.json({ success: true, data })
})

// PUT /api/returns/:id/approve — seller approves return, initiates refund via payment-service
returnsRouter.put('/:id/approve', requireAuth, async (req, res) => {
  const { data: returnReq } = await supabaseAdmin
    .from('returns')
    .select('*, orders(payment_id, store_id, stores(seller_id))')
    .eq('id', req.params.id)
    .single()

  if (!returnReq) return res.status(404).json({ success: false, error: 'Return not found' })
  if (returnReq.status !== 'requested') return res.status(400).json({ success: false, error: 'Can only approve requested returns' })

  const sellerId = (req as any).user.id
  if ((returnReq as any).orders?.stores?.seller_id !== sellerId) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Update return status to approved
  await supabaseAdmin
    .from('returns')
    .update({ status: 'approved', resolved_at: new Date().toISOString() })
    .eq('id', req.params.id)

  // Call payment-service to initiate refund
  try {
    const refundRes = await fetch(`${process.env.PAYMENT_SERVICE_URL}/api/payments/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: (req as any).headers.authorization, // forward seller's JWT
      },
      body: JSON.stringify({
        orderId: returnReq.order_id,
        returnId: returnReq.id,
        amount: returnReq.refund_amount,
      }),
    })
    const refundData = await refundRes.json()
    if (!refundData.success) throw new Error(refundData.error)
  } catch (err: any) {
    // Refund initiation failed — revert to approved state but log error
    console.error('Refund initiation failed:', err.message)
    return res.status(500).json({ success: false, error: 'Approved but refund initiation failed: ' + err.message })
  }

  const { data } = await supabaseAdmin.from('returns').select('*').eq('id', req.params.id).single()
  res.json({ success: true, data })
})

// PUT /api/returns/:id/reject — seller rejects return
returnsRouter.put('/:id/reject', requireAuth, async (req, res) => {
  const { reason } = req.body
  if (!reason?.trim()) return res.status(400).json({ success: false, error: 'Rejection reason required' })

  const { data: returnReq } = await supabaseAdmin
    .from('returns')
    .select('status, orders(stores(seller_id))')
    .eq('id', req.params.id)
    .single()

  if (!returnReq) return res.status(404).json({ success: false, error: 'Return not found' })
  if (returnReq.status !== 'requested') return res.status(400).json({ success: false, error: 'Can only reject requested returns' })

  const sellerId = (req as any).user.id
  if ((returnReq as any).orders?.stores?.seller_id !== sellerId) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  const { data } = await supabaseAdmin
    .from('returns')
    .update({ status: 'rejected', rejection_reason: reason, resolved_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .single()

  res.json({ success: true, data })
})
```

---

## Step 2: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
PAYMENT_SERVICE_URL=http://payment-service:3000
```

---

## Done When

- [ ] `POST /api/returns` creates return request (validates 7-day window, delivered status, paid status)
- [ ] Duplicate return requests rejected with 400
- [ ] `GET /api/returns?storeId=` lists store's return requests
- [ ] `GET /api/returns?buyerId=` lists buyer's return requests
- [ ] `PUT /api/returns/:id/approve` updates status and calls payment-service `/refund`
- [ ] `PUT /api/returns/:id/reject` stores rejection reason
- [ ] Seller cannot approve/reject another seller's returns (403)
