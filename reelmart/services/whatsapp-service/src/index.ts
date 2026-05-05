import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { whatsappRouter } from './routes/whatsapp'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'whatsapp-service' }))
app.use('/api/whatsapp', whatsappRouter)

app.listen(PORT, () => console.log(`whatsapp-service running on :${PORT}`))
