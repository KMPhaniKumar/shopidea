import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { ordersRouter } from './routes/orders'
import { cartRouter } from './routes/cart'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean)
// MED-3 fix: deny-by-default when ALLOWED_ORIGINS is unset; never allow-all wildcard
app.use(cors({ origin: allowedOrigins?.length ? (allowedOrigins.includes('*') ? true : allowedOrigins) : false }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'order-service' }))
app.use('/api/orders', ordersRouter)
app.use('/api/orders', cartRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`order-service running on :${PORT}`))
