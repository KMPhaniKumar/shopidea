/**
 * whatsapp-service — authorization & webhook signature tests
 *
 * Tests verify the security sweep fix for LOW-3:
 *  - When GUPSHUP_WEBHOOK_SECRET is set:
 *    - POST /webhook with no X-Gupshup-Signature header → 401
 *    - POST /webhook with wrong signature → 401
 *    - POST /webhook with correct HMAC signature → 200 (accepted)
 *  - When GUPSHUP_WEBHOOK_SECRET is NOT set:
 *    - POST /webhook passes through (warn-only mode) → 200
 *  - POST /broadcast: requires auth (401 without token) and store ownership (403)
 *
 * Mock strategy: mock lib/supabase.ts + lib/gupshup.ts + bot/handler.ts
 * by absolute path.  No real Gupshup or Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import {
  SELLER, OTHER_SELLER, STORE, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Mock Gupshup sender ────────────────────────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/lib/gupshup',
  () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }),
)

// ── 3. Mock the bot handler so webhook processing doesn't blow up ─────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/bot/handler',
  () => ({ handleBotMessage: vi.fn().mockResolvedValue(undefined) }),
)

// ── 4. Test app ───────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { whatsappRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/routes/whatsapp'
  )
  app = express()
  app.use(express.json())
  app.use('/api/whatsapp', whatsappRouter)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function authAs(identity: { id: string }) {
  mockGetUser.mockResolvedValue({
    data: { user: makeSupabaseUser(identity) },
    error: null,
  })
}

function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

function makeQueryBuilder(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: () => builder,
      insert: () => builder,
      eq: () => builder,
      then: (fn: any) => Promise.resolve(result).then(fn),
      single: () => result,
    }
    return builder
  }
}

/** Compute a valid Gupshup HMAC-SHA256 signature for a body and secret */
function makeGupshupSignature(body: object, secret: string): string {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
}

const WEBHOOK_BODY = {
  payload: {
    sender: { phone: '919999900001' },
    payload: { text: 'hi' },
  },
}

const WEBHOOK_SECRET = 'test-gupshup-webhook-secret'

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── POST /api/whatsapp/webhook (with secret configured) ───────────────────────

describe('POST /api/whatsapp/webhook — LOW-3: Gupshup signature enforcement', () => {
  let originalSecret: string | undefined

  beforeAll(() => {
    originalSecret = process.env.GUPSHUP_WEBHOOK_SECRET
    process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  afterAll(() => {
    // Restore original value (undefined if unset)
    if (originalSecret === undefined) {
      delete process.env.GUPSHUP_WEBHOOK_SECRET
    } else {
      process.env.GUPSHUP_WEBHOOK_SECRET = originalSecret
    }
  })

  it('rejects request with no X-Gupshup-Signature header → 401 — LOW-3 fix', async () => {
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: 'test-store' })
      .send(WEBHOOK_BODY)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_MISSING')
  })

  it('rejects request with wrong signature → 401 — LOW-3 fix', async () => {
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: 'test-store' })
      .set('x-gupshup-signature', 'deadbeef'.repeat(8)) // 64 hex chars, wrong value
      .send(WEBHOOK_BODY)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('accepts request with correct HMAC signature — LOW-3 fix', async () => {
    const validSig = makeGupshupSignature(WEBHOOK_BODY, WEBHOOK_SECRET)
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: 'test-store' })
      .set('x-gupshup-signature', validSig)
      .send(WEBHOOK_BODY)
    // Webhook handler sends 200 immediately and processes async
    expect(res.status).toBe(200)
  })
})

// ── POST /api/whatsapp/webhook (secret NOT configured — warn-only mode) ───────

describe('POST /api/whatsapp/webhook — LOW-3: pass-through when secret unset', () => {
  let originalSecret: string | undefined

  beforeAll(() => {
    originalSecret = process.env.GUPSHUP_WEBHOOK_SECRET
    delete process.env.GUPSHUP_WEBHOOK_SECRET
  })

  afterAll(() => {
    if (originalSecret !== undefined) {
      process.env.GUPSHUP_WEBHOOK_SECRET = originalSecret
    }
  })

  it('passes through without signature when secret is not configured', async () => {
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: 'test-store' })
      .send(WEBHOOK_BODY)
    // No signature provided, no secret set → warn and pass
    expect(res.status).toBe(200)
  })
})

// ── POST /api/whatsapp/broadcast — auth + ownership ───────────────────────────

describe('POST /api/whatsapp/broadcast — auth and store ownership', () => {
  let originalSecret: string | undefined

  beforeAll(() => {
    // Make sure webhook secret doesn't interfere with broadcast test setup
    originalSecret = process.env.GUPSHUP_WEBHOOK_SECRET
  })

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.GUPSHUP_WEBHOOK_SECRET
    } else {
      process.env.GUPSHUP_WEBHOOK_SECRET = originalSecret
    }
  })

  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .send({ storeId: STORE.id, message: 'Hello customers!' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when message is missing', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { id: STORE.id }, error: null },
    }))
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id }) // missing message
    expect(res.status).toBe(400)
  })

  it('returns 403 when caller does not own the store', async () => {
    authAs(OTHER_SELLER)
    // Ownership: stores.select('id').eq('id',storeId).eq('seller_id',OTHER_SELLER.id) → null
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ storeId: STORE.id, message: 'Broadcast from attacker' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the owning seller to send a broadcast', async () => {
    authAs(SELLER)
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQueryBuilder({ stores: { data: { id: STORE.id }, error: null } })(table)
      }
      if (table === 'orders') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
        }
        return builder
      }
      if (table === 'broadcasts') {
        const builder: any = {
          insert: () => builder,
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'New arrivals this week!' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.sent).toBe('number')
  })
})
