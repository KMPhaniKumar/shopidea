# MS-02: Catalog Service
> Manages stores, products, discovery, and reviews. Extracted from direct Supabase calls in mobile apps.

**Port (local):** 3001 | **Docker:** 3000  
**Prefix:** `/api/catalog`

---

## What This Replaces
- `apps/seller-app/src/services/productService.ts` → direct Supabase calls
- `apps/buyer-app/src/services/discoveryService.ts` → direct Supabase calls
- `apps/buyer-app/src/services/reviewService.ts` → direct Supabase calls

---

## Step 1: Directory Structure

```
services/catalog-service/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   ├── stores.ts
│   │   ├── products.ts
│   │   └── reviews.ts
│   ├── middleware/
│   │   └── auth.ts
│   └── lib/
│       └── supabase.ts
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Step 2: src/index.ts

```typescript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { storesRouter } from './routes/stores'
import { productsRouter } from './routes/products'
import { reviewsRouter } from './routes/reviews'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'catalog-service' }))
app.use('/api/catalog', storesRouter)
app.use('/api/catalog', productsRouter)
app.use('/api/catalog', reviewsRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`catalog-service running on :${PORT}`))
```

---

## Step 3: src/routes/stores.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const storesRouter = Router()

// GET /api/catalog/stores?city=&category= — public, discovery
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
    .select('*, users!seller_id(name, phone)')
    .eq('store_slug', req.params.slug)
    .single()
  if (!data) return res.status(404).json({ success: false, error: 'Store not found' })
  res.json({ success: true, data })
})

// GET /api/catalog/stores/:id/products — public
storesRouter.get('/stores/:id/products', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('products')
    .select('*, product_variants(*)')
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
    description: z.string().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const sellerId = (req as any).user.id
  const slug = parsed.data.store_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString(36)

  const { data, error } = await supabaseAdmin.from('stores').insert({
    ...parsed.data,
    seller_id: sellerId,
    store_slug: slug,
    is_active: true,
    is_open: true,
  }).select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// PUT /api/catalog/stores/:id — auth, update store
storesRouter.put('/stores/:id', requireAuth, async (req, res) => {
  const sellerId = (req as any).user.id
  const { data: store } = await supabaseAdmin.from('stores').select('seller_id').eq('id', req.params.id).single()
  if (!store || store.seller_id !== sellerId) return res.status(403).json({ success: false, error: 'Forbidden' })

  const { data, error } = await supabaseAdmin.from('stores').update(req.body).eq('id', req.params.id).select('*').single()
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
```

---

## Step 4: src/routes/products.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const productsRouter = Router()

// GET /api/catalog/products?storeId= — auth (seller lists own products)
productsRouter.get('/products', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const { data } = await supabaseAdmin
    .from('products')
    .select('*, product_variants(*)')
    .eq('store_id', storeId as string)
    .order('created_at', { ascending: false })
  res.json({ success: true, data: data ?? [] })
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
    stock_type: z.enum(['unlimited', 'counted']).default('unlimited'),
    stock_count: z.number().int().default(0),
    low_stock_threshold: z.number().int().default(5),
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
  const { data, error } = await supabaseAdmin
    .from('products')
    .update(req.body)
    .eq('id', req.params.id)
    .select('*').single()
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
    .update({ is_available })
    .eq('id', req.params.id)
    .select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
```

---

## Step 5: src/routes/reviews.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const reviewsRouter = Router()

// GET /api/catalog/stores/:id/reviews — public
reviewsRouter.get('/stores/:id/reviews', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('reviews')
    .select('*, users!buyer_id(name)')
    .eq('store_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50)
  res.json({ success: true, data: data ?? [] })
})

// POST /api/catalog/reviews — auth, submit review
reviewsRouter.post('/reviews', requireAuth, async (req, res) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    order_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional(),
    photos: z.array(z.string()).default([]),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data, error } = await supabaseAdmin.from('reviews').insert({
    ...parsed.data,
    buyer_id: (req as any).user.id,
  }).select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})
```

---

## Step 6: .env.example

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

## Done When

- [ ] `GET /api/catalog/stores?city=Mumbai` returns store list
- [ ] `GET /api/catalog/stores/:slug` returns store detail
- [ ] `GET /api/catalog/stores/:id/products` returns products
- [ ] `POST /api/catalog/products` creates a product (with auth token)
- [ ] `PUT /api/catalog/products/:id` updates product
- [ ] `DELETE /api/catalog/products/:id` deletes product
- [ ] `POST /api/catalog/reviews` creates a review
- [ ] All endpoints return `{ success: true, data: ... }`
- [ ] `/health` returns `{ status: 'ok' }`
