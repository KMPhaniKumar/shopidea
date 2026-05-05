import { Router, Request, Response } from 'express'
import { handleBotMessage } from '../whatsapp/bot'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { sendWhatsApp } from '../notifications/whatsapp'
import { requireAuth } from '../middleware/auth'

export const whatsappRouter = Router()

// Gupshup webhook — POST /api/whatsapp/webhook?store=<storeSlug>
// Each seller configures their Gupshup webhook URL with their store slug as query param
whatsappRouter.post('/webhook', async (req: Request, res: Response) => {
  // Always respond 200 immediately to prevent Gupshup retries
  res.send('ok')

  try {
    const { payload } = req.body
    if (!payload?.sender?.phone || !payload?.payload?.text) return

    const buyerPhone = payload.sender.phone as string
    const message = payload.payload.text as string
    const storeSlug = req.query.store as string

    if (!storeSlug) return

    await handleBotMessage(buyerPhone, message, storeSlug)
  } catch {
    // Swallow errors — Gupshup must not retry
  }
})

// Razorpay payment link callback — GET /api/whatsapp/payment-callback?orderId=...&razorpay_payment_id=...
whatsappRouter.get('/payment-callback', async (req: Request, res: Response) => {
  const { orderId, razorpay_payment_id, razorpay_payment_link_status } = req.query

  if (!orderId) {
    return res.status(400).send('Missing orderId')
  }

  if (razorpay_payment_link_status === 'paid' && razorpay_payment_id) {
    await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_id: razorpay_payment_id as string,
        status: 'pending',
      })
      .eq('id', orderId as string)
  }

  // Redirect to a thank-you page or back to WhatsApp
  res.redirect(`https://reelmart.in/order-confirmed?id=${orderId}`)
})

// Broadcast WhatsApp message to all store customers — POST /api/whatsapp/broadcast
whatsappRouter.post('/broadcast', requireAuth, async (req: Request, res: Response) => {
  const { storeId, message } = req.body
  if (!storeId || !message?.trim()) {
    return res.status(400).json({ success: false, error: 'storeId and message are required' })
  }

  // Verify caller owns the store
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('seller_id', (req as any).user.id)
    .single()

  if (!store) {
    return res.status(403).json({ success: false, error: 'Unauthorized' })
  }

  // Fetch unique buyer phones for this store
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('buyer_id, users!buyer_id(phone)')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')

  const phonesSet = new Set<string>()
  for (const o of orders ?? []) {
    const phone = (o as any).users?.phone
    if (phone) phonesSet.add(phone)
  }
  const phones = [...phonesSet]

  // Send sequentially — 1 per second to respect rate limits
  let sent = 0
  for (const phone of phones) {
    await sendWhatsApp(phone, message).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
    sent++
  }

  // Log broadcast
  await supabaseAdmin.from('broadcasts').insert({ store_id: storeId, message, recipient_count: sent })

  res.json({ success: true, count: sent })
})
