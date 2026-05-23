# MS-03: Order Service
> Order lifecycle management and cart operations. Notifies notification-service on every status change.

**Port (local):** 3002 | **Docker:** 3000  
**Prefix:** `/api/orders`

---

## Step 1: Directory Structure

```
services/order-service/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── orders.ts
│   │   └── cart.ts
│   ├── middleware/
│   │   └── auth.ts
│   └── lib/
│       ├── supabase.ts
│       └── notify.ts      ← fire-and-forget to notification-service
├── Dockerfile
├── package.json
└── .env.example
```

---

## Step 2: src/lib/notify.ts

```typescript
// Fire-and-forget — never await, never throw
export function notifyOrderUpdate(orderId: string, status: string, buyerPhone: string, storeName: string) {
  fetch(`${process.env.NOTIFICATION_SERVICE_URL}/api/notifications/order-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY! },
    body: JSON.stringify({ orderId, status, buyerPhone, storeName }),
  }).catch(() => {})
}
```

---

## Step 3: src/routes/orders.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { notifyOrderUpdate } from '../lib/notify'

export const ordersRouter = Router()

const ORDER_STATUS_FLOW = ['pending', 'accepted', 'packed', 'shipped', 'delivered']

// POST /api/orders — create order (buyer)
ordersRouter.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    items: z.array(z.object({
      productId: z.string(),
      name: z.string(),
      image: z.string(),
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

// GET /api/orders?storeId=&buyerId= — list orders
ordersRouter.get('/', requireAuth, async (req, res) => {
  const { storeId, buyerId, status } = req.query
  let query = supabaseAdmin
    .from('orders')
    .select('*, stores(store_name, store_slug)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (storeId) query = query.eq('store_id', storeId as string)
  if (buyerId) query = query.eq('buyer_id', buyerId as string)
  if (status) query = query.eq('status', status as string)

  const { data } = await query
  res.json({ success: true, data: data ?? [] })
})

// GET /api/orders/:id — get order detail
ordersRouter.get('/:id', requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('orders')
    .select('*, stores(store_name, store_slug, whatsapp_number)')
    .eq('id', req.params.id)
    .single()
  if (!data) return res.status(404).json({ success: false, error: 'Order not found' })
  res.json({ success: true, data })
})

// PUT /api/orders/:id/status — update status (seller)
ordersRouter.put('/:id/status', requireAuth, async (req, res) => {
  const { status, tracking_number, awb_code } = req.body
  if (!ORDER_STATUS_FLOW.includes(status) && !['rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' })
  }

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

  // Notify buyer — fire and forget
  notifyOrderUpdate(req.params.id, status, (data as any).users?.phone, (data as any).stores?.store_name)

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
```

---

## Step 4: src/routes/cart.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const cartRouter = Router()

// GET /api/orders/cart/:userId
cartRouter.get('/cart/:userId', requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('cart_items')
    .select('*, products(name, price, images, is_available)')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: true })
  res.json({ success: true, data: data ?? [] })
})

// POST /api/orders/cart — add item
cartRouter.post('/cart', requireAuth, async (req, res) => {
  const schema = z.object({
    user_id: z.string().uuid(),
    store_id: z.string().uuid(),
    product_id: z.string().uuid(),
    qty: z.number().int().positive().default(1),
    selected_variant: z.any().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .upsert(parsed.data, { onConflict: 'user_id,product_id' })
    .select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// PUT /api/orders/cart/:itemId — update qty
cartRouter.put('/cart/:itemId', requireAuth, async (req, res) => {
  const { qty } = req.body
  if (qty <= 0) {
    await supabaseAdmin.from('cart_items').delete().eq('id', req.params.itemId)
    return res.json({ success: true, data: null })
  }
  const { data } = await supabaseAdmin
    .from('cart_items').update({ qty }).eq('id', req.params.itemId).select('*').single()
  res.json({ success: true, data })
})

// DELETE /api/orders/cart/:itemId — remove item
cartRouter.delete('/cart/:itemId', requireAuth, async (req, res) => {
  await supabaseAdmin.from('cart_items').delete().eq('id', req.params.itemId)
  res.json({ success: true, data: null })
})

// DELETE /api/orders/cart/user/:userId — clear cart
cartRouter.delete('/cart/user/:userId', requireAuth, async (req, res) => {
  await supabaseAdmin.from('cart_items').delete().eq('user_id', req.params.userId)
  res.json({ success: true, data: null })
})
```

---

## Step 5: .env.example

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
NOTIFICATION_SERVICE_URL=http://notification-service:3000
INTERNAL_API_KEY=change-me-internal-secret
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in
```

---

## Done When

- [ ] `POST /api/orders` creates an order and returns order with number
- [ ] `GET /api/orders?storeId=` returns seller orders
- [ ] `GET /api/orders?buyerId=` returns buyer orders
- [ ] `PUT /api/orders/:id/status` updates status and fires notification
- [ ] `POST /api/orders/:id/cancel` cancels pending/accepted orders
- [ ] Cart CRUD all working
- [ ] Notification service receives order-update call (check notification-service logs)
