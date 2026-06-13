import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const productsRouter = Router()

// Returns true iff the given user is the seller who owns `storeId`.
async function userOwnsStore(storeId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('stores').select('seller_id').eq('id', storeId).single()
  return !!data && (data as any).seller_id === userId
}

// Returns the store_id + seller_id for a product, or null if not found.
async function getProductStore(productId: string): Promise<{ store_id: string; seller_id: string } | null> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('store_id, stores!store_id(seller_id)')
    .eq('id', productId)
    .single()
  if (!data) return null
  return { store_id: (data as any).store_id, seller_id: (data as any).stores?.seller_id }
}

// Returns true iff the given user owns the store the product belongs to.
async function userOwnsProduct(productId: string, userId: string): Promise<boolean> {
  const ps = await getProductStore(productId)
  return !!ps && ps.seller_id === userId
}

// Returns true iff the store with `storeId` is currently suspended.
async function isStoreSuspended(storeId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('stores').select('suspended').eq('id', storeId).single()
  return !!data && (data as any).suspended === true
}

// GET /api/catalog/products?storeId= — auth, seller lists own products
productsRouter.get('/products', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  // Ownership: only the store's seller may list its (incl. unavailable) products.
  if (!(await userOwnsStore(storeId as string, (req as any).user.id))) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  const { data } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', storeId as string)
    .order('created_at', { ascending: false })
  res.json({ success: true, data: data ?? [] })
})

// GET /api/catalog/products/:id — public
// Only expose the product if it is available AND its store is approved, active, and not suspended.
productsRouter.get('/products/:id', async (req, res) => {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('*, stores!store_id(approval_status, is_active, suspended)')
    .eq('id', req.params.id)
    .single()

  if (!product) return res.status(404).json({ success: false, error: 'Product not found' })

  const store = (product as any).stores
  const storeVisible =
    store?.approval_status === 'approved' &&
    store?.is_active === true &&
    store?.suspended === false

  if (!storeVisible || !(product as any).is_available) {
    return res.status(404).json({ success: false, error: 'Product not found' })
  }

  // Strip the joined store moderation columns before returning — callers don't need them
  const { stores: _stores, ...productData } = product as any
  res.json({ success: true, data: productData })
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

  // Ownership check
  if (!(await userOwnsStore(parsed.data.store_id, (req as any).user.id))) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Block writes from suspended sellers
  if (await isStoreSuspended(parsed.data.store_id)) {
    return res.status(403).json({ success: false, error: 'Store is suspended', code: 'STORE_SUSPENDED' })
  }

  const { data, error } = await supabaseAdmin.from('products').insert(parsed.data).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// PUT /api/catalog/products/:id — auth, update product
productsRouter.put('/products/:id', requireAuth, async (req, res) => {
  // Verify seller owns the product's store
  const ps = await getProductStore(req.params.id)
  if (!ps || ps.seller_id !== (req as any).user.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Block writes from suspended sellers
  if (await isStoreSuspended(ps.store_id)) {
    return res.status(403).json({ success: false, error: 'Store is suspended', code: 'STORE_SUSPENDED' })
  }

  const { store_id, ...updates } = req.body
  const { data, error } = await supabaseAdmin
    .from('products').update(updates).eq('id', req.params.id).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// DELETE /api/catalog/products/:id — auth, delete product
productsRouter.delete('/products/:id', requireAuth, async (req, res) => {
  const ps = await getProductStore(req.params.id)
  if (!ps || ps.seller_id !== (req as any).user.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Block writes from suspended sellers
  if (await isStoreSuspended(ps.store_id)) {
    return res.status(403).json({ success: false, error: 'Store is suspended', code: 'STORE_SUSPENDED' })
  }

  const { error } = await supabaseAdmin.from('products').delete().eq('id', req.params.id)
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data: null })
})

// PUT /api/catalog/products/:id/availability — auth, toggle availability
productsRouter.put('/products/:id/availability', requireAuth, async (req, res) => {
  const ps = await getProductStore(req.params.id)
  if (!ps || ps.seller_id !== (req as any).user.id) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Block writes from suspended sellers
  if (await isStoreSuspended(ps.store_id)) {
    return res.status(403).json({ success: false, error: 'Store is suspended', code: 'STORE_SUSPENDED' })
  }

  const { is_available } = req.body
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ is_available: Boolean(is_available) })
    .eq('id', req.params.id)
    .select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
