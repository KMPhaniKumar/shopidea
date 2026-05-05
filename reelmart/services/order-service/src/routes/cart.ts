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

// POST /api/orders/cart — add/upsert item
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
