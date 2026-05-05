import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const reviewsRouter = Router()

// GET /api/catalog/stores/:id/reviews — public
reviewsRouter.get('/stores/:id/reviews', async (req, res) => {
  const { data } = await supabaseAdmin
    .from('reviews')
    .select('*, users!buyer_id(full_name)')
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

  // Verify buyer actually ordered from this store
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('id', parsed.data.order_id)
    .eq('buyer_id', (req as any).user.id)
    .eq('store_id', parsed.data.store_id)
    .eq('status', 'delivered')
    .single()

  if (!order) return res.status(403).json({ success: false, error: 'Can only review after delivery' })

  const { data, error } = await supabaseAdmin.from('reviews').insert({
    ...parsed.data,
    buyer_id: (req as any).user.id,
  }).select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })

  // Update store rating_avg
  const { data: reviews } = await supabaseAdmin.from('reviews').select('rating').eq('store_id', parsed.data.store_id)
  if (reviews && reviews.length > 0) {
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    await supabaseAdmin.from('stores').update({
      rating_avg: Math.round(avg * 10) / 10,
      total_reviews: reviews.length,
    }).eq('id', parsed.data.store_id)
  }

  res.status(201).json({ success: true, data })
})
