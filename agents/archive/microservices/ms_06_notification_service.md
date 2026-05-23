# MS-06: Notification Service
> Sends FCM push notifications and WhatsApp messages via Gupshup. Called internally by other services.

**Port (local):** 3005 | **Docker:** 3000  
**Prefix:** `/api/notifications`  
**Auth:** Internal API key (`x-internal-key` header) — not Supabase JWT

---

## Step 1: src/lib/fcm.ts

```typescript
import * as admin from 'firebase-admin'

let initialized = false

function getApp() {
  if (!initialized) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON!)),
    })
    initialized = true
  }
  return admin.app()
}

export async function sendPush(token: string, title: string, body: string, data?: Record<string, string>) {
  try {
    await getApp().messaging().send({ token, notification: { title, body }, data })
  } catch (err) {
    console.error('FCM error:', err)
  }
}
```

---

## Step 2: src/lib/gupshup.ts

```typescript
export async function sendWhatsApp(phone: string, message: string) {
  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SENDER_NUMBER!,
    destination: phone,
    message: JSON.stringify({ type: 'text', text: message }),
    'src.name': process.env.GUPSHUP_APP_NAME!,
  })

  const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
    method: 'POST',
    headers: {
      apikey: process.env.GUPSHUP_API_KEY!,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!res.ok) console.error('Gupshup error:', await res.text())
}
```

---

## Step 3: src/routes/notifications.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { sendPush } from '../lib/fcm'
import { sendWhatsApp } from '../lib/gupshup'

export const notificationsRouter = Router()

const ORDER_STATUS_MESSAGES: Record<string, { title: string; body: string; whatsapp: string }> = {
  accepted:  { title: 'Order Accepted ✅',   body: 'Your order is being prepared.',        whatsapp: '✅ Your order has been accepted and is being prepared!' },
  packed:    { title: 'Order Packed 📦',     body: 'Your order is packed and ready.',      whatsapp: '📦 Your order is packed and ready to ship!' },
  shipped:   { title: 'Order Shipped 🚚',    body: 'Your order is on the way!',            whatsapp: '🚚 Your order is on the way! Track it in the ReelMart app.' },
  delivered: { title: 'Order Delivered 🎉',  body: 'Enjoy your purchase!',                 whatsapp: '🎉 Your order has been delivered! We hope you love it.' },
  rejected:  { title: 'Order Rejected ❌',   body: 'Your order could not be fulfilled.',   whatsapp: '❌ Sorry, your order was rejected. A refund will be processed if payment was made.' },
  cancelled: { title: 'Order Cancelled',     body: 'Your order has been cancelled.',       whatsapp: '❌ Your order has been cancelled.' },
}

function requireInternalKey(req: any, res: any, next: any) {
  if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

// POST /api/notifications/push — send FCM push
notificationsRouter.post('/push', requireInternalKey, async (req, res) => {
  const { userId, title, body, data } = req.body

  const { data: tokens } = await supabaseAdmin
    .from('fcm_tokens')
    .select('token')
    .eq('user_id', userId)

  await Promise.all((tokens ?? []).map(t => sendPush(t.token, title, body, data)))
  res.json({ success: true, data: { sent: tokens?.length ?? 0 } })
})

// POST /api/notifications/whatsapp — send WhatsApp
notificationsRouter.post('/whatsapp', requireInternalKey, async (req, res) => {
  const { phone, message } = req.body
  await sendWhatsApp(phone, message)
  res.json({ success: true })
})

// POST /api/notifications/register-token — called by mobile apps on login
notificationsRouter.post('/register-token', async (req, res) => {
  const schema = z.object({ userId: z.string().uuid(), token: z.string(), platform: z.enum(['ios', 'android']) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  await supabaseAdmin.from('fcm_tokens').upsert(
    { user_id: parsed.data.userId, token: parsed.data.token, platform: parsed.data.platform },
    { onConflict: 'token' }
  )
  res.json({ success: true })
})

// POST /api/notifications/order-update — called by order-service
notificationsRouter.post('/order-update', requireInternalKey, async (req, res) => {
  const { orderId, status, buyerPhone, storeName, buyerId } = req.body
  const msgs = ORDER_STATUS_MESSAGES[status]
  if (!msgs) return res.json({ success: true })

  const pushBody = `${msgs.body} — ${storeName}`
  const waMsg = `*ReelMart* — ${storeName}\n\n${msgs.whatsapp}`

  await Promise.all([
    buyerId && sendPush('', msgs.title, pushBody).catch(() => {}),
    buyerPhone && sendWhatsApp(buyerPhone, waMsg),
  ])

  res.json({ success: true })
})
```

---

## Step 4: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
GUPSHUP_API_KEY=xxx
GUPSHUP_SENDER_NUMBER=+91xxxxxxxxxx
GUPSHUP_APP_NAME=ReelMart
INTERNAL_API_KEY=change-me-internal-secret
```

---

## Done When

- [ ] `POST /api/notifications/push` sends FCM to user's registered devices
- [ ] `POST /api/notifications/whatsapp` sends WhatsApp via Gupshup
- [ ] `POST /api/notifications/register-token` stores FCM token
- [ ] `POST /api/notifications/order-update` sends both push + WhatsApp on order status change
- [ ] Invalid `x-internal-key` returns 401
