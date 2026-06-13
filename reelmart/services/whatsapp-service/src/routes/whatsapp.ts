import { Router } from 'express'
import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'
import { handleBotMessage } from '../bot/handler'
import { sendWhatsApp } from '../lib/gupshup'

export const whatsappRouter = Router()

/**
 * Verify the Gupshup inbound webhook signature.
 * Gupshup signs the raw request body with HMAC-SHA256 using the app secret
 * and sends the hex digest in the `X-Gupshup-Signature` header.
 *
 * If GUPSHUP_WEBHOOK_SECRET is not configured, the check is skipped so that
 * the webhook continues to function in dev environments where the secret has
 * not yet been set. Infra must add GUPSHUP_WEBHOOK_SECRET to the task def
 * secret mappings to activate fail-closed enforcement in production.
 */
function verifyGupshupSignature(req: any, res: any, next: any) {
  const secret = process.env.GUPSHUP_WEBHOOK_SECRET
  if (!secret) {
    // Secret not yet configured — skip verification (open, but logged)
    console.warn('GUPSHUP_WEBHOOK_SECRET not set; skipping webhook signature check')
    return next()
  }

  const signature = req.headers['x-gupshup-signature'] as string | undefined
  if (!signature) {
    return res.status(401).json({ success: false, error: 'Missing webhook signature', code: 'WEBHOOK_SIGNATURE_MISSING' })
  }

  const rawBody = JSON.stringify(req.body)
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  // Timing-safe compare (pads to equal length so the comparison is constant-time)
  let valid = false
  try {
    const expectedBuf = Buffer.from(expected, 'hex')
    const receivedBuf = Buffer.from(signature, 'hex')
    if (expectedBuf.length === receivedBuf.length) {
      valid = crypto.timingSafeEqual(expectedBuf, receivedBuf)
    }
  } catch {
    valid = false
  }

  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature', code: 'WEBHOOK_SIGNATURE_INVALID' })
  }

  next()
}

// POST /api/whatsapp/webhook?store=<slug> — Gupshup webhook
whatsappRouter.post('/webhook', verifyGupshupSignature, async (req, res) => {
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
