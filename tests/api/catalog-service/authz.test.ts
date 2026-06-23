/**
 * catalog-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fixes for CRIT-4, HIGH-6:
 *  - CRIT-4: DELETE /products/:id & PUT /products/:id/availability & GET /products?storeId=
 *    require store ownership; non-owner receives 403.
 *  - HIGH-6: public GET /stores, /stores/:slug, /stores/:id/products must NOT
 *    expose KYC columns (pan_number, aadhaar_url, gst_number, selfie_path,
 *    pan_doc_path) in the response body.
 *
 * Mock strategy: mock lib/supabase.ts by absolute path so supabaseAdmin is a
 * controllable spy.  No real Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, SELLER, OTHER_SELLER, STORE, OTHER_STORE,
  makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin (absolute path) ─────────────────────────────────────
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

// ── 2. Build test Express app ─────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const [{ storesRouter }, { productsRouter }] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/stores'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/products'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/catalog', storesRouter)
  app.use('/api/catalog', productsRouter)
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
 * Fluent Supabase query builder stub.
 * tableResults maps table name → { data, error }.
 * Supports chaining select/eq/ilike/order/limit/single/maybeSingle/then.
 */
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

/** A product row whose store is owned by SELLER */
const OWNED_PRODUCT = {
  id: PRODUCT_ID,
  store_id: STORE.id,
  name: 'Test Product',
  price: 500,
  is_available: true,
  stores: { seller_id: SELLER.id },
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/catalog/products?storeId= (CRIT-4) ───────────────────────────────

describe('GET /api/catalog/products?storeId= — CRIT-4 ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .get('/api/catalog/products')
      .query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 400 when storeId query param is missing', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null },
    }))
    const res = await request(app)
      .get('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when caller does not own the store — CRIT-4 fix', async () => {
    authAs(OTHER_SELLER)
    // userOwnsStore: store lookup returns a store owned by SELLER, not OTHER_SELLER
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null },
    }))
    const res = await request(app)
      .get('/api/catalog/products')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the owning seller to list their products — CRIT-4 fix', async () => {
    authAs(SELLER)
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      // First call: ownership check on 'stores'; second: product list from 'products'
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null } })(table)
      }
      // products table
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (fn: any) => Promise.resolve({ data: [OWNED_PRODUCT], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/catalog/products')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ── DELETE /api/catalog/products/:id (CRIT-4) ─────────────────────────────────

describe('DELETE /api/catalog/products/:id — CRIT-4 ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).delete(`/api/catalog/products/${PRODUCT_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when non-owner tries to delete a product — CRIT-4 fix', async () => {
    authAs(OTHER_SELLER)
    // userOwnsProduct: product lookup returns stores.seller_id = SELLER.id
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows owning seller to delete their product — CRIT-4 fix', async () => {
    authAs(SELLER)
    let productsOwnershipDone = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' && !productsOwnershipDone) {
        productsOwnershipDone = true
        // First products call: ownership check (getProductStore)
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        // isStoreSuspended() calls .from('stores').select('suspended').eq(...).single()
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      // Second products call: the actual delete — return no error
      const builder: any = {
        delete: () => builder,
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── PUT /api/catalog/products/:id/availability (CRIT-4) ───────────────────────

describe('PUT /api/catalog/products/:id/availability — CRIT-4 ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}/availability`)
      .send({ is_available: false })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-owner — CRIT-4 fix', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}/availability`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ is_available: false })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows owning seller to toggle availability — CRIT-4 fix', async () => {
    authAs(SELLER)
    let ownershipChecked = false
    mockFrom.mockImplementation((table: string) => {
      if (!ownershipChecked) {
        ownershipChecked = true
        // Ownership check: products with stores join
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      // Update call
      const builder: any = {
        update: () => builder,
        eq: () => builder,
        select: () => builder,
        single: () => ({ data: { ...OWNED_PRODUCT, is_available: false }, error: null }),
      }
      return builder
    })
    const res = await request(app)
      .put(`/api/catalog/products/${PRODUCT_ID}/availability`)
      .set('Authorization', bearerToken(SELLER))
      .send({ is_available: false })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── HIGH-6: KYC field leak on public store endpoints ─────────────────────────

const KYC_FIELDS = ['pan_number', 'aadhaar_url', 'gst_number', 'selfie_path', 'pan_doc_path', 'bank_account_number', 'bank_ifsc']

/** A store row that a badly-written query might return (includes KYC) */
const STORE_ROW_WITH_KYC = {
  id: STORE.id,
  store_name: 'Test Store',
  store_slug: 'test-store',
  category: 'fashion',
  logo_url: null,
  description: 'Cool store',
  city: 'Mumbai',
  area: 'Andheri',
  pincode: '400053',
  whatsapp_number: '+919999900002',
  instagram_handle: null,
  rating_avg: 4.5,
  total_reviews: 10,
  total_orders: 50,
  is_verified: true,
  is_active: true,
  created_at: new Date().toISOString(),
  // KYC fields that MUST NOT appear in response
  pan_number: 'ABCDE1234F',
  aadhaar_url: 'https://storage/aadhaar.jpg',
  gst_number: '27ABCDE1234F1Z5',
  selfie_path: 'https://storage/selfie.jpg',
  pan_doc_path: 'https://storage/pan.jpg',
  bank_account_number: '1234567890',
  bank_ifsc: 'HDFC0001234',
  seller_id: SELLER.id,
}

/**
 * HIGH-6 KYC-leak testing strategy:
 *
 * The routes call supabaseAdmin.from('stores').select('<safe_cols>') with an
 * explicit column list.  Real Supabase enforces column projection server-side:
 * only the requested columns come back.  Our mock cannot replicate that — it
 * always returns the full fixture row regardless of the column string.
 *
 * Correct approach: the mock simulates what the real DB returns — i.e. it
 * projects the fixture to only the columns the route requests.  We extract
 * the column list from the select() call and filter the fixture accordingly.
 * This accurately models the Supabase contract and lets the test prove that
 * the route does NOT strip KYC fields itself (it relies on select-projection).
 *
 * If the route ever changes to select('*'), the test will fail — correctly —
 * because the projected row will then contain KYC fields.
 */

/** Parse a Supabase select string and return a Set of simple column names */
function parseSelectColumns(cols?: string): Set<string> | null {
  if (!cols || cols.trim() === '*') return null // '*' → no projection
  return new Set(cols.split(',').map(c => c.trim().split(' ')[0]))
}

/** Project a row to only the requested columns (simulates Supabase server-side) */
function projectRow(row: Record<string, any>, cols?: string): Record<string, any> {
  const allowed = parseSelectColumns(cols)
  if (!allowed) return row
  return Object.fromEntries(Object.entries(row).filter(([k]) => allowed.has(k)))
}

describe('GET /api/catalog/stores — HIGH-6: no KYC leak', () => {
  it('returns 200 on public store list', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: [STORE_ROW_WITH_KYC], error: null },
    }))
    const res = await request(app).get('/api/catalog/stores')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('does not expose KYC columns in GET /stores list response — HIGH-6 fix', async () => {
    // Use a column-projecting mock that mirrors what Supabase server-side does.
    // The route selects a fixed safe column list — no KYC fields appear there.
    // If the query ever switches to select('*'), this test will fail.
    mockFrom.mockImplementation((table: string) => {
      let _selectCols: string | undefined
      const builder: any = {
        select: (cols?: string) => { _selectCols = cols; return builder },
        eq: () => builder,
        ilike: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (fn: any) =>
          Promise.resolve({
            data: [projectRow(STORE_ROW_WITH_KYC, _selectCols)],
            error: null,
          }).then(fn),
      }
      return builder
    })
    const res = await request(app).get('/api/catalog/stores')
    expect(res.status).toBe(200)
    const store = res.body.data?.[0] ?? {}
    for (const field of KYC_FIELDS) {
      expect(store, `KYC field "${field}" must not appear in public /stores response`).not.toHaveProperty(field)
    }
  })
})

describe('GET /api/catalog/stores/:slug — HIGH-6: no KYC leak', () => {
  it('returns 200 with store data', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: STORE_ROW_WITH_KYC, error: null },
    }))
    const res = await request(app).get('/api/catalog/stores/test-store')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('does not expose KYC columns in GET /stores/:slug response — HIGH-6 fix', async () => {
    // Column-projecting mock: captures the select() column list and returns only
    // those columns (simulates Supabase server-side projection).
    mockFrom.mockImplementation((table: string) => {
      let _selectCols: string | undefined
      const builder: any = {
        select: (cols?: string) => { _selectCols = cols; return builder },
        eq: () => builder,
        single: () => ({ data: projectRow(STORE_ROW_WITH_KYC, _selectCols), error: null }),
      }
      return builder
    })
    const res = await request(app).get('/api/catalog/stores/test-store')
    expect(res.status).toBe(200)
    const store = res.body.data ?? {}
    for (const field of KYC_FIELDS) {
      expect(store, `KYC field "${field}" must not be present in GET /stores/:slug`).not.toHaveProperty(field)
    }
  })

  it('returns 404 when store slug does not exist', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app).get('/api/catalog/stores/no-such-store')
    expect(res.status).toBe(404)
  })
})

describe('GET /api/catalog/stores/:id/products — HIGH-6: no KYC leak', () => {
  it('returns 200 with product list (no KYC in product rows)', async () => {
    // The handler first validates the store (stores query), then fetches products.
    // The mock must handle both tables in call-sequence order.
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQueryBuilder({
          stores: { data: { id: STORE.id, approval_status: 'approved', is_active: true, suspended: false }, error: null },
        })(table)
      }
      return makeQueryBuilder({
        products: { data: [OWNED_PRODUCT], error: null },
      })(table)
    })
    const res = await request(app).get(`/api/catalog/stores/${STORE.id}/products`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    // Products endpoint returns product rows, not store rows — but verify no
    // KYC columns leaked through any accidental select('*') on the join.
    const product = res.body.data?.[0] ?? {}
    for (const field of KYC_FIELDS) {
      expect(product, `KYC field "${field}" must not appear in products response`).not.toHaveProperty(field)
    }
  })
})
