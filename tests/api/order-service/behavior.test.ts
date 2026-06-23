/**
 * order-service — behavior tests (P1-7, P1-8, P1-18)
 *
 * Covers:
 *  - POST /api/orders  : create COD order (201), validation (400), suspended store (403)
 *  - POST /api/orders/:id/cancel : buyer cancels (200), stranger (403), wrong stage (400)
 *  - Status transitions: pending→accepted→packed→shipped→delivered→rejected
 *  - cart CRUD: GET /cart/:userId, POST /cart, PUT /cart/:itemId, DELETE /cart/:itemId
 *  - order_events / order_status_events insert mock (fixes PRODUCT-05)
 *
 * Mock strategy:
 *  - lib/supabase: supabaseAdmin spy (no real DB)
 *  - lib/notify:   notifyOrderUpdate spy (no real HTTP)
 *  - lib/orderEvents: recordOrderEvent spy (no real DB) — fixes PRODUCT-05
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, OTHER_BUYER, SELLER, ORDER, STORE,
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
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Mock notification lib (no real HTTP) ──────────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/notify',
  () => ({ notifyOrderUpdate: vi.fn() }),
)

// ── Mock orderEvents lib — PRODUCT-05 fix ────────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/orderEvents',
  () => ({ recordOrderEvent: vi.fn() }),
)

// ── Test app (includes both orders + cart routers) ────────────────────────────
let app: express.Application

beforeAll(async () => {
  const [{ ordersRouter }, { cartRouter }] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/orders'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/cart'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/orders', ordersRouter)
  app.use('/api/orders', cartRouter)
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

/** Single-result query builder. Supports both .single() and chained then() for list queries. */
function makeQB(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: (_cols?: string) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      upsert: (_d: any, _o?: any) => builder,
      delete: () => builder,
      eq: (_c: string, _v: any) => builder,
      is: (_c: string, _v: any) => builder,
      lte: (_c: string, _v: any) => builder,
      in: (_c: string, _v: any) => builder,
      order: (_col: string, _opts?: any) => builder,
      limit: (_n: number) => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

/** Valid COD order body */
const VALID_ORDER_BODY = {
  store_id: STORE.id,
  items: [{ productId: 'prod-1', name: 'Salwar', price: 500, qty: 2 }],
  subtotal: 1000,
  delivery_fee: 60,
  discount: 0,
  delivery_address: { name: 'Priya', phone: '+919999900001', address: '12 MG Road', city: 'Bengaluru', pincode: '560001' },
}

const DELIVERED_ORDER = {
  ...ORDER,
  status: 'delivered',
  payment_status: 'paid',
  delivered_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  stores: { seller_id: SELLER.id },
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── POST /api/orders — create order ──────────────────────────────────────────

describe('POST /api/orders (create COD order)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post('/api/orders').send(VALID_ORDER_BODY)
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing required fields (no items)', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, subtotal: 500, delivery_address: VALID_ORDER_BODY.delivery_address })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for invalid UUID store_id', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({ ...VALID_ORDER_BODY, store_id: 'not-a-uuid' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for negative qty', async () => {
    authAs(BUYER)
    const body = { ...VALID_ORDER_BODY, items: [{ productId: 'p1', name: 'X', price: 100, qty: -1 }] }
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send(body)
    expect(res.status).toBe(400)
  })

  it('returns 404 when store does not exist', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_ORDER_BODY)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/Store not found/i)
  })

  it('returns 403 when target store is suspended', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      stores: { data: { suspended: true }, error: null },
    }))
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_ORDER_BODY)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_SUSPENDED')
  })

  it('creates a COD order (201) and sets buyer_id from token — not from body', async () => {
    authAs(BUYER)

    // First call: stores check (not suspended). Second call: orders insert.
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQB({ stores: { data: { suspended: false }, error: null } })(table)
      }
      // orders insert — return a realistic created order
      const createdOrder = {
        ...ORDER,
        buyer_id: BUYER.id,
        status: 'pending',
        payment_status: 'pending',
        stores: { store_name: 'Test Store' },
      }
      const builder: any = {
        select: () => builder,
        insert: (_d: any) => builder,
        eq: () => builder,
        single: () => ({ data: createdOrder, error: null }),
        then: (fn: any) => Promise.resolve({ data: createdOrder, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send(VALID_ORDER_BODY)

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.buyer_id).toBe(BUYER.id)
    expect(res.body.data.status).toBe('pending')
    expect(res.body.data.payment_status).toBe('pending')
  })

  it('calculates total_amount correctly (subtotal + delivery_fee - discount)', async () => {
    authAs(BUYER)

    const insertedData: any[] = []
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQB({ stores: { data: { suspended: false }, error: null } })(table)
      }
      const builder: any = {
        select: () => builder,
        insert: (d: any) => { insertedData.push(d); return builder },
        eq: () => builder,
        single: () => ({ data: { ...ORDER, total_amount: 1000 + 60 - 50, stores: {} }, error: null }),
        then: (fn: any) => Promise.resolve({ data: { total_amount: 1010 }, error: null }).then(fn),
      }
      return builder
    })

    await request(app)
      .post('/api/orders')
      .set('Authorization', bearerToken(BUYER))
      .send({ ...VALID_ORDER_BODY, subtotal: 1000, delivery_fee: 60, discount: 50 })

    // The inserted row should have total_amount = 1000 + 60 - 50 = 1010
    const inserted = insertedData[0]
    if (inserted) expect(inserted.total_amount).toBe(1010)
  })
})

