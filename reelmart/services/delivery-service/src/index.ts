import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { deliveryRouter } from './routes/delivery'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: !allowedOrigins || allowedOrigins.includes('*') ? true : allowedOrigins }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'delivery-service' }))
app.use('/api/delivery', deliveryRouter)

app.listen(PORT, () => console.log(`delivery-service running on :${PORT}`))
