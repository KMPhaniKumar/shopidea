import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const productsRouter = Router()

// GET /api/catalog/products?storeId= — auth, seller lists own products
productsRouter.get('/products', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const { data } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId as string)
    .order('created_at', { ascending: false })
  res.json({ success: true, data: data ?? [] })
})

// GET /api/catalog/products/:id — public
productsRouter.get('/products/:id', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (!data) return res.status(404).json({ success: false, error: 'Product not found' })
  res.json({ success: true, data })
})

// POST /api/catalog/products — auth, create product
productsRouter.post('/products', requireAuth, async (req, res) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    name: z.string().min(2),
    description: z.string().optional(),
    price: z.number().positive(),
    compare_price: z.number().optional(),
    images: z.array(z.string()).default([]),
    category: z.string().optional(),
    stock_quantity: z.number().int().default(-1), // -1 = unlimited
    low_stock_threshold: z.number().int().default(3),
    is_available: z.boolean().default(true),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data, error } = await supabaseAdmin.from('products').insert(parsed.data).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// PUT /api/catalog/products/:id — auth, update product
productsRouter.put('/products/:id', requireAuth, async (req, res) => {
  const sellerId = (req as any).user.id
  // Verify seller owns the product's store
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('stores!store_id(seller_id)')
    .eq('id', req.params.id)
    .single()
  if (!product || (product as any).stores?.seller_id !== sellerId) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  const { store_id, ...updates } = req.body
  const { data, error } = await supabaseAdmin
    .from('products').update(updates).eq('id', req.params.id).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// DELETE /api/catalog/products/:id — auth, delete product
productsRouter.delete('/products/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin.from('products').delete().eq('id', req.params.id)
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data: null })
})

// PUT /api/catalog/products/:id/availability — auth, toggle availability
productsRouter.put('/products/:id/availability', requireAuth, async (req, res) => {
  const { is_available } = req.body
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ is_available: Boolean(is_available) })
    .eq('id', req.params.id)
    .select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
