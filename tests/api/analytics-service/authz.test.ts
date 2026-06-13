/**
 * analytics-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fix for HIGH-3:
 *  - GET /analytics/store?storeId=: 403 when caller does not own the store
 *  - GET /analytics/store/top-products?storeId=: same ownership check
 *  - GET /analytics/platform: 403 for non-admin (requireAdmin middleware)
 *
 * Mock strategy: mock lib/supabase.ts by absolute path so supabaseAdmin is a
 * controllable spy.  No real Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, OTHER_SELLER, ADMIN, STORE,
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
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/analytics-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Test app setup ────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { analyticsRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/analytics-service/src/routes/analytics'
  )
  app = express()
  app.use(express.json())
  app.use('/api/analytics', analyticsRouter)
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
      eq: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

/** Simulate requireAdmin: returns a store-ownership check first (for /store), then further data */
function makeAdminQueryBuilder() {
  return (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => {
        if (table === 'users') return { data: { role: 'admin' }, error: null }
        return { data: null, error: null }
      },
      then: (fn: any) => {
        if (table === 'orders') return Promise.resolve({ data: [], error: null }).then(fn)
        if (table === 'stores') return Promise.resolve({ data: [], error: null }).then(fn)
        if (table === 'users') return Promise.resolve({ data: [], error: null }).then(fn)
        return Promise.resolve({ data: null, error: null }).then(fn)
      },
    }
    return builder
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/analytics/store — HIGH-3 ownership ───────────────────────────────

describe('GET /api/analytics/store — HIGH-3 store ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .get('/api/analytics/store')
      .query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 400 when storeId is missing', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({}))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 403 when caller does not own the store — HIGH-3 fix', async () => {
    authAs(OTHER_SELLER)
    // Ownership check: stores.select('id').eq('id',storeId).eq('seller_id',OTHER_SELLER.id) → null
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
    expect(res.body.code).toBe('STORE_OWNERSHIP_REQUIRED')
  })

  it('returns 200 for the owning seller — HIGH-3 fix', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: () => ({ data: { id: STORE.id }, error: null }),
        }
        return builder
      }
      // All data tables return empty arrays
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
    expect(typeof res.body.data.totalRevenue).toBe('number')
    expect(Array.isArray(res.body.data.dailyRevenue)).toBe(true)
  })
})

// ── GET /api/analytics/store/top-products — HIGH-3 ownership ─────────────────

describe('GET /api/analytics/store/top-products — HIGH-3 store ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller does not own the store — HIGH-3 fix', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_OWNERSHIP_REQUIRED')
  })

  it('returns 200 for the owning seller — HIGH-3 fix', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: () => ({ data: { id: STORE.id }, error: null }),
        }
        return builder
      }
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ── GET /api/analytics/platform — admin-only ─────────────────────────────────

describe('GET /api/analytics/platform — requireAdmin enforcement', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get('/api/analytics/platform')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin user (seller)', async () => {
    authAs(SELLER)
    // requireAdmin: users table check returns role = 'seller'
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: () => ({ data: { role: 'seller' }, error: null }),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(403)
  })

  it('returns 200 for an admin user', async () => {
    authAs(ADMIN)
    // requireAdmin calls from('users').select('role').eq('id', ...).single() first,
    // then the handler calls from('orders'), from('stores'), from('users') with
    // a chain that includes .select().gte().  We need to distinguish the role
    // lookup (single()) from the data queries (.then()).
    let adminCheckDone = false
    mockFrom.mockImplementation((table: string) => {
      // The middleware role-check: from('users').select().eq().single()
      // We detect it by checking if adminCheckDone is false AND table is 'users'.
      if (table === 'users' && !adminCheckDone) {
        adminCheckDone = true
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          single: () => ({ data: { role: 'admin' }, error: null }),
          then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
        }
        return builder
      }
      // All data query tables (orders, stores, users second pass)
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => ({ data: null, error: null }),
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.gmv).toBe('number')
  }, 15000)
})
