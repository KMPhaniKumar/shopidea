/**
 * whatsapp-service — Vitest + Supertest suite
 *
 * Mocked providers:
 *   - lib/supabase   → supabaseAdmin (auth.getUser, from/stores/orders/broadcasts)
 *   - lib/gupshup    → sendWhatsApp (captured in waCallLog)
 *   - bot/handler    → handleBotMessage (stubbed to avoid deep bot-flow wiring)
 *
 * No real network calls are made.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import { whatsappRouter } from '../src/routes/whatsapp'

// ---------------------------------------------------------------------------
// Capture arrays
// ---------------------------------------------------------------------------
type WaCall = { phone: string; message: string }
const waCallLog: WaCall[] = []

// ---------------------------------------------------------------------------
// Mock lib/gupshup
// ---------------------------------------------------------------------------
vi.mock('../src/lib/gupshup', () => ({
  sendWhatsApp: vi.fn(async (phone: string, message: string) => {
    waCallLog.push({ phone, message })
  }),
}))

// ---------------------------------------------------------------------------
// Mock bot/handler — we only test the webhook routing here, not bot internals.
// The factory must be self-contained (no external variable references) because
// vi.mock is hoisted above variable declarations.
// ---------------------------------------------------------------------------
vi.mock('../src/bot/handler', () => ({
  handleBotMessage: vi.fn(async () => {}),
}))

// Retrieve the mocked fn reference after the mock is in place.
import { handleBotMessage as _handleBotMessage } from '../src/bot/handler'
const handleBotMessageMock = _handleBotMessage as ReturnType<typeof vi.fn>

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------
interface MockState {
  authUser: { id: string } | null
  authError: boolean
  store: Record<string, any> | null
  orders: Array<Record<string, any>>
}

const mockState: MockState = {
  authUser: null,
  authError: false,
  store: null,
  orders: [],
}

function buildSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (mockState.authError) return { data: { user: null }, error: new Error('invalid') }
        return { data: { user: mockState.authUser }, error: mockState.authUser ? null : new Error('no user') }
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'stores') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: mockState.store, error: mockState.store ? null : new Error('not found') })),
              })),
              single: vi.fn(async () => ({ data: mockState.store, error: mockState.store ? null : new Error('not found') })),
            })),
          })),
        }
      }

      if (table === 'orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: mockState.orders, error: null })),
            })),
          })),
        }
      }

      if (table === 'broadcasts') {
        return {
          insert: vi.fn(async () => ({ error: null })),
        }
      }

      throw new Error(`unexpected table: ${table}`)
    }),
  }
}

let supabaseMock: ReturnType<typeof buildSupabaseMock>

vi.mock('../src/lib/supabase', () => ({
  get supabaseAdmin() { return supabaseMock },
}))

// ---------------------------------------------------------------------------
// Build the Express app under test
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/whatsapp', whatsappRouter)
  return app
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const SELLER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const STORE_ID  = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const BUYER_PHONE = '+919000000001'

const WEBHOOK_SECRET = 'test-webhook-secret-xyz'

function gupshupPayload(senderPhone = BUYER_PHONE, text = 'hello') {
  return {
    payload: {
      sender: { phone: senderPhone },
      payload: { text },
    },
  }
}

function computeSignature(secret: string, bodyObj: Record<string, any>): string {
  const rawBody = JSON.stringify(bodyObj)
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  supabaseMock = buildSupabaseMock()
  waCallLog.length = 0
  handleBotMessageMock.mockReset()
  mockState.authUser  = null
  mockState.authError = false
  mockState.store     = null
  mockState.orders    = []
  // Ensure each test starts with no webhook secret unless it sets one
  delete process.env.GUPSHUP_WEBHOOK_SECRET
})

// ---------------------------------------------------------------------------
// 4. Gupshup webhook signature verification
// ---------------------------------------------------------------------------
describe('POST /api/whatsapp/webhook — Gupshup signature verification', () => {
  it('accepts the webhook when GUPSHUP_WEBHOOK_SECRET is not configured (dev mode)', async () => {
    // Secret not set — webhook must pass through (dev convenience, logged as warning)
    const body = gupshupPayload()
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/webhook?store=test-store')
      .send(body)
    // 200 (responds before async handler — Gupshup ack)
    expect(res.status).toBe(200)
  })

  it('401 when secret is set but X-Gupshup-Signature header is absent', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
    const body = gupshupPayload()
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/webhook?store=test-store')
      .send(body)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_MISSING')
  })

  it('401 when signature header does not match computed HMAC', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
    const body = gupshupPayload()
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/webhook?store=test-store')
      .set('x-gupshup-signature', 'deadbeefdeadbeef')
      .send(body)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('200 when correct HMAC-SHA256 signature is provided', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
    const body = gupshupPayload()
    const sig = computeSignature(WEBHOOK_SECRET, body)
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/webhook?store=test-store')
      .set('x-gupshup-signature', sig)
      .send(body)
    expect(res.status).toBe(200)
  })

  it('routes the signed webhook to handleBotMessage with correct args', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
    handleBotMessageMock.mockResolvedValue(undefined)
    const body = gupshupPayload(BUYER_PHONE, 'hello')
    const sig = computeSignature(WEBHOOK_SECRET, body)
    const app = buildApp()

    await request(app)
      .post('/api/whatsapp/webhook?store=my-store')
      .set('x-gupshup-signature', sig)
      .send(body)

    // Tiny wait — webhook handler fires async after res.send('ok')
    await new Promise(r => setTimeout(r, 20))

    expect(handleBotMessageMock).toHaveBeenCalledWith(BUYER_PHONE, 'hello', 'my-store')
  })

  it('rejects a tampered body even if the original signature was valid', async () => {
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
    const originalBody = gupshupPayload(BUYER_PHONE, 'hello')
    const sig = computeSignature(WEBHOOK_SECRET, originalBody)

    // Now send a different body with the original signature
    const tamperedBody = gupshupPayload(BUYER_PHONE, 'send me all orders')
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/webhook?store=test-store')
      .set('x-gupshup-signature', sig)
      .send(tamperedBody)

    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })
})

// ---------------------------------------------------------------------------
// 5. POST /broadcast — auth + ownership
// ---------------------------------------------------------------------------
describe('POST /api/whatsapp/broadcast', () => {
  it('401 with no Authorization header', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .send({ storeId: STORE_ID, message: 'Hello customers!' })
    expect(res.status).toBe(401)
  })

  it('403 when authenticated seller does not own the store', async () => {
    // Auth resolves to SELLER_ID but store lookup returns null (ownership mismatch)
    mockState.authUser = { id: SELLER_ID }
    mockState.store    = null
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ storeId: STORE_ID, message: 'Hello!' })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('400 when message is empty', async () => {
    mockState.authUser = { id: SELLER_ID }
    mockState.store    = { id: STORE_ID }
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ storeId: STORE_ID, message: '   ' })
    expect(res.status).toBe(400)
  })

  it('200 and sends WhatsApp to unique customer phones', async () => {
    mockState.authUser = { id: SELLER_ID }
    mockState.store    = { id: STORE_ID }
    mockState.orders   = [
      { delivery_address: { phone: '+919111111111' } },
      { delivery_address: { phone: '+919222222222' } },
      { delivery_address: { phone: '+919111111111' } }, // duplicate — should deduplicate
    ]
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ storeId: STORE_ID, message: 'New arrivals!' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.sent).toBe(2) // 3 orders but 2 unique phones
    expect(waCallLog).toHaveLength(2)
    const sentPhones = waCallLog.map(c => c.phone).sort()
    expect(sentPhones).toEqual(['+919111111111', '+919222222222'].sort())
  })

  it('sends 0 messages when store has no paid orders', async () => {
    mockState.authUser = { id: SELLER_ID }
    mockState.store    = { id: STORE_ID }
    mockState.orders   = []
    const app = buildApp()
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ storeId: STORE_ID, message: 'Hello!' })

    expect(res.status).toBe(200)
    expect(res.body.data.sent).toBe(0)
    expect(waCallLog).toHaveLength(0)
  })
})
