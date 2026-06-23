/**
 * payout-service — authorization & IDOR tests
 *
 * Tests verify the security sweep fixes for HIGH-3, MED-8:
 *  - GET /payouts?storeId=: 403 for a store the caller doesn't own (HIGH-3)
 *  - GET /payouts/summary?storeId=: same ownership check (HIGH-3)
 *  - GET /payouts/bank-account: uses req.user.id only, no sellerId param honored (MED-8)
 *
 * Mock strategy: mock lib/supabase.ts directly so supabaseAdmin is a spy object.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, OTHER_SELLER, STORE, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── Mock supabaseAdmin singleton ──────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Test app setup ────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const [{ payoutsRouter }, { bankAccountsRouter }] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/payouts'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/routes/bankAccounts'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/payouts', payoutsRouter)
  app.use('/api/payouts', bankAccountsRouter)
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

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── GET /api/payouts?storeId= ─────────────────────────────────────────────────

describe('GET /api/payouts (list)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get('/api/payouts').query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 400 when storeId is missing', async () => {
    authAs(SELLER)
    mockFrom.mockReturnValue({ select: vi.fn().mockReturnThis() }) // not reached
    const res = await request(app)
      .get('/api/payouts')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/storeId required/i)
  })

  it('returns 403 for a store the caller does not own — HIGH-3 fix', async () => {
    authAs(OTHER_SELLER) // attacker

    mockFrom.mockImplementation((table: string) => {
      // stores ownership check returns nothing (OTHER_SELLER does not own STORE)
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({ data: null, error: { message: 'not found' } }),
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_OWNERSHIP_REQUIRED')
  })

  it('allows the owning seller to list payouts — HIGH-3 fix', async () => {
    authAs(SELLER)

    let storeChecked = false
    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => {
          storeChecked = true
          return { data: { id: STORE.id }, error: null } // ownership passes
        },
        then: (fn: any) =>
          Promise.resolve({
            data: [{ id: 'payout-1', store_id: STORE.id, amount: 5000, status: 'done' }],
            error: null,
          }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(storeChecked).toBe(true) // ownership check must have run
  })
})

// ── GET /api/payouts/summary?storeId= ────────────────────────────────────────

describe('GET /api/payouts/summary', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get('/api/payouts/summary').query({ storeId: STORE.id })
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-owner — HIGH-3 fix', async () => {
    authAs(OTHER_SELLER)

    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({ data: null, error: { message: 'not found' } }),
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(403)
    expect(res.body.code).toBe('STORE_OWNERSHIP_REQUIRED')
  })

  it('returns correct summary for owning seller', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({ data: { id: STORE.id }, error: null }), // ownership passes
        then: (fn: any) => {
          if (table === 'orders') {
            return Promise.resolve({
              data: [{ total_amount: 1060, delivery_fee: 60 }],
              error: null,
            }).then(fn)
          }
          // payouts table
          return Promise.resolve({
            data: [{ amount: 200, status: 'done' }],
            error: null,
          }).then(fn)
        },
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('totalEarned')
    expect(res.body.data).toHaveProperty('totalPaid')
    expect(res.body.data).toHaveProperty('pending')
    // CALC-8: gross = 1060 - 60 = 1000; net = 1000 * 0.94 = 940 (5% fee + 1% TCS); paid = 200; pending = 740
    expect(res.body.data.totalEarned).toBe(940)
    expect(res.body.data.totalPaid).toBe(200)
    expect(res.body.data.pending).toBe(740)
  })
})

// ── GET /api/payouts/bank-account ─────────────────────────────────────────────

describe('GET /api/payouts/bank-account', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).get('/api/payouts/bank-account')
    expect(res.status).toBe(401)
  })

  it('queries bank_accounts by the authenticated user id — MED-8 fix (no sellerId param honored)', async () => {
    authAs(SELLER)

    const queriedSellerIds: string[] = []
    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'seller_id') queriedSellerIds.push(val)
          return builder
        },
        maybeSingle: () => ({
          data: { id: 'ba-1', seller_id: SELLER.id, account_number: '****1234' },
          error: null,
        }),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      // Attempt IDOR: pass a different sellerId as query param — must be ignored
      .query({ sellerId: OTHER_SELLER.id })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // The route MUST have queried with SELLER.id (from req.user.id), not OTHER_SELLER.id
    expect(queriedSellerIds).toContain(SELLER.id)
    expect(queriedSellerIds).not.toContain(OTHER_SELLER.id)
  })

  it('returns the seller bank account data', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => ({
          data: { id: 'ba-1', seller_id: SELLER.id, account_number: '****1234', ifsc_code: 'HDFC0000001', bank_name: 'HDFC' },
          error: null,
        }),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.data.account_number).toBe('****1234')
  })
})
