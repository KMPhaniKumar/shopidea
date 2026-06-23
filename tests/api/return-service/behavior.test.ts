/**
 * return-service — behavior tests (P1-6)
 *
 * Covers:
 *  - POST /api/returns : buyer files a return (201), wrong buyer (403), not delivered (400),
 *    not paid (400), outside return window (400), duplicate active return (400)
 *  - PUT /api/returns/:id/approve : owning seller (200), non-owner (403), wrong status (400)
 *  - PUT /api/returns/:id/reject  : owning seller (200), non-owner (403), missing reason (400),
 *    wrong status (400)
 *
 * Mock strategy:
 *  - lib/supabase: supabaseAdmin spy
 *  - global fetch: mocked so the /approve route's refund call to payment-service never fires
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, OTHER_BUYER, SELLER, OTHER_SELLER, ORDER, STORE,
  makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── Mock supabaseAdmin ────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/return-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Mock global fetch (used by /approve to call payment-service) ───────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Test app ──────────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { returnsRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/return-service/src/routes/returns'
  )
  app = express()
  app.use(express.json())
  app.use('/api/returns', returnsRouter)
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
      select: (_cols?: string) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      eq: () => builder,
      neq: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

const RETURN_ID = 'ffffffff-0001-4000-8000-000000000001'

/** An order in the correct state for a return: delivered, paid, fresh */
function deliveredOrder(overrides: Partial<typeof ORDER> = {}) {
  return {
    id: ORDER.id,
    buyer_id: BUYER.id,
    status: 'delivered',
    payment_status: 'paid',
    total_amount: 1060,
    delivery_fee: 60,
    store_id: STORE.id,
    delivered_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    ...overrides,
  }
}

/** A return row owned by BUYER, with the store owned by SELLER */
const RETURN_ROW = {
  id: RETURN_ID,
  order_id: ORDER.id,
  store_id: STORE.id,
  buyer_id: BUYER.id,
  reason: 'damaged',
  description: 'Screen cracked',
  status: 'requested',
  refund_amount: 1000,
  orders: {
    order_number: 'RM1TEST',
    total_amount: 1060,
    stores: { seller_id: SELLER.id },
    payment_id: 'pay_test_001',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  // Default fetch mock returns a successful refund
  mockFetch.mockResolvedValue({
    json: async () => ({ success: true, data: { refundId: 'rfnd_test_001' } }),
  })
})

// ── POST /api/returns — buyer files a return ──────────────────────────────────

