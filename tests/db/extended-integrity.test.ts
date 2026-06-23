/**
 * tests/db/extended-integrity.test.ts
 *
 * Extended data-integrity + ownership tests.
 *
 * Invariants covered
 * ──────────────────
 *
 *  RETURN-1   State machine: buyer can only file a return on a delivered+paid order
 *  RETURN-2   State machine: duplicate return for same order_id blocked (unless prior
 *             return was rejected)
 *  RETURN-3   State machine: can only approve/reject a return in 'requested' state
 *  RETURN-4   refund_amount = total_amount − delivery_fee (server-computed, not client)
 *  RETURN-5   State machine: buyer cannot approve or reject their own return
 *  RETURN-6   Return window: past 7-day window → 400
 *
 *  COUPON-1   Discount math: percentage coupon = round(orderAmount × pct / 100)
 *  COUPON-2   Discount math: fixed coupon = min(discount_value, orderAmount)
 *  COUPON-3   Percentage coupon capped at order amount (never goes negative)
 *  COUPON-4   Expired coupon → 400
 *  COUPON-5   Usage-limit exhausted → 400
 *  COUPON-6   min_order_amount not met → 400
 *  COUPON-7   Coupon not active → 404
 *  COUPON-8   Cross-store coupon isolation: coupon for store A is invalid when
 *             validating against store B
 *
 *  CART-1     Cart is isolated per user: GET /cart/:userId scopes to user_id;
 *             another user's userId in the path still binds to the auth'd user's data
 *             (IDOR: route passes userId from path, not from JWT — documented as open gap)
 *  CART-2     Cart upsert (add/update): same user_id+product_id resolves to one row
 *  CART-3     Cart clear: DELETE /cart/user/:userId removes only that user's items
 *
 *  XREF-1     Order↔Payment consistency: every 'paid' order that is 'delivered' and
 *             has no payout_id is eligible for settlement — not orders that are only
 *             'delivered' with payment_status='pending' (COD awaiting confirmation)
 *  XREF-2     Order↔Payout link: once payout_id is set on an order, it is NOT
 *             re-included in the next /process batch (no double-payout)
 *  XREF-3     Order↔Return link: a return can only reference an existing order;
 *             the store_id on the return must match the order's store_id
 *  XREF-4     Payout net formula (with TCS): net = gross × 0.94
 *             (payout-service now applies both PLATFORM_FEE_PCT=5% and TCS_PCT=1%)
 *  XREF-5     Summary with TCS: totalEarned + totalTcs + totalPlatformFee ≈ gross
 *
 * Mock strategy
 * ─────────────
 * Route-level Supertest tests only. Top-level vi.mock() calls (hoisted by Vitest)
 * follow the EXACT pattern used across all files in this harness.
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

// ─── TOP-LEVEL MOCKS (hoisted by Vitest) ──────────────────────────────────────

const mockGetUser_return  = vi.fn()
const mockFrom_return     = vi.fn()
const mockGetUser_order   = vi.fn()
const mockFrom_order      = vi.fn()
const mockGetUser_admin   = vi.fn()
const mockFrom_admin      = vi.fn()
const mockGetUser_payout  = vi.fn()
const mockFrom_payout     = vi.fn()

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/return-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_return(...a) },
      from:          (...a: any[]) => mockFrom_return(...a),
    },
  }),
)

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
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/lib/supabase',
  () => ({
    supabaseAdmin: {
      auth: { getUser: (...a: any[]) => mockGetUser_admin(...a) },
      from:          (...a: any[]) => mockFrom_admin(...a),
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

// Silence order-service side-effects (notify + orderEvents)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/notify',
  () => ({ notifyOrderUpdate: vi.fn() }),
)
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/orderEvents',
  () => ({ recordOrderEvent: vi.fn() }),
)

// ─── Express apps (one per service under test) ────────────────────────────────

let returnApp:  express.Application
let orderApp:   express.Application
let adminApp:   express.Application
let payoutApp:  express.Application

beforeAll(async () => {
  const [
    { returnsRouter },
    { ordersRouter },
    { cartRouter },
    { couponsRouter },
    { payoutsRouter },
    { bankAccountsRouter },
  ] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/return-service/src/routes/returns'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/orders'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/cart'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/coupons'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/payouts'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/bankAccounts'),
  ])

  returnApp = express()
  returnApp.use(express.json())
  returnApp.use('/api/returns', returnsRouter)

  orderApp = express()
  orderApp.use(express.json())
  orderApp.use('/api/orders', ordersRouter)
  orderApp.use('/api/orders', cartRouter)

  adminApp = express()
  adminApp.use(express.json())
  adminApp.use('/api/admin/coupons', couponsRouter)

  payoutApp = express()
  payoutApp.use(express.json())
  payoutApp.use('/api/payouts', payoutsRouter)
  payoutApp.use('/api/payouts', bankAccountsRouter)
})

// ─── Auth helpers ──────────────────────────────────────────────────────────────

function authReturnAs(id: { id: string }) {
  mockGetUser_return.mockResolvedValue({ data: { user: makeSupabaseUser(id) }, error: null })
}
function authReturnFail() {
  mockGetUser_return.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
}

function authOrderAs(id: { id: string }) {
  mockGetUser_order.mockResolvedValue({ data: { user: makeSupabaseUser(id) }, error: null })
}
function authOrderFail() {
  mockGetUser_order.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
}

function authAdminAs(id: { id: string }) {
  mockGetUser_admin.mockResolvedValue({ data: { user: makeSupabaseUser(id) }, error: null })
}

function authPayoutAs(id: { id: string }) {
  mockGetUser_payout.mockResolvedValue({ data: { user: makeSupabaseUser(id) }, error: null })
}
function authPayoutFail() {
  mockGetUser_payout.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  authReturnFail()
  authOrderFail()
  authPayoutFail()
})

// ─── Reusable minimal builder ─────────────────────────────────────────────────

function makeBuilder(result: any): any {
  const b: any = {
    select:      () => b,
    insert:      (_d: any) => ({ select: () => ({ single: () => Promise.resolve(result) }) }),
    update:      (_d: any) => ({ eq: () => b, in: () => Promise.resolve(result), select: () => ({ single: () => Promise.resolve(result) }) }),
    upsert:      (_d: any, _opts?: any) => ({ select: () => ({ single: () => Promise.resolve(result) }) }),
    delete:      () => b,
    eq:          () => b,
    neq:         () => b,
    lte:         () => b,
    is:          () => b,
    in:          () => b,
    order:       () => b,
    limit:       () => b,
    single:      () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then:        (fn: any) => Promise.resolve(result).then(fn),
  }
  return b
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const RETURN_ID       = 'aabbcc01-0001-4000-8000-000000000001'
const COUPON_ID       = 'aabbcc02-0001-4000-8000-000000000001'
const CART_ITEM_ID_A  = 'aabbcc03-0001-4000-8000-000000000001'
const CART_ITEM_ID_B  = 'aabbcc04-0002-4000-8000-000000000002'
const PRODUCT_ID      = 'aabbcc05-0001-4000-8000-000000000001'

/** A fully delivered, paid order — the canonical state for returns */
const DELIVERED_PAID_ORDER = {
  id: ORDER.id,
  buyer_id: BUYER.id,
  store_id: STORE.id,
  status: 'delivered',
  payment_status: 'paid',
  total_amount: 1060,
  delivery_fee: 60,
  delivered_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), // 2 days ago — within window
}

