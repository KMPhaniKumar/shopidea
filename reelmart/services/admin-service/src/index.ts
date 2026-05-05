import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { adminUsersRouter } from './routes/users'
import { adminStoresRouter } from './routes/stores'
import { couponsRouter } from './routes/coupons'
import { settingsRouter } from './routes/settings'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'admin-service' }))
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/stores', adminStoresRouter)
app.use('/api/admin/coupons', couponsRouter)
app.use('/api/admin/settings', settingsRouter)

app.listen(PORT, () => console.log(`admin-service running on :${PORT}`))
