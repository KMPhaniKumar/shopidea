import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { sendPush } from '../lib/fcm'
import { sendWhatsApp } from '../lib/gupshup'

export const notificationsRouter = Router()

const ORDER_MESSAGES: Record<string, { title: string; body: string; whatsapp: string }> = {
  accepted:  { title: 'Order Accepted ✅',   body: 'Your order is being prepared.',       whatsapp: '✅ Your order has been accepted and is being prepared!' },
  packed:    { title: 'Order Packed 📦',     body: 'Your order is packed and ready.',     whatsapp: '📦 Your order is packed and ready to ship!' },
  shipped:   { title: 'Order Shipped 🚚',    body: 'Your order is on the way!',           whatsapp: '🚚 Your order is on the way! Track it in the ReelMart app.' },
  delivered: { title: 'Order Delivered 🎉',  body: 'Enjoy your purchase!',               whatsapp: '🎉 Your order has been delivered! We hope you love it.' },
  rejected:  { title: 'Order Rejected ❌',   body: 'Your order could not be fulfilled.',  whatsapp: '❌ Sorry, your order was rejected. A refund will be processed if applicable.' },
  cancelled: { title: 'Order Cancelled',     body: 'Your order has been cancelled.',      whatsapp: '❌ Your order has been cancelled.' },
}

function requireInternalKey(req: any, res: any, next: any) {
  if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

// POST /api/notifications/register-token — called by mobile apps on login (public)
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

// POST /api/notifications/push — internal
notificationsRouter.post('/push', requireInternalKey, async (req, res) => {
  const { userId, title, body, data } = req.body
  const { data: tokens } = await supabaseAdmin.from('fcm_tokens').select('token').eq('user_id', userId)
  await Promise.all((tokens ?? []).map(t => sendPush(t.token, title, body, data)))
  res.json({ success: true, data: { sent: tokens?.length ?? 0 } })
})

// POST /api/notifications/whatsapp — internal
notificationsRouter.post('/whatsapp', requireInternalKey, async (req, res) => {
  const { phone, message } = req.body
  await sendWhatsApp(phone, message)
  res.json({ success: true })
})

// POST /api/notifications/order-update — called by order-service
notificationsRouter.post('/order-update', requireInternalKey, async (req, res) => {
  const { orderId, status, buyerPhone, storeName, buyerId } = req.body
  const msgs = ORDER_MESSAGES[status]
  if (!msgs) return res.json({ success: true })

  await Promise.all([
    buyerId && supabaseAdmin.from('fcm_tokens').select('token').eq('user_id', buyerId).then(({ data: tokens }) =>
      Promise.all((tokens ?? []).map(t => sendPush(t.token, msgs.title, `${msgs.body} — ${storeName}`)))
    ),
    buyerPhone && sendWhatsApp(buyerPhone, `*ReelMart* — ${storeName}\n\n${msgs.whatsapp}`),
  ])

  res.json({ success: true })
})
