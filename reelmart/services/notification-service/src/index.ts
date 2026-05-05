import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { notificationsRouter } from './routes/notifications'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'notification-service' }))
app.use('/api/notifications', notificationsRouter)

app.listen(PORT, () => console.log(`notification-service running on :${PORT}`))
