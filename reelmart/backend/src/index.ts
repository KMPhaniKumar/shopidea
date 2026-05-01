import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { paymentsRouter } from './routes/payments'
import { deliveryRouter } from './routes/delivery'
import { notificationsRouter } from './routes/notifications'
import { whatsappRouter } from './routes/whatsapp'
import { payoutsRouter } from './routes/payouts'

const app = express()
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
app.use('/api/', limiter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/payments', paymentsRouter)
app.use('/api/delivery', deliveryRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/whatsapp', whatsappRouter)
app.use('/api/payouts', payoutsRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`)
})
