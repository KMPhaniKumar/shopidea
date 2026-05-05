import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { paymentsRouter } from './routes/payments'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))

// Webhook needs raw body — register before express.json()
app.post('/api/payments/webhook', express.raw({ type: '*/*' }), (req, _res, next) => {
  ;(req as any).rawBody = (req.body as Buffer).toString('utf8')
  next()
})

app.use(express.json())
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'payment-service' }))
app.use('/api/payments', paymentsRouter)

app.listen(PORT, () => console.log(`payment-service running on :${PORT}`))
