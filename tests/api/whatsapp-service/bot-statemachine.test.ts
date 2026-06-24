/**
 * whatsapp-service — deterministic bot state-machine tests
 *
 * These tests drive a multi-step conversation (greeting → browse → select →
 * confirm → address) through the real in-memory session store, using
 * resetAllSessions() in beforeEach so every test starts with a clean slate
 * without needing unique phone numbers per case.
 *
 * Mock strategy:
 *  - supabase, gupshup, razorpay: mocked by absolute path (no real traffic)
 *  - bot/session: real module — state transitions are the thing under test
 *  - Webhook signed with HMAC-SHA256 to pass signature verification
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────
const mockFrom = vi.fn()
const supabaseAdminMock = {
  auth: { getUser: vi.fn() },
  from: mockFrom,
}
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Mock Gupshup — capture sent messages ───────────────────────────────────
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

// ── 4. bot/session: real module (NOT mocked) so state transitions are real ────

// ── 5. Test app + constants ───────────────────────────────────────────────────
let app: express.Application
const WEBHOOK_SECRET = 'test-bot-sm-secret'
const TEST_PHONE = '919000000001'
const TEST_STORE_SLUG = 'test-store-sm'

const STORE_ID = 'store-sm-001'
const STORE_NAME = 'SM Test Store'

const PRODUCTS = [
  { id: 'p1', name: 'Kurta', price: 800 },
  { id: 'p2', name: 'Saree', price: 2000 },
]

const INSERTED_ORDER = { id: 'order-sm-001', order_number: 'RMSM001' }

beforeAll(async () => {
  process.env.GUPSHUP_WEBHOOK_SECRET = WEBHOOK_SECRET

  const { whatsappRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/routes/whatsapp'
  )
  app = express()
  app.use(express.json())
  app.use('/api/whatsapp', whatsappRouter)
})

afterAll(() => {
  delete process.env.GUPSHUP_WEBHOOK_SECRET
})

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sign a webhook body and POST it as a simulated inbound WhatsApp message */
async function sendMessage(text: string) {
  const body = {
    payload: {
      sender: { phone: TEST_PHONE },
      payload: { text },
    },
  }
  const sig = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex')
  return request(app)
    .post('/api/whatsapp/webhook')
    .query({ store: TEST_STORE_SLUG })
    .set('x-gupshup-signature', sig)
    .send(body)
}

/** Standard Supabase mock covering stores → products → orders for the handler */
function buildBotMock() {
  return (table: string) => {
    if (table === 'stores') {
      const b: any = {
        select: () => b,
        eq: () => b,
        single: () => ({ data: { id: STORE_ID, store_name: STORE_NAME }, error: null }),
      }
      return b
    }
    if (table === 'products') {
      const b: any = {
        select: () => b,
        eq: () => b,
        limit: () => b,
        then: (fn: any) => Promise.resolve({ data: PRODUCTS, error: null }).then(fn),
      }
      return b
    }
    if (table === 'orders') {
      const b: any = {
        insert: () => b,
        select: () => b,
        single: () => ({ data: INSERTED_ORDER, error: null }),
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

// Convenience: wait a tick so async webhook processing completes before asserting
function tick() { return new Promise(r => setImmediate(r)) }

// ── beforeEach: clear session and mocks for every test ───────────────────────
// Import the real session module so we can call resetAllSessions().
// The dynamic import is resolved at test run time after mocks are set up.
let resetAllSessions: () => void
let getSession: (phone: string) => any

beforeAll(async () => {
  const sessionMod = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/whatsapp-service/src/bot/session'
  )
  resetAllSessions = sessionMod.resetAllSessions
  getSession = sessionMod.getSession
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSendWhatsApp.mockResolvedValue(undefined)
  mockCreatePaymentLink.mockResolvedValue('https://rzp.io/test-link')
  mockFrom.mockImplementation(buildBotMock())
  // KEY: reset session store so each test has a clean slate with the same phone
  resetAllSessions()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bot state machine — greeting triggers menu step', () => {
  it('"hi" message → sendWhatsApp called with product names and prices', async () => {
    const res = await sendMessage('hi')
    expect(res.status).toBe(200)
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [sentPhone, sentText] = mockSendWhatsApp.mock.calls[0]
    expect(sentPhone).toBe(TEST_PHONE)
    expect(sentText).toContain('Kurta')
    expect(sentText).toContain('₹800')
    expect(sentText).toContain('Saree')
    expect(sentText).toContain('₹2000')
  })

  it('"0" message → same menu listing as "hi"', async () => {
    const res = await sendMessage('0')
    expect(res.status).toBe(200)
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, sentText] = mockSendWhatsApp.mock.calls[0]
    expect(sentText).toContain('Kurta')
    expect(sentText).toContain('Saree')
  })

  it('"MENU" (uppercase) → menu step (case-insensitive keyword)', async () => {
    const res = await sendMessage('MENU')
    expect(res.status).toBe(200)
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, sentText] = mockSendWhatsApp.mock.calls[0]
    expect(sentText).toContain('Kurta')
  })
})

describe('Bot state machine — greeting → product selection', () => {
  it('step 1 "hi" transitions to qty step; step 2 "1" selects first product', async () => {
    // Step 1: greeting → menu shown, session moves to qty step
    await sendMessage('hi')
    await tick()
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
    const [, menuText] = mockSendWhatsApp.mock.calls[0]
    expect(menuText).toContain('Kurta')

    // Step 2: "1" selects Kurta → bot confirms product and asks for quantity
    vi.clearAllMocks()
    await sendMessage('1')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, qtyPrompt] = mockSendWhatsApp.mock.calls[0]
    expect(qtyPrompt).toContain('Kurta')
    expect(qtyPrompt).toContain('₹800')
    // Prompt should ask how many
    expect(qtyPrompt.toLowerCase()).toMatch(/how many|quantity/i)
  })

  it('invalid product number → error prompt, sendWhatsApp sends error message', async () => {
    // First get into qty step
    await sendMessage('hi')
    await tick()

    vi.clearAllMocks()
    // Reply with "99" — out of range
    await sendMessage('99')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, errorText] = mockSendWhatsApp.mock.calls[0]
    expect(errorText).toMatch(/valid number|valid/i)
  })
})

