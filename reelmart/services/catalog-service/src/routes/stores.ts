import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const storesRouter = Router()

// GET /api/catalog/stores?city=&category=&q= — public, discovery
storesRouter.get('/stores', async (req, res) => {
  const { city, category, q } = req.query

  if (q) {
    const { data } = await supabaseAdmin
      .from('stores')
      .select('id, store_name, store_slug, category, logo_url, city, area, rating_avg, total_reviews, is_verified')
      .eq('is_active', true)
      .ilike('store_name', `%${q}%`)
      .limit(20)
    return res.json({ success: true, data: data ?? [] })
  }

  let query = supabaseAdmin
    .from('stores')
    .select('id, store_name, store_slug, category, logo_url, city, area, rating_avg, total_reviews, total_orders, is_verified')
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })
    .limit(20)

  if (city) query = query.eq('city', city as string)
  if (category) query = query.eq('category', category as string)

  const { data } = await query
  res.json({ success: true, data: data ?? [] })
})

// GET /api/catalog/stores/:slug — public
storesRouter.get('/stores/:slug', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('store_slug', req.params.slug)
    .single()
  if (!data) return res.status(404).json({ success: false, error: 'Store not found' })
  res.json({ success: true, data })
})

// GET /api/catalog/stores/:id/products — public
storesRouter.get('/stores/:id/products', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('store_id', req.params.id)
    .eq('is_available', true)
    .order('created_at', { ascending: false })
  res.json({ success: true, data: data ?? [] })
})

// POST /api/catalog/stores — auth, create store
storesRouter.post('/stores', requireAuth, async (req, res) => {
  const schema = z.object({
    store_name: z.string().min(3).max(40),
    category: z.string(),
    city: z.string(),
    area: z.string().optional(),
    whatsapp_number: z.string().optional(),
    instagram_handle: z.string().optional(),
    description: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const sellerId = (req as any).user.id
  const slug = parsed.data.store_name
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
    '-' + Date.now().toString(36)

  const { data, error } = await supabaseAdmin.from('stores').insert({
    ...parsed.data,
    seller_id: sellerId,
    store_slug: slug,
    is_active: true,
  }).select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// PUT /api/catalog/stores/:id — auth, update own store
storesRouter.put('/stores/:id', requireAuth, async (req, res) => {
  const sellerId = (req as any).user.id
  const { data: store } = await supabaseAdmin.from('stores').select('seller_id').eq('id', req.params.id).single()
  if (!store || store.seller_id !== sellerId) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  // Prevent overwriting seller_id
  const { seller_id, ...updates } = req.body
  const { data, error } = await supabaseAdmin.from('stores').update(updates).eq('id', req.params.id).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// POST /api/catalog/stores/:id/follow — auth, toggle follow
storesRouter.post('/stores/:id/follow', requireAuth, async (req, res) => {
  const userId = (req as any).user.id
  const storeId = req.params.id

  const { data: existing } = await supabaseAdmin
    .from('followed_stores')
    .select('id')
    .eq('user_id', userId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin.from('followed_stores').delete().eq('user_id', userId).eq('store_id', storeId)
    res.json({ success: true, data: { following: false } })
  } else {
    await supabaseAdmin.from('followed_stores').insert({ user_id: userId, store_id: storeId })
    res.json({ success: true, data: { following: true } })
  }
})

// GET /api/catalog/my-store — auth, get seller's own store
storesRouter.get('/my-store', requireAuth, async (req, res) => {
  const sellerId = (req as any).user.id
  const { data } = await supabaseAdmin.from('stores').select('*').eq('seller_id', sellerId).single()
  if (!data) return res.status(404).json({ success: false, error: 'No store found' })
  res.json({ success: true, data })
})
