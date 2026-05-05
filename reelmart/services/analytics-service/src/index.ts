import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { analyticsRouter } from './routes/analytics'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'analytics-service' }))
app.use('/api/analytics', analyticsRouter)

app.listen(PORT, () => console.log(`analytics-service running on :${PORT}`))