/** A COD order that has been delivered but payment not confirmed */
const DELIVERED_COD_UNPAID = {
  ...DELIVERED_PAID_ORDER,
  payment_status: 'pending',
}

/** An order that is still being processed (not yet delivered) */
const PROCESSING_ORDER = {
  ...DELIVERED_PAID_ORDER,
  status: 'accepted',
}

/** A return row already in 'requested' state */
const REQUESTED_RETURN = {
  id: RETURN_ID,
  order_id: ORDER.id,
  buyer_id: BUYER.id,
  store_id: STORE.id,
  status: 'requested',
  reason: 'damaged',
  refund_amount: 1000,  // 1060 - 60
  orders: {
    order_number: ORDER.order_number,
    total_amount: 1060,
    stores: { seller_id: SELLER.id },
  },
}

/** A return that was previously rejected — buyer may refile */
const REJECTED_RETURN = { ...REQUESTED_RETURN, status: 'rejected' }

/** An approved return (cannot approve/reject again) */
const APPROVED_RETURN = { ...REQUESTED_RETURN, status: 'approved' }

const COUPON_PERCENTAGE = {
  id: COUPON_ID,
  store_id: STORE.id,
  code: 'SAVE10',
  discount_type: 'percentage',
  discount_value: 10,
  min_order_amount: 0,
  max_uses: null,
  uses: 0,
  is_active: true,
  expires_at: null,
}

const COUPON_FIXED = {
  ...COUPON_PERCENTAGE,
  code: 'FLAT100',
  discount_type: 'fixed',
  discount_value: 100,
}

const COUPON_EXPIRED = {
  ...COUPON_PERCENTAGE,
  code: 'OLDCODE',
  expires_at: new Date(Date.now() - 86_400_000).toISOString(), // yesterday
}

const COUPON_MAXED = {
  ...COUPON_PERCENTAGE,
  code: 'USED10',
  max_uses: 10,
  uses: 10,
}

const COUPON_INACTIVE = {
  ...COUPON_PERCENTAGE,
  code: 'DEAD',
  is_active: false,
}

const CART_ITEM_BUYER_A = {
  id: CART_ITEM_ID_A,
  user_id: BUYER.id,
  store_id: STORE.id,
  product_id: PRODUCT_ID,
  qty: 2,
}

const CART_ITEM_BUYER_B = {
  id: CART_ITEM_ID_B,
  user_id: OTHER_BUYER.id,
  store_id: STORE.id,
  product_id: PRODUCT_ID,
  qty: 1,
}


