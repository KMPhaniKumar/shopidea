import { Router, Response } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const cartRouter = Router()

// GET /api/orders/cart/:userId
// Ownership enforced: 403 when path :userId ≠ JWT user.
// Keeping the param in the URL preserves existing client URLs.
cartRouter.get('/cart/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.params.userId !== req.user!.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }
  const { data } = await supabaseAdmin
    .from('cart_items')
    .select('*, products(name, price, images, is_available)')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: true })
  res.json({ success: true, data: data ?? [] })
})

// POST /api/orders/cart — add/upsert item
// user_id is NOT accepted from the client body — it is always taken from the JWT.
cartRouter.post('/cart', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    product_id: z.string().uuid(),
    qty: z.number().int().positive().default(1),
    selected_variant: z.any().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const payload = { ...parsed.data, user_id: req.user!.id }

  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .upsert(payload, { onConflict: 'user_id,product_id' })
    .select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// PUT /api/orders/cart/:itemId — update qty
// Ownership enforced: the update query is scoped to both id AND user_id so a
// cross-user itemId silently matches zero rows, returning 403.
cartRouter.put('/cart/:itemId', requireAuth, async (req: AuthRequest, res: Response) => {
  const { qty } = req.body
  if (qty <= 0) {
    await supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('id', req.params.itemId)
      .eq('user_id', req.user!.id)
    return res.json({ success: true, data: null })
  }
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .update({ qty })
    .eq('id', req.params.itemId)
    .eq('user_id', req.user!.id)
    .select('*')
    .single()

  if (error || !data) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }
  res.json({ success: true, data })
})

// DELETE /api/orders/cart/:itemId — remove item
// Ownership enforced: delete is scoped to both id AND user_id.
cartRouter.delete('/cart/:itemId', requireAuth, async (req: AuthRequest, res: Response) => {
  await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('id', req.params.itemId)
    .eq('user_id', req.user!.id)
  res.json({ success: true, data: null })
})

// DELETE /api/orders/cart/user/:userId — clear cart
// Ownership enforced: 403 when path :userId ≠ JWT user.
cartRouter.delete('/cart/user/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.params.userId !== req.user!.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }
  await supabaseAdmin
    .from('cart_items')
    .delete()
    .eq('user_id', req.user!.id)
  res.json({ success: true, data: null })
})
