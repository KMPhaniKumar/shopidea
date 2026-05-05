# MS-11: Admin Service
> Platform admin API — user management, store moderation, coupon engine, platform settings.

**Port (local):** 3010 | **Docker:** 3000  
**Prefix:** `/api/admin`  
**Auth:** All routes require `requireAdmin` (role = 'admin' in Supabase JWT)

---

## Step 1: src/routes/users.ts

```typescript
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const adminUsersRouter = Router()

// GET /api/admin/users?role=&search=&page= — list users
adminUsersRouter.get('/', requireAdmin, async (req, res) => {
  const { role, search, page = '1' } = req.query
  const pageNum = Math.max(1, parseInt(page as string))
  const pageSize = 20
  const from = (pageNum - 1) * pageSize

  let query = supabaseAdmin
    .from('users')
    .select('id, full_name, phone, email, role, created_at, is_active', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (role) query = query.eq('role', role as string)
  if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)

  const { data, count } = await query
  res.json({ success: true, data: data ?? [], total: count ?? 0, page: pageNum, pageSize })
})

// PUT /api/admin/users/:id/ban — ban/unban user
adminUsersRouter.put('/:id/ban', requireAdmin, async (req, res) => {
  const { ban } = req.body // true = ban, false = unban
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ is_active: !ban })
    .eq('id', req.params.id)
    .select('id, full_name, is_active')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
```

---

## Step 2: src/routes/stores.ts

```typescript
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const adminStoresRouter = Router()

// GET /api/admin/stores?status=&search= — list all stores
adminStoresRouter.get('/', requireAdmin, async (req, res) => {
  const { status, search, page = '1' } = req.query
  const pageNum = Math.max(1, parseInt(page as string))
  const pageSize = 20
  const from = (pageNum - 1) * pageSize

  let query = supabaseAdmin
    .from('stores')
    .select('id, store_name, store_slug, seller_id, status, category, created_at, users!seller_id(full_name, phone)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (status) query = query.eq('status', status as string)
  if (search) query = query.or(`store_name.ilike.%${search}%,store_slug.ilike.%${search}%`)

  const { data, count } = await query
  res.json({ success: true, data: data ?? [], total: count ?? 0, page: pageNum, pageSize })
})

// PUT /api/admin/stores/:id/approve — approve pending store
adminStoresRouter.put('/:id/approve', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({ status: 'active' })
    .eq('id', req.params.id)
    .select('id, store_name, status')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

// PUT /api/admin/stores/:id/suspend — suspend store
adminStoresRouter.put('/:id/suspend', requireAdmin, async (req, res) => {
  const { reason } = req.body
  const { data, error } = await supabaseAdmin
    .from('stores')
    .update({ status: 'suspended', suspension_reason: reason })
    .eq('id', req.params.id)
    .select('id, store_name, status')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
```

---

## Step 3: src/routes/coupons.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const couponsRouter = Router()

// GET /api/admin/coupons?storeId= — list coupons (seller or admin)
couponsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId } = req.query
  let query = supabaseAdmin
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  if (storeId) query = query.eq('store_id', storeId as string)

  const { data } = await query
  res.json({ success: true, data: data ?? [] })
})

// POST /api/admin/coupons — create coupon (seller)
couponsRouter.post('/', requireAuth, async (req, res) => {
  const schema = z.object({
    store_id: z.string().uuid(),
    code: z.string().min(3).max(20).toUpperCase(),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.number().positive(),
    min_order_amount: z.number().min(0).default(0),
    max_uses: z.number().int().positive().optional(),
    expires_at: z.string().datetime().optional(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  // Verify seller owns the store
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', parsed.data.store_id)
    .eq('seller_id', (req as any).user.id)
    .single()

  if (!store) return res.status(403).json({ success: false, error: 'Forbidden' })

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .insert({ ...parsed.data, uses: 0, is_active: true })
    .select('*')
    .single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

// POST /api/admin/coupons/validate — validate coupon code at checkout
couponsRouter.post('/validate', requireAuth, async (req, res) => {
  const { code, storeId, orderAmount } = req.body
  if (!code || !storeId || !orderAmount) {
    return res.status(400).json({ success: false, error: 'code, storeId, orderAmount required' })
  }

  const { data: coupon } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('code', (code as string).toUpperCase())
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle()

  if (!coupon) return res.status(404).json({ success: false, error: 'Invalid or expired coupon' })
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return res.status(400).json({ success: false, error: 'Coupon has expired' })
  }
  if (coupon.max_uses && coupon.uses >= coupon.max_uses) {
    return res.status(400).json({ success: false, error: 'Coupon usage limit reached' })
  }
  if (orderAmount < coupon.min_order_amount) {
    return res.status(400).json({
      success: false,
      error: `Minimum order amount ₹${coupon.min_order_amount} required`,
    })
  }

  const discount = coupon.discount_type === 'percentage'
    ? Math.min((orderAmount * coupon.discount_value) / 100, orderAmount)
    : Math.min(coupon.discount_value, orderAmount)

  res.json({ success: true, data: { coupon, discount: Math.round(discount) } })
})

// DELETE /api/admin/coupons/:id — deactivate coupon
couponsRouter.delete('/:id', requireAuth, async (req, res) => {
  await supabaseAdmin.from('coupons').update({ is_active: false }).eq('id', req.params.id)
  res.json({ success: true, data: null })
})
```

---

## Step 4: src/routes/settings.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const settingsRouter = Router()

// GET /api/admin/settings — get platform settings
settingsRouter.get('/', async (_req, res) => {
  const { data } = await supabaseAdmin
    .from('platform_settings')
    .select('key, value')

  const settings = Object.fromEntries((data ?? []).map(s => [s.key, s.value]))
  res.json({ success: true, data: settings })
})

// PUT /api/admin/settings — update settings (admin only)
settingsRouter.put('/', requireAdmin, async (req, res) => {
  const schema = z.record(z.string(), z.any())
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const upserts = Object.entries(parsed.data).map(([key, value]) => ({ key, value }))

  const { error } = await supabaseAdmin
    .from('platform_settings')
    .upsert(upserts, { onConflict: 'key' })

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data: parsed.data })
})
```

---

## Step 5: src/index.ts

```typescript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { adminUsersRouter } from './routes/users'
import { adminStoresRouter } from './routes/stores'
import { couponsRouter } from './routes/coupons'
import { settingsRouter } from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'admin-service' }))
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/stores', adminStoresRouter)
app.use('/api/admin/coupons', couponsRouter)
app.use('/api/admin/settings', settingsRouter)

app.listen(PORT, () => console.log(`admin-service running on :${PORT}`))
```

---

## Step 6: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in
```

---

## Done When

- [ ] `GET /api/admin/users?role=seller` lists sellers with pagination
- [ ] `PUT /api/admin/users/:id/ban` bans/unbans user
- [ ] `GET /api/admin/stores` lists all stores
- [ ] `PUT /api/admin/stores/:id/approve` sets store status to active
- [ ] `PUT /api/admin/stores/:id/suspend` suspends store with reason
- [ ] `POST /api/admin/coupons` creates coupon (seller owns store check)
- [ ] `POST /api/admin/coupons/validate` validates coupon code and returns discount amount
- [ ] `GET /api/admin/settings` publicly readable platform settings
- [ ] `PUT /api/admin/settings` admin-only settings update
