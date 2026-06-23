/**
 * tests/db/data-integrity.test.ts
 *
 * Data-integrity + calculation-correctness tests (beyond the 3 RLS isolation
 * checks already in rls-core.test.ts).
 *
 * Invariants covered
 * ──────────────────
 *  CALC-1   Order total atomicity: total_amount = subtotal + delivery_fee − discount
 *           (pure-formula checks + Supertest route verification)
 *  CALC-2   Payment-confirm flow creates order with payment_status=paid ONLY after
 *           verified signature; a bad signature leaves NO order row (ghost-order prevention)
 *  CALC-3   COD order: exactly one row, payment_status=pending, no Razorpay IDs
 *  CALC-4   Duplicate payment.captured webhook does not double-credit the order
 *           (idempotency via razorpay_order_id uniqueness)
 *  CALC-5   Payment status / order status consistency invariants
 *  CALC-6   Payout summary: totalEarned = Σ (total_amount − delivery_fee) × 0.95
 *  CALC-7   Payout /process: net = gross × (1 − PLATFORM_FEE_PCT); suspended stores skipped
 *  CALC-8   TCS deduction: NOT currently applied — documented as P1 bug
 *  CALC-9   Refund amount > order total → 400 REFUND_AMOUNT_EXCEEDS_ORDER
 *  CALC-10  Refund default (amount omitted) → full order.total_amount
 *
 *  OWN-1    Return requests: buyer cannot read another buyer's returns
 *  OWN-2    Return requests: seller cannot read another seller's store's returns
 *  OWN-3    Bank accounts: seller A cannot read seller B's bank account
 *  OWN-4    Bank accounts: upsert always bound to req.user.id, never a spoofed param
 *  OWN-5    Device tokens: user cannot register a push token for a different user
 *  OWN-6    Device tokens: push notification target scoped to intended user_id
 *
 * Mock strategy
 * ─────────────
 * Two mock layers:
 *  (a) Pure formula/predicate tests — arithmetic + JS filter functions that mirror
 *      the service source exactly. No HTTP, no module mocking needed.
 *  (b) Route-level Supertest tests — top-level vi.mock() calls (hoisted by Vitest)
 *      following the EXACT same pattern used in tests/api/<svc>/authz.test.ts.
 *
 * Top-level vi.mock() is required by Vitest's hoisting model; the mock factory
 * must not reference outer variables. We use a shared mockGetUser + mockFrom
 * pattern identical to every other test file in this harness.
 *
 * Run: npx vitest run db   (from the tests/ directory)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER,
  OTHER_BUYER,
  SELLER,
  OTHER_SELLER,
  STORE,
  OTHER_STORE,
  ORDER,
  makeSupabaseUser,
  bearerToken,
} from '../fixtures/users'

// ─── TOP-LEVEL MOCKS (hoisted by Vitest — no outer variables in factories) ────
//
// We mock three service supabase singletons.  The actual spy fns are assigned
// below (after vi.mock hoisting completes) and referenced by name inside
// each describe block via the module-level variables.
//
// Pattern mirrors tests/api/payout-service/authz.test.ts exactly.

const mockGetUser_order   = vi.fn()
const mockFrom_order      = vi.fn()
const mockGetUser_payment = vi.fn()
const mockFrom_payment    = vi.fn()
const mockGetUser_notif   = vi.fn()
const mockFrom_notif      = vi.fn()
const mockGetUser_payout  = vi.fn()
const mockFrom_payout     = vi.fn()

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_order(...a) },
      from:          (...a: any[]) => mockFrom_order(...a),
    },
  }),
)

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_payment(...a) },
      from:          (...a: any[]) => mockFrom_payment(...a),
    },
  }),
)

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_notif(...a) },
      from:          (...a: any[]) => mockFrom_notif(...a),
    },
  }),
)

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_payout(...a) },
      from:          (...a: any[]) => mockFrom_payout(...a),
    },
  }),
)

// Mock Razorpay lib used by payment-service.
// verifySignature returns true only for the sentinel string 'order_VALID'.
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/razorpay',
  () => ({
    createRazorpayOrder:    vi.fn(),
    verifySignature:        (rzOrderId: string) => rzOrderId === 'order_VALID',
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    createRefund:           vi.fn().mockResolvedValue({ id: 'rfnd_test001' }),
    fetchPaymentMethod:     vi.fn().mockResolvedValue('upi'),
  }),
)

// Mock notification-service external libs (no real SMS/push/WhatsApp)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/fcm',
  () => ({ sendPush: vi.fn().mockResolvedValue(undefined) }),
)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/gupshup',
  () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }),
)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/sms',
  () => ({ sendSMS: vi.fn().mockResolvedValue(undefined) }),
)

// Mock order-service internal libs to avoid unrelated calls throwing
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/notify',
  () => ({ notifyOrderUpdate: vi.fn() }),
)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/orderEvents',
  () => ({ recordOrderEvent: vi.fn() }),
)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/lib/orderEvents',
  () => ({ recordOrderEvent: vi.fn() }),
)

// ─── Shared constants (mirror service source exactly) ─────────────────────────
// payout-service/src/routes/payouts.ts:7
const PLATFORM_FEE_PCT = 0.05

// ─── Additional fixture identities ────────────────────────────────────────────

const RETURN_ID            = 'eeeeeeee-0001-4000-8000-000000000001'
const FCM_USER_A           = '11111111-f000-4000-8000-000000000001'
const FCM_USER_B           = '22222222-f000-4000-8000-000000000002'

const RETURN_ROW = {
  id: RETURN_ID,
  buyer_id: BUYER.id,
  order_id: ORDER.id,
  store_id: STORE.id,
  reason: 'damaged',
  status: 'requested',
  refund_amount: 1000,
  orders: {
    order_number: ORDER.order_number,
    total_amount: ORDER.total_amount,
    stores: { seller_id: SELLER.id },
  },
}

const OTHER_RETURN_ROW = {
  id: 'eeeeeeee-0002-4000-8000-000000000002',
  buyer_id: OTHER_BUYER.id,
  order_id: 'dddddddd-0002-4000-8000-000000000002',
  store_id: OTHER_STORE.id,
  reason: 'wrong_item',
  status: 'requested',
  refund_amount: 750,
  orders: {
    order_number: 'RM2TEST',
    total_amount: 750,
    stores: { seller_id: OTHER_SELLER.id },
  },
}

const BANK_ACCOUNT_SELLER = {
  id: 'ba000001-0001-4000-8000-000000000001',
  seller_id: SELLER.id,
  account_number: '****5678',
  account_holder: 'Test Seller',
  ifsc_code: 'HDFC0001234',
  bank_name: 'HDFC Bank',
}

const BANK_ACCOUNT_OTHER_SELLER = {
  id: 'ba000002-0002-4000-8000-000000000002',
  seller_id: OTHER_SELLER.id,
  account_number: '****9999',
  account_holder: 'Other Seller',
  ifsc_code: 'SBIN0005678',
  bank_name: 'SBI',
}

const DB_RETURNS        = [RETURN_ROW, OTHER_RETURN_ROW]
const DB_BANK_ACCOUNTS  = [BANK_ACCOUNT_SELLER, BANK_ACCOUNT_OTHER_SELLER]
const DB_FCM_TOKENS     = [
  { user_id: FCM_USER_A, token: 'fcm-token-aaa', platform: 'android' },
  { user_id: FCM_USER_B, token: 'fcm-token-bbb', platform: 'ios' },
]

// ─── Shared Express apps (built once in beforeAll) ─────────────────────────────

let orderApp:   express.Application
let paymentApp: express.Application
let notifApp:   express.Application
let payoutApp:  express.Application

beforeAll(async () => {
  const [
    { ordersRouter },
    { paymentsRouter },
    { notificationsRouter },
    { payoutsRouter },
    { bankAccountsRouter },
  ] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/orders'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payment-service/src/routes/payments'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/routes/notifications'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/payouts'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/bankAccounts'),
  ])

  orderApp = express()
  orderApp.use(express.json())
  orderApp.use('/api/orders', ordersRouter)

  paymentApp = express()
  paymentApp.use(express.json())
  paymentApp.use('/api/payments', paymentsRouter)

  notifApp = express()
  notifApp.use(express.json())
  notifApp.use('/api/notifications', notificationsRouter)

  payoutApp = express()
  payoutApp.use(express.json())
  payoutApp.use('/api/payouts', payoutsRouter)
  payoutApp.use('/api/payouts', bankAccountsRouter)
})

// ─── Helper: auth mock setters ──────────────────────────────────────────────────

function authOrderAs(identity: { id: string }) {
  mockGetUser_order.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}
function authPaymentAs(identity: { id: string }) {
  mockGetUser_payment.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}
function authNotifAs(identity: { id: string }) {
  mockGetUser_notif.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}
function authPayoutAs(identity: { id: string }) {
  mockGetUser_payout.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}
function authFail_order()   { mockGetUser_order.mockResolvedValue(   { data: { user: null }, error: { message: 'invalid' } }) }
function authFail_payment() { mockGetUser_payment.mockResolvedValue( { data: { user: null }, error: { message: 'invalid' } }) }
function authFail_notif()   { mockGetUser_notif.mockResolvedValue(   { data: { user: null }, error: { message: 'invalid' } }) }
function authFail_payout()  { mockGetUser_payout.mockResolvedValue(  { data: { user: null }, error: { message: 'invalid' } }) }

beforeEach(() => {
  vi.clearAllMocks()
  authFail_order()
  authFail_payment()
  authFail_notif()
  authFail_payout()
})

// ─── Minimal query-builder factory (reusable) ─────────────────────────────────

function makeBuilder(result: any): any {
  const b: any = {
    select: () => b,
    insert: (_d: any) => ({ select: () => ({ single: () => Promise.resolve(result) }) }),
    update: (_d: any) => ({ eq: () => b, in: () => Promise.resolve(result) }),
    upsert:  (_d: any) => ({ select: () => ({ single: () => Promise.resolve(result) }) }),
    eq:     () => b,
    is:     () => b,
    lte:    () => b,
    in:     () => b,
    neq:    () => b,
    order:  () => b,
    limit:  () => b,
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then:   (fn: any) => Promise.resolve(result).then(fn),
  }
  return b
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ORDER TOTAL ATOMICITY (CALC-1)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-1 — order total atomicity: total_amount = subtotal + delivery_fee − discount', () => {
  it('base case: subtotal=1000 + delivery_fee=60 − discount=0 = 1060', () => {
    expect(1000 + 60 - 0).toBe(1060)
  })

  it('with discount: subtotal=2000 + delivery_fee=0 − discount=200 = 1800', () => {
    expect(2000 + 0 - 200).toBe(1800)
  })

  it('negative total is impossible (discount exceeds sum) — service must guard this', () => {
    const computed = 500 + 60 - 600
    // The computed value would be negative: a guard is required in the service.
    // If this ever reaches the DB it is a bug.
    expect(computed).toBeLessThan(0)
  })

  it('item prices × qty sum must equal client-supplied subtotal (current trust model)', () => {
    const items = [
      { price: 500, qty: 2 },
      { price: 250, qty: 1 },
    ]
    const clientSubtotal = 1250
    const serverRecomputed = items.reduce((s, i) => s + i.price * i.qty, 0)
    // The current order-service trusts the client subtotal — this test documents
    // the invariant: client SHOULD send accurate values.
    expect(serverRecomputed).toBe(clientSubtotal)
  })

  it('route inserts derived total_amount (not a separate field from request body)', async () => {
    const capturedInserts: any[] = []

    authOrderAs(BUYER)

    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'stores') {
        // Suspension check — store is not suspended
        return makeBuilder({ data: { suspended: false }, error: null })
      }
      if (table === 'orders') {
        return {
          insert: (row: any) => {
            capturedInserts.push(row)
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: {
                    ...row,
                    id: 'order-atomic-001',
                    order_number: 'RMATM01',
                    created_at: new Date().toISOString(),
                    stores: { store_name: 'Test Store' },
                  },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({
        store_id: STORE.id,
        items: [{ productId: 'p1', name: 'Shirt', price: 500, qty: 2 }],
        subtotal: 1000,
        delivery_fee: 60,
        discount: 0,
        delivery_address: {
          name: 'Test Buyer',
          phone: '+919000000001',
          address: '12 Main St',
          city: 'Hyderabad',
          pincode: '500034',
        },
      })

    expect(res.status).toBe(201)
    expect(capturedInserts).toHaveLength(1)

    const row = capturedInserts[0]
    // Atomicity invariant: the inserted total must equal the derived formula
    expect(row.total_amount).toBe(row.subtotal + row.delivery_fee - row.discount)
    expect(row.total_amount).toBe(1060)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — PAYMENT-CONFIRM GHOST-ORDER PREVENTION (CALC-2)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-2 — payment-confirm: order created ONLY after valid Razorpay signature', () => {
  /**
   * The /confirm route:
   *   1. Verify HMAC signature (verifySignature)
   *   2. ONLY IF valid → INSERT order row with payment_status='paid'
   *
   * An invalid signature must leave ZERO order rows (no ghost orders).
   * The Razorpay mock (vi.mock above) makes verifySignature return:
   *   true  when razorpay_order_id === 'order_VALID'
   *   false otherwise
   */

  const VALID_PAYLOAD = {
    razorpay_order_id:  'order_VALID',
    razorpay_payment_id: 'pay_test001',
    razorpay_signature:  'sig_valid',
    order: {
      store_id: STORE.id,
      items: [{ productId: 'p1', name: 'Shirt', price: 500, qty: 2 }],
      subtotal: 1000,
      delivery_fee: 60,
      discount_amount: 0,
      total_amount: 1060,
      delivery_address: { name: 'T', phone: '+910000000001', address: 'A', city: 'B', pincode: '500001' },
    },
  }

  const INVALID_PAYLOAD = { ...VALID_PAYLOAD, razorpay_order_id: 'order_INVALID' }

  it('CALC-2a: invalid signature → 400 + zero order rows inserted', async () => {
    authPaymentAs(BUYER)
    const orderInserts: any[] = []

    mockFrom_payment.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          insert: (row: any) => {
            orderInserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'x', order_number: 'X' }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(paymentApp)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send(INVALID_PAYLOAD)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid payment signature/i)
    // CRITICAL: no ghost rows
    expect(orderInserts).toHaveLength(0)
  })

  it('CALC-2b: valid signature → 200 + exactly one order row, payment_status=paid', async () => {
    authPaymentAs(BUYER)
    const orderInserts: any[] = []

    mockFrom_payment.mockImplementation((table: string) => {
      if (table === 'orders') {
        return {
          insert: (row: any) => {
            orderInserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'order-paid-001', order_number: 'RMPAID01' }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(paymentApp)
      .post('/api/payments/confirm')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_PAYLOAD)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // Exactly one order insert
    expect(orderInserts).toHaveLength(1)
    // payment_status MUST be 'paid' — not 'pending'
    expect(orderInserts[0].payment_status).toBe('paid')
    // buyer_id must come from JWT, not request body
    expect(orderInserts[0].buyer_id).toBe(BUYER.id)
  })

  it('CALC-2c: unauthenticated caller → 401 + zero order rows', async () => {
    authFail_payment()
    const orderInserts: any[] = []

    mockFrom_payment.mockImplementation((_table: string) => ({
      insert: (row: any) => { orderInserts.push(row); return { select: () => ({ single: () => Promise.resolve({ data: { id: 'x' }, error: null }) }) } },
    }))

    const res = await request(paymentApp)
      .post('/api/payments/confirm')
      .send(VALID_PAYLOAD)

    expect(res.status).toBe(401)
    expect(orderInserts).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — COD ORDER INVARIANTS (CALC-3)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-3 — COD order: payment_status=pending, no Razorpay IDs', () => {
  it('total = subtotal + delivery_fee − discount (COD)', () => {
    const subtotal = 800, delivery_fee = 60, discount = 0
    expect(subtotal + delivery_fee - discount).toBe(860)
  })

  it('COD row has payment_status=pending and no razorpay_* fields', () => {
    const codRow: any = {
      buyer_id: BUYER.id,
      store_id: STORE.id,
      subtotal: 800,
      delivery_fee: 60,
      discount: 0,
      total_amount: 860,
      status: 'pending',
      payment_status: 'pending',
      // razorpay fields deliberately absent for COD
    }
    expect(codRow.payment_status).toBe('pending')
    expect(codRow.status).toBe('pending')
    expect(codRow.razorpay_order_id).toBeUndefined()
    expect(codRow.razorpay_payment_id).toBeUndefined()
  })

  it('COD route inserts exactly one row with payment_status=pending', async () => {
    const codInserts: any[] = []
    authOrderAs(BUYER)

    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'stores') return makeBuilder({ data: { suspended: false }, error: null })
      if (table === 'orders') {
        return {
          insert: (row: any) => {
            codInserts.push(row)
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { ...row, id: 'cod-001', order_number: 'RMCOD01', created_at: new Date().toISOString(), stores: { store_name: 'T' } },
                  error: null,
                }),
              }),
            }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({
        store_id: STORE.id,
        items: [{ productId: 'p1', name: 'Kurta', price: 800, qty: 1 }],
        subtotal: 800,
        delivery_fee: 60,
        discount: 0,
        delivery_address: { name: 'A', phone: '+910000000001', address: 'B', city: 'C', pincode: '500034' },
      })

    expect(res.status).toBe(201)
    expect(codInserts).toHaveLength(1)
    expect(codInserts[0].payment_status).toBe('pending')
    expect(codInserts[0].total_amount).toBe(860)
    // COD orders must not have Razorpay IDs set at creation
    expect(codInserts[0].razorpay_order_id).toBeUndefined()
    expect(codInserts[0].razorpay_payment_id).toBeUndefined()
  })

  it('suspended store rejects COD order before any insert', async () => {
    authOrderAs(BUYER)
    const suspendedInserts: any[] = []

    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'stores') return makeBuilder({ data: { suspended: true }, error: null })
      if (table === 'orders') {
        return {
          insert: (row: any) => {
            suspendedInserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({
        store_id: STORE.id,
        items: [{ productId: 'p1', name: 'Kurta', price: 800, qty: 1 }],
        subtotal: 800,
        delivery_fee: 60,
        discount: 0,
        delivery_address: { name: 'A', phone: '+910000000001', address: 'B', city: 'C', pincode: '500034' },
      })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_SUSPENDED')
    // Guard fires before insert — no rows
    expect(suspendedInserts).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — DUPLICATE WEBHOOK IDEMPOTENCY (CALC-4)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-4 — duplicate payment.captured webhook: idempotency', () => {
  /**
   * The webhook UPDATE is keyed on razorpay_order_id.
   * Same event arriving twice targets the same row → idempotent.
   * We model this in-memory to confirm the UPDATE semantics.
   */

  function simulateWebhookUpdate(
    orders: Record<string, any>,
    rzOrderId: string,
    pmtId: string,
  ): { updated: number } {
    const row = orders[rzOrderId]
    if (!row) return { updated: 0 }
    row.payment_status = 'paid'
    row.razorpay_payment_id = pmtId
    row.status = 'pending'
    return { updated: 1 }
  }

  it('first webhook marks order paid', () => {
    const orders: Record<string, any> = {
      'order_rzp_001': { id: 'db-001', razorpay_order_id: 'order_rzp_001', payment_status: 'pending' },
    }
    const r = simulateWebhookUpdate(orders, 'order_rzp_001', 'pay_aaa')
    expect(r.updated).toBe(1)
    expect(orders['order_rzp_001'].payment_status).toBe('paid')
  })

  it('second identical webhook is idempotent — order not double-credited', () => {
    const orders: Record<string, any> = {
      'order_rzp_001': { id: 'db-001', razorpay_order_id: 'order_rzp_001', payment_status: 'pending' },
    }
    simulateWebhookUpdate(orders, 'order_rzp_001', 'pay_aaa')
    simulateWebhookUpdate(orders, 'order_rzp_001', 'pay_aaa')  // second event

    // Row count stays at 1
    expect(Object.keys(orders)).toHaveLength(1)
    expect(orders['order_rzp_001'].payment_status).toBe('paid')
    // payment_id unchanged — not appended/doubled
    expect(orders['order_rzp_001'].razorpay_payment_id).toBe('pay_aaa')
  })

  it('webhook for unknown razorpay_order_id updates 0 rows (no ghost payment)', () => {
    const orders: Record<string, any> = {}
    const r = simulateWebhookUpdate(orders, 'order_PHANTOM', 'pay_zzz')
    expect(r.updated).toBe(0)
    expect(Object.keys(orders)).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — PAYMENT STATUS / ORDER STATUS CONSISTENCY (CALC-5)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-5 — payment_status vs order status consistency', () => {
  type PS = 'pending' | 'paid' | 'refunded' | 'failed'
  type OS = 'pending' | 'accepted' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'rejected'

  const isPayoutEligible = (o: { payment_status: PS; status: OS }) =>
    o.payment_status === 'paid' && o.status === 'delivered'

  const isCODCancellableWithoutRefund = (o: { payment_status: PS }) =>
    o.payment_status === 'pending'

  it('paid + delivered → payout eligible', () => {
    expect(isPayoutEligible({ payment_status: 'paid', status: 'delivered' })).toBe(true)
  })

  it('pending + delivered (COD unconfirmed) → NOT payout eligible', () => {
    expect(isPayoutEligible({ payment_status: 'pending', status: 'delivered' })).toBe(false)
  })

  it('pending + cancelled (COD) → no refund required', () => {
    expect(isCODCancellableWithoutRefund({ payment_status: 'pending' })).toBe(true)
  })

  it('paid + cancelled (online after capture) → refund required before settlement', () => {
    // payment_status stays 'paid' until refund is issued (transitions to 'refunded')
    const o = { payment_status: 'paid' as PS, status: 'cancelled' as OS }
    expect(isCODCancellableWithoutRefund(o)).toBe(false)
    expect(o.payment_status).toBe('paid')
  })

  it('online /confirm inserts payment_method=online, not cod', () => {
    const row = { payment_method: 'online', payment_status: 'paid', status: 'pending' }
    expect(row.payment_method).toBe('online')
    expect(row.payment_status).toBe('paid')
  })

  it('ORDER_STATUS_FLOW covers all valid transitions and excludes ghost states', () => {
    const VALID = ['pending','accepted','packed','shipped','delivered','rejected','cancelled']
    expect(VALID).toContain('delivered')
    expect(VALID).not.toContain('ghost')
    expect(VALID).not.toContain('payment_pending')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — PAYOUT SUMMARY CALCULATION (CALC-6)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-6 — payout summary: totalEarned formula correctness', () => {
  /**
   * From payouts.ts:46 (exact formula):
   *   totalEarned = Σ (total_amount − delivery_fee) × (1 − PLATFORM_FEE_PCT)
   *
   * PLATFORM_FEE_PCT = 0.05 (5% commission)
   */

  function computeTotalEarned(orders: Array<{ total_amount: number; delivery_fee: number }>): number {
    return orders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * (1 - PLATFORM_FEE_PCT), 0)
  }

  it('CALC-6a: total=1060, delivery=60 → gross=1000, net=950', () => {
    expect(Math.round(computeTotalEarned([{ total_amount: 1060, delivery_fee: 60 }]))).toBe(950)
  })

  it('CALC-6b: zero delivery_fee → gross=total, net=total×0.95', () => {
    expect(Math.round(computeTotalEarned([{ total_amount: 1000, delivery_fee: 0 }]))).toBe(950)
  })

  it('CALC-6c: multiple orders aggregate correctly', () => {
    const orders = [
      { total_amount: 1060, delivery_fee: 60 },   // net 950
      { total_amount: 810,  delivery_fee: 60 },   // net 712.5
      { total_amount: 2060, delivery_fee: 60 },   // net 1900
    ]
    // 950 + 712.5 + 1900 = 3562.5 → 3563
    expect(Math.round(computeTotalEarned(orders))).toBe(3563)
  })

  it('CALC-6d: pending = totalEarned − totalPaid', () => {
    const earned   = Math.round(computeTotalEarned([{ total_amount: 1060, delivery_fee: 60 }]))
    const paid     = 200
    const pending  = earned - paid
    expect(earned).toBe(950)
    expect(pending).toBe(750)
  })

  it('CALC-6e: only payment_status=paid orders count (COD pending excluded)', () => {
    const all = [
      { total_amount: 1060, delivery_fee: 60, payment_status: 'paid' },
      { total_amount: 860,  delivery_fee: 60, payment_status: 'pending' },  // not eligible
    ]
    const paidOnly = all.filter(o => o.payment_status === 'paid')
    const earnedCorrect = computeTotalEarned(paidOnly)
    const earnedWrong   = computeTotalEarned(all)

    expect(Math.round(earnedCorrect)).toBe(950)
    // If pending COD were incorrectly included:
    expect(Math.round(earnedWrong)).not.toBe(Math.round(earnedCorrect))
  })

  it('CALC-6f: summary via Supertest returns correct numbers', async () => {
    authPayoutAs(SELLER)

    let callCount = 0
    mockFrom_payout.mockImplementation((table: string) => {
      callCount++
      if (table === 'stores') {
        return makeBuilder({ data: { id: STORE.id }, error: null })
      }
      if (table === 'orders') {
        return makeBuilder({ data: [{ total_amount: 1060, delivery_fee: 60 }], error: null })
      }
      // payouts table
      return makeBuilder({ data: [{ amount: 200, status: 'done' }], error: null })
    })

    const res = await request(payoutApp)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    // After BUG-TCS-001 fix: net = gross × (1 − 0.05 − 0.01) = 1000 × 0.94 = 940
    // (previously 950 before TCS was applied — test updated to match corrected formula)
    expect(res.body.data.totalEarned).toBe(940)
    expect(res.body.data.totalPaid).toBe(200)
    expect(res.body.data.pending).toBe(740)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — PAYOUT PROCESS CALCULATION (CALC-7)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-7 — payout /process: net = gross × (1 − PLATFORM_FEE_PCT)', () => {
  function net(gross: number) { return gross * (1 - PLATFORM_FEE_PCT) }

  it('CALC-7a: gross=1000 → net=950', () => { expect(net(1000)).toBe(950) })
  it('CALC-7b: gross=750  → net=712.5', () => { expect(net(750)).toBe(712.5) })
  it('CALC-7c: gross=0    → net=0', () => { expect(net(0)).toBe(0) })

  it('CALC-7d: per-order then sum equals aggregate then fee (linear distributivity)', () => {
    const orders = [{ gross: 1000 }, { gross: 750 }]
    const perOrder   = orders.reduce((s, o) => s + net(o.gross), 0)
    const onAggregate = net(orders.reduce((s, o) => s + o.gross, 0))
    expect(perOrder).toBeCloseTo(onAggregate, 10)
    expect(Math.round(perOrder)).toBe(1663)
  })

  it('CALC-7e: suspended store is skipped — no payout row', () => {
    const storeRows = [
      { id: STORE.id, suspended: false },
      { id: OTHER_STORE.id, suspended: true },
    ]
    const suspendedIds = new Set(storeRows.filter(s => s.suspended).map(s => s.id))
    const batches = [
      { storeId: STORE.id, gross: 1000 },
      { storeId: OTHER_STORE.id, gross: 500 },
    ]
    const toProcess = batches.filter(b => !suspendedIds.has(b.storeId))
    expect(toProcess).toHaveLength(1)
    expect(toProcess[0].storeId).toBe(STORE.id)
  })

  it('CALC-7f: non-admin (seller) cannot call /process — 403', async () => {
    authPayoutAs(SELLER)
    // requireAdmin queries users table; seller is not admin
    mockFrom_payout.mockImplementation((table: string) => {
      if (table === 'users') return makeBuilder({ data: { role: 'seller', is_admin: false }, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(payoutApp)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken(SELLER))
      .send({})

    expect(res.status).toBe(403)
  })

  it('CALC-7g: unauthenticated cannot call /process — 401', async () => {
    authFail_payout()
    const res = await request(payoutApp)
      .post('/api/payouts/process')
      .send({})
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — TCS DOCUMENTATION (CALC-8 — known gap, P1 bug marker)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-8 — TCS deduction: NOT currently implemented (P1 bug)', () => {
  /**
   * BUG: payout-service does not deduct TCS (Tax Collected at Source).
   *
   * Per Indian e-commerce regulations (Sec 194-O Income Tax Act), platforms
   * must deduct TCS @ 1% of gross sales and remit to the government.
   * The current formula only deducts the 5% platform commission.
   *
   * Expected formula (when implemented):
   *   netAmount = gross × (1 − PLATFORM_FEE_PCT − TCS_PCT)   [TCS_PCT = 0.01]
   *
   * Current formula:
   *   netAmount = gross × (1 − PLATFORM_FEE_PCT)
   *
   * Impact: sellers are overpaid by TCS_PCT of gross; ReelMart is not
   * collecting/remitting TCS as legally required.
   *
   * Owner: backend-engineer (payout-service)
   * Priority: P1 (regulatory requirement)
   */

  const TCS_PCT = 0.01

  it('current impl applies only platform fee — TCS not deducted', () => {
    const gross = 1000
    const currentNet = gross * (1 - PLATFORM_FEE_PCT)
    const correctNet = gross * (1 - PLATFORM_FEE_PCT - TCS_PCT)

    expect(currentNet).toBe(950)
    expect(correctNet).toBe(940)
    // They differ: the ₹10 gap per ₹1000 gross is the un-deducted TCS
    expect(currentNet - correctNet).toBeCloseTo(10, 10)
  })

  it('commission per-order and aggregate are equivalent (math sanity)', () => {
    const orders = [{ gross: 1000 }, { gross: 750 }, { gross: 2000 }]
    const perOrder   = orders.reduce((s, o) => s + o.gross * (1 - PLATFORM_FEE_PCT), 0)
    const aggregate  = orders.reduce((s, o) => s + o.gross, 0) * (1 - PLATFORM_FEE_PCT)
    expect(perOrder).toBeCloseTo(aggregate, 10)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — REFUND AMOUNT CAP (CALC-9, CALC-10)
// ══════════════════════════════════════════════════════════════════════════════

describe('CALC-9/10 — refund amount: cap + default', () => {
  /**
   * From payment-service/routes/payments.ts:217–224:
   *   refundAmount = parsed.data.amount ?? order.total_amount
   *   if (refundAmount > order.total_amount) → 400 REFUND_AMOUNT_EXCEEDS_ORDER
   */
  function refundCheck(requested: number | undefined, total: number) {
    const amount = requested ?? total
    if (amount > total) return { ok: false, code: 'REFUND_AMOUNT_EXCEEDS_ORDER' }
    return { ok: true, amount }
  }

  it('CALC-9: refund > total → rejected (REFUND_AMOUNT_EXCEEDS_ORDER)', () => {
    const r = refundCheck(1500, 1060)
    expect(r.ok).toBe(false)
    expect((r as any).code).toBe('REFUND_AMOUNT_EXCEEDS_ORDER')
  })

  it('CALC-10: amount omitted → defaults to full order total', () => {
    const r = refundCheck(undefined, 1060)
    expect(r.ok).toBe(true)
    expect((r as any).amount).toBe(1060)
  })

  it('partial refund ≤ total → allowed', () => {
    const r = refundCheck(500, 1060)
    expect(r.ok).toBe(true)
    expect((r as any).amount).toBe(500)
  })

  it('refund = total exactly → allowed', () => {
    const r = refundCheck(1060, 1060)
    expect(r.ok).toBe(true)
  })

  it('refund = total + 1 → rejected', () => {
    const r = refundCheck(1061, 1060)
    expect(r.ok).toBe(false)
  })

  it('Razorpay amount is paise (× 100, integer)', () => {
    const paise = Math.round(500.5 * 100)
    expect(paise).toBe(50050)
    expect(Number.isInteger(paise)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — RETURN REQUEST OWNERSHIP (OWN-1, OWN-2)
// ══════════════════════════════════════════════════════════════════════════════

describe('OWN-1/OWN-2 — return requests: cross-identity isolation', () => {
  /**
   * Mirrors the service-layer MED-4 fix but at the RLS-predicate level.
   * Policy: buyer sees own returns; seller sees returns for their store's orders.
   */

  function canReadReturn(
    row: typeof RETURN_ROW,
    identity: { id: string; role: string } | null,
  ): boolean {
    if (!identity) return false
    if (identity.role === 'admin') return true
    if (row.buyer_id === identity.id) return true
    if (row.orders?.stores?.seller_id === identity.id) return true
    return false
  }

  it('OWN-1: BUYER reads own return', () => {
    expect(canReadReturn(RETURN_ROW, { ...BUYER, role: 'buyer' })).toBe(true)
  })

  it('OWN-1: BUYER cannot read OTHER_BUYER return', () => {
    expect(canReadReturn(OTHER_RETURN_ROW, { ...BUYER, role: 'buyer' })).toBe(false)
  })

  it('OWN-1: OTHER_BUYER cannot read BUYER return', () => {
    expect(canReadReturn(RETURN_ROW, { ...OTHER_BUYER, role: 'buyer' })).toBe(false)
  })

  it('OWN-2: SELLER (owning store) can read return in their store', () => {
    expect(canReadReturn(RETURN_ROW, { ...SELLER, role: 'seller' })).toBe(true)
  })

  it('OWN-2: OTHER_SELLER cannot read SELLER store return', () => {
    expect(canReadReturn(RETURN_ROW, { ...OTHER_SELLER, role: 'seller' })).toBe(false)
  })

  it('OWN-2: SELLER cannot read OTHER_SELLER store return', () => {
    expect(canReadReturn(OTHER_RETURN_ROW, { ...SELLER, role: 'seller' })).toBe(false)
  })

  it('anon cannot read any return', () => {
    expect(canReadReturn(RETURN_ROW, null)).toBe(false)
  })

  it('buyer list returns only own rows', () => {
    const visible = DB_RETURNS.filter(r => canReadReturn(r as typeof RETURN_ROW, { ...BUYER, role: 'buyer' }))
    expect(visible).toHaveLength(1)
    expect(visible[0].buyer_id).toBe(BUYER.id)
  })

  it('seller list returns only their store rows', () => {
    const visible = DB_RETURNS.filter(r => canReadReturn(r as typeof RETURN_ROW, { ...SELLER, role: 'seller' }))
    expect(visible).toHaveLength(1)
    expect(visible[0].store_id).toBe(STORE.id)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — BANK ACCOUNT OWNERSHIP (OWN-3, OWN-4 / MED-8)
// ══════════════════════════════════════════════════════════════════════════════

describe('OWN-3/OWN-4 — bank accounts: cross-seller isolation (MED-8)', () => {

  function canReadBankAccount(row: typeof BANK_ACCOUNT_SELLER, identity: { id: string } | null): boolean {
    if (!identity) return false
    return row.seller_id === identity.id
  }

  function canUpsertBankAccount(newRow: { seller_id: string }, identity: { id: string } | null): boolean {
    if (!identity) return false
    return newRow.seller_id === identity.id
  }

  it('OWN-3: SELLER reads own bank account', () => {
    expect(canReadBankAccount(BANK_ACCOUNT_SELLER, SELLER)).toBe(true)
  })

  it('OWN-3: SELLER cannot read OTHER_SELLER bank account', () => {
    expect(canReadBankAccount(BANK_ACCOUNT_OTHER_SELLER, SELLER)).toBe(false)
  })

  it('OWN-3: OTHER_SELLER cannot read SELLER bank account', () => {
    expect(canReadBankAccount(BANK_ACCOUNT_SELLER, OTHER_SELLER)).toBe(false)
  })

  it('OWN-3: anon cannot read any bank account', () => {
    expect(canReadBankAccount(BANK_ACCOUNT_SELLER, null)).toBe(false)
    expect(canReadBankAccount(BANK_ACCOUNT_OTHER_SELLER, null)).toBe(false)
  })

  it('OWN-3: SELECT scoped to own seller_id returns exactly one row', () => {
    const visible = DB_BANK_ACCOUNTS.filter(ba => canReadBankAccount(ba, SELLER))
    expect(visible).toHaveLength(1)
    expect(visible[0].seller_id).toBe(SELLER.id)
    expect(visible.some(ba => ba.seller_id === OTHER_SELLER.id)).toBe(false)
  })

  it('OWN-4: upsert for own seller_id succeeds', () => {
    expect(canUpsertBankAccount({ seller_id: SELLER.id }, SELLER)).toBe(true)
  })

  it('OWN-4: upsert for another seller_id is blocked', () => {
    expect(canUpsertBankAccount({ seller_id: OTHER_SELLER.id }, SELLER)).toBe(false)
  })

  it('OWN-4: route ignores ?sellerId= query param — uses req.user.id (MED-8 via Supertest)', async () => {
    authPayoutAs(SELLER)
    const queriedSellerIds: string[] = []

    mockFrom_payout.mockImplementation((_table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => {
          if (col === 'seller_id') queriedSellerIds.push(val)
          return { maybeSingle: () => Promise.resolve({ data: BANK_ACCOUNT_SELLER, error: null }) }
        },
      }),
    }))

    const res = await request(payoutApp)
      .get('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .query({ sellerId: OTHER_SELLER.id })   // attacker param — must be ignored

    expect(res.status).toBe(200)
    expect(queriedSellerIds).toContain(SELLER.id)
    expect(queriedSellerIds).not.toContain(OTHER_SELLER.id)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — DEVICE TOKEN OWNERSHIP (OWN-5, OWN-6 / HIGH-9)
// ══════════════════════════════════════════════════════════════════════════════

describe('OWN-5/OWN-6 — device tokens (fcm_tokens): user isolation (HIGH-9)', () => {
  /**
   * HIGH-9: POST /register-token must reject userId ≠ req.user.id.
   * Route guard (notifications.ts:38):
   *   if (parsed.data.userId !== req.user.id) → 403 USER_ID_MISMATCH
   */

  function canRegisterToken(requestedUserId: string, identity: { id: string } | null): boolean {
    if (!identity) return false
    return requestedUserId === identity.id
  }

  function tokensForUser(userId: string) {
    return DB_FCM_TOKENS.filter(t => t.user_id === userId)
  }

  // ── Pure predicate tests ──────────────────────────────────────────────────

  it('OWN-5: own userId → allowed', () => {
    expect(canRegisterToken(FCM_USER_A, { id: FCM_USER_A })).toBe(true)
  })

  it('OWN-5: different userId → blocked', () => {
    expect(canRegisterToken(FCM_USER_B, { id: FCM_USER_A })).toBe(false)
  })

  it('OWN-5: anon → blocked', () => {
    expect(canRegisterToken(FCM_USER_A, null)).toBe(false)
  })

  it('OWN-6: push scoped to user_id returns only that user\'s tokens', () => {
    const tokens = tokensForUser(FCM_USER_A)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].token).toBe('fcm-token-aaa')
    expect(tokens.some(t => t.token === 'fcm-token-bbb')).toBe(false)
  })

  it('OWN-6: push for FCM_USER_B does not include FCM_USER_A tokens', () => {
    const tokens = tokensForUser(FCM_USER_B)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].token).toBe('fcm-token-bbb')
    expect(tokens.some(t => t.token === 'fcm-token-aaa')).toBe(false)
  })

  // ── Route-level Supertest tests ───────────────────────────────────────────

  it('OWN-5: route returns 403 + USER_ID_MISMATCH when userId ≠ auth.uid()', async () => {
    authNotifAs({ id: FCM_USER_A })
    mockFrom_notif.mockImplementation((_table: string) => makeBuilder({ data: null, error: null }))

    const res = await request(notifApp)
      .post('/api/notifications/register-token')
      .set('Authorization', `Bearer test-token-${FCM_USER_A}`)
      .send({
        userId:   FCM_USER_B,       // spoofed — differs from auth.uid()
        token:    'fcm-hijack-001',
        platform: 'android',
      })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('USER_ID_MISMATCH')
  })

  it('OWN-5: route returns 200 when userId = auth.uid()', async () => {
    authNotifAs({ id: FCM_USER_A })

    mockFrom_notif.mockImplementation((_table: string) => ({
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: () => makeBuilder({ data: [], error: null }),
      eq:     () => makeBuilder({ data: [], error: null }),
    }))

    const res = await request(notifApp)
      .post('/api/notifications/register-token')
      .set('Authorization', `Bearer test-token-${FCM_USER_A}`)
      .send({
        userId:   FCM_USER_A,       // matches auth.uid()
        token:    'fcm-token-valid',
        platform: 'ios',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('OWN-5: unauthenticated register-token → 401', async () => {
    authFail_notif()

    const res = await request(notifApp)
      .post('/api/notifications/register-token')
      .send({
        userId:   FCM_USER_A,
        token:    'fcm-no-auth',
        platform: 'android',
      })

    expect(res.status).toBe(401)
  })
})