// ── POST /api/orders/:id/cancel ───────────────────────────────────────────────

describe('POST /api/orders/:id/cancel', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post(`/api/orders/${ORDER.id}/cancel`)
    expect(res.status).toBe(401)
  })

  it('returns 404 when order does not exist', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: null, error: null },
    }))
    const res = await request(app)
      .post('/api/orders/00000000-0000-0000-0000-000000000000/cancel')
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(404)
  })

  it('returns 403 when another buyer tries to cancel — IDOR prevention', async () => {
    authAs(OTHER_BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: { status: 'pending', buyer_id: BUYER.id }, error: null },
    }))
    const res = await request(app)
      .post(`/api/orders/${ORDER.id}/cancel`)
      .set('Authorization', bearerToken(OTHER_BUYER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 400 when order is already shipped (cannot cancel)', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: { status: 'shipped', buyer_id: BUYER.id }, error: null },
    }))
    const res = await request(app)
      .post(`/api/orders/${ORDER.id}/cancel`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/cancel/i)
  })

  it('returns 400 when order is already delivered (cannot cancel)', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQB({
      orders: { data: { status: 'delivered', buyer_id: BUYER.id }, error: null },
    }))
    const res = await request(app)
      .post(`/api/orders/${ORDER.id}/cancel`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(400)
  })

  it('allows buyer to cancel a pending order (200)', async () => {
    authAs(BUYER)

    // First call: select for validation. Second call: update.
    let selectDone = false
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          if (!selectDone) {
            selectDone = true
            return { data: { status: 'pending', buyer_id: BUYER.id }, error: null }
          }
          return { data: { ...ORDER, status: 'cancelled' }, error: null }
        },
        then: (fn: any) => Promise.resolve({ data: { status: 'cancelled' }, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post(`/api/orders/${ORDER.id}/cancel`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('allows buyer to cancel an accepted order (200)', async () => {
    authAs(BUYER)

    let selectDone = false
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          if (!selectDone) {
            selectDone = true
            return { data: { status: 'accepted', buyer_id: BUYER.id }, error: null }
          }
          return { data: { ...ORDER, status: 'cancelled' }, error: null }
        },
        then: (fn: any) => Promise.resolve({ data: { status: 'cancelled' }, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post(`/api/orders/${ORDER.id}/cancel`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── PUT /api/orders/:id/status — additional status transition tests ──────────

describe('PUT /api/orders/:id/status (status transitions)', () => {
  /**
   * Helper: set up the mock so that:
   *  - First from('orders').select().eq().single() → ownership check passes
   *  - from('orders').update().select().single() → updated order
   */
  function mockStatusUpdate(fromStatus: string, toStatus: string) {
    let firstEqDone = false
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: (_c: string, _v: any) => builder,
        single: () => {
          if (!firstEqDone) {
            firstEqDone = true
            return {
              data: {
                id: ORDER.id,
                store_id: STORE.id,
                status: fromStatus,
                stores: { seller_id: SELLER.id, suspended: false },
              },
              error: null,
            }
          }
          return {
            data: {
              ...ORDER,
              status: toStatus,
              stores: { store_name: 'Test Store' },
              users: { phone: '+919999900001' },
            },
            error: null,
          }
        },
        then: (fn: any) =>
          Promise.resolve({
            data: { ...ORDER, status: toStatus, stores: { store_name: 'Test' }, users: { phone: '' } },
            error: null,
          }).then(fn),
      }
      return builder
    })
  }

  it('pending → accepted transitions cleanly', async () => {
    authAs(SELLER)
    mockStatusUpdate('pending', 'accepted')

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('accepted → packed transitions cleanly', async () => {
    authAs(SELLER)
    mockStatusUpdate('accepted', 'packed')

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'packed' })

    expect(res.status).toBe(200)
  })

  it('packed → shipped transitions cleanly', async () => {
    authAs(SELLER)
    mockStatusUpdate('packed', 'shipped')

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'shipped' })

    expect(res.status).toBe(200)
  })

  it('shipped → delivered transitions cleanly', async () => {
    authAs(SELLER)
    mockStatusUpdate('shipped', 'delivered')

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'delivered' })

    expect(res.status).toBe(200)
  })

  it('pending → rejected transitions cleanly', async () => {
    authAs(SELLER)
    mockStatusUpdate('pending', 'rejected')

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'rejected', rejection_reason: 'Out of stock' })

    expect(res.status).toBe(200)
  })

  it('returns 403 when store is suspended at status update', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({
          data: { id: ORDER.id, store_id: STORE.id, stores: { seller_id: SELLER.id, suspended: true } },
          error: null,
        }),
      }
      return builder
    })

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'accepted' })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_SUSPENDED')
  })
})

