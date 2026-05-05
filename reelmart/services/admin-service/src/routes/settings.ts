import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAdmin } from '../middleware/auth'

export const settingsRouter = Router()

settingsRouter.get('/', async (_req, res) => {
  const { data } = await supabaseAdmin.from('platform_settings').select('key, value')
  const settings = Object.fromEntries((data ?? []).map(s => [s.key, s.value]))
  res.json({ success: true, data: settings })
})

settingsRouter.put('/', requireAdmin, async (req, res) => {
  const upserts = Object.entries(req.body).map(([key, value]) => ({ key, value }))
  const { error } = await supabaseAdmin.from('platform_settings').upsert(upserts, { onConflict: 'key' })
  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data: req.body })
})
