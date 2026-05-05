import 'dotenv/config'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { paymentsRouter } from './routes/payments'
import { deliveryRouter } from './routes/delivery'
import { notificationsRouter } from './routes/notifications'
import { whatsappRouter } from './routes/whatsapp'
import { payoutsRouter } from './routes/payouts'
import { supabaseAdmin } from './lib/supabaseAdmin'

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(Sentry.Handlers.requestHandler())
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/api/', limiter)

app.get('/health', async (_req, res) => {
  const checks = await Promise.allSettled([
    supabaseAdmin.from('users').select('count').limit(1),
  ])
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase: checks[0].status === 'fulfilled' ? 'ok' : 'error',
    version: process.env.npm_package_version ?? '1.0.0',
  })
})

app.use('/api/payments', paymentsRouter)
app.use('/api/delivery', deliveryRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/whatsapp', whatsappRouter)
app.use('/api/payouts', payoutsRouter)

app.use(Sentry.Handlers.errorHandler())
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`)
})
