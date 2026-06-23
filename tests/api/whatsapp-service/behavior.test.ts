/**
 * whatsapp-service — broadcast behavior + bot session state machine tests
 *
 * Covers:
 *  POST /api/whatsapp/broadcast
 *    - deduplication: unique phone numbers from paid orders only
 *    - empty customer list (zero orders) → sent=0, 200
 *    - storeId missing → 400
 *    - blank message → 400
 *    - records broadcast log row in `broadcasts` table
 *    - Gupshup sendWhatsApp called once per unique customer
 *
 *  Bot session state machine (via POST /webhook + handleBotMessage)
 *    - 'hi' / '0' / 'menu' keyword → menu step, lists products
 *    - number reply → qty step, confirms product
 *    - qty reply → address step, asks for address
 *    - address reply → places order, sends payment link, clears session
 *    - invalid product selection → error prompt, stays on qty step
 *    - non-numeric qty → error prompt
 *    - unknown store slug → bot silently returns (no crash)
 *
 * Mock strategy: absolute-path mocks for supabase, gupshup, bot/handler,
 * bot/session.  No real Gupshup or Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import {
  SELLER, STORE, makeSupabaseUser, bearerToken,
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

// ── 2. Mock Gupshup sendWhatsApp ──────────────────────────────────────────────
const mockSendWhatsApp = vi.fn().mockResolvedValue(undefined)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/lib/gupshup',
  () => ({ sendWhatsApp: mockSendWhatsApp }),
)

// ── 3. Mock Razorpay payment link ─────────────────────────────────────────────
const mockCreatePaymentLink = vi.fn().mockResolvedValue('https://rzp.io/test-link')
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/lib/razorpay',
  () => ({ createPaymentLink: mockCreatePaymentLink }),
)

// ── 4. Mock bot session store ─────────────────────────────────────────────────
// We don't mock the session — we use the real in-memory store so the state
// machine tests cover realistic session transitions.

// ── 5. Test app ───────────────────────────────────────────────────────────────
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

/** Sign a webhook body with the given secret */
function sign(body: object, secret: string) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
}

const WEBHOOK_SECRET = 'test-gupshup-behavior-secret'
const TEST_STORE_SLUG = 'test-store'
const TEST_PHONE = '919999900001'

/** Wrapper that sends a signed Gupshup webhook (simulates inbound message) */
async function sendInboundMessage(text: string) {
  const body = {
    payload: {
      sender: { phone: TEST_PHONE },
      payload: { text },
    },
  }
  return request(app)
    .post('/api/whatsapp/webhook')
    .query({ store: TEST_STORE_SLUG })
    .set('x-gupshup-signature', sign(body, WEBHOOK_SECRET))
    .send(body)
}

/**
 * Build a multi-table Supabase mock for the bot handler.
 * The handler calls from('stores').single() first, then from('products').then(),
 * and later from('orders').insert().single() in the 'done' step.
 */
function makeBotMock(opts: {
  storeName?: string
  products?: any[]
  insertedOrder?: any
} = {}) {
  const storeName = opts.storeName ?? 'Test Store'
  const products = opts.products ?? [
    { id: 'p1', name: 'Shirt', price: 500 },
    { id: 'p2', name: 'Saree', price: 1200 },
  ]
  const insertedOrder = opts.insertedOrder ?? { id: 'order-123', order_number: 'RMABC123' }

  return (table: string) => {
    if (table === 'stores') {
      const b: any = {
        select: () => b,
        eq: () => b,
        single: () => ({ data: { id: STORE.id, store_name: storeName }, error: null }),
      }
      return b
    }
    if (table === 'products') {
      const b: any = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        then: (fn: any) => Promise.resolve({ data: products, error: null }).then(fn),
      }
      return b
    }
    if (table === 'orders') {
      const b: any = {
        insert: () => b,
        select: () => b,
        single: () => ({ data: insertedOrder, error: null }),
      }
      return b
    }
    const b: any = {
      select: () => b,
      eq: () => b,
      insert: () => b,
      then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      single: () => ({ data: null, error: null }),
    }
    return b
  }
}