describe('Bot state machine — greeting → select → quantity', () => {
  it('step 1 "hi" → step 2 "2" selects second product → step 3 "1" asks for address', async () => {
    // Step 1: greeting
    await sendMessage('hi')
    await tick()

    // Step 2: select Saree (index 2)
    vi.clearAllMocks()
    await sendMessage('2')
    await tick()
    const [, productConfirm] = mockSendWhatsApp.mock.calls[0]
    expect(productConfirm).toContain('Saree')

    // Step 3: quantity "1" → bot asks for delivery address
    vi.clearAllMocks()
    await sendMessage('1')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, addressPrompt] = mockSendWhatsApp.mock.calls[0]
    expect(addressPrompt.toLowerCase()).toMatch(/address|delivery/i)
    expect(addressPrompt).toContain('Saree')
  })

  it('non-numeric quantity → error prompt, session stays in address step', async () => {
    // Get to the address step
    await sendMessage('hi')
    await tick()
    await sendMessage('1')
    await tick()

    vi.clearAllMocks()
    // Send "abc" instead of a number
    await sendMessage('abc')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, errText] = mockSendWhatsApp.mock.calls[0]
    expect(errText).toMatch(/valid quantity|valid/i)
  })

  it('"0" mid-flow resets to menu (keyword takes priority over qty parsing)', async () => {
    // Note: the handler checks ['hi', '0', 'menu'] BEFORE the switch, so '0'
    // always resets to menu regardless of the current step — it cannot be used
    // as a quantity value.
    await sendMessage('hi')
    await tick()
    await sendMessage('1')  // select product → address step
    await tick()

    vi.clearAllMocks()
    await sendMessage('0')  // '0' is the menu-reset keyword
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, resetText] = mockSendWhatsApp.mock.calls[0]
    // Bot should show the menu again, not an error
    expect(resetText).toContain('Kurta')
    expect(resetText).toContain('Saree')
  })
})

describe('Bot state machine — full happy path: greeting → select → qty → address → order placed', () => {
  it('drives all four steps and receives a payment link at the end', async () => {
    // Step 1: greeting → menu
    await sendMessage('hi')
    await tick()
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)

    // Step 2: select product 1 (Kurta)
    vi.clearAllMocks()
    await sendMessage('1')
    await tick()
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
    const [, qtyPrompt] = mockSendWhatsApp.mock.calls[0]
    expect(qtyPrompt).toContain('Kurta')

    // Step 3: quantity
    vi.clearAllMocks()
    await sendMessage('2')
    await tick()
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
    const [, addrPrompt] = mockSendWhatsApp.mock.calls[0]
    expect(addrPrompt.toLowerCase()).toMatch(/address|delivery/i)

    // Step 4: delivery address → order placed, payment link sent
    vi.clearAllMocks()
    await sendMessage('Ravi Kumar, 12 MG Road, Bengaluru, 560001')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1)
    const [, orderConfirm] = mockSendWhatsApp.mock.calls[0]
    // Should mention the product, total and the payment link
    expect(orderConfirm).toContain('Kurta')
    expect(orderConfirm).toContain('https://rzp.io/test-link')
    // Total = 800*2 + 60 delivery = 1660
    expect(orderConfirm).toContain('1660')

    // createPaymentLink must have been called with correct total
    expect(mockCreatePaymentLink).toHaveBeenCalledOnce()
    const [orderId, total] = mockCreatePaymentLink.mock.calls[0]
    expect(orderId).toBe(INSERTED_ORDER.id)
    expect(total).toBe(1660)

    // After order completion: clearSession() is called inside the done branch,
    // but handler.ts calls setSession() unconditionally after the switch, so
    // the session object is re-persisted. The conversation can be restarted
    // with 'hi' without issues — verify that 'hi' now shows the menu again.
    vi.clearAllMocks()
    await sendMessage('hi')
    await tick()
    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, restartText] = mockSendWhatsApp.mock.calls[0]
    expect(restartText).toContain('Kurta')
  })

  it('"0" mid-flow resets to menu and starts fresh', async () => {
    // Get into the qty step
    await sendMessage('hi')
    await tick()
    await sendMessage('1')
    await tick()

    // Send "0" → should reset to menu
    vi.clearAllMocks()
    await sendMessage('0')
    await tick()

    expect(mockSendWhatsApp).toHaveBeenCalledOnce()
    const [, resetText] = mockSendWhatsApp.mock.calls[0]
    // Menu should be shown again
    expect(resetText).toContain('Kurta')
    expect(resetText).toContain('Saree')
  })
})

describe('Bot state machine — resetAllSessions isolation guarantee', () => {
  it('second test sees no leftover session from previous test', async () => {
    // Drive a step so a session exists for TEST_PHONE
    await sendMessage('hi')
    await tick()
    // Session is active after greeting
    expect(getSession(TEST_PHONE)).not.toBeNull()
    // (beforeEach will reset between tests)
  })

  it('session is null at start of this test — confirming beforeEach reset worked', () => {
    // No message sent yet in this test; resetAllSessions() in beforeEach should have cleared it
    expect(getSession(TEST_PHONE)).toBeNull()
  })
})
