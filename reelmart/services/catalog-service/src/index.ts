import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { storesRouter } from './routes/stores'
import { productsRouter } from './routes/products'
import { reviewsRouter } from './routes/reviews'

const app = express()
const PORT = process.env.PORT || 3000

app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'catalog-service' }))
app.use('/api/catalog', storesRouter)
app.use('/api/catalog', productsRouter)
app.use('/api/catalog', reviewsRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`catalog-service running on :${PORT}`))