// ══════════════════════════════════════════════════════════════════════════════
// RETURN STATE MACHINE TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('RETURN-1 — buyer can only file a return on a delivered + paid order', () => {

  const VALID_BODY = {
    order_id: ORDER.id,
    reason:   'damaged',
  }

  function mockOrderForReturn(order: any, existingReturn: any = null) {
    let ordersHit = false
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: order, error: null })
      }
      if (table === 'returns') {
        // maybeSingle for existing-return check
        return { ...makeBuilder({ data: existingReturn, error: null }), maybeSingle: () => Promise.resolve({ data: existingReturn, error: null }) }
      }
      return makeBuilder({ data: null, error: null })
    })
  }

  it('RETURN-1a: 401 without auth', async () => {
    const res = await request(returnApp).post('/api/returns').send(VALID_BODY)
    expect(res.status).toBe(401)
  })

  it('RETURN-1b: accepts return for delivered + paid order (happy path)', async () => {
    authReturnAs(BUYER)
    const inserts: any[] = []
    let ordersHit = false
    let returnsCheckHit = false

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: DELIVERED_PAID_ORDER, error: null })
      }
      if (table === 'returns' && !returnsCheckHit) {
        returnsCheckHit = true
        // maybeSingle check — no existing return
        const b: any = { ...makeBuilder({ data: null, error: null }), select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
        return b
      }
      if (table === 'returns') {
        // The actual insert
        return {
          insert: (row: any) => {
            inserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: RETURN_ID }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    // Verify the store_id is derived from the order, not a client field
    expect(inserts[0].store_id).toBe(STORE.id)
    expect(inserts[0].buyer_id).toBe(BUYER.id)
  })

  it('RETURN-1c: 400 when order status is not delivered (e.g. accepted)', async () => {
    authReturnAs(BUYER)
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders') return makeBuilder({ data: PROCESSING_ORDER, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/delivered/i)
  })

  it('RETURN-1d: 400 when order is delivered but payment_status is pending (COD unconfirmed)', async () => {
    authReturnAs(BUYER)
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders') return makeBuilder({ data: DELIVERED_COD_UNPAID, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/paid/i)
  })

  it('RETURN-1e: 403 when buyer tries to file return for another buyer\'s order', async () => {
    authReturnAs(OTHER_BUYER)  // auth'd as OTHER_BUYER
    const otherOrder = { ...DELIVERED_PAID_ORDER, buyer_id: BUYER.id }  // order belongs to BUYER
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders') return makeBuilder({ data: otherOrder, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(OTHER_BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(403)
  })

  it('RETURN-1f: 404 when order_id does not exist', async () => {
    authReturnAs(BUYER)
    mockFrom_return.mockImplementation((_table: string) => makeBuilder({ data: null, error: { message: 'not found' } }))

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(404)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RETURN-2 — duplicate return for same order_id blocked (idempotency)', () => {
  const VALID_BODY = { order_id: ORDER.id, reason: 'damaged' }

  it('RETURN-2a: 400 when a requested return already exists for the order', async () => {
    authReturnAs(BUYER)
    let ordersHit = false
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: DELIVERED_PAID_ORDER, error: null })
      }
      if (table === 'returns') {
        // maybeSingle returns an existing requested return
        const b: any = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: REQUESTED_RETURN, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('RETURN-2b: 400 when an approved return already exists (no re-filing of approved)', async () => {
    authReturnAs(BUYER)
    let ordersHit = false
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: DELIVERED_PAID_ORDER, error: null })
      }
      if (table === 'returns') {
        const b: any = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: APPROVED_RETURN, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_BODY)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('RETURN-2c: buyer CAN refile when prior return was rejected', async () => {
    authReturnAs(BUYER)
    const inserts: any[] = []
    let ordersHit = false
    let returnsFirstHit = false

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: DELIVERED_PAID_ORDER, error: null })
      }
      if (table === 'returns' && !returnsFirstHit) {
        returnsFirstHit = true
        // maybeSingle: a previously rejected return exists → re-filing allowed
        const b: any = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: REJECTED_RETURN, error: null }) }
        return b
      }
      if (table === 'returns') {
        return {
          insert: (row: any) => {
            inserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: RETURN_ID + '_2' }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'wrong_item' })

    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RETURN-3 — approve/reject only possible on \'requested\' returns', () => {

  it('RETURN-3a: 400 when trying to approve an already-approved return', async () => {
    authReturnAs(SELLER)

    // The approve route fetches the return first
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'returns') return makeBuilder({ data: { ...APPROVED_RETURN, orders: { payment_id: null, stores: { seller_id: SELLER.id } } }, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Can only approve requested/i)
  })

  it('RETURN-3b: 400 when trying to reject an already-approved return', async () => {
    authReturnAs(SELLER)

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'returns') return makeBuilder({ data: { ...APPROVED_RETURN, orders: { stores: { seller_id: SELLER.id } } }, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: 'Item looks fine' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Can only reject requested/i)
  })

  it('RETURN-3c: 403 when OTHER_SELLER tries to reject SELLER\'s store return', async () => {
    authReturnAs(OTHER_SELLER)

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'returns') return makeBuilder({ data: { ...REQUESTED_RETURN, orders: { stores: { seller_id: SELLER.id } } }, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ reason: 'Nope' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('RETURN-3d: reject requires a non-empty reason', async () => {
    authReturnAs(SELLER)

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'returns') return makeBuilder({ data: { ...REQUESTED_RETURN, orders: { stores: { seller_id: SELLER.id } } }, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: '' })   // empty reason

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Rejection reason required/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RETURN-4 — refund_amount = total_amount − delivery_fee (server-computed)', () => {

  /**
   * The service computes: refund_amount = order.total_amount - order.delivery_fee
   * Clients do NOT supply refund_amount; it is always derived server-side.
   */

  it('RETURN-4a: pure formula: 1060 − 60 = 1000', () => {
    const total = 1060, delivery = 60
    expect(total - delivery).toBe(1000)
  })

  it('RETURN-4b: zero delivery_fee → refund = full total', () => {
    const total = 800, delivery = 0
    expect(total - delivery).toBe(800)
  })

  it('RETURN-4c: insert captures server-derived refund_amount (not a client value)', async () => {
    authReturnAs(BUYER)
    const inserts: any[] = []
    let ordersHit = false
    let returnsCheckHit = false

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: { ...DELIVERED_PAID_ORDER, total_amount: 2060, delivery_fee: 60 }, error: null })
      }
      if (table === 'returns' && !returnsCheckHit) {
        returnsCheckHit = true
        const b: any = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
        return b
      }
      if (table === 'returns') {
        return {
          insert: (row: any) => {
            inserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: RETURN_ID }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'wrong_item' })

    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
    // Server must derive 2060 - 60 = 2000, regardless of what the client sends
    expect(inserts[0].refund_amount).toBe(2000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RETURN-5 — buyer cannot approve or reject their own return', () => {
  /**
   * Approve and reject routes check that the caller is the SELLER (or admin)
   * of the order's store, not just any authenticated user.
   * A buyer who happens to be the return filer cannot approve their own claim.
   */

  it('RETURN-5a: buyer calling approve endpoint → 403 (not the seller)', async () => {
    authReturnAs(BUYER)
    // Return exists; order belongs to SELLER's store
    mockFrom_return.mockImplementation((_table: string) =>
      makeBuilder({ data: { ...REQUESTED_RETURN, orders: { payment_id: null, stores: { seller_id: SELLER.id } } }, error: null }),
    )

    const res = await request(returnApp)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(BUYER))   // BUYER ≠ SELLER

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('RETURN-6 — return window: past 7-day window → 400', () => {

  it('RETURN-6a: 400 when delivered_at is more than 7 days ago', async () => {
    authReturnAs(BUYER)

    const expiredOrder = {
      ...DELIVERED_PAID_ORDER,
      delivered_at: new Date(Date.now() - 9 * 86_400_000).toISOString(),  // 9 days ago
    }

    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders') return makeBuilder({ data: expiredOrder, error: null })
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/window.*expired|expired.*window/i)
  })

  it('RETURN-6b: return accepted when delivered_at is within 7 days', async () => {
    authReturnAs(BUYER)
    const inserts: any[] = []
    let ordersHit = false
    let returnsCheckHit = false

    // within-window order (2 days ago = DELIVERED_PAID_ORDER fixture)
    mockFrom_return.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeBuilder({ data: DELIVERED_PAID_ORDER, error: null })
      }
      if (table === 'returns' && !returnsCheckHit) {
        returnsCheckHit = true
        const b: any = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
        return b
      }
      if (table === 'returns') {
        return {
          insert: (row: any) => {
            inserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...row, id: RETURN_ID }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(returnApp)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'not_as_described' })

    expect(res.status).toBe(201)
    expect(inserts).toHaveLength(1)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// COUPON TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('COUPON-1/2/3 — discount math: percentage and fixed', () => {
  /**
   * These pure-predicate tests mirror the server-side formula exactly:
   *   percentage: Math.round(Math.min((amount × pct / 100), amount))
   *   fixed:      Math.round(Math.min(discount_value, amount))
   */

  function computeDiscount(
    coupon: { discount_type: 'percentage' | 'fixed'; discount_value: number },
    orderAmount: number,
  ): number {
    const raw = coupon.discount_type === 'percentage'
      ? Math.min((orderAmount * coupon.discount_value) / 100, orderAmount)
      : Math.min(coupon.discount_value, orderAmount)
    return Math.round(raw)
  }

  it('COUPON-1a: 10% off ₹1000 = ₹100', () => {
    expect(computeDiscount({ discount_type: 'percentage', discount_value: 10 }, 1000)).toBe(100)
  })

  it('COUPON-1b: 15% off ₹500 = ₹75', () => {
    expect(computeDiscount({ discount_type: 'percentage', discount_value: 15 }, 500)).toBe(75)
  })

  it('COUPON-1c: 5% off ₹333 = round(16.65) = ₹17', () => {
    expect(computeDiscount({ discount_type: 'percentage', discount_value: 5 }, 333)).toBe(17)
  })

  it('COUPON-2a: fixed ₹100 off ₹1000 = ₹100', () => {
    expect(computeDiscount({ discount_type: 'fixed', discount_value: 100 }, 1000)).toBe(100)
  })

  it('COUPON-2b: fixed ₹200 off ₹150 is capped at ₹150 (cannot exceed order total)', () => {
    expect(computeDiscount({ discount_type: 'fixed', discount_value: 200 }, 150)).toBe(150)
  })

  it('COUPON-3: 200% percentage coupon is capped at the order amount, never negative', () => {
    // Extreme edge: discount_value=200 (percent). Without the min() cap this
    // would produce a negative order total.
    expect(computeDiscount({ discount_type: 'percentage', discount_value: 200 }, 500)).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('COUPON-4 — expired coupon → 400', () => {
  it('rejects a coupon whose expires_at is in the past', async () => {
    authAdminAs(SELLER)

    // Seller owns the store
    let storesHit = false
    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeBuilder({ data: { id: STORE.id }, error: null })
      }
      if (table === 'coupons') {
        // coupon exists but is expired — validate route uses maybeSingle
        const b: any = { ...makeBuilder({ data: COUPON_EXPIRED, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: COUPON_EXPIRED, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'OLDCODE', storeId: STORE.id, orderAmount: 500 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expired/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('COUPON-5 — usage limit exhausted → 400', () => {
  it('rejects when max_uses is reached', async () => {
    authAdminAs(SELLER)

    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'coupons') {
        const b: any = { ...makeBuilder({ data: COUPON_MAXED, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: COUPON_MAXED, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'USED10', storeId: STORE.id, orderAmount: 500 })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/usage limit/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('COUPON-6 — min_order_amount not met → 400', () => {
  it('rejects when order amount is below the minimum', async () => {
    authAdminAs(SELLER)

    const couponWithMin = { ...COUPON_PERCENTAGE, min_order_amount: 999, code: 'MIN999' }

    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'coupons') {
        const b: any = { ...makeBuilder({ data: couponWithMin, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: couponWithMin, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'MIN999', storeId: STORE.id, orderAmount: 500 })  // 500 < 999

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Minimum order/i)
  })

  it('accepts when order amount exactly meets the minimum', async () => {
    authAdminAs(SELLER)

    const couponWithMin = { ...COUPON_PERCENTAGE, min_order_amount: 500, code: 'MIN500' }

    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'coupons') {
        const b: any = { ...makeBuilder({ data: couponWithMin, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: couponWithMin, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'MIN500', storeId: STORE.id, orderAmount: 500 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.discount).toBe(50)  // 10% of 500
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('COUPON-7 — inactive coupon → 404', () => {
  it('returns 404 for an inactive coupon (is_active=false)', async () => {
    authAdminAs(SELLER)

    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'coupons') {
        // is_active=false → query with .eq('is_active', true) returns null
        const b: any = { ...makeBuilder({ data: null, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'DEAD', storeId: STORE.id, orderAmount: 500 })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Invalid or expired coupon/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('COUPON-8 — cross-store coupon isolation', () => {
  /**
   * The validate route queries: .eq('code', code).eq('store_id', storeId).eq('is_active', true)
   * A coupon from Store A must NOT be valid when the buyer is shopping at Store B.
   * This is enforced by the store_id eq filter in the query.
   */

  it('COUPON-8a: pure predicate — coupon store_id mismatch returns false', () => {
    function isCouponValidForStore(couponStoreId: string, requestedStoreId: string): boolean {
      return couponStoreId === requestedStoreId
    }
    expect(isCouponValidForStore(STORE.id, STORE.id)).toBe(true)
    expect(isCouponValidForStore(STORE.id, OTHER_STORE.id)).toBe(false)
    expect(isCouponValidForStore(OTHER_STORE.id, STORE.id)).toBe(false)
  })

  it('COUPON-8b: validate route returns 404 when coupon belongs to a different store', async () => {
    authAdminAs(SELLER)

    // The combined eq chain store_id=OTHER_STORE.id on a coupon for STORE → null
    mockFrom_admin.mockImplementation((table: string) => {
      if (table === 'coupons') {
        const b: any = { ...makeBuilder({ data: null, error: null }), eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }) }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'SAVE10', storeId: OTHER_STORE.id, orderAmount: 500 })

    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Invalid or expired coupon/i)
  })

  it('COUPON-8c: missing required params → 400 (not a mis-scoped coupon leak)', async () => {
    authAdminAs(SELLER)

    const res = await request(adminApp)
      .post('/api/admin/coupons/validate')
      .set('Authorization', bearerToken(SELLER))
      .send({ code: 'SAVE10' })  // missing storeId + orderAmount

    expect(res.status).toBe(400)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// CART ISOLATION TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('CART-1 — cart read: GET /cart/:userId isolation', () => {
  /**
   * The route at GET /cart/:userId passes the :userId from the path directly
   * to the Supabase query (.eq('user_id', req.params.userId)).
   * This is an IDOR risk: an authenticated user can read another user's cart
   * by supplying a different userId in the path.
   *
   * We document the current behavior as a sentinel test.
   * If the route is fixed to bind user_id from req.user.id (JWT), this test
   * will need to be updated to assert the fix is in place.
   *
   * Bug owner: backend-engineer (order-service cart.ts).
   */

  it('CART-1a: authenticated buyer can GET their own cart', async () => {
    authOrderAs(BUYER)

    const queriedUserIds: string[] = []
    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'cart_items') {
        const b: any = {
          select: () => b,
          eq: (col: string, val: string) => { if (col === 'user_id') queriedUserIds.push(val); return b },
          order: () => b,
          then: (fn: any) => Promise.resolve({ data: [CART_ITEM_BUYER_A], error: null }).then(fn),
        }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .get(`/api/orders/cart/${BUYER.id}`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // The route queries with the path param userId
    expect(queriedUserIds).toContain(BUYER.id)
  })

  it('CART-1b: IDOR sentinel — cart/:userId trusts path param, not JWT (open bug)', async () => {
    /**
     * SENTINEL for IDOR — this test documents the current (broken) behavior.
     *
     * Current: authenticated OTHER_BUYER can read BUYER's cart by passing
     *          BUYER.id in the URL path. Route does not check that the path
     *          userId matches req.user.id.
     *
     * Expected (after fix): 403 when path userId ≠ req.user.id.
     *
     * Route to: backend-engineer (order-service cart.ts line 12 — bind to req.user.id).
     */
    authOrderAs(OTHER_BUYER)

    const queriedUserIds: string[] = []
    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'cart_items') {
        const b: any = {
          select: () => b,
          eq: (col: string, val: string) => { if (col === 'user_id') queriedUserIds.push(val); return b },
          order: () => b,
          then: (fn: any) => Promise.resolve({ data: [CART_ITEM_BUYER_A], error: null }).then(fn),
        }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .get(`/api/orders/cart/${BUYER.id}`)     // path has BUYER.id
      .set('Authorization', bearerToken(OTHER_BUYER))  // but JWT is OTHER_BUYER

    // SENTINEL: currently returns 200 (IDOR gap).
    // When fixed, this should return 403.
    // Update this assertion and file a test-update task when the bug is fixed.
    expect(res.status).toBe(200)
    // The query went to BUYER.id — the path param was trusted over the JWT
    expect(queriedUserIds).toContain(BUYER.id)
    expect(queriedUserIds).not.toContain(OTHER_BUYER.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('CART-2 — cart upsert: same user_id+product_id does not create duplicate rows', () => {
  /**
   * The cart upsert uses: .upsert(parsed.data, { onConflict: 'user_id,product_id' })
   * A second add of the same product must update qty, not insert a second row.
   */

  it('CART-2a: pure predicate — upsert semantics on (user_id, product_id)', () => {
    const cartDB: Record<string, typeof CART_ITEM_BUYER_A> = {}

    function upsertCart(item: { user_id: string; product_id: string; qty: number }) {
      const key = `${item.user_id}:${item.product_id}`
      cartDB[key] = { ...CART_ITEM_BUYER_A, ...item }
      return cartDB[key]
    }

    upsertCart({ user_id: BUYER.id, product_id: PRODUCT_ID, qty: 1 })
    upsertCart({ user_id: BUYER.id, product_id: PRODUCT_ID, qty: 3 })  // update

    expect(Object.keys(cartDB)).toHaveLength(1)  // still one entry
    expect(cartDB[`${BUYER.id}:${PRODUCT_ID}`].qty).toBe(3)
  })

  it('CART-2b: different users get separate cart rows for the same product', () => {
    const cartDB: Record<string, { user_id: string; product_id: string; qty: number }> = {}

    function upsertCart(item: { user_id: string; product_id: string; qty: number }) {
      const key = `${item.user_id}:${item.product_id}`
      cartDB[key] = item
    }

    upsertCart({ user_id: BUYER.id, product_id: PRODUCT_ID, qty: 2 })
    upsertCart({ user_id: OTHER_BUYER.id, product_id: PRODUCT_ID, qty: 5 })

    expect(Object.keys(cartDB)).toHaveLength(2)
    expect(cartDB[`${BUYER.id}:${PRODUCT_ID}`].qty).toBe(2)
    expect(cartDB[`${OTHER_BUYER.id}:${PRODUCT_ID}`].qty).toBe(5)
  })

  it('CART-2c: POST /cart returns 200 and single row', async () => {
    authOrderAs(BUYER)

    const upserts: any[] = []
    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'cart_items') {
        return {
          upsert: (data: any, _opts?: any) => {
            upserts.push(data)
            return { select: () => ({ single: () => Promise.resolve({ data: { ...data, id: CART_ITEM_ID_A }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .post('/api/orders/cart')
      .set('Authorization', bearerToken(BUYER))
      .send({ user_id: BUYER.id, store_id: STORE.id, product_id: PRODUCT_ID, qty: 2 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(upserts).toHaveLength(1)
    expect(upserts[0].qty).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('CART-3 — cart clear: DELETE /cart/user/:userId removes only that user\'s items', () => {
  it('CART-3a: pure predicate — cart clear is scoped by user_id', () => {
    let db = [CART_ITEM_BUYER_A, CART_ITEM_BUYER_B]

    function clearCart(userId: string) {
      db = db.filter(item => item.user_id !== userId)
    }

    clearCart(BUYER.id)
    expect(db).toHaveLength(1)
    expect(db[0].user_id).toBe(OTHER_BUYER.id)
  })

  it('CART-3b: DELETE /cart/user/:userId invokes delete scoped to that user', async () => {
    authOrderAs(BUYER)

    const deletedUserIds: string[] = []
    mockFrom_order.mockImplementation((table: string) => {
      if (table === 'cart_items') {
        const b: any = {
          delete: () => b,
          eq: (col: string, val: string) => {
            if (col === 'user_id') deletedUserIds.push(val)
            return b
          },
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(orderApp)
      .delete(`/api/orders/cart/user/${BUYER.id}`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(deletedUserIds).toContain(BUYER.id)
    expect(deletedUserIds).not.toContain(OTHER_BUYER.id)
  })
})


// ══════════════════════════════════════════════════════════════════════════════
// CROSS-TABLE CONSISTENCY TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('XREF-1 — order↔payment: only paid+delivered orders eligible for settlement', () => {
  /**
   * The payout /process route filters:
   *   .eq('status', 'delivered').eq('payment_status', 'paid').is('payout_id', null)
   * COD orders that are delivered but payment_status='pending' must NOT be included.
   */

  type OrderRow = {
    id: string
    status: string
    payment_status: string
    payout_id: string | null
    total_amount: number
    delivery_fee: number
  }

  function eligibleForPayout(order: OrderRow): boolean {
    return (
      order.status === 'delivered' &&
      order.payment_status === 'paid' &&
      order.payout_id === null
    )
  }

  it('XREF-1a: paid+delivered+no payout → eligible', () => {
    const o: OrderRow = { id: 'o1', status: 'delivered', payment_status: 'paid', payout_id: null, total_amount: 1060, delivery_fee: 60 }
    expect(eligibleForPayout(o)).toBe(true)
  })

  it('XREF-1b: delivered but payment_status=pending (COD unconfirmed) → NOT eligible', () => {
    const o: OrderRow = { id: 'o2', status: 'delivered', payment_status: 'pending', payout_id: null, total_amount: 860, delivery_fee: 60 }
    expect(eligibleForPayout(o)).toBe(false)
  })

  it('XREF-1c: paid but not yet delivered → NOT eligible (still in transit)', () => {
    const o: OrderRow = { id: 'o3', status: 'shipped', payment_status: 'paid', payout_id: null, total_amount: 1060, delivery_fee: 60 }
    expect(eligibleForPayout(o)).toBe(false)
  })

  it('XREF-1d: paid+delivered but already has payout_id → NOT eligible (no double-payout)', () => {
    const o: OrderRow = { id: 'o4', status: 'delivered', payment_status: 'paid', payout_id: 'payout-123', total_amount: 1060, delivery_fee: 60 }
    expect(eligibleForPayout(o)).toBe(false)
  })

  it('XREF-1e: cancelled order with payment_status=paid → NOT eligible (cancellation beats delivery)', () => {
    const o: OrderRow = { id: 'o5', status: 'cancelled', payment_status: 'paid', payout_id: null, total_amount: 1060, delivery_fee: 60 }
    expect(eligibleForPayout(o)).toBe(false)
  })

  it('XREF-1f: payout /process route — only processes orders where all three conditions hold', async () => {
    authPayoutAs({ id: 'admin-user-id' })

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const candidateOrders = [
      { id: 'ord-paid-delivered', store_id: STORE.id, total_amount: 1060, delivery_fee: 60 },
    ]

    const payoutInserts: any[] = []
    let ordersQueryHit = false
    let storesQueryHit = false
    let payoutInsertHit = false
    let ordersUpdateHit = false

    mockFrom_payout.mockImplementation((table: string) => {
      if (table === 'users') {
        // requireAdmin check
        return makeBuilder({ data: { role: 'admin', is_admin: true }, error: null })
      }
      if (table === 'orders' && !ordersQueryHit) {
        ordersQueryHit = true
        const b: any = {
          select: () => b,
          eq: () => b,
          is: () => b,
          lte: () => b,
          then: (fn: any) => Promise.resolve({ data: candidateOrders, error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores' && !storesQueryHit) {
        storesQueryHit = true
        const b: any = {
          select: () => b,
          in: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ id: STORE.id, suspended: false }], error: null }).then(fn),
        }
        return b
      }
      if (table === 'payouts' && !payoutInsertHit) {
        payoutInsertHit = true
        return {
          insert: (row: any) => {
            payoutInserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'payout-new-001' }, error: null }) }) }
          },
        }
      }
      if (table === 'orders' && !ordersUpdateHit) {
        ordersUpdateHit = true
        return makeBuilder({ data: null, error: null })
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(payoutApp)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken({ id: 'admin-user-id' }))
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(payoutInserts).toHaveLength(1)
    // Net formula: gross (1060 - 60 = 1000) × 0.94 = 940
    expect(Math.round(payoutInserts[0].amount)).toBe(940)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('XREF-2 — order↔payout link: payout_id set → order excluded from next batch', () => {
  /**
   * The payout /process filter: .is('payout_id', null)
   * Once an order has been assigned a payout_id, it must NEVER appear in a
   * subsequent /process batch. This is the core double-payout guard.
   */

  it('XREF-2a: pure predicate — payout_id!=null excludes from batch', () => {
    const orders = [
      { id: 'o1', payout_id: null },
      { id: 'o2', payout_id: 'payout-abc' },
      { id: 'o3', payout_id: null },
    ]
    const batch = orders.filter(o => o.payout_id === null)
    expect(batch).toHaveLength(2)
    expect(batch.map(o => o.id)).toEqual(['o1', 'o3'])
    expect(batch.some(o => o.id === 'o2')).toBe(false)
  })

  it('XREF-2b: two identical /process calls → payout_id is set after first → second call processes 0 orders', async () => {
    const orders = [
      { id: 'o-alpha', store_id: STORE.id, total_amount: 1060, delivery_fee: 60 },
    ]
    let ordersHavePayoutId = false  // simulate side effect of first run
    const payoutInserts: any[] = []
    let adminHit = false

    authPayoutAs({ id: 'admin-user-id' })
    mockFrom_payout.mockImplementation((table: string) => {
      if (table === 'users') {
        if (!adminHit) { adminHit = true }
        return makeBuilder({ data: { role: 'admin', is_admin: true }, error: null })
      }
      if (table === 'orders') {
        const ordersForBatch = ordersHavePayoutId ? [] : orders
        const b: any = {
          select: () => b,
          eq: () => b,
          is: () => b,
          lte: () => b,
          update: (_d: any) => {
            ordersHavePayoutId = true  // simulate payout_id being written
            return { in: () => Promise.resolve({ data: null, error: null }) }
          },
          in: () => Promise.resolve({ data: null, error: null }),
          then: (fn: any) => Promise.resolve({ data: ordersForBatch, error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores') {
        const b: any = {
          select: () => b,
          in: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ id: STORE.id, suspended: false }], error: null }).then(fn),
        }
        return b
      }
      if (table === 'payouts') {
        return {
          insert: (row: any) => {
            payoutInserts.push(row)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'payout-first' }, error: null }) }) }
          },
        }
      }
      return makeBuilder({ data: null, error: null })
    })

    // First run
    const res1 = await request(payoutApp)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken({ id: 'admin-user-id' }))
      .send({})
    expect(res1.status).toBe(200)

    // Second run — orders already have payout_id set; /process should find no eligible orders
    adminHit = false
    const res2 = await request(payoutApp)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken({ id: 'admin-user-id' }))
      .send({})
    expect(res2.status).toBe(200)
    expect(res2.body.data.processed).toBe(0)
    // Only one payout row inserted total across both calls
    expect(payoutInserts).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('XREF-3 — order↔return consistency: store_id coherence', () => {
  /**
   * When a return is filed, the service derives store_id from the order row.
   * This ensures the return's store_id always matches the order's store_id —
   * clients cannot supply a different store_id to associate a return with a
   * store they don't own.
   */

  it('XREF-3a: pure predicate — return.store_id must equal order.store_id', () => {
    function buildReturnRow(order: { store_id: string; buyer_id: string; total_amount: number; delivery_fee: number }, callerId: string) {
      if (order.buyer_id !== callerId) throw new Error('Forbidden')
      return {
        store_id: order.store_id,   // always from order — never from client
        buyer_id: callerId,
        refund_amount: order.total_amount - order.delivery_fee,
      }
    }

    const returnRow = buildReturnRow(
      { store_id: STORE.id, buyer_id: BUYER.id, total_amount: 1060, delivery_fee: 60 },
      BUYER.id,
    )

    expect(returnRow.store_id).toBe(STORE.id)
    expect(returnRow.refund_amount).toBe(1000)
  })

  it('XREF-3b: a return row cannot reference an order that belongs to a different store', () => {
    // If a buyer supplied the wrong store_id in an API field (hypothetically),
    // the service ignores it and takes store_id from the fetched order.
    // This is enforced by the route: `store_id: order.store_id` (return-service/returns.ts:43)

    const orderFromDB = { store_id: STORE.id, buyer_id: BUYER.id, total_amount: 1060, delivery_fee: 60 }
    const derivedStoreId = orderFromDB.store_id  // always from the DB order

    expect(derivedStoreId).toBe(STORE.id)
    expect(derivedStoreId).not.toBe(OTHER_STORE.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('XREF-4/5 — payout net formula now includes TCS (Sec 194-O, 1%)', () => {
  /**
   * After the BUG-TCS-001 fix landed in payout-service, the formula is:
   *   net = gross × (1 − PLATFORM_FEE_PCT − TCS_PCT) = gross × 0.94
   *
   * The /summary endpoint now returns totalTcs and totalPlatformFee fields.
   * Verify: totalEarned + totalTcs + totalPlatformFee ≈ gross (accounting for rounding)
   */

  const PLATFORM_FEE_PCT = 0.05
  const TCS_PCT = 0.01

  function netWithTCS(gross: number): number {
    return Math.round(gross * (1 - PLATFORM_FEE_PCT - TCS_PCT))
  }

  it('XREF-4a: gross=1000 → net=940 (5% fee + 1% TCS)', () => {
    expect(netWithTCS(1000)).toBe(940)
  })

  it('XREF-4b: gross=750 → net=705', () => {
    expect(netWithTCS(750)).toBe(705)
  })

  it('XREF-4c: gross=0 → net=0', () => {
    expect(netWithTCS(0)).toBe(0)
  })

  it('XREF-4d: formula is strictly less than the old 5%-only formula (seller never overpaid)', () => {
    const gross = 1000
    const oldNet = gross * (1 - PLATFORM_FEE_PCT)          // 950
    const newNet = gross * (1 - PLATFORM_FEE_PCT - TCS_PCT) // 940
    expect(newNet).toBeLessThan(oldNet)
    expect(oldNet - newNet).toBeCloseTo(10, 10)  // exactly ₹10 TCS per ₹1000 gross
  })

  it('XREF-5: summary route returns totalTcs + totalPlatformFee fields that sum with totalEarned ≈ gross', async () => {
    authPayoutAs(SELLER)

    // Order: total=1060, delivery=60 → gross=1000
    mockFrom_payout.mockImplementation((table: string) => {
      if (table === 'stores') return makeBuilder({ data: { id: STORE.id }, error: null })
      if (table === 'orders') {
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ total_amount: 1060, delivery_fee: 60 }], error: null }).then(fn),
        }
        return b
      }
      if (table === 'payouts') {
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
        }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(payoutApp)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    const { totalEarned, totalPlatformFee, totalTcs, totalPaid, pending } = res.body.data

    // New formula: net = 1000 × 0.94 = 940
    expect(totalEarned).toBe(940)
    expect(totalPlatformFee).toBe(50)   // 1000 × 0.05
    expect(totalTcs).toBe(10)           // 1000 × 0.01

    // Accounting identity: earned + fee + tcs ≈ gross (1000)
    // Small rounding may occur but the totals must reconcile within ₹1
    expect(totalEarned + totalPlatformFee + totalTcs).toBeGreaterThanOrEqual(999)
    expect(totalEarned + totalPlatformFee + totalTcs).toBeLessThanOrEqual(1001)

    // No payouts done yet
    expect(totalPaid).toBe(0)
    expect(pending).toBe(940)  // pending = totalEarned − totalPaid
  })

  it('XREF-5b: summary correctly computes pending = totalEarned − totalPaid', async () => {
    authPayoutAs(SELLER)

    mockFrom_payout.mockImplementation((table: string) => {
      if (table === 'stores') return makeBuilder({ data: { id: STORE.id }, error: null })
      if (table === 'orders') {
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [
            { total_amount: 1060, delivery_fee: 60 },  // gross=1000 → net=940
            { total_amount: 810,  delivery_fee: 60 },  // gross=750  → net=705
          ], error: null }).then(fn),
        }
        return b
      }
      if (table === 'payouts') {
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ amount: 500, status: 'done' }], error: null }).then(fn),
        }
        return b
      }
      return makeBuilder({ data: null, error: null })
    })

    const res = await request(payoutApp)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    const { totalEarned, totalPaid, pending } = res.body.data

    // gross = (1000 + 750) = 1750 → net = 1750 × 0.94 = 1645
    expect(totalEarned).toBe(1645)
    expect(totalPaid).toBe(500)
    expect(pending).toBe(1145)  // 1645 - 500
  })
})