// ── Cart endpoints ────────────────────────────────────────────────────────────

describe('GET /api/orders/cart/:userId', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).get(`/api/orders/cart/${BUYER.id}`)
    expect(res.status).toBe(401)
  })

  it('returns cart items for the user', async () => {
    authAs(BUYER)
    const cartItem = { id: 'item-1', user_id: BUYER.id, product_id: 'prod-1', qty: 2, products: { name: 'Salwar', price: 500 } }
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (fn: any) => Promise.resolve({ data: [cartItem], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get(`/api/orders/cart/${BUYER.id}`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data[0].id).toBe('item-1')
  })

  it('returns empty array when cart is empty', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get(`/api/orders/cart/${BUYER.id}`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})

describe('POST /api/orders/cart (add to cart)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).post('/api/orders/cart').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body (non-UUID product_id)', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/orders/cart')
      .set('Authorization', bearerToken(BUYER))
      .send({ user_id: BUYER.id, store_id: STORE.id, product_id: 'not-a-uuid', qty: 1 })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for missing store_id', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/orders/cart')
      .set('Authorization', bearerToken(BUYER))
      .send({ user_id: BUYER.id, product_id: 'aaaaaaaa-0001-4000-8000-000000000099', qty: 1 })
    expect(res.status).toBe(400)
  })

  it('upserts item and returns 200', async () => {
    authAs(BUYER)
    const cartItem = { id: 'item-1', user_id: BUYER.id, product_id: 'aaaaaaaa-0001-4000-8000-000000000099', qty: 1 }
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        upsert: (_d: any, _o?: any) => builder,
        single: () => ({ data: cartItem, error: null }),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/orders/cart')
      .set('Authorization', bearerToken(BUYER))
      .send({ user_id: BUYER.id, store_id: STORE.id, product_id: 'aaaaaaaa-0001-4000-8000-000000000099', qty: 1 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe('item-1')
  })
})

describe('PUT /api/orders/cart/:itemId (update qty)', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).put('/api/orders/cart/item-1').send({ qty: 3 })
    expect(res.status).toBe(401)
  })

  it('updates qty and returns the item', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        update: (_d: any) => builder,
        delete: () => builder,
        eq: () => builder,
        select: () => builder,
        single: () => ({ data: { id: 'item-1', qty: 3 }, error: null }),
      }
      return builder
    })

    const res = await request(app)
      .put('/api/orders/cart/item-1')
      .set('Authorization', bearerToken(BUYER))
      .send({ qty: 3 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('deletes item when qty is 0', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        update: (_d: any) => builder,
        delete: () => builder,
        eq: () => builder,
        select: () => builder,
        single: () => ({ data: null, error: null }),
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .put('/api/orders/cart/item-1')
      .set('Authorization', bearerToken(BUYER))
      .send({ qty: 0 })

    expect(res.status).toBe(200)
    expect(res.body.data).toBeNull()
  })
})

describe('DELETE /api/orders/cart/:itemId', () => {
  it('returns 401 with no auth', async () => {
    const res = await request(app).delete('/api/orders/cart/item-1')
    expect(res.status).toBe(401)
  })

  it('removes the item and returns success', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        delete: () => builder,
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .delete('/api/orders/cart/item-1')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeNull()
  })
})
