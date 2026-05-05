import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { returnsRouter } from './routes/returns'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'return-service' }))
app.use('/api/returns', returnsRouter)

app.listen(PORT, () => console.log(`return-service running on :${PORT}`))
