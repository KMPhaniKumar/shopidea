import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { payoutsRouter } from './routes/payouts'
import { bankAccountsRouter } from './routes/bankAccounts'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'payout-service' }))
app.use('/api/payouts', payoutsRouter)
app.use('/api/payouts', bankAccountsRouter)

app.listen(PORT, () => console.log(`payout-service running on :${PORT}`))
