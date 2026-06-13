/**
 * return-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fix for MED-4:
 *  - GET /returns/:id: 403 for a stranger (neither buyer nor owning seller)
 *  - GET /returns/?storeId=: 403 when storeId belongs to a different seller
 *  - GET /returns/ (buyer path): buyer sees own returns only
 *
 * Mock strategy: mock lib/supabase.ts by absolute path so supabaseAdmin is a
 * controllable spy.  No real Supabase traffic.
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

// ── Test app setup ────────────────────────────────────────────────────────────
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

/** A return row owned by BUYER; the order's store is owned by SELLER */
const RETURN_ROW = {
  id: RETURN_ID,
  buyer_id: BUYER.id,
  order_id: ORDER.id,
  store_id: STORE.id,
  reason: 'damaged',
  status: 'requested',
  refund_amount: 1000,
  orders: {
    order_number: 'RM1TEST',
    total_amount: 1060,
    stores: { seller_id: SELLER.id },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/returns/:id — MED-4 ownership ────────────────────────────────────

describe('GET /api/returns/:id — MED-4 ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get(`/api/returns/${RETURN_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 404 when return does not exist', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      returns: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get(`/api/returns/${RETURN_ID}`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(404)
  })

  it('returns 403 for a stranger — MED-4 fix', async () => {
    authAs(OTHER_BUYER) // neither the buyer nor the owning seller
    mockFrom.mockImplementation(makeQueryBuilder({
      returns: { data: RETURN_ROW, error: null },
    }))
    const res = await request(app)
      .get(`/api/returns/${RETURN_ID}`)
      .set('Authorization', bearerToken(OTHER_BUYER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 for a different seller — MED-4 fix', async () => {
    authAs(OTHER_SELLER) // not the owning seller
    mockFrom.mockImplementation(makeQueryBuilder({
      returns: { data: RETURN_ROW, error: null },
    }))
    const res = await request(app)
      .get(`/api/returns/${RETURN_ID}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the buyer to view their return — MED-4 fix', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      returns: { data: RETURN_ROW, error: null },
    }))
    const res = await request(app)
      .get(`/api/returns/${RETURN_ID}`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(RETURN_ID)
  })

  it('allows the owning seller to view the return — MED-4 fix', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      returns: { data: RETURN_ROW, error: null },
    }))
    const res = await request(app)
      .get(`/api/returns/${RETURN_ID}`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── GET /api/returns?storeId= — MED-4 seller path ownership ──────────────────

describe('GET /api/returns?storeId= — MED-4 seller path', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .get('/api/returns')
      .query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 403 when seller does not own the storeId — MED-4 fix', async () => {
    authAs(OTHER_SELLER)
    // stores ownership check: eq('seller_id', OTHER_SELLER.id) → null for STORE
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get('/api/returns')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the owning seller to list returns for their store — MED-4 fix', async () => {
    authAs(SELLER)
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQueryBuilder({ stores: { data: { id: STORE.id }, error: null } })(table)
      }
      // returns table list query
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (fn: any) => Promise.resolve({ data: [RETURN_ROW], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/returns')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ── GET /api/returns (buyer path — no storeId) ─────────────────────────────────

describe('GET /api/returns (buyer path) — MED-4 scoped to buyer_id', () => {
  it('scopes the query to the authenticated buyer_id — MED-4 fix', async () => {
    authAs(BUYER)

    const eqCalls: Array<{ col: string; val: any }> = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: any) => { eqCalls.push({ col, val }); return builder },
        order: () => builder,
        limit: () => builder,
        then: (fn: any) => Promise.resolve({ data: [RETURN_ROW], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/returns')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(200)
    // Verify the route scoped the query by buyer_id = BUYER.id
    const buyerScope = eqCalls.find(c => c.col === 'buyer_id')
    expect(buyerScope, 'buyer_id filter must be applied in buyer path').toBeTruthy()
    expect(buyerScope!.val).toBe(BUYER.id)
  })
})
