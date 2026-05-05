import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { handleBotMessage } from '../bot/handler'
import { sendWhatsApp } from '../lib/gupshup'

export const whatsappRouter = Router()

// POST /api/whatsapp/webhook?store=<slug> — Gupshup webhook (public)
whatsappRouter.post('/webhook', async (req, res) => {
  res.send('ok')
  try {
    const { payload } = req.body
    if (!payload?.sender?.phone || !payload?.payload?.text) return
    const storeSlug = req.query.store as string
    if (!storeSlug) return
    await handleBotMessage(payload.sender.phone as string, payload.payload.text as string, storeSlug)
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
    .from('orders')
    .select('delivery_address')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')

  const phones = [...new Set(
    (orders ?? []).map((o: any) => o.delivery_address?.phone).filter(Boolean)
  )]

  let sent = 0
  for (const phone of phones) {
    await sendWhatsApp(phone, message).catch(() => {})
    await new Promise(r => setTimeout(r, 1000))
    sent++
  }

  await supabaseAdmin.from('broadcasts').insert({ store_id: storeId, message, recipient_count: sent })
  res.json({ success: true, data: { sent } })
})