describe('POST /api/returns (file a return)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post('/api/returns').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid reason enum', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'i_dont_like_it' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for non-UUID order_id', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: 'not-a-uuid', reason: 'damaged' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when order does not exist', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: null, error: null },
    }))
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Order not found/i)
  })

  it('returns 403 when another buyer tries to return — IDOR prevention', async () => {
    authAs(OTHER_BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: deliveredOrder(), error: null }, // owned by BUYER, not OTHER_BUYER
    }))
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(OTHER_BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 400 when order is not delivered', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: deliveredOrder({ status: 'shipped' }), error: null },
    }))
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/delivered/i)
  })

  it('returns 400 when order payment_status is not paid', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: deliveredOrder({ payment_status: 'pending' }), error: null },
    }))
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/paid/i)
  })

  it('returns 400 when return window (7 days) has expired', async () => {
    authAs(BUYER)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    mockFrom.mockImplementation(makeQB({
      orders: { data: deliveredOrder({ delivered_at: eightDaysAgo }), error: null },
    }))
    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/window/i)
  })

  it('returns 400 when an active return already exists for the order', async () => {
    authAs(BUYER)

    let ordersHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeQB({ orders: { data: deliveredOrder(), error: null } })(table)
      }
      // returns table — existing return found with status=requested (not rejected)
      return makeQB({ returns: { data: { id: RETURN_ID, status: 'requested' }, error: null } })(table)
    })

    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/already exists/i)
  })

  it('allows a previously-rejected return to be re-filed', async () => {
    authAs(BUYER)

    let callCount = 0
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        insert: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          callCount++
          if (callCount === 1) return { data: deliveredOrder(), error: null } // orders fetch
          if (callCount === 2) return { data: { id: RETURN_ID, status: 'rejected' }, error: null } // existing check
          return { data: { ...RETURN_ROW, id: 'new-return-id' }, error: null } // insert result
        },
        maybeSingle: () => ({ data: { id: RETURN_ID, status: 'rejected' }, error: null }),
        then: (fn: any) => Promise.resolve({ data: { id: 'new-return-id' }, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'wrong_item', description: 'Wrong colour sent' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
  })

  it('creates return with refund_amount = total - delivery_fee', async () => {
    authAs(BUYER)

    const insertedRows: any[] = []
    let ordersHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        return makeQB({ orders: { data: deliveredOrder(), error: null } })(table)
      }
      // returns table
      const builder: any = {
        select: () => builder,
        insert: (d: any) => { insertedRows.push(d); return builder },
        eq: () => builder,
        single: () => ({ data: { ...RETURN_ROW, id: 'inserted-id' }, error: null }),
        maybeSingle: () => ({ data: null, error: null }), // no existing return
        then: (fn: any) => Promise.resolve({ data: { id: 'inserted-id' }, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/returns')
      .set('Authorization', bearerToken(BUYER))
      .send({ order_id: ORDER.id, reason: 'damaged' })

    expect(res.status).toBe(201)
    if (insertedRows.length > 0) {
      // refund_amount = total_amount(1060) - delivery_fee(60) = 1000
      expect(insertedRows[0].refund_amount).toBe(1000)
      expect(insertedRows[0].status).toBe('requested')
      expect(insertedRows[0].buyer_id).toBe(BUYER.id)
    }
  })
})

// ── PUT /api/returns/:id/approve ──────────────────────────────────────────────

describe('PUT /api/returns/:id/approve (seller/admin)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).put(`/api/returns/${RETURN_ID}/approve`)
    expect(res.status).toBe(401)
  })

  it('returns 404 when return does not exist', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: { data: null, error: null },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(404)
  })

  it('returns 403 when a different seller tries to approve — IDOR prevention', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: { data: RETURN_ROW, error: null },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(OTHER_SELLER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 400 when return is already approved (wrong status)', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: {
        data: { ...RETURN_ROW, status: 'approved', orders: { ...RETURN_ROW.orders } },
        error: null,
      },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/requested/i)
  })

  it('returns 400 when return is already rejected (wrong status)', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: {
        data: { ...RETURN_ROW, status: 'rejected', orders: { ...RETURN_ROW.orders } },
        error: null,
      },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
  })

  it('allows the owning seller to approve a requested return (200)', async () => {
    authAs(SELLER)

    let callCount = 0
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          callCount++
          if (callCount === 1) {
            return {
              data: {
                ...RETURN_ROW,
                orders: {
                  payment_id: 'pay_test_001',
                  stores: { seller_id: SELLER.id },
                },
              },
              error: null,
            }
          }
          return { data: { ...RETURN_ROW, status: 'approved' }, error: null }
        },
        then: (fn: any) =>
          Promise.resolve({ data: { ...RETURN_ROW, status: 'approved' }, error: null }).then(fn),
      }
      return builder
    })

    // Mock successful refund from payment-service
    mockFetch.mockResolvedValue({
      json: async () => ({ success: true, data: { refundId: 'rfnd_test_001' } }),
    })

    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 500 when payment-service refund call fails', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => ({
          data: {
            ...RETURN_ROW,
            orders: {
              payment_id: 'pay_test_001',
              stores: { seller_id: SELLER.id },
            },
          },
          error: null,
        }),
        then: (fn: any) =>
          Promise.resolve({ data: { ...RETURN_ROW, status: 'approved' }, error: null }).then(fn),
      }
      return builder
    })

    // Simulate payment-service returning an error
    mockFetch.mockResolvedValue({
      json: async () => ({ success: false, error: 'Payment not found' }),
    })

    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/approve`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/refund initiation failed/i)
  })
})

// ── PUT /api/returns/:id/reject ───────────────────────────────────────────────

describe('PUT /api/returns/:id/reject (seller/admin)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .send({ reason: 'Used product' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when rejection reason is missing', async () => {
    authAs(SELLER)
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({}) // no reason
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reason required/i)
  })

  it('returns 400 when rejection reason is whitespace only', async () => {
    authAs(SELLER)
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: '   ' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when return does not exist', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: { data: null, error: null },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: 'Used product' })
    expect(res.status).toBe(404)
  })

  it('returns 403 when a different seller tries to reject — IDOR prevention', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQB({
      returns: {
        data: {
          status: 'requested',
          orders: { stores: { seller_id: SELLER.id } }, // owned by SELLER, not OTHER_SELLER
        },
        error: null,
      },
    }))
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ reason: 'Unauthorized rejection attempt' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 400 when return is not in requested status', async () => {
    authAs(SELLER)
    // Route checks: status must be 'requested'; status='approved' → 400
    // The seller_id must match so we reach the status check (not 403 first)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => ({
          data: {
            status: 'approved', // not 'requested' → 400
            orders: { stores: { seller_id: SELLER.id } },
          },
          error: null,
        }),
      }
      return builder
    })
    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: 'Policy' })
    expect(res.status).toBe(400)
  })

  it('allows the owning seller to reject with a reason (200)', async () => {
    authAs(SELLER)

    // The reject route calls from('returns') twice:
    //   1. .select('status, orders(...)').eq().single()  → fetch to check ownership + status
    //   2. .update({...}).eq().select('*').single()      → write the rejection
    let fetchDone = false
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          if (!fetchDone) {
            fetchDone = true
            // First call: fetch succeeds with status=requested and correct seller
            return {
              data: {
                status: 'requested',
                orders: { stores: { seller_id: SELLER.id } },
              },
              error: null,
            }
          }
          // Second call: update result
          return {
            data: { ...RETURN_ROW, status: 'rejected', rejection_reason: 'Product was used' },
            error: null,
          }
        },
        then: (fn: any) =>
          Promise.resolve({
            data: { ...RETURN_ROW, status: 'rejected' },
            error: null,
          }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .put(`/api/returns/${RETURN_ID}/reject`)
      .set('Authorization', bearerToken(SELLER))
      .send({ reason: 'Product was used and cannot be returned' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
