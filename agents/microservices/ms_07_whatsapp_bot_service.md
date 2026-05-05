# MS-07: WhatsApp Bot Service
> Conversational ordering bot via Gupshup. Buyer messages store WhatsApp → bot handles full order flow.

**Port (local):** 3006 | **Docker:** 3000  
**Prefix:** `/api/whatsapp`

---

## Step 1: src/bot/session.ts

```typescript
export interface BotSession {
  storeSlug: string
  storeId: string
  storeName: string
  step: 'menu' | 'qty' | 'address' | 'done'
  products?: any[]
  selectedProduct?: any
  quantity?: number
}

const sessions = new Map<string, { session: BotSession; expiresAt: number }>()
const TTL_MS = 30 * 60 * 1000 // 30 minutes

export function getSession(phone: string): BotSession | null {
  const entry = sessions.get(phone)
  if (!entry || Date.now() > entry.expiresAt) { sessions.delete(phone); return null }
  return entry.session
}

export function setSession(phone: string, session: BotSession) {
  sessions.set(phone, { session, expiresAt: Date.now() + TTL_MS })
}

export function clearSession(phone: string) {
  sessions.delete(phone)
}
```

---

## Step 2: src/bot/handler.ts

```typescript
import { supabaseAdmin } from '../lib/supabase'
import { sendWhatsApp } from '../lib/gupshup'
import { createPaymentLink } from '../lib/razorpay'
import { getSession, setSession, clearSession, BotSession } from './session'

export async function handleBotMessage(phone: string, message: string, storeSlug: string) {
  const msg = message.trim()
  let session = getSession(phone)

  // Fetch store if no session or different store
  if (!session || session.storeSlug !== storeSlug) {
    const { data: store } = await supabaseAdmin
      .from('stores').select('id, store_name').eq('store_slug', storeSlug).single()
    if (!store) return
    session = { storeSlug, storeId: store.id, storeName: store.store_name, step: 'menu' }
  }

  if (msg.toLowerCase() === 'hi' || msg === '0' || msg.toLowerCase() === 'menu') {
    session.step = 'menu'
  }

  switch (session.step) {
    case 'menu': {
      const { data: products } = await supabaseAdmin
        .from('products').select('id, name, price').eq('store_id', session.storeId).eq('is_available', true).limit(10)

      const menu = (products ?? []).map((p, i) => `${i + 1}. ${p.name} — ₹${p.price}`).join('\n')
      await sendWhatsApp(phone,
        `👋 Welcome to *${session.storeName}*!\n\nHere's what we have:\n\n${menu}\n\n_Reply with a number to order_\n_Reply 0 for menu_`
      )
      session.products = products ?? []
      session.step = 'qty'
      break
    }

    case 'qty': {
      const idx = parseInt(msg) - 1
      const product = session.products?.[idx]
      if (!product) {
        await sendWhatsApp(phone, '❓ Please reply with a valid number from the menu.')
        break
      }
      session.selectedProduct = product
      await sendWhatsApp(phone, `*${product.name}* — ₹${product.price}\n\nHow many would you like? (Reply with number)`)
      session.step = 'address'
      break
    }

    case 'address': {
      const qty = parseInt(msg)
      if (isNaN(qty) || qty < 1) {
        await sendWhatsApp(phone, '❓ Please reply with a valid quantity (e.g. 1, 2, 3)')
        break
      }
      session.quantity = qty
      await sendWhatsApp(phone,
        `✅ *${session.selectedProduct.name} x${qty}*\n\nPlease share your delivery address:\n\nFormat: Name, Full Address, City, Pincode\nExample: _Priya Sharma, 12 MG Road, Bangalore, 560001_`
      )
      session.step = 'done'
      break
    }

    case 'done': {
      const product = session.selectedProduct!
      const qty = session.quantity!
      const total = product.price * qty + 60 // +60 delivery

      // Create order in DB
      const { data: order } = await supabaseAdmin.from('orders').insert({
        store_id: session.storeId,
        order_number: `RM${Date.now().toString(36).toUpperCase()}`,
        items: [{ productId: product.id, name: product.name, price: product.price, qty }],
        subtotal: product.price * qty,
        delivery_fee: 60,
        total_amount: total,
        delivery_address: { raw: msg, phone },
        status: 'pending',
        payment_status: 'pending',
      }).select('id, order_number').single()

      if (!order) {
        await sendWhatsApp(phone, '❌ Something went wrong. Please try again.')
        clearSession(phone)
        break
      }

      // Create Razorpay payment link
      const paymentLink = await createPaymentLink(order.id, total, order.order_number, phone)

      await sendWhatsApp(phone,
        `📦 *Order Summary*\n\n${product.name} x${qty} = ₹${product.price * qty}\nDelivery = ₹60\n*Total = ₹${total}*\n\n💳 Pay to confirm:\n${paymentLink}\n\n_Link expires in 30 minutes_`
      )
      clearSession(phone)
      break
    }
  }

  setSession(phone, session)
}
```

---

## Step 3: src/lib/razorpay.ts

```typescript
const AUTH = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')

