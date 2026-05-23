# MS-00: Architecture Setup & Shared Infrastructure
> First step of microservices conversion. Sets up the folder structure, shared libraries, and docker-compose for local dev.

---

## Target Directory Structure

```
reelmart/
├── services/                    ← NEW: all microservices live here
│   ├── api-gateway/
│   ├── catalog-service/
│   ├── order-service/
│   ├── payment-service/
│   ├── delivery-service/
│   ├── notification-service/
│   ├── whatsapp-bot-service/
│   ├── payout-service/
│   ├── analytics-service/
│   ├── return-service/
│   └── admin-service/
├── shared/                      ← Existing shared types
├── apps/                        ← Existing mobile + web apps
├── supabase/                    ← Existing migrations
├── docker-compose.yml           ← NEW: local dev
└── MICROSERVICES_TRACKER.md
```

---

## Step 1: Each Service Template

Every service follows this exact structure:

```
services/<name>/
├── src/
│   ├── index.ts          ← Express app entry + AppRegistry
│   ├── routes/
│   │   └── *.ts
│   ├── middleware/
│   │   └── auth.ts       ← Supabase JWT validator
│   └── lib/
│       └── supabase.ts   ← supabaseAdmin client
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Step 2: Shared package.json template per service

```json
{
  "name": "reelmart-<service-name>",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "@sentry/node": "^8.0.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

---

## Step 3: Shared auth middleware (copy to every service)

Create `services/<name>/src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ success: false, error: 'Missing token' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' })

  ;(req as any).user = user
  next()
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ success: false, error: 'Missing token' })

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ success: false, error: 'Invalid token' })

  const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: profile } = await supabaseAdmin.from('users').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return res.status(403).json({ success: false, error: 'Admin only' })

  ;(req as any).user = user
  next()
}
```

---

## Step 4: Shared supabaseAdmin client (copy to every service)

Create `services/<name>/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

---

## Step 5: Standard service index.ts template

```typescript
import 'dotenv/config'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { router } from './routes'

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 })
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(Sentry.Handlers.requestHandler())
app.use(helmet())
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }))
app.use(express.json({ limit: '10mb' }))
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }))

app.get('/health', (_req, res) => res.json({ status: 'ok', service: '<service-name>', ts: new Date() }))
app.use('/api/<prefix>', router)

app.use(Sentry.Handlers.errorHandler())
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

app.listen(PORT, () => console.log(`<service-name> running on :${PORT}`))
```

---

## Step 6: Standard Dockerfile (copy to every service)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

---

## Step 7: Standard tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 8: docker-compose.yml (root level — local dev only)

```yaml
version: '3.9'

services:
  api-gateway:
    build: ./services/api-gateway
    ports: ["3000:3000"]
    env_file: ./services/api-gateway/.env
    depends_on: [catalog-service, order-service, payment-service]

  catalog-service:
    build: ./services/catalog-service
    ports: ["3001:3000"]
    env_file: ./services/catalog-service/.env

  order-service:
    build: ./services/order-service
    ports: ["3002:3000"]
    env_file: ./services/order-service/.env

  payment-service:
    build: ./services/payment-service
    ports: ["3003:3000"]
    env_file: ./services/payment-service/.env

  delivery-service:
    build: ./services/delivery-service
    ports: ["3004:3000"]
    env_file: ./services/delivery-service/.env

  notification-service:
    build: ./services/notification-service
    ports: ["3005:3000"]
    env_file: ./services/notification-service/.env

  whatsapp-bot-service:
    build: ./services/whatsapp-bot-service
    ports: ["3006:3000"]
    env_file: ./services/whatsapp-bot-service/.env

  payout-service:
    build: ./services/payout-service
    ports: ["3007:3000"]
    env_file: ./services/payout-service/.env

  analytics-service:
    build: ./services/analytics-service
    ports: ["3008:3000"]
    env_file: ./services/analytics-service/.env

  return-service:
    build: ./services/return-service
    ports: ["3009:3000"]
    env_file: ./services/return-service/.env

  admin-service:
    build: ./services/admin-service
    ports: ["3010:3000"]
    env_file: ./services/admin-service/.env
```

---

## Step 9: Standard .env.example (all services share these base vars)

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
SENTRY_DSN=https://xxx@sentry.io/xxx
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in
```

---

## Done When

- [ ] `reelmart/services/` directory created
- [ ] All 11 service folders scaffolded with template files
- [ ] `docker-compose.yml` at repo root created
- [ ] `docker compose up` starts all services without errors
- [ ] `/health` endpoint on every service returns `{ status: 'ok' }`
