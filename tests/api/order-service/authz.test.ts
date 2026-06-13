/**
 * order-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fixes for HIGH-4, HIGH-5:
 *  - GET /orders: buyer sees only own; seller must own store (403 for other's store)
 *  - GET /orders/:id: 403 for non-owner (neither buyer nor seller)
 *  - PUT /orders/:id/status: 403 for a seller who doesn't own the order's store
 *
 * Mock strategy: mock lib/supabase.ts directly (absolute path) so supabaseAdmin
 * is a controllable spy.  Mock lib/notify.ts to prevent real notification calls.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, OTHER_BUYER, SELLER, OTHER_SELLER, ORDER, STORE,
  makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── Mock supabaseAdmin singleton ──────────────────────────────────────────────
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

// ── Mock notification lib ─────────────────────────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/lib/notify',
  () => ({ notifyOrderUpdate: vi.fn() }),
)

// ── Test app setup ────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { ordersRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/order-service/src/routes/orders'
  )
  app = express()
  app.use(express.json())
  app.use('/api/orders', ordersRouter)
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

/** Minimal fluent builder for a single-table result */
function singleResult(data: any, error: any = null) {
  return { data, error }
}

/** Full-chain fluent builder that returns different data per terminal call */
function makeQueryBuilder(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: (_cols?: string) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      eq: (_col: string, _val: any) => builder,
      single: () => result,
      maybeSingle: () => result,
      limit: (_n: number) => builder,
      order: (_col: string, _opts?: any) => builder,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/orders — list ────────────────────────────────────────────────────

describe('GET /api/orders', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get('/api/orders')
    expect(res.status).toBe(401)
  })

  it('returns 400 when storeId provided but caller does not own it — HIGH-4 fix', async () => {
    authAs(OTHER_SELLER) // attacker — does not own STORE

    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        // Ownership check fails: no store returned
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: () => ({ data: null, error: { message: 'not found' } }),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows a seller to list orders for their own store — HIGH-4 fix', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        // Ownership check passes
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: () => ({ data: { id: STORE.id }, error: null }),
        }
        return builder
      }
      // orders table — list query
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (fn: any) => Promise.resolve({ data: [ORDER], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('buyer gets orders without storeId (own orders) — HIGH-4 fix', async () => {
    authAs(BUYER)

    // Record which eq() calls were made (we want buyer_id to be scoped to BUYER.id)
    const eqCalls: Array<{ col: string; val: any }> = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => { eqCalls.push({ col, val }); return builder },
        order: () => builder,
        limit: () => builder,
        then: (fn: any) => Promise.resolve({ data: [ORDER], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    // Verify the route scoped by buyer_id
    const buyerScope = eqCalls.find(c => c.col === 'buyer_id')
    expect(buyerScope).toBeTruthy()
    expect(buyerScope!.val).toBe(BUYER.id)
  })
})

// ── GET /api/orders/:id ───────────────────────────────────────────────────────

describe('GET /api/orders/:id', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get(`/api/orders/${ORDER.id}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a stranger — HIGH-4 fix', async () => {
    authAs(OTHER_BUYER) // no connection to this order
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: {
        data: {
          ...ORDER,
          stores: { store_name: 'Test', store_slug: 'test', whatsapp_number: null, seller_id: SELLER.id },
        },
        error: null,
      },
    }))

    const res = await request(app)
      .get(`/api/orders/${ORDER.id}`)
      .set('Authorization', bearerToken(OTHER_BUYER))

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the buyer of the order to view it', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: {
        data: {
          ...ORDER,
          stores: { store_name: 'Test', store_slug: 'test', whatsapp_number: null, seller_id: SELLER.id },
        },
        error: null,
      },
    }))

    const res = await request(app)
      .get(`/api/orders/${ORDER.id}`)
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(ORDER.id)
  })

  it('allows the owning seller to view the order', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: {
        data: {
          ...ORDER,
          stores: { store_name: 'Test', store_slug: 'test', whatsapp_number: null, seller_id: SELLER.id },
        },
        error: null,
      },
    }))

    const res = await request(app)
      .get(`/api/orders/${ORDER.id}`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 404 when order does not exist', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: { data: null, error: { message: 'not found' } },
    }))

    const res = await request(app)
      .get('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(404)
  })
})

// ── PUT /api/orders/:id/status ────────────────────────────────────────────────

describe('PUT /api/orders/:id/status', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .send({ status: 'accepted' })
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid status value', async () => {
    authAs(SELLER)
    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'bogus_status_that_does_not_exist' })
    expect(res.status).toBe(400)
  })

  it('returns 403 when seller does not own the order store — HIGH-5 fix', async () => {
    authAs(OTHER_SELLER) // attacker — STORE is owned by SELLER, not OTHER_SELLER

    mockFrom.mockImplementation(makeQueryBuilder({
      orders: {
        data: { id: ORDER.id, store_id: STORE.id, stores: { seller_id: SELLER.id } },
        error: null,
      },
    }))

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ status: 'accepted' })

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows owning seller to update order status — HIGH-5 fix', async () => {
    authAs(SELLER)

    // First .from() call: ownership check (select). Second: update.
    let selectDone = false
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        update: (_d: any) => builder,
        eq: () => builder,
        single: () => {
          if (!selectDone) {
            selectDone = true
            return { data: { id: ORDER.id, store_id: STORE.id, stores: { seller_id: SELLER.id } }, error: null }
          }
          return {
            data: { ...ORDER, status: 'accepted', stores: { store_name: 'Test' }, users: { phone: '+919999900001' } },
            error: null,
          }
        },
        then: (fn: any) =>
          Promise.resolve({
            data: { ...ORDER, status: 'accepted', stores: { store_name: 'Test' }, users: { phone: '+919999900001' } },
            error: null,
          }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .put(`/api/orders/${ORDER.id}/status`)
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'accepted' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 404 when order does not exist', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: { data: null, error: { message: 'not found' } },
    }))

    const res = await request(app)
      .put('/api/orders/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', bearerToken(SELLER))
      .send({ status: 'accepted' })

    expect(res.status).toBe(404)
  })
})
