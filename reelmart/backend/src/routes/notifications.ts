import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { sendPushToUser, pushNotify } from '../notifications/push'
import { notify } from '../notifications/whatsapp'
import { supabaseAdmin } from '../lib/supabaseAdmin'

export const notificationsRouter = Router()

// Called by Supabase Edge Function when a new order is inserted
notificationsRouter.post('/new-order', async (req, res) => {
  try {
    const { order } = req.body as { order: any }
    if (!order) return res.status(400).json({ success: false, error: 'Missing order' })

    const sellerPhone = order.stores?.whatsapp_number
    const buyerPhone = order.users?.phone
    const buyerName = order.users?.name ?? 'Customer'
    const storeName = order.stores?.store_name ?? 'the seller'
    const sellerId = order.stores?.seller_id

    await Promise.allSettled([
      sellerPhone
        ? notify.newOrder(sellerPhone, order.order_number, buyerName, order.total_amount)
        : Promise.resolve(),
      buyerPhone
        ? notify.orderConfirmed(buyerPhone, order.order_number, storeName, order.total_amount)
        : Promise.resolve(),
      sellerId
        ? pushNotify.newOrder(sellerId, order.order_number)
        : Promise.resolve(),
    ])

    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Called by Supabase Edge Function when an order status changes
notificationsRouter.post('/status-change', async (req, res) => {
  try {
    const { order, newStatus } = req.body as { order: any; newStatus: string }
    if (!order || !newStatus) return res.status(400).json({ success: false, error: 'Missing order or newStatus' })

    const buyerPhone = order.users?.phone
    const buyerId = order.buyer_id

    await Promise.allSettled([
      buyerPhone
        ? notify.orderStatusChanged(buyerPhone, order.order_number, newStatus, {
            trackingUrl: order.tracking_url,
            rejectionReason: order.rejection_reason,
          })
        : Promise.resolve(),
      buyerId
        ? pushNotify.orderStatusUpdate(buyerId, newStatus, order.order_number)
        : Promise.resolve(),
    ])

    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Register device token for push notifications
notificationsRouter.post('/register-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { token, platform } = req.body as { token: string; platform: 'ios' | 'android' }
    if (!token) return res.status(400).json({ success: false, error: 'Missing token' })

    await supabaseAdmin.from('device_tokens').upsert(
      { user_id: req.userId!, token, platform },
      { onConflict: 'token' }
    )
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message })
  }
})

// Test push (dev only)
notificationsRouter.post('/test', requireAuth, async (req: AuthRequest, res) => {
  await sendPushToUser(req.userId!, 'Test Notification', 'Push notifications are working!')
  res.json({ success: true, message: 'Test notification sent' })
})
