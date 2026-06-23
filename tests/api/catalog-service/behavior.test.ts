/**
 * catalog-service — behavior tests (beyond existing authz suite)
 *
 * Covers:
 *  Products
 *    POST /products — create with ownership, validation (missing name, negative price),
 *      suspended store → 403, success → 201 with product shape
 *    PUT /products/:id — update by owner, suspended → 403, non-owner → 403
 *    GET /products/:id (public) — available in approved store → 200;
 *      unavailable → 404; unapproved store → 404; suspended store → 404
 *
 *  Reviews
 *    GET /stores/:id/reviews (public) — returns review list with reviewer name
 *    POST /reviews — buyer must have a delivered order from this store;
 *      no delivered order → 403; rating out of range → 400;
 *      success → 201; updates store rating_avg after insert
 *
 *  Stores
 *    POST /stores — auth, creates store, 400 on too-short name
 *    PUT /stores/:id — seller updates own store, non-owner → 403
 *    POST /stores/:id/follow — toggle follow; follow → { following: true };
 *      second call → { following: false }
 *    GET /my-store — returns seller's store, 404 if no store
 *    GET /stores with ?q= filter — returns search results
 *    GET /stores/:id/products — 404 when store not approved
 *
 * Mock strategy: absolute-path mocks for catalog's lib/supabase.ts.
 * No real Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, SELLER, OTHER_SELLER, STORE, OTHER_STORE,
  makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Test app ───────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const [{ storesRouter }, { productsRouter }, { reviewsRouter }] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/stores'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/products'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/reviews'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/catalog', storesRouter)
  app.use('/api/catalog', productsRouter)
  app.use('/api/catalog', reviewsRouter)
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
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      ilike: () => builder,
      gte: () => builder,
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

const PRODUCT_ID = 'dddddddd-0001-4000-8000-000000000001'
const ORDER_ID   = 'eeeeeeee-0001-4000-8000-000000000001'

const OWNED_PRODUCT = {
  id: PRODUCT_ID,
  store_id: STORE.id,
  name: 'Test Product',
  price: 500,
  is_available: true,
  stores: { seller_id: SELLER.id, approval_status: 'approved', is_active: true, suspended: false },
}

const APPROVED_STORE_ROW = {
  id: STORE.id,
  approval_status: 'approved',
  is_active: true,
  suspended: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── POST /api/catalog/products — create product ───────────────────────────────

describe('POST /api/catalog/products — create', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/catalog/products')
      .send({ store_id: STORE.id, name: 'Shirt', price: 500 })
    expect(res.status).toBe(401)
  })

  it('returns 400 when name is too short (< 2 chars)', async () => {
    // Zod validation fires before any DB call — no DB mock needed
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      // Should not be reached (Zod rejects before ownership check)
      const b: any = { select: () => b, eq: () => b, single: () => ({ data: null, error: null }) }
      return b
    })
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_id: STORE.id, name: 'X', price: 500 })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  }, 5000)

  it('returns 400 when price is negative', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      const b: any = { select: () => b, eq: () => b, single: () => ({ data: null, error: null }) }
      return b
    })
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_id: STORE.id, name: 'Shirt', price: -100 })
    expect(res.status).toBe(400)
  }, 5000)

  it('returns 400 when store_id is missing', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((table: string) => {
      const b: any = { select: () => b, eq: () => b, single: () => ({ data: null, error: null }) }
      return b
    })
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .send({ name: 'Shirt', price: 500 })
    expect(res.status).toBe(400)
  }, 5000)

  it('returns 403 when caller does not own the store', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { seller_id: SELLER.id }, error: null },
    }))
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ store_id: STORE.id, name: 'Shirt', price: 500 })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 when store is suspended', async () => {
    authAs(SELLER)
    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        callIdx++
        if (callIdx === 1) {
          // Ownership check — seller owns the store
          return makeQueryBuilder({ stores: { data: { seller_id: SELLER.id }, error: null } })(table)
        } else {
          // isStoreSuspended check — suspended=true
          return makeQueryBuilder({ stores: { data: { suspended: true }, error: null } })(table)
        }
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_id: STORE.id, name: 'Shirt', price: 500 })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_SUSPENDED')
  })

  it('returns 201 with new product on valid request', async () => {
    authAs(SELLER)
    const newProduct = { id: PRODUCT_ID, store_id: STORE.id, name: 'New Shirt', price: 750, is_available: true }
    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        callIdx++
        if (callIdx === 1) {
          return makeQueryBuilder({ stores: { data: { seller_id: SELLER.id }, error: null } })(table)
        }
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'products') {
        const b: any = {
          insert: () => b,
          select: () => b,
          single: () => ({ data: newProduct, error: null }),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_id: STORE.id, name: 'New Shirt', price: 750 })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('New Shirt')
    expect(res.body.data.price).toBe(750)
  })
})

// ── PUT /api/catalog/products/:id — update product ───────────────────────────

describe('PUT /api/catalog/products/:id — update', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}`)
      .send({ name: 'Updated Shirt' })
    expect(res.status).toBe(401)
  })

  it('returns 403 when caller does not own the product', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ name: 'Hacked name' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 when owning seller but store is suspended', async () => {
    authAs(SELLER)
    let storeCallIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') {
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        storeCallIdx++
        // isStoreSuspended → suspended=true
        return makeQueryBuilder({ stores: { data: { suspended: true }, error: null } })(table)
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}`)
      .set('Authorization', bearerToken(SELLER))
      .send({ name: 'Updated Shirt' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_SUSPENDED')
  })

  it('allows owning seller to update product name and price', async () => {
    authAs(SELLER)
    const updatedProduct = { ...OWNED_PRODUCT, name: 'Premium Shirt', price: 999 }
    let storeCallIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') {
        // First call: getProductStore (ownership)
        const b: any = {
          select: () => b,
          eq: () => b,
          update: () => b,
          single: () => ({ data: updatedProduct, error: null }),
        }
        return b
      }
      if (table === 'stores') {
        // isStoreSuspended → not suspended
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      return makeQueryBuilder({})(table)
    })
    // Mock products to return ownership on first call, then the update result
    let productsCallIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') {
        productsCallIdx++
        if (productsCallIdx === 1) {
          // getProductStore
          return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
        }
        // update
        const b: any = {
          update: () => b,
          eq: () => b,
          select: () => b,
          single: () => ({ data: updatedProduct, error: null }),
        }
        return b
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}`)
      .set('Authorization', bearerToken(SELLER))
      .send({ name: 'Premium Shirt', price: 999 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe('Premium Shirt')
  })
})

// ── GET /api/catalog/products/:id (public) ────────────────────────────────────

describe('GET /api/catalog/products/:id — public product detail', () => {
  it('returns 200 for an available product in an approved store', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app).get(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(PRODUCT_ID)
    // stores join must not appear in response
    expect(res.body.data).not.toHaveProperty('stores')
  })

  it('returns 404 when product is not available (is_available=false)', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: {
        data: { ...OWNED_PRODUCT, is_available: false },
        error: null,
      },
    }))
    const res = await request(app).get(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when store is not approved', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: {
        data: { ...OWNED_PRODUCT, stores: { approval_status: 'pending', is_active: true, suspended: false } },
        error: null,
      },
    }))
    const res = await request(app).get(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when store is inactive', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: {
        data: { ...OWNED_PRODUCT, stores: { approval_status: 'approved', is_active: false, suspended: false } },
        error: null,
      },
    }))
    const res = await request(app).get(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when store is suspended', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: {
        data: { ...OWNED_PRODUCT, stores: { approval_status: 'approved', is_active: true, suspended: true } },
        error: null,
      },
    }))
    const res = await request(app).get(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 when product does not exist', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app).get(`/api/catalog/products/nonexistent-id`)
    expect(res.status).toBe(404)
  })
})

// ── GET /stores/:id/products — 404 when store not approved ───────────────────

describe('GET /api/catalog/stores/:id/products — store moderation gate', () => {
  it('returns 404 when store is not approved', async () => {
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        // Store query returns null (not approved/active/unsuspended)
        return makeQueryBuilder({ stores: { data: null, error: { message: 'not found' } } })(table)
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app).get(`/api/catalog/stores/${STORE.id}/products`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it('returns 200 with product list when store is approved', async () => {
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQueryBuilder({ stores: { data: APPROVED_STORE_ROW, error: null } })(table)
      }
      return makeQueryBuilder({ products: { data: [OWNED_PRODUCT], error: null } })(table)
    })
    const res = await request(app).get(`/api/catalog/stores/${STORE.id}/products`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ── GET /api/catalog/stores/:id/reviews ──────────────────────────────────────

describe('GET /api/catalog/stores/:id/reviews — public', () => {
  it('returns 200 with review list (no auth required)', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      reviews: {
        data: [
          { id: 'r1', rating: 5, comment: 'Great!', users: { full_name: 'Buyer One' } },
          { id: 'r2', rating: 4, comment: 'Good',   users: { full_name: 'Buyer Two' } },
        ],
        error: null,
      },
    }))
    const res = await request(app).get(`/api/catalog/stores/${STORE.id}/reviews`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(2)
  })

  it('returns empty array when store has no reviews', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      reviews: { data: [], error: null },
    }))
    const res = await request(app).get(`/api/catalog/stores/${STORE.id}/reviews`)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})

// ── POST /api/catalog/reviews — submit review ────────────────────────────────

describe('POST /api/catalog/reviews — review submission', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/catalog/reviews')
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 5 })
    expect(res.status).toBe(401)
  })

  it('returns 400 when rating is out of range (0 or 6)', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({}))
    const res0 = await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 0 })
    expect(res0.status).toBe(400)

    const res6 = await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 6 })
    expect(res6.status).toBe(400)
  })

  it('returns 400 when order_id is missing', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, rating: 5 })
    expect(res.status).toBe(400)
  })

  it('returns 403 when buyer has no delivered order from this store', async () => {
    authAs(BUYER)
    // orders check returns null (no delivered order found)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 5, comment: 'Great!' })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Can only review after delivery/i)
  })

  it('returns 201 with review data when buyer has a delivered order', async () => {
    authAs(BUYER)
    const newReview = { id: 'r-new', store_id: STORE.id, buyer_id: BUYER.id, rating: 4, comment: 'Good store' }
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders' && callCount === 0) {
        callCount++
        // Verify delivered order exists
        return makeQueryBuilder({ orders: { data: { id: ORDER_ID }, error: null } })(table)
      }
      if (table === 'reviews' && callCount === 1) {
        callCount++
        // Insert review
        const b: any = {
          insert: () => b,
          select: () => b,
          single: () => ({ data: newReview, error: null }),
        }
        return b
      }
      if (table === 'reviews') {
        // Fetch all reviews for rating_avg update
        callCount++
        return makeQueryBuilder({ reviews: { data: [{ rating: 4 }, { rating: 5 }], error: null } })(table)
      }
      if (table === 'stores') {
        // Update rating_avg
        const b: any = {
          update: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 4, comment: 'Good store' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.rating).toBe(4)
  })

  it('updates store rating_avg after review insert', async () => {
    authAs(BUYER)
    let storesUpdateCalled = false
    let storesUpdateData: any = null

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return makeQueryBuilder({ orders: { data: { id: ORDER_ID }, error: null } })(table)
      }
      if (table === 'reviews') {
        const b: any = {
          // insert path
          insert: () => b,
          select: () => b,
          eq: () => b,
          // select path for rating recalc
          order: () => b,
          limit: () => b,
          single: () => ({ data: { id: 'new-review', rating: 5 }, error: null }),
          then: (fn: any) => Promise.resolve({ data: [{ rating: 4 }, { rating: 5 }], error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores') {
        const b: any = {
          update: (data: any) => {
            storesUpdateCalled = true
            storesUpdateData = data
            return b
          },
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })

    await request(app)
      .post('/api/catalog/reviews')
      .set('Authorization', bearerToken(BUYER))
      .send({ store_id: STORE.id, order_id: ORDER_ID, rating: 5 })

    expect(storesUpdateCalled).toBe(true)
    expect(storesUpdateData).toMatchObject({ rating_avg: expect.any(Number), total_reviews: expect.any(Number) })
    // Two reviews: 4 and 5 → avg = 4.5
    expect(storesUpdateData.rating_avg).toBe(4.5)
    expect(storesUpdateData.total_reviews).toBe(2)
  })
})

// ── POST /api/catalog/stores — create store ───────────────────────────────────

describe('POST /api/catalog/stores — create', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/catalog/stores')
      .send({ store_name: 'My Store', category: 'fashion', city: 'Mumbai' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when store_name is too short (< 3 chars)', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/catalog/stores')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_name: 'AB', category: 'fashion', city: 'Mumbai' })
    expect(res.status).toBe(400)
  })

  it('returns 201 with store data on valid request', async () => {
    authAs(SELLER)
    const newStore = { id: STORE.id, store_name: 'My Store', store_slug: 'my-store-abc123', seller_id: SELLER.id }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        const b: any = {
          insert: () => b,
          select: () => b,
          single: () => ({ data: newStore, error: null }),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post('/api/catalog/stores')
      .set('Authorization', bearerToken(SELLER))
      .send({ store_name: 'My Store', category: 'fashion', city: 'Mumbai' })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.store_name).toBe('My Store')
  })
})

// ── PUT /api/catalog/stores/:id — update store ───────────────────────────────

describe('PUT /api/catalog/stores/:id — update', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).put(`/api/catalog/stores/${STORE.id}`).send({ store_name: 'New Name' })
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-owner tries to update', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { seller_id: SELLER.id }, error: null },
    }))
    const res = await request(app)
      .put(`/api/catalog/stores/${STORE.id}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ store_name: 'Hijacked' })
    expect(res.status).toBe(403)
  })

  it('prevents overwriting seller_id via body', async () => {
    authAs(SELLER)
    let updateData: any = null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores') {
        const b: any = {
          select: () => b,
          update: (data: any) => {
            updateData = data
            return b
          },
          eq: () => b,
          single: () => ({ data: { ...STORE, seller_id: SELLER.id, store_name: 'Updated' }, error: null }),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    await request(app)
      .put(`/api/catalog/stores/${STORE.id}`)
      .set('Authorization', bearerToken(SELLER))
      .send({ store_name: 'Updated', seller_id: 'attacker-id' })
    // seller_id must have been stripped before DB update
    expect(updateData).not.toHaveProperty('seller_id')
  })
})

// ── POST /stores/:id/follow — toggle follow ───────────────────────────────────

describe('POST /api/catalog/stores/:id/follow — toggle', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post(`/api/catalog/stores/${STORE.id}/follow`)
    expect(res.status).toBe(401)
  })

  it('returns { following: true } when not currently following', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'followed_stores') {
        const b: any = {
          select: () => b,
          insert: () => b,
          delete: () => b,
          eq: () => b,
          maybeSingle: () => ({ data: null, error: null }), // not following
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post(`/api/catalog/stores/${STORE.id}/follow`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(200)
    expect(res.body.data.following).toBe(true)
  })

  it('returns { following: false } when already following (unfollow)', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'followed_stores') {
        const b: any = {
          select: () => b,
          delete: () => b,
          insert: () => b,
          eq: () => b,
          maybeSingle: () => ({ data: { id: 'existing-follow' }, error: null }), // already following
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .post(`/api/catalog/stores/${STORE.id}/follow`)
      .set('Authorization', bearerToken(BUYER))
    expect(res.status).toBe(200)
    expect(res.body.data.following).toBe(false)
  })
})

// ── GET /api/catalog/my-store ─────────────────────────────────────────────────

describe('GET /api/catalog/my-store — seller own store', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/catalog/my-store')
    expect(res.status).toBe(401)
  })

  it('returns 404 when seller has no store', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get('/api/catalog/my-store')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/No store found/i)
  })

  it('returns 200 with store data for the authenticated seller', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { id: STORE.id, store_name: 'Test Store', seller_id: SELLER.id }, error: null },
    }))
    const res = await request(app)
      .get('/api/catalog/my-store')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.seller_id).toBe(SELLER.id)
  })
})

// ── GET /api/catalog/stores?q= — search ──────────────────────────────────────

describe('GET /api/catalog/stores?q= — search query', () => {
  it('returns matching stores for a search query', async () => {
    mockFrom.mockImplementation((table: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        ilike: () => b,
        order: () => b,
        limit: () => b,
        then: (fn: any) => Promise.resolve({
          data: [{ id: STORE.id, store_name: 'Test Store', store_slug: 'test-store', city: 'Mumbai' }],
          error: null,
        }).then(fn),
      }
      return b
    })
    const res = await request(app).get('/api/catalog/stores').query({ q: 'test' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns empty array when no stores match the query', async () => {
    mockFrom.mockImplementation((table: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        ilike: () => b,
        limit: () => b,
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return b
    })
    const res = await request(app).get('/api/catalog/stores').query({ q: 'zzz-no-match' })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})
