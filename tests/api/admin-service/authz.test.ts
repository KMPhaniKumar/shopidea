/**
 * admin-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fixes for HIGH-8, LOW-2:
 *  - HIGH-8: coupon DELETE /:id requires store ownership (403 for non-owner)
 *  - HIGH-8: coupon GET / requires store ownership via storeId param (403 for non-owner)
 *  - LOW-2: settings GET / requires auth (401 without token, 200 with valid token)
 *
 * Mock strategy: mock lib/supabase.ts by absolute path so supabaseAdmin is a
 * controllable spy.  No real Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, OTHER_SELLER, STORE, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── Mock supabaseAdmin ────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Test app setup ────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const [{ couponsRouter }, { settingsRouter }] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/coupons'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/settings'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/admin/coupons', couponsRouter)
  app.use('/api/admin/settings', settingsRouter)
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
      upsert: (_d: any, _opts?: any) => builder,
      delete: () => builder,
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

const COUPON_ID = 'eeeeeeee-0001-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/admin/coupons?storeId= — HIGH-8 ownership ───────────────────────

describe('GET /api/admin/coupons — HIGH-8 store ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .get('/api/admin/coupons')
      .query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 400 when storeId is missing', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({}))
    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 403 when caller does not own the store — HIGH-8 fix', async () => {
    authAs(OTHER_SELLER)
    // Ownership check: stores.select('id').eq('id', storeId).eq('seller_id', userId) → null
    mockFrom.mockImplementation(makeQueryBuilder({
      stores: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the owning seller to list coupons — HIGH-8 fix', async () => {
    authAs(SELLER)
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'stores' && !storesHit) {
        storesHit = true
        return makeQueryBuilder({ stores: { data: { id: STORE.id }, error: null } })(table)
      }
      // coupons table
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .get('/api/admin/coupons')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// ── DELETE /api/admin/coupons/:id — HIGH-8 ownership ─────────────────────────

describe('DELETE /api/admin/coupons/:id — HIGH-8 store ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).delete(`/api/admin/coupons/${COUPON_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 404 when coupon does not exist', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      coupons: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .delete(`/api/admin/coupons/${COUPON_ID}`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(404)
  })

  it('returns 403 when non-owner tries to delete coupon — HIGH-8 fix', async () => {
    authAs(OTHER_SELLER)
    let couponsHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coupons' && !couponsHit) {
        couponsHit = true
        // Coupon exists, store_id = STORE.id (owned by SELLER, not OTHER_SELLER)
        return makeQueryBuilder({
          coupons: { data: { id: COUPON_ID, store_id: STORE.id }, error: null },
        })(table)
      }
      if (table === 'stores') {
        // Ownership check: seller_id filter returns null → not owner
        return makeQueryBuilder({ stores: { data: null, error: { message: 'not found' } } })(table)
      }
      return makeQueryBuilder({})(table)
    })
    const res = await request(app)
      .delete(`/api/admin/coupons/${COUPON_ID}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('allows the owning seller to delete their coupon — HIGH-8 fix', async () => {
    authAs(SELLER)
    let couponsHit = false
    let storesHit = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'coupons' && !couponsHit) {
        couponsHit = true
        return makeQueryBuilder({
          coupons: { data: { id: COUPON_ID, store_id: STORE.id }, error: null },
        })(table)
      }
      if (table === 'stores' && !storesHit) {
        storesHit = true
        // Ownership check passes
        return makeQueryBuilder({ stores: { data: { id: STORE.id }, error: null } })(table)
      }
      // Final update (soft-delete sets is_active=false)
      const builder: any = {
        update: () => builder,
        eq: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })
    const res = await request(app)
      .delete(`/api/admin/coupons/${COUPON_ID}`)
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ── GET /api/admin/settings — LOW-2: requires auth ───────────────────────────

describe('GET /api/admin/settings — LOW-2: auth required', () => {
  it('returns 401 when no auth token is provided — LOW-2 fix', async () => {
    const res = await request(app).get('/api/admin/settings')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 200 with settings when authenticated', async () => {
    // settings GET / uses requireAuth (any authenticated user)
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      platform_settings: { data: [{ key: 'maintenance_mode', value: false }], error: null },
    }))
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data).toBe('object')
  })
})
