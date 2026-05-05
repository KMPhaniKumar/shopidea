# MS-01: API Gateway Service
> Single entry point for all client requests. Validates JWT, routes to downstream services via http-proxy-middleware, applies rate limiting and CORS.

**Local port:** 3000
**Docker internal port:** 3000
**Service name in docker-compose:** `api-gateway`

---

## What This Service Does

- Accepts every request from mobile apps and web clients
- Validates Supabase JWT on protected routes before forwarding
- Proxies requests to the correct downstream microservice
- Applies rate limiting, CORS headers, and security headers globally
- Exposes public routes (webhooks, store discovery) without auth

---

## Directory Structure

```
services/api-gateway/
├── src/
│   ├── index.ts            ← Express app entry point
│   ├── proxy.ts            ← All proxy route definitions
│   └── middleware/
│       └── auth.ts         ← JWT validation middleware
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Step 1: package.json

```json
{
  "name": "reelmart-api-gateway",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@sentry/node": "^8.0.0",
    "@supabase/supabase-js": "^2.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "express-rate-limit": "^7.0.0",
    "helmet": "^7.0.0",
    "http-proxy-middleware": "^3.0.0"
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

## Step 2: tsconfig.json

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

## Step 3: .env.example

```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SENTRY_DSN=https://xxx@sentry.io/xxx
ALLOWED_ORIGINS=http://localhost:3000,https://reelmart.in,exp://localhost:8081

# Downstream service URLs (docker-compose service names used in production)
CATALOG_SERVICE_URL=http://catalog-service:3000
ORDER_SERVICE_URL=http://order-service:3000
PAYMENT_SERVICE_URL=http://payment-service:3000
DELIVERY_SERVICE_URL=http://delivery-service:3000
NOTIFICATION_SERVICE_URL=http://notification-service:3000
WHATSAPP_SERVICE_URL=http://whatsapp-bot-service:3000
PAYOUT_SERVICE_URL=http://payout-service:3000
ANALYTICS_SERVICE_URL=http://analytics-service:3000
RETURN_SERVICE_URL=http://return-service:3000
ADMIN_SERVICE_URL=http://admin-service:3000
```

---

## Step 4: src/middleware/auth.ts

Validates the Supabase JWT and attaches the decoded user object to `req.user`. Returns 401 if token is missing or invalid.

```typescript
import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

// Use anon key — getUser() validates the JWT server-side via Supabase Auth
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
    phone?: string
    role?: string
    user_metadata?: Record<string, unknown>
  }
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' })
    return
  }

  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) {
    res.status(401).json({ success: false, error: 'Empty token' })
    return
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' })
    return
  }

  req.user = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    user_metadata: user.user_metadata,
  }

  // Forward the validated user ID to downstream services via header
  req.headers['x-user-id'] = user.id
  req.headers['x-user-email'] = user.email ?? ''
  req.headers['x-user-role'] = user.role ?? 'authenticated'

  next()
}
```

---

## Step 5: src/proxy.ts

Sets up all proxy routes. Public routes skip auth middleware; protected routes call `requireAuth` first.

```typescript
import { Router, Request, Response, NextFunction } from 'express'
import { createProxyMiddleware, Options } from 'http-proxy-middleware'
import { requireAuth, AuthenticatedRequest } from './middleware/auth'

const router = Router()

// ─── Helper: build proxy options ────────────────────────────────────────────

function makeProxy(target: string, pathRewrite?: Record<string, string>): ReturnType<typeof createProxyMiddleware> {
  const options: Options = {
    target,
    changeOrigin: true,
    // Pass pathRewrite only when provided
    ...(pathRewrite ? { pathRewrite } : {}),
    on: {
      error: (err: Error, _req: Request, res: Response) => {
        console.error(`[proxy] error → ${target}:`, err.message)
        // res may already be a ServerResponse — cast safely
        if (!res.headersSent) {
          (res as Response).status(502).json({ success: false, error: 'Upstream service unavailable' })
        }
      },
    },
  }
  return createProxyMiddleware(options)
}

// ─── Service URLs from env ────────────────────────────────────────────────────

const CATALOG_URL       = process.env.CATALOG_SERVICE_URL!
const ORDER_URL         = process.env.ORDER_SERVICE_URL!
const PAYMENT_URL       = process.env.PAYMENT_SERVICE_URL!
const DELIVERY_URL      = process.env.DELIVERY_SERVICE_URL!
const NOTIFICATION_URL  = process.env.NOTIFICATION_SERVICE_URL!
const WHATSAPP_URL      = process.env.WHATSAPP_SERVICE_URL!
const PAYOUT_URL        = process.env.PAYOUT_SERVICE_URL!
const ANALYTICS_URL     = process.env.ANALYTICS_SERVICE_URL!
const RETURN_URL        = process.env.RETURN_SERVICE_URL!
const ADMIN_URL         = process.env.ADMIN_SERVICE_URL!

// ─── Public routes (no auth) ──────────────────────────────────────────────────

// Razorpay payment webhook — must receive raw body; no auth
router.use('/api/payments/webhook', makeProxy(PAYMENT_URL))

// Gupshup WhatsApp webhook — public
router.use('/api/whatsapp/webhook', makeProxy(WHATSAPP_URL))

// Store discovery — public browse (GET /api/catalog/stores)
router.use('/api/catalog/stores', makeProxy(CATALOG_URL))

// ─── Protected routes (JWT required) ─────────────────────────────────────────

const auth = (req: Request, res: Response, next: NextFunction) =>
  requireAuth(req as AuthenticatedRequest, res, next)

router.use('/api/catalog',       auth, makeProxy(CATALOG_URL))
router.use('/api/orders',        auth, makeProxy(ORDER_URL))
router.use('/api/payments',      auth, makeProxy(PAYMENT_URL))
router.use('/api/delivery',      auth, makeProxy(DELIVERY_URL))
router.use('/api/notifications', auth, makeProxy(NOTIFICATION_URL))
router.use('/api/whatsapp',      auth, makeProxy(WHATSAPP_URL))
router.use('/api/payouts',       auth, makeProxy(PAYOUT_URL))
router.use('/api/analytics',     auth, makeProxy(ANALYTICS_URL))
router.use('/api/returns',       auth, makeProxy(RETURN_URL))
router.use('/api/admin',         auth, makeProxy(ADMIN_URL))

export { router }
```

---

## Step 6: src/index.ts

Main Express application. Applies global middleware, mounts the proxy router, and starts the server.

```typescript
import 'dotenv/config'
import * as Sentry from '@sentry/node'
import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { router } from './proxy'

// ─── Sentry init (before any other middleware) ────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.1,
  })
}

const app = express()
const PORT = process.env.PORT ?? 3000

// ─── Sentry request handler ───────────────────────────────────────────────────
app.use(Sentry.Handlers.requestHandler())

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:3000']

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, curl)
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      callback(new Error(`CORS: origin ${origin} not allowed`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Razorpay-Signature'],
  })
)

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Global limiter: 300 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
})

// Stricter limiter for auth-adjacent endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many auth attempts, please try again later' },
})

app.use(globalLimiter)
app.use('/api/payments/create-order', authLimiter)
app.use('/api/payments/verify', authLimiter)

// ─── Body parsing ─────────────────────────────────────────────────────────────
// NOTE: Do NOT parse body for webhook routes — proxy needs raw bytes.
// http-proxy-middleware streams the raw body through without parsing.
// For all other routes, json() is fine because proxy middleware intercepts first.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/api/payments/webhook' || req.path === '/api/whatsapp/webhook') {
    return next() // skip body parsing — pass raw to proxy
  }
  express.json({ limit: '10mb' })(req, res, next)
})

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    ts: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// ─── Proxy router ─────────────────────────────────────────────────────────────
app.use(router)

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' })
})

// ─── Sentry error handler ─────────────────────────────────────────────────────
app.use(Sentry.Handlers.errorHandler())

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api-gateway] unhandled error:', err.message)
  res.status(500).json({ success: false, error: 'Internal server error' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[api-gateway] running on :${PORT}`)
  console.log(`[api-gateway] environment: ${process.env.NODE_ENV}`)
})
```

---

## Step 7: Dockerfile

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

## How JWT Forwarding Works

When `requireAuth` validates a token it injects three headers before the proxy forwards the request downstream:

| Header | Value |
|---|---|
| `x-user-id` | Supabase user UUID |
| `x-user-email` | User email (may be empty) |
| `x-user-role` | `authenticated` or `service_role` |

Downstream services trust these headers **only from internal network traffic** (ECS VPC / docker-compose network). They never re-validate the JWT themselves, which keeps auth logic in one place.

---

## Public vs Protected Route Matrix

| Path pattern | Auth | Notes |
|---|---|---|
| `POST /api/payments/webhook` | None | Razorpay signs payload with HMAC |
| `POST /api/whatsapp/webhook` | None | Gupshup IP allowlist in production |
| `GET /api/catalog/stores` | None | Discovery / browse |
| `GET /api/catalog/stores/:slug` | None | Public storefront |
| `GET /api/catalog/stores/:id/products` | None | Public product listing |
| All other `/api/*` | JWT required | Gateway rejects before proxying |

---

## Done When

- [ ] `npm run dev` starts gateway on port 3000 without TypeScript errors
- [ ] `GET /health` returns `{ status: 'ok', service: 'api-gateway' }`
- [ ] Request with no `Authorization` header to `/api/orders` returns `401`
- [ ] Valid Supabase JWT on `/api/orders` is proxied to order-service (502 expected if order-service not running)
- [ ] `GET /api/catalog/stores` proxies without auth header
- [ ] `POST /api/payments/webhook` proxies without auth header
- [ ] `curl` from an unlisted origin returns CORS error
- [ ] Sending 301+ requests in 15 minutes from same IP returns `429`
- [ ] Docker image builds with `docker build -t reelmart-api-gateway .`
- [ ] `docker compose up api-gateway` starts and `/health` responds