export async function createPaymentLink(orderId: string, amount: number, orderNumber: string, phone: string): Promise<string> {
  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amount * 100,
      currency: 'INR',
      description: `ReelMart Order ${orderNumber}`,
      customer: { contact: phone },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 1800,
      callback_url: `${process.env.PAYMENT_SERVICE_URL}/api/payments/whatsapp-callback?orderId=${orderId}`,
    }),
  })
  const data = await res.json()
  return data.short_url ?? data.id
}
```

---

## Step 4: src/lib/gupshup.ts

```typescript
export async function sendWhatsApp(phone: string, message: string) {
  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SENDER_NUMBER!,
    destination: phone,
    message: JSON.stringify({ type: 'text', text: message }),
    'src.name': process.env.GUPSHUP_APP_NAME!,
  })
  await fetch('https://api.gupshup.io/sm/api/v1/msg', {
    method: 'POST',
    headers: { apikey: process.env.GUPSHUP_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  }).catch(console.error)
}
```

---

## Step 5: src/routes/whatsapp.ts

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { handleBotMessage } from '../bot/handler'
import { sendWhatsApp } from '../lib/gupshup'
import { supabaseAdmin } from '../lib/supabase'

export const whatsappRouter = Router()

// POST /api/whatsapp/webhook?store=<slug> — Gupshup sends here
whatsappRouter.post('/webhook', async (req, res) => {
  res.send('ok') // Always 200 immediately
  try {
    const { payload } = req.body
    if (!payload?.sender?.phone || !payload?.payload?.text) return
    const phone = payload.sender.phone as string
    const message = payload.payload.text as string
    const storeSlug = req.query.store as string
    if (!storeSlug) return
    await handleBotMessage(phone, message, storeSlug)
  } catch (err) {
    console.error('Bot error:', err)
  }
})

// POST /api/whatsapp/broadcast — auth (seller)
whatsappRouter.post('/broadcast', requireAuth, async (req, res) => {
  const { storeId, message } = req.body
  if (!storeId || !message?.trim()) return res.status(400).json({ success: false, error: 'storeId and message required' })

  const { data: store } = await supabaseAdmin.from('stores').select('id').eq('id', storeId).eq('seller_id', (req as any).user.id).single()
  if (!store) return res.status(403).json({ success: false, error: 'Forbidden' })

  const { data: orders } = await supabaseAdmin
    .from('orders').select('users!buyer_id(phone)').eq('store_id', storeId).eq('payment_status', 'paid')

  const phones = [...new Set((orders ?? []).map((o: any) => o.users?.phone).filter(Boolean))]

  let sent = 0
  for (const phone of phones) {
    await sendWhatsApp(phone, message).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
    sent++
  }

  await supabaseAdmin.from('broadcasts').insert({ store_id: storeId, message, recipient_count: sent })
  res.json({ success: true, data: { sent } })
})
```

---

## Step 6: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
GUPSHUP_API_KEY=xxx
GUPSHUP_SENDER_NUMBER=+91xxxxxxxxxx
GUPSHUP_APP_NAME=ReelMart
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
PAYMENT_SERVICE_URL=http://payment-service:3000
```

---

## Done When

- [ ] Gupshup webhook receives POST and replies ok immediately
- [ ] Sending "hi" to the webhook shows the product catalogue
- [ ] Selecting a product number → asks quantity
- [ ] Providing address → creates order in DB and sends Razorpay payment link
- [ ] Broadcast sends WhatsApp to all store customers
- [ ] Sessions expire after 30 minutes of inactivity