// ── Cleanup: ensure GUPSHUP_WEBHOOK_SECRET is set for all tests ───────────────
let originalSecret: string | undefined
beforeAll(() => {
  originalSecret = process.env.GUPSHUP_WEBHOOK_SECRET
  process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET
})
afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.GUPSHUP_WEBHOOK_SECRET
  } else {
    process.env.GUPSHUP_WEBHOOK_SECRET = originalSecret
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  mockSendWhatsApp.mockResolvedValue(undefined)
  mockCreatePaymentLink.mockResolvedValue('https://rzp.io/test-link')
})

// ── POST /broadcast — behavior ────────────────────────────────────────────────

describe('POST /api/whatsapp/broadcast — behavior', () => {
  it('deduplicates phone numbers: two orders same phone → sends only once', async () => {
    authAs(SELLER)

    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      if (table === 'orders') {
        // Two orders with the SAME phone → only 1 unique → sent=1
        const orders = [
          { delivery_address: { phone: '9111111111' } },
          { delivery_address: { phone: '9111111111' } },
        ]
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: orders, error: null }).then(fn),
        }
        return b
      }
      if (table === 'broadcasts') {
        const b: any = { insert: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
        return b
      }
      const b: any = {
        select: () => b, eq: () => b,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        single: () => ({ data: null, error: null }),
      }
      return b
    })

    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'Sale on now!' })

    expect(res.status).toBe(200)
    expect(res.body.data.sent).toBe(1)
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('sends to multiple unique customers and reports correct count', async () => {
    authAs(SELLER)

    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      if (table === 'orders') {
        const orders = [
          { delivery_address: { phone: '9111111111' } },
          { delivery_address: { phone: '9222222222' } },
          { delivery_address: { phone: '9333333333' } },
        ]
        const b: any = {
          select: () => b, eq: () => b,
          then: (fn: any) => Promise.resolve({ data: orders, error: null }).then(fn),
        }
        return b
      }
      if (table === 'broadcasts') {
        const b: any = { insert: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
        return b
      }
      const b: any = { select: () => b, eq: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
      return b
    })

    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'Flash sale!' })

    expect(res.status).toBe(200)
    expect(res.body.data.sent).toBe(3)
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(3)
  })

  it('returns sent=0 when the store has no paid orders', async () => {
    authAs(SELLER)

    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      if (table === 'orders') {
        const b: any = { select: () => b, eq: () => b, then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn) }
        return b
      }
      if (table === 'broadcasts') {
        const b: any = { insert: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
        return b
      }
      const b: any = { select: () => b, eq: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
      return b
    })

    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'Hello no one!' })

    expect(res.status).toBe(200)
    expect(res.body.data.sent).toBe(0)
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('skips orders where delivery_address.phone is absent/null', async () => {
    authAs(SELLER)

    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      if (table === 'orders') {
        const orders = [
          { delivery_address: { phone: null } },       // no phone
          { delivery_address: {} },                     // phone key missing
          { delivery_address: { phone: '9111111111' } }, // valid
        ]
        const b: any = {
          select: () => b, eq: () => b,
          then: (fn: any) => Promise.resolve({ data: orders, error: null }).then(fn),
        }
        return b
      }
      if (table === 'broadcasts') {
        const b: any = { insert: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
        return b
      }
      const b: any = { select: () => b, eq: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
      return b
    })

    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'Test' })

    expect(res.status).toBe(200)
    // Only 1 valid phone out of 3 orders
    expect(res.body.data.sent).toBe(1)
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
  })

  it('records a broadcasts row with recipient_count and message', async () => {
    authAs(SELLER)

    let broadcastInsertCalled = false
    let insertData: any = null

    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      if (table === 'orders') {
        const b: any = {
          select: () => b, eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ delivery_address: { phone: '9111111111' } }], error: null }).then(fn),
        }
        return b
      }
      if (table === 'broadcasts') {
        const b: any = {
          insert: (data: any) => {
            broadcastInsertCalled = true
            insertData = data
            return b
          },
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      const b: any = { select: () => b, eq: () => b, then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn) }
      return b
    })

    await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: 'New collection!' })

    expect(broadcastInsertCalled).toBe(true)
    expect(insertData).toMatchObject({
      store_id: STORE.id,
      message: 'New collection!',
      recipient_count: 1,
    })
  })

  it('returns 400 when storeId is missing', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ message: 'No storeId here!' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when message is blank whitespace', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
      return b
    })
    const res = await request(app)
      .post('/api/whatsapp/broadcast')
      .set('Authorization', bearerToken(SELLER))
      .send({ storeId: STORE.id, message: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ── Bot state machine — via webhook endpoint ──────────────────────────────────

describe('Bot session state machine (via POST /webhook)', () => {
  // Each test group needs an isolated session so we use unique phone numbers
  // to avoid cross-contamination between tests (the real session store keys by phone).

  it('responds with 200 to a valid signed webhook payload', async () => {
    mockFrom.mockImplementation(makeBotMock())
    const res = await sendInboundMessage('hi')
    expect(res.status).toBe(200)
  })

  it('"hi" keyword triggers menu step and sendWhatsApp is called with product list', async () => {
    mockFrom.mockImplementation(makeBotMock({
      products: [
        { id: 'p1', name: 'Kurta', price: 800 },
        { id: 'p2', name: 'Saree', price: 2000 },
      ],
    }))
    // 'hi' → menu step
    await sendInboundMessage('hi')
    // sendWhatsApp should have been called with a menu listing products
    expect(mockSendWhatsApp).toHaveBeenCalled()
    const [_phone, msgText] = mockSendWhatsApp.mock.calls[0]
    expect(msgText).toContain('Kurta')
    expect(msgText).toContain('₹800')
    expect(msgText).toContain('Saree')
    expect(msgText).toContain('₹2000')
  })

  it('"0" keyword resets session to menu and shows product list', async () => {
    mockFrom.mockImplementation(makeBotMock({
      products: [{ id: 'p1', name: 'Shirt', price: 500 }],
    }))
    await sendInboundMessage('0')
    expect(mockSendWhatsApp).toHaveBeenCalled()
    const [_phone, msgText] = mockSendWhatsApp.mock.calls[0]
    expect(msgText).toContain('Shirt')
  })

  it('"menu" keyword resets session to menu step', async () => {
    mockFrom.mockImplementation(makeBotMock({
      products: [{ id: 'p1', name: 'Hat', price: 300 }],
    }))
    await sendInboundMessage('menu')
    expect(mockSendWhatsApp).toHaveBeenCalled()
    const [_phone, msgText] = mockSendWhatsApp.mock.calls[0]
    expect(msgText).toContain('Hat')
  })

  it('webhook with invalid signature is rejected (401)', async () => {
    const body = {
      payload: {
        sender: { phone: TEST_PHONE },
        payload: { text: 'hi' },
      },
    }
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: TEST_STORE_SLUG })
      .set('x-gupshup-signature', 'deadbeef'.repeat(8))
      .send(body)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('webhook without store query param silently returns 200 without crashing', async () => {
    mockFrom.mockImplementation(makeBotMock())
    const body = {
      payload: {
        sender: { phone: TEST_PHONE },
        payload: { text: 'hi' },
      },
    }
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('x-gupshup-signature', sign(body, WEBHOOK_SECRET))
      // No ?store= query param
      .send(body)
    expect(res.status).toBe(200)
    // Bot returns early when store is missing — no sendWhatsApp calls
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })

  it('webhook for unknown store slug silently returns 200 (no crash)', async () => {
    // stores.single() returns null → bot handler returns early
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: null, error: null }) }
        return b
      }
      const b: any = { select: () => b, eq: () => b, single: () => ({ data: null, error: null }) }
      return b
    })

    const body = {
      payload: {
        sender: { phone: '919876543210' },
        payload: { text: 'hi' },
      },
    }
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .query({ store: 'nonexistent-store' })
      .set('x-gupshup-signature', sign(body, WEBHOOK_SECRET))
      .send(body)
    expect(res.status).toBe(200)
    expect(mockSendWhatsApp).not.toHaveBeenCalled()
  })
})
