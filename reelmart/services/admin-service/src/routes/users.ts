import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const adminUsersRouter = Router()

adminUsersRouter.get('/', requireAdmin, async (req, res) => {
  const { role, search, page = '1' } = req.query
  const pageNum = Math.max(1, parseInt(page as string))
  const from = (pageNum - 1) * 20

  let query = supabaseAdmin.from('users').select('id, full_name, phone, email, role, created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, from + 19)

  if (role) query = query.eq('role', role as string)
  if (search) query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`)

  const { data, count } = await query
  res.json({ success: true, data: data ?? [], total: count ?? 0, page: pageNum })
})

adminUsersRouter.put('/:id/ban', requireAdmin, async (req, res) => {
  const { ban } = req.body
  const { data, error } = await supabaseAdmin.from('users').update({ is_active: !ban }).eq('id', req.params.id).select('id, full_name, is_active').single()
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
