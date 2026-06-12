import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { sendPush } from '../lib/fcm'
import { sendWhatsApp } from '../lib/gupshup'
import { sendSMS } from '../lib/sms'

const SITE_URL = process.env.SITE_URL ?? 'https://dev.reelmart.in'
// Smart link to the ReelMart buyer app (routes to Play Store / App Store).
const APP_DOWNLOAD_URL = process.env.APP_DOWNLOAD_URL ?? `${SITE_URL}/app`

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

// POST /api/notifications/order-placed — public, idempotent.
// Called from the web checkout right after a successful order insert.
// Marks `notification_sent=true` on the order so re-calls are no-ops.
notificationsRouter.post('/order-placed', async (req, res) => {
  const schema = z.object({ orderId: z.string().uuid() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, total_amount, delivery_address, notification_sent, created_at, awb_code, store_id, stores(store_name)')
    .eq('id', parsed.data.orderId)
    .single()

  if (error || !order) return res.status(404).json({ success: false, error: 'Order not found' })
  if (order.notification_sent) return res.json({ success: true, data: { skipped: 'already-sent' } })

  // Only fire for fresh orders to prevent drive-by spam if someone discovers
  // an old order id.
  const ageMs = Date.now() - new Date(order.created_at).getTime()
  if (ageMs > 30 * 60 * 1000) {
    return res.json({ success: true, data: { skipped: 'too-old' } })
  }

  const addr = order.delivery_address as any
  const phone = addr?.phone as string | undefined
  const altPhone = addr?.alt_phone as string | undefined
  const storeName = (order as any).stores?.store_name ?? 'the store'
  const trackUrl = order.awb_code
    ? `${SITE_URL}/track/${order.awb_code}`
    : `${SITE_URL}/order/${order.id}`

  const waBody =
    `*ReelMart* — Order placed at ${storeName} 🎉\n` +
    `Order: ${order.order_number}\n` +
    `Total: ₹${order.total_amount}\n\n` +
    `Track your order: ${trackUrl}\n\n` +
    `📲 Get live order updates — download the ReelMart app: ${APP_DOWNLOAD_URL}`

  const smsBody =
    `ReelMart: Order ${order.order_number} placed at ${storeName}. ` +
    `Total Rs.${order.total_amount}. Track: ${trackUrl}. ` +
    `Get the app for live updates: ${APP_DOWNLOAD_URL}`

  const results = await Promise.allSettled([
    phone ? sendWhatsApp(phone, waBody) : Promise.resolve(),
    phone ? sendSMS({ phone, message: smsBody }) : Promise.resolve(),
    // Backup phone gets SMS only — many alt numbers are landlines or shared.
    altPhone ? sendSMS({ phone: altPhone, message: smsBody }) : Promise.resolve(),
  ])

  await supabaseAdmin.from('orders')
    .update({ notification_sent: true })
    .eq('id', order.id)

  res.json({
    success: true,
    data: { sent: results.map(r => r.status) },
  })
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

// ---------------------------------------------------------------------------
// Seller pickup-address change notifications — called by the web admin route
// after it approves or rejects a store_address_changes request.
// Auth: x-internal-key (same as all service-to-service triggers).
// ---------------------------------------------------------------------------

const ADDRESS_CHANGE_MESSAGES = {
  approved: {
    push: {
      title: 'Pickup address approved',
      body: 'Your updated pickup address has been approved and is now active with our courier partner.',
    },
    whatsapp:
      '*ReelMart* — Your updated pickup address has been approved and is now active with our courier partner.',
  },
  rejected: (reason?: string) => ({
    push: {
      title: 'Pickup address change not approved',
      body: reason
        ? `Your pickup address change was not approved: ${reason}. Please review and resubmit.`
        : 'Your pickup address change was not approved. Please review and resubmit.',
    },
    whatsapp: reason
      ? `*ReelMart* — Your pickup address change was not approved: ${reason}. Please review and resubmit.`
      : '*ReelMart* — Your pickup address change was not approved. Please review and resubmit.',
  }),
}

// POST /api/notifications/address-change-approved
// Body: { storeId: uuid }
notificationsRouter.post('/address-change-approved', requireInternalKey, async (req, res) => {
  const schema = z.object({ storeId: z.string().uuid() })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.message })
  }

  const { storeId } = parsed.data

  // Resolve seller user_id and phone from stores → users join.
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores')
    .select('seller_id, store_name, users:seller_id(phone)')
    .eq('id', storeId)
    .single()

  if (storeErr || !store) {
    return res.status(404).json({ success: false, error: 'Store not found' })
  }

  const sellerId = (store as any).seller_id as string | null
  const sellerPhone = (store as any).users?.phone as string | undefined
  const msgs = ADDRESS_CHANGE_MESSAGES.approved

  const sends: PromiseLike<unknown>[] = []

  if (sellerPhone) {
    sends.push(sendWhatsApp(sellerPhone, msgs.whatsapp))
  }

  if (sellerId) {
    sends.push(
      supabaseAdmin
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', sellerId)
        .then(({ data: tokens }) =>
          Promise.allSettled(
            (tokens ?? []).map(t =>
              sendPush(t.token, msgs.push.title, msgs.push.body, { type: 'address_change_approved', storeId })
            )
          )
        )
    )
  }

  const results = await Promise.allSettled(sends)

  return res.json({
    success: true,
    data: {
      channels: results.map(r => r.status),
      whatsappSent: !!sellerPhone,
      pushSent: !!sellerId,
    },
  })
})

// POST /api/notifications/address-change-rejected
// Body: { storeId: uuid, rejectReason?: string }
notificationsRouter.post('/address-change-rejected', requireInternalKey, async (req, res) => {
  const schema = z.object({
    storeId: z.string().uuid(),
    rejectReason: z.string().trim().max(500).optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.message })
  }

  const { storeId, rejectReason } = parsed.data

  // Resolve seller user_id and phone from stores → users join.
  const { data: store, error: storeErr } = await supabaseAdmin
    .from('stores')
    .select('seller_id, store_name, users:seller_id(phone)')
    .eq('id', storeId)
    .single()

  if (storeErr || !store) {
    return res.status(404).json({ success: false, error: 'Store not found' })
  }

  const sellerId = (store as any).seller_id as string | null
  const sellerPhone = (store as any).users?.phone as string | undefined
  const msgs = ADDRESS_CHANGE_MESSAGES.rejected(rejectReason)

  const sends: PromiseLike<unknown>[] = []

  if (sellerPhone) {
    sends.push(sendWhatsApp(sellerPhone, msgs.whatsapp))
  }

  if (sellerId) {
    sends.push(
      supabaseAdmin
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', sellerId)
        .then(({ data: tokens }) =>
          Promise.allSettled(
            (tokens ?? []).map(t =>
              sendPush(t.token, msgs.push.title, msgs.push.body, {
                type: 'address_change_rejected',
                storeId,
                ...(rejectReason ? { rejectReason } : {}),
              })
            )
          )
        )
    )
  }

  const results = await Promise.allSettled(sends)

  return res.json({
    success: true,
    data: {
      channels: results.map(r => r.status),
      whatsappSent: !!sellerPhone,
      pushSent: !!sellerId,
    },
  })
})
