import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { sendPushToUser } from '../notifications/push'

export const notificationsRouter = Router()

notificationsRouter.post('/test', requireAuth, async (req: AuthRequest, res) => {
  await sendPushToUser(req.userId!, 'Test Notification', 'Push notifications are working!')
  res.json({ success: true, message: 'Test notification sent' })
})
