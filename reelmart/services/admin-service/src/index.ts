import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { adminUsersRouter } from './routes/users'
import { adminStoresRouter } from './routes/stores'
import { couponsRouter } from './routes/coupons'
import { settingsRouter } from './routes/settings'
import { authRouter } from './routes/auth'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: !allowedOrigins || allowedOrigins.includes('*') ? true : allowedOrigins }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'admin-service' }))
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/stores', adminStoresRouter)
app.use('/api/admin/coupons', couponsRouter)
app.use('/api/admin/settings', settingsRouter)
app.use('/api/admin/auth', authRouter)

app.listen(PORT, () => console.log(`admin-service running on :${PORT}`))
