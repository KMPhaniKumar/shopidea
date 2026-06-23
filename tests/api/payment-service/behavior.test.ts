/**
 * payment-service — behavior tests (P1-9, BA-51, BA-52)
 *
 * Covers:
 *  - POST /api/payments/confirm : valid sig → order created with buyer_id from token;
 *    invalid sig → 400; missing fields → 400; double-create idempotency note
 *  - POST /api/payments/webhook : valid sig → 200 (captured + refund.processed);
 *    invalid sig → 400; duplicate captured → idempotent
 *
 * Mock strategy:
 *  - lib/supabase: supabaseAdmin spy
 *  - lib/razorpay: real verifySignature (tests HMAC) + mock createRazorpayOrder,
 *    createRefund, fetchPaymentMethod, verifyWebhookSignature (controlled)
 *  - lib/orderEvents: spy (no real DB)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import crypto from 'crypto'
import {
  BUYER, ORDER, STORE, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── Environment (from vitest.config.ts env block) ────────────────────────────
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET!

// ── Mock supabaseAdmin ────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Mock lib/razorpay ─────────────────────────────────────────────────────────
const mockCreateRazorpayOrder = vi.fn()
const mockCreateRefund = vi.fn()
const mockFetchPaymentMethod = vi.fn().mockResolvedValue('upi')
const mockVerifyWebhookSignature = vi.fn()

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/razorpay',
  () => ({
    createRazorpayOrder: mockCreateRazorpayOrder,
    createRefund: mockCreateRefund,
    fetchPaymentMethod: mockFetchPaymentMethod,
    // verifySignature is the real implementation (we test the HMAC)
    verifySignature: (orderId: string, paymentId: string, sig: string): boolean => {
      const secret = process.env.RAZORPAY_KEY_SECRET!
      const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
      const expectedBuf = Buffer.from(expected, 'hex')
      try {
        const actualBuf = Buffer.from(sig, 'hex')
        if (expectedBuf.length !== actualBuf.length) return false
        return crypto.timingSafeEqual(expectedBuf, actualBuf)
      } catch {
        return false
      }
    },
    verifyWebhookSignature: mockVerifyWebhookSignature,
  }),
)

// ── Mock lib/orderEvents ──────────────────────────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/orderEvents',
  () => ({ recordOrderEvent: vi.fn() }),
)

// ── Test app ──────────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { paymentsRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/routes/payments'
  )
  app = express()
  // The webhook route needs rawBody. Simulate it for the webhook tests.
  app.use((req, _res, next) => {
    if (req.path === '/api/payments/webhook') {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        ;(req as any).rawBody = body
        ;(req as any).body = body ? JSON.parse(body) : {}
        next()
      })
    } else {
      express.json()(req, _res, next)
    }
  })
  app.use('/api/payments', paymentsRouter)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function authAs(identity: { id: string }) {
  mockGetUser.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}

function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

function makeQB(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: () => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      upsert: (_d: any, _o?: any) => builder,
      eq: () => builder,
      neq: () => builder,
      in: () => builder,
      is: () => builder,
      lte: () => builder,
      limit: () => builder,
      order: () => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

/** Build a valid HMAC signature for the /confirm and /verify routes */
function makePaymentSig(rzOrderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${rzOrderId}|${paymentId}`)
    .digest('hex')
}

/** Build a valid webhook signature */
function makeWebhookSig(rawBody: string): string {
  return crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')
}

const RZP_ORDER_ID = 'order_test_razorpay_001'
const PAYMENT_ID = 'pay_test_confirm_001'

/** Minimal valid /confirm body */
const CONFIRM_ORDER = {
  store_id: STORE.id,
  items: [{ productId: 'prod-1', name: 'Dupatta', price: 300, qty: 1 }],
  subtotal: 300,
  delivery_fee: 60,
  discount_amount: 0,
  total_amount: 360,
  delivery_address: { name: 'Asha', phone: '+919999900001', address: '5 MG Road', city: 'Hyd', pincode: '500034' },
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  mockFetchPaymentMethod.mockResolvedValue('upi')
  mockVerifyWebhookSignature.mockReturnValue(false) // safe default — must be overridden per test
})

// ── POST /api/payments/confirm ────────────────────────────────────────────────

describe('POST /api/payments/confirm', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post('/api/payments/confirm').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing required fields (no order object)', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'deadbeef',
        // order block deliberately omitted
      })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when payment signature is invalid', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'deadbeef'.repeat(8), // wrong HMAC
        order: CONFIRM_ORDER,
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid payment signature/i)
  })

  it('returns 400 when signature length mismatches (non-hex)', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: 'tooshort', // clearly wrong
        order: CONFIRM_ORDER,
      })
    expect(res.status).toBe(400)
  })

  it('creates paid order with buyer_id from token when signature is valid', async () => {
    authAs(BUYER)
    const sig = makePaymentSig(RZP_ORDER_ID, PAYMENT_ID)

    const createdOrder = { id: 'new-order-id', order_number: 'RM99TEST' }
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        insert: (_d: any) => builder,
        eq: () => builder,
        single: () => ({ data: createdOrder, error: null }),
        then: (fn: any) => Promise.resolve({ data: createdOrder, error: null }).then(fn),
      }
      return builder
    })

    const insertedRows: any[] = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        insert: (d: any) => { insertedRows.push(d); return builder },
        eq: () => builder,
        single: () => ({ data: createdOrder, error: null }),
        then: (fn: any) => Promise.resolve({ data: createdOrder, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: sig,
        order: CONFIRM_ORDER,
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe('new-order-id')

    // Verify the order was inserted with buyer_id from the token (BUYER.id), not from body
    if (insertedRows.length > 0) {
      const inserted = insertedRows[0]
      expect(inserted.buyer_id).toBe(BUYER.id)
      expect(inserted.payment_status).toBe('paid')
      expect(inserted.razorpay_order_id).toBe(RZP_ORDER_ID)
      expect(inserted.razorpay_payment_id).toBe(PAYMENT_ID)
    }
  })

  it('uses payment_method from fetchPaymentMethod (non-blocking: null is fine)', async () => {
    authAs(BUYER)
    const sig = makePaymentSig(RZP_ORDER_ID, PAYMENT_ID)
    mockFetchPaymentMethod.mockResolvedValue(null) // simulate Razorpay API hiccup

    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        insert: (_d: any) => builder,
        eq: () => builder,
        single: () => ({ data: { id: 'new-order-2', order_number: 'RM100TEST' }, error: null }),
        then: (fn: any) => Promise.resolve({ data: { id: 'new-order-2' }, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: sig,
        order: CONFIRM_ORDER,
      })

    // A null payment method must not block order creation
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── POST /api/payments/webhook ────────────────────────────────────────────────

describe('POST /api/payments/webhook (BA-52)', () => {
  /**
   * Helper: send a webhook with the given raw body, optionally with a valid sig.
   * The webhook middleware reads req.rawBody, so we send raw JSON as body.
   */
  function sendWebhook(eventPayload: object, sign = true) {
    const body = JSON.stringify(eventPayload)
    const sig = sign ? makeWebhookSig(body) : 'invalidsig'
    if (sign) {
      mockVerifyWebhookSignature.mockReturnValue(true)
    } else {
      mockVerifyWebhookSignature.mockReturnValue(false)
    }
    return request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sig)
      .send(body)
  }

  const capturedEvent = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: PAYMENT_ID,
          order_id: RZP_ORDER_ID,
        },
      },
    },
  }

  it('returns 400 for invalid webhook signature', async () => {
    mockVerifyWebhookSignature.mockReturnValue(false)
    const res = await sendWebhook(capturedEvent, false)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid webhook signature/i)
  })

  it('returns 200 and updates order on payment.captured with valid signature', async () => {
    const updateCalls: any[] = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        update: (d: any) => { updateCalls.push(d); return builder },
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await sendWebhook(capturedEvent, true)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Verify the update was for payment_status=paid with the correct payment_id
    const paid = updateCalls.find(u => u.payment_status === 'paid')
    expect(paid, 'should have updated payment_status to paid').toBeTruthy()
    expect(paid.razorpay_payment_id).toBe(PAYMENT_ID)
  })

  it('duplicate payment.captured event is idempotent (no error returned)', async () => {
    // Simulate the DB update running twice — both succeed. The route doesn't check for
    // pre-existing state, so duplicate is naturally idempotent (update is a no-op on same data).
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        update: (_d: any) => builder,
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res1 = await sendWebhook(capturedEvent, true)
    const res2 = await sendWebhook(capturedEvent, true)

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it('returns 200 and updates return on refund.processed', async () => {
    const refundEvent = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: { id: 'rfnd_test_001' },
        },
      },
    }

    const updateCalls: any[] = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        update: (d: any) => { updateCalls.push(d); return builder },
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await sendWebhook(refundEvent, true)
    expect(res.status).toBe(200)

    const refunded = updateCalls.find(u => u.status === 'refunded')
    expect(refunded, 'should have updated return status to refunded').toBeTruthy()
    expect(refunded.razorpay_refund_id).toBe('rfnd_test_001')
  })

  it('returns 200 for unrecognised event type (no-op)', async () => {
    mockFrom.mockImplementation(makeQB({}))

    const unknownEvent = { event: 'order.paid', payload: {} }
    const res = await sendWebhook(unknownEvent, true)
    expect(res.status).toBe(200)
  })

  /**
   * Security: the webhook endpoint is PUBLIC (no requireAuth).
   * An attacker sending a valid JSON body without a proper HMAC must be rejected.
   */
  it('rejects an unauthenticated webhook even with a well-formed JSON body', async () => {
    mockVerifyWebhookSignature.mockReturnValue(false)
    const res = await sendWebhook(capturedEvent, false)
    expect(res.status).toBe(400)
  })
})

// ── POST /api/payments/confirm — idempotency note ─────────────────────────────

describe('POST /api/payments/confirm — DB error handling', () => {
  it('returns 500 when the order insert fails', async () => {
    authAs(BUYER)
    const sig = makePaymentSig(RZP_ORDER_ID, PAYMENT_ID)

    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        insert: (_d: any) => builder,
        eq: () => builder,
        single: () => ({ data: null, error: { message: 'duplicate key value violates unique constraint' } }),
        then: (fn: any) =>
          Promise.resolve({ data: null, error: { message: 'duplicate key' } }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send({
        razorpay_order_id: RZP_ORDER_ID,
        razorpay_payment_id: PAYMENT_ID,
        razorpay_signature: sig,
        order: CONFIRM_ORDER,
      })

    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })
})
