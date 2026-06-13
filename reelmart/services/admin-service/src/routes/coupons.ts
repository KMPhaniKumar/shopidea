import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const couponsRouter = Router()

couponsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId } = req.query

  // storeId is required — scopes the response to a single store and allows an
  // ownership check consistent with how POST / and DELETE /:id work.
  if (!storeId || typeof storeId !== 'string') {
    return res.status(400).json({ success: false, error: 'storeId query parameter is required', code: 'STORE_ID_REQUIRED' })
  }

  // Verify the caller owns this store (same pattern as POST /)
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', storeId)
    .eq('seller_id', (req as any).user.id)
    .single()
  if (!store) return res.status(403).json({ success: false, error: 'Forbidden', code: 'STORE_OWNERSHIP_REQUIRED' })

  const { data, error } = await supabaseAdmin
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ success: false, error: error.message })

  res.json({ success: true, data: data ?? [] })
})

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

  const { data: store } = await supabaseAdmin.from('stores').select('id').eq('id', parsed.data.store_id).eq('seller_id', (req as any).user.id).single()
  if (!store) return res.status(403).json({ success: false, error: 'Forbidden' })

  const { data, error } = await supabaseAdmin.from('coupons').insert({ ...parsed.data, uses: 0, is_active: true }).select('*').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.status(201).json({ success: true, data })
})

couponsRouter.post('/validate', requireAuth, async (req, res) => {
  const { code, storeId, orderAmount } = req.body
  if (!code || !storeId || !orderAmount) return res.status(400).json({ success: false, error: 'code, storeId, orderAmount required' })

  const { data: coupon } = await supabaseAdmin.from('coupons').select('*').eq('code', (code as string).toUpperCase()).eq('store_id', storeId).eq('is_active', true).maybeSingle()
  if (!coupon) return res.status(404).json({ success: false, error: 'Invalid or expired coupon' })
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'Coupon has expired' })
  if (coupon.max_uses && coupon.uses >= coupon.max_uses) return res.status(400).json({ success: false, error: 'Coupon usage limit reached' })
  if (orderAmount < coupon.min_order_amount) return res.status(400).json({ success: false, error: `Minimum order ₹${coupon.min_order_amount} required` })

  const discount = coupon.discount_type === 'percentage'
    ? Math.min((orderAmount * coupon.discount_value) / 100, orderAmount)
    : Math.min(coupon.discount_value, orderAmount)

  res.json({ success: true, data: { coupon, discount: Math.round(discount) } })
})

couponsRouter.delete('/:id', requireAuth, async (req, res) => {
  // Verify the coupon belongs to a store owned by the caller
  const { data: coupon } = await supabaseAdmin
    .from('coupons')
    .select('store_id')
    .eq('id', req.params.id)
    .single()
  if (!coupon) return res.status(404).json({ success: false, error: 'Coupon not found', code: 'COUPON_NOT_FOUND' })

  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id')
    .eq('id', coupon.store_id)
    .eq('seller_id', (req as any).user.id)
    .single()
  if (!store) return res.status(403).json({ success: false, error: 'Forbidden', code: 'COUPON_OWNERSHIP_REQUIRED' })

  await supabaseAdmin.from('coupons').update({ is_active: false }).eq('id', req.params.id)
  res.json({ success: true, data: null })
})
