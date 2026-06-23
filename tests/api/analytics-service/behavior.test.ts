/**
 * analytics-service — aggregation correctness tests
 *
 * Covers:
 *  - GET /api/analytics/store — revenue calc (platform fee deducted), daily
 *    revenue bucketing, avgRating, product counts, period param (7/30/90 days)
 *  - GET /api/analytics/store/top-products — qty + revenue aggregation across
 *    orders, sort order, limit param
 *  - GET /api/analytics/platform — GMV (paid only), platformFee calc,
 *    newBuyers/newSellers segmentation, period param
 *
 * Mock strategy: absolute-path mock of lib/supabase.ts so we control the
 * Supabase query results directly.  No real Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, ADMIN, STORE,
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

/**
 * Build a multi-table query-builder mock.  The handler calls:
 *   from('stores').select(...).eq(...).single()   — ownership check
 *   from('orders').select(...)...                 — order data (array)
 *   from('reviews').select(...)...               — review data (array)
 *   from('products').select(...)...              — product data (array)
 *
 * We handle each table independently and allow specifying the return value.
 */
function makeStoreAnalyticsMock(opts: {
  orders?: any[]
  reviews?: any[]
  products?: any[]
}) {
  return (table: string) => {
    if (table === 'stores') {
      // Ownership check — caller owns the store
      const b: any = {
        select: () => b,
        eq: () => b,
        single: () => ({ data: { id: STORE.id }, error: null }),
      }
      return b
    }
    if (table === 'orders') {
      const data = opts.orders ?? []
      const b: any = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    if (table === 'reviews') {
      const data = opts.reviews ?? []
      const b: any = {
        select: () => b,
        eq: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    if (table === 'products') {
      const data = opts.products ?? []
      const b: any = {
        select: () => b,
        eq: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    const b: any = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
    }
    return b
  }
}

/**
 * Admin query builder: first `users` call (role check, single()) → admin,
 * then `orders`/`stores`/`users` data queries (then()).
 */
function makeAdminAnalyticsMock(opts: {
  orders?: any[]
  stores?: any[]
  users?: any[]
}) {
  let adminRoleCheckDone = false
  return (table: string) => {
    if (table === 'users' && !adminRoleCheckDone) {
      adminRoleCheckDone = true
      const b: any = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        single: () => ({ data: { role: 'admin' }, error: null }),
        then: (fn: any) => Promise.resolve({ data: [{ role: 'admin' }], error: null }).then(fn),
      }
      return b
    }
    if (table === 'orders') {
      const data = opts.orders ?? []
      const b: any = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    if (table === 'stores') {
      const data = opts.stores ?? []
      const b: any = {
        select: () => b,
        gte: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    if (table === 'users') {
      // second users call (data)
      const data = opts.users ?? []
      const b: any = {
        select: () => b,
        gte: () => b,
        then: (fn: any) => Promise.resolve({ data, error: null }).then(fn),
      }
      return b
    }
    const b: any = {
      select: () => b,
      eq: () => b,
      gte: () => b,
      then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
    }
    return b
  }
}

/** Build an order object for use in mock data */
function makeOrder(overrides: Partial<{ total_amount: number; delivery_fee: number; payment_status: string; status: string; created_at: string }> = {}) {
  const today = new Date().toISOString()
  return {
    total_amount: 1060,
    delivery_fee: 60,
    payment_status: 'paid',
    status: 'delivered',
    created_at: today,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/analytics/store — revenue calculation correctness ─────────────────

describe('GET /api/analytics/store — revenue aggregation correctness', () => {
  it('totalRevenue excludes delivery fee and applies 5% platform cut', async () => {
    // Order: total=1060, delivery=60 → seller gross = 1000 → net = 1000 * 0.95 = 950
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({
      orders: [makeOrder({ total_amount: 1060, delivery_fee: 60 })],
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    // Math: (1060 - 60) * 0.95 = 950
    expect(res.body.data.totalRevenue).toBe(950)
  })

  it('totalRevenue sums multiple paid orders correctly', async () => {
    // Two orders: each gross 1000 → each net 950 → total 1900
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({
      orders: [
        makeOrder({ total_amount: 1060, delivery_fee: 60 }),
        makeOrder({ total_amount: 560, delivery_fee: 60 }),
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    // (1060-60)*0.95 + (560-60)*0.95 = 950 + 475 = 1425
    expect(res.body.data.totalRevenue).toBe(1425)
    expect(res.body.data.totalOrders).toBe(2)
  })

  it('totalRevenue is 0 when no orders', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ orders: [] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data.totalRevenue).toBe(0)
    expect(res.body.data.totalOrders).toBe(0)
    expect(res.body.data.avgOrderValue).toBe(0)
  })

  it('avgOrderValue is rounded integer of mean total_amount', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({
      orders: [
        makeOrder({ total_amount: 1000 }),
        makeOrder({ total_amount: 500 }),
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    // avgOrderValue = round((1000 + 500) / 2) = 750
    expect(res.body.data.avgOrderValue).toBe(750)
  })

  it('avgRating is rounded to 1 decimal from reviews', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({
      reviews: [{ rating: 4 }, { rating: 5 }, { rating: 3 }],
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    // avgRating = round((4+5+3)/3 * 10) / 10 = round(4 * 10) / 10 = 4.0
    expect(res.body.data.avgRating).toBe(4)
    expect(res.body.data.reviewCount).toBe(3)
  })

  it('avgRating is 0 when no reviews', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ reviews: [] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data.avgRating).toBe(0)
    expect(res.body.data.reviewCount).toBe(0)
  })

  it('productCount and activeProductCount are correct', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({
      products: [
        { id: 'p1', is_available: true },
        { id: 'p2', is_available: false },
        { id: 'p3', is_available: true },
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data.productCount).toBe(3)
    expect(res.body.data.activeProductCount).toBe(2)
  })

  it('dailyRevenue array has exactly `period` buckets (default 30)', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ orders: [] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.dailyRevenue)).toBe(true)
    expect(res.body.data.dailyRevenue).toHaveLength(30)
    // Each bucket has a date string and an amount number
    const bucket = res.body.data.dailyRevenue[0]
    expect(typeof bucket.date).toBe('string')
    expect(typeof bucket.amount).toBe('number')
  })

  it('dailyRevenue has 7 buckets for period=7', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ orders: [] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id, period: '7' })
    expect(res.status).toBe(200)
    expect(res.body.data.dailyRevenue).toHaveLength(7)
  })

  it('dailyRevenue has 90 buckets for period=90', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ orders: [] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id, period: '90' })
    expect(res.status).toBe(200)
    expect(res.body.data.dailyRevenue).toHaveLength(90)
  })

  it('an order placed today appears in the last dailyRevenue bucket with correct revenue', async () => {
    authAs(SELLER)
    const todayDate = new Date().toISOString().split('T')[0]
    const order = makeOrder({ total_amount: 1060, delivery_fee: 60, created_at: new Date().toISOString() })
    mockFrom.mockImplementation(makeStoreAnalyticsMock({ orders: [order] }))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    const todayBucket = res.body.data.dailyRevenue.find((b: any) => b.date === todayDate)
    expect(todayBucket).toBeDefined()
    // (1060 - 60) * 0.95 = 950
    expect(todayBucket.amount).toBe(950)
  })

  it('response shape includes all required keys', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeStoreAnalyticsMock({}))
    const res = await request(app)
      .get('/api/analytics/store')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d).toHaveProperty('totalRevenue')
    expect(d).toHaveProperty('totalOrders')
    expect(d).toHaveProperty('avgOrderValue')
    expect(d).toHaveProperty('avgRating')
    expect(d).toHaveProperty('reviewCount')
    expect(d).toHaveProperty('productCount')
    expect(d).toHaveProperty('activeProductCount')
    expect(d).toHaveProperty('dailyRevenue')
  })
})

// ── GET /api/analytics/store/top-products — aggregation ───────────────────────

describe('GET /api/analytics/store/top-products — aggregation correctness', () => {
  /** Build a query-builder that returns an orders payload for top-products */
  function makeTopProductsMock(orders: any[]) {
    return (table: string) => {
      if (table === 'stores') {
        const b: any = { select: () => b, eq: () => b, single: () => ({ data: { id: STORE.id }, error: null }) }
        return b
      }
      // orders table
      const b: any = {
        select: () => b,
        eq: () => b,
        gte: () => b,
        then: (fn: any) => Promise.resolve({ data: orders, error: null }).then(fn),
      }
      return b
    }
  }

  it('aggregates qty and revenue across multiple orders for the same product', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeTopProductsMock([
      { items: [{ productId: 'p1', name: 'Shirt', price: 500, qty: 2 }] },
      { items: [{ productId: 'p1', name: 'Shirt', price: 500, qty: 3 }] },
    ]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    const shirt = res.body.data.find((p: any) => p.productId === 'p1')
    expect(shirt).toBeDefined()
    expect(shirt.qty).toBe(5)          // 2 + 3
    expect(shirt.revenue).toBe(2500)   // 500*2 + 500*3
    expect(shirt.name).toBe('Shirt')
  })

  it('sorts results by revenue descending', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeTopProductsMock([
      { items: [
        { productId: 'p1', name: 'Cheap', price: 100, qty: 1 },
        { productId: 'p2', name: 'Expensive', price: 1000, qty: 1 },
      ] },
    ]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data[0].productId).toBe('p2')  // 1000 revenue first
    expect(res.body.data[1].productId).toBe('p1')
  })

  it('respects the limit param', async () => {
    authAs(SELLER)
    const manyProducts = Array.from({ length: 10 }, (_, i) => ({
      productId: `p${i}`, name: `Product ${i}`, price: 100 * (i + 1), qty: 1,
    }))
    mockFrom.mockImplementation(makeTopProductsMock([{ items: manyProducts }]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id, limit: '3' })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(3)
  })

  it('defaults to limit=5 when no limit param', async () => {
    authAs(SELLER)
    const manyProducts = Array.from({ length: 10 }, (_, i) => ({
      productId: `p${i}`, name: `Product ${i}`, price: 100, qty: 1,
    }))
    mockFrom.mockImplementation(makeTopProductsMock([{ items: manyProducts }]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(5)
  })

  it('returns empty array when there are no orders', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeTopProductsMock([]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it('each result has productId, name, qty, revenue', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeTopProductsMock([
      { items: [{ productId: 'p1', name: 'Widget', price: 200, qty: 3 }] },
    ]))
    const res = await request(app)
      .get('/api/analytics/store/top-products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    const item = res.body.data[0]
    expect(item).toHaveProperty('productId', 'p1')
    expect(item).toHaveProperty('name', 'Widget')
    expect(item).toHaveProperty('qty', 3)
    expect(item).toHaveProperty('revenue', 600)
  })
})

// ── GET /api/analytics/platform — admin aggregates ────────────────────────────

describe('GET /api/analytics/platform — platform-wide aggregation', () => {
  it('GMV counts only paid orders', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({
      orders: [
        { total_amount: 1000, delivery_fee: 60, payment_status: 'paid' },
        { total_amount: 500,  delivery_fee: 60, payment_status: 'pending' }, // NOT paid — must be excluded
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.data.gmv).toBe(1000)            // only the paid one
    expect(res.body.data.totalOrders).toBe(2)        // all orders
    expect(res.body.data.paidOrders).toBe(1)         // only paid
  })

  it('platformFee is 5% of (total - delivery) for paid orders', async () => {
    authAs(ADMIN)
    // total=1060, delivery=60 → seller gross=1000 → platform fee = 1000*0.05 = 50
    mockFrom.mockImplementation(makeAdminAnalyticsMock({
      orders: [{ total_amount: 1060, delivery_fee: 60, payment_status: 'paid' }],
    }))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.data.platformFee).toBe(50)
  })

  it('platformFee sums across multiple paid orders', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({
      orders: [
        { total_amount: 1060, delivery_fee: 60, payment_status: 'paid' },  // fee=50
        { total_amount: 560,  delivery_fee: 60, payment_status: 'paid' },  // fee=25
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.data.platformFee).toBe(75)
  })

  it('newBuyers and newSellers are segmented by role', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({
      users: [
        { id: 'u1', role: 'buyer' },
        { id: 'u2', role: 'buyer' },
        { id: 'u3', role: 'seller' },
      ],
    }))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.data.newBuyers).toBe(2)
    expect(res.body.data.newSellers).toBe(1)
  })

  it('newStores counts stores created in the period', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({
      stores: [{ id: 's1' }, { id: 's2' }],
    }))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    expect(res.body.data.newStores).toBe(2)
  })

  it('returns zero counts when there are no orders/stores/users in period', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({}))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d.gmv).toBe(0)
    expect(d.platformFee).toBe(0)
    expect(d.totalOrders).toBe(0)
    expect(d.paidOrders).toBe(0)
    expect(d.newStores).toBe(0)
    expect(d.newBuyers).toBe(0)
    expect(d.newSellers).toBe(0)
  })

  it('response shape has all required platform metric keys', async () => {
    authAs(ADMIN)
    mockFrom.mockImplementation(makeAdminAnalyticsMock({}))
    const res = await request(app)
      .get('/api/analytics/platform')
      .set('Authorization', bearerToken(ADMIN))
    expect(res.status).toBe(200)
    const d = res.body.data
    expect(d).toHaveProperty('gmv')
    expect(d).toHaveProperty('platformFee')
    expect(d).toHaveProperty('totalOrders')
    expect(d).toHaveProperty('paidOrders')
    expect(d).toHaveProperty('newStores')
    expect(d).toHaveProperty('newBuyers')
    expect(d).toHaveProperty('newSellers')
  })
})
