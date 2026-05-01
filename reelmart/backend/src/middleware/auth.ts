import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin'

export interface AuthRequest extends Request {
  userId?: string
  userRole?: string
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized', code: 'NO_TOKEN' })
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return res.status(401).json({ success: false, error: 'Invalid token', code: 'INVALID_TOKEN' })
  }
  req.userId = user.id
  next()
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const { data } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', req.userId!)
      .single()
    if (!data?.is_admin) {
      return res.status(403).json({ success: false, error: 'Forbidden', code: 'NOT_ADMIN' })
    }
    next()
  })
}
