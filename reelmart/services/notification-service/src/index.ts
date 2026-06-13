import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { notificationsRouter } from './routes/notifications'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : false }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }))
app.use('/api/notifications', notificationsRouter)

app.listen(PORT, () => console.log(`notification-service running on :${PORT}`))
