import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const adminStoresRouter = Router()

adminStoresRouter.get('/', requireAdmin, async (req, res) => {
  const { status, search, page = '1' } = req.query
  const from = (Math.max(1, parseInt(page as string)) - 1) * 20
  let query = supabaseAdmin.from('stores')
    .select('id, store_name, store_slug, seller_id, status, category, created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, from + 19)
  if (status) query = query.eq('status', status as string)
  if (search) query = query.ilike('store_name', `%${search}%`)
  const { data, count } = await query
  res.json({ success: true, data: data ?? [], total: count ?? 0 })
})

adminStoresRouter.put('/:id/approve', requireAdmin, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('stores').update({ status: 'active' }).eq('id', req.params.id).select('id, store_name, status').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})

adminStoresRouter.put('/:id/suspend', requireAdmin, async (req, res) => {
  const { reason } = req.body
  const { data, error } = await supabaseAdmin.from('stores').update({ status: 'suspended', suspension_reason: reason }).eq('id', req.params.id).select('id, store_name, status').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
