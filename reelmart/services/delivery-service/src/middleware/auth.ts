import { Request, Response, NextFunction } from 'express'
import { supabaseAdmin } from '../lib/supabase'

export interface AuthRequest extends Request {
  user?: { id: string; role?: string }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' })

  req.user = { id: user.id }
  next()
}

// For server-to-server calls (e.g. the web admin-approval route asking us to
// register a store's NimbusPost pickup). Mirrors notification-service's guard.
export function requireInternalKey(req: Request, res: Response, next: NextFunction) {
  if (req.headers['x-internal-key'] !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  next()
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' })

  const { data } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single()
  if (!data || !['admin'].includes(data.role)) {
    return res.status(403).json({ success: false, error: 'Forbidden' })
  }

  req.user = { id: user.id, role: data.role }
  next()
}
