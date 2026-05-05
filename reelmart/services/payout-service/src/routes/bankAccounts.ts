import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const bankAccountsRouter = Router()

// GET /api/payouts/bank-account?sellerId=
bankAccountsRouter.get('/bank-account', requireAuth, async (req, res) => {
  const sellerId = (req.query.sellerId as string) ?? (req as any).user.id
  const { data } = await supabaseAdmin.from('bank_accounts').select('*').eq('seller_id', sellerId).maybeSingle()
  res.json({ success: true, data })
})

// POST /api/payouts/bank-account — save/update
bankAccountsRouter.post('/bank-account', requireAuth, async (req, res) => {
  const schema = z.object({
    account_number: z.string().min(8),
    account_holder: z.string().min(2),
    ifsc_code: z.string().length(11),
    bank_name: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const sellerId = (req as any).user.id
  const { data, error } = await supabaseAdmin.from('bank_accounts')
    .upsert({ ...parsed.data, seller_id: sellerId }, { onConflict: 'seller_id' })
    .select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
