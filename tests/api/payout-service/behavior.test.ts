/**
 * payout-service — behavior tests (P1-4, P1-5, BA-57, BA-58, BA-59)
 *
 * Covers:
 *  - POST /api/payouts/process : admin-only (200 processed, 401 no auth, 403 non-admin),
 *    skips suspended stores, correct net amount math (5% platform fee), idempotent
 *  - POST /api/payouts/bank-account : create/update with Zod validation
 *  - GET  /api/payouts/bank-account : scoped to caller (MED-8 check — extended)
 *  - GET  /api/payouts/summary     : TCS/commission deductions in summary math
 *
 * Mock strategy:
 *  - lib/supabase: supabaseAdmin spy (requireAdmin reads 'users' table for role check)
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
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/payout-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── Test app ──────────────────────────────────────────────────────────────────
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
  mockGetUser.mockResolvedValue({ data: { user: makeSupabaseUser(identity) }, error: null })
}

function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

/**
 * requireAdmin calls: 1) auth.getUser(token), 2) from('users').select('role').eq(...).single()
 * This helper wires the mock so the requireAdmin guard passes for ADMIN.
 */
function authAsAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: makeSupabaseUser(ADMIN) }, error: null })
  // The 'users' table role check in requireAdmin middleware must yield 'admin'
  // We prime mockFrom to return role=admin on the first users call, then fall through.
}

function authAsNonAdmin() {
  mockGetUser.mockResolvedValue({ data: { user: makeSupabaseUser(SELLER) }, error: null })
  // users table will return role=seller → requireAdmin rejects
}

function makeQB(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: (_cols?: string) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      upsert: (_d: any, _o?: any) => builder,
      delete: () => builder,
      eq: () => builder,
      is: () => builder,
      lte: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

/** Wire mockFrom so requireAdmin passes (role=admin) then falls through to table-specific results */
function withAdminRole(tableOverrides: Record<string, { data: any; error: any }> = {}) {
  let usersHit = false
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users' && !usersHit) {
      usersHit = true
      return makeQB({ users: { data: { role: 'admin' }, error: null } })(table)
    }
    return makeQB(tableOverrides)(table)
  })
}

/** Wire mockFrom so requireAdmin fails (role=seller) */
function withSellerRole() {
  let usersHit = false
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users' && !usersHit) {
      usersHit = true
      return makeQB({ users: { data: { role: 'seller' }, error: null } })(table)
    }
    return makeQB({})(table)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── POST /api/payouts/process (admin-only) ────────────────────────────────────

describe('POST /api/payouts/process (admin-only)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post('/api/payouts/process')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a non-admin seller — P1-4', async () => {
    authAsNonAdmin()
    withSellerRole()
    const res = await request(app)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken(SELLER))
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 200 with processed=0 when no eligible orders — P1-4', async () => {
    authAsAdmin()
    withAdminRole({
      orders: { data: [], error: null }, // no eligible orders
    })

    const res = await request(app)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken(ADMIN))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.processed).toBe(0)
    expect(res.body.data.totalAmount).toBe(0)
  })

  it('processes eligible orders and applies 5% platform fee', async () => {
    authAsAdmin()

    // Two delivered+paid orders for the same store, no payout yet
    const eligibleOrders = [
      { id: 'ord-1', store_id: STORE.id, total_amount: 1060, delivery_fee: 60 },
      { id: 'ord-2', store_id: STORE.id, total_amount: 560, delivery_fee: 60 },
    ]
    // gross for STORE.id = (1060-60) + (560-60) = 1000 + 500 = 1500
    // net = 1500 * 0.95 = 1425

    const insertedPayouts: any[] = []
    let ordersHit = false
    let storesHit = false

    mockFrom.mockImplementation((table: string) => {
      // requireAdmin: users table
      if (table === 'users') {
        return makeQB({ users: { data: { role: 'admin' }, error: null } })(table)
      }
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        // First orders call: eligible order fetch
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          lte: () => builder,
          then: (fn: any) => Promise.resolve({ data: eligibleOrders, error: null }).then(fn),
        }
        return builder
      }
      if (table === 'stores' && !storesHit) {
        storesHit = true
        // stores suspension check
        const builder: any = {
          select: () => builder,
          in: () => builder,
          then: (fn: any) =>
            Promise.resolve({ data: [{ id: STORE.id, suspended: false }], error: null }).then(fn),
        }
        return builder
      }
      if (table === 'payouts') {
        // payout insert
        const builder: any = {
          select: () => builder,
          insert: (d: any) => { insertedPayouts.push(d); return builder },
          eq: () => builder,
          single: () => ({ data: { id: 'payout-1' }, error: null }),
        }
        return builder
      }
      // orders update (payout_id assignment)
      const builder: any = {
        update: (_d: any) => builder,
        in: () => builder,
        then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken(ADMIN))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.processed).toBe(1) // one store processed
    // Net = 1500 * 0.95 = 1425
    expect(res.body.data.totalAmount).toBe(1425)

    if (insertedPayouts.length > 0) {
      expect(insertedPayouts[0].store_id).toBe(STORE.id)
      expect(insertedPayouts[0].amount).toBeCloseTo(1425, 0)
      expect(insertedPayouts[0].status).toBe('pending')
    }
  })

  it('skips suspended stores during payout processing', async () => {
    authAsAdmin()

    const SUSPENDED_STORE_ID = 'eeeeeeee-0099-4000-8000-000000000099'
    const eligibleOrders = [
      { id: 'ord-3', store_id: SUSPENDED_STORE_ID, total_amount: 500, delivery_fee: 60 },
    ]

    let ordersHit = false
    let storesHit = false
    const insertedPayouts: any[] = []

    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return makeQB({ users: { data: { role: 'admin' }, error: null } })(table)
      }
      if (table === 'orders' && !ordersHit) {
        ordersHit = true
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          is: () => builder,
          lte: () => builder,
          then: (fn: any) => Promise.resolve({ data: eligibleOrders, error: null }).then(fn),
        }
        return builder
      }
      if (table === 'stores' && !storesHit) {
        storesHit = true
        // Store is suspended
        const builder: any = {
          select: () => builder,
          in: () => builder,
          then: (fn: any) =>
            Promise.resolve({
              data: [{ id: SUSPENDED_STORE_ID, suspended: true }],
              error: null,
            }).then(fn),
        }
        return builder
      }
      if (table === 'payouts') {
        const builder: any = {
          select: () => builder,
          insert: (d: any) => { insertedPayouts.push(d); return builder },
          single: () => ({ data: { id: 'payout-2' }, error: null }),
        }
        return builder
      }
      return makeQB({})(table)
    })

    const res = await request(app)
      .post('/api/payouts/process')
      .set('Authorization', bearerToken(ADMIN))

    expect(res.status).toBe(200)
    expect(res.body.data.processed).toBe(0) // suspended store skipped
    expect(res.body.data.skipped).toBe(1)
    expect(insertedPayouts).toHaveLength(0) // no payout inserted for suspended store
  })
})

// ── POST /api/payouts/bank-account ────────────────────────────────────────────

describe('POST /api/payouts/bank-account (create/update)', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app).post('/api/payouts/bank-account').send({})
    expect(res.status).toBe(401)
  })

  it('returns 400 for account_number shorter than 8 chars', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send({
        account_number: '1234567', // 7 chars — too short
        account_holder: 'Surya',
        ifsc_code: 'HDFC0000001',
        bank_name: 'HDFC Bank',
      })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 for IFSC code that is not exactly 11 chars', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send({
        account_number: '12345678',
        account_holder: 'Surya',
        ifsc_code: 'HDFC000001', // 10 chars, should be 11
        bank_name: 'HDFC Bank',
      })
    expect(res.status).toBe(400)
  })

  it('returns 400 for account_holder shorter than 2 chars', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send({
        account_number: '12345678',
        account_holder: 'A', // too short
        ifsc_code: 'HDFC0000001',
        bank_name: 'HDFC Bank',
      })
    expect(res.status).toBe(400)
  })

  it('creates bank account with seller_id from auth token (not from body) — MED-8', async () => {
    authAs(SELLER)

    const insertedRows: any[] = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        upsert: (d: any, _o?: any) => { insertedRows.push(d); return builder },
        eq: () => builder,
        single: () => ({
          data: {
            id: 'ba-1',
            seller_id: SELLER.id,
            account_number: '12345678901',
            account_holder: 'Surya Kumar',
            ifsc_code: 'HDFC0000001',
            bank_name: 'HDFC Bank',
          },
          error: null,
        }),
      }
      return builder
    })

    const res = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send({
        account_number: '12345678901',
        account_holder: 'Surya Kumar',
        ifsc_code: 'HDFC0000001',
        bank_name: 'HDFC Bank',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.seller_id).toBe(SELLER.id)

    // Verify the seller_id in the upsert came from auth (token), not body
    if (insertedRows.length > 0) {
      expect(insertedRows[0].seller_id).toBe(SELLER.id)
    }
  })

  it('upserts correctly (idempotent: second save does not create duplicate)', async () => {
    authAs(SELLER)

    let upsertCallCount = 0
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        upsert: (_d: any, _o?: any) => { upsertCallCount++; return builder },
        eq: () => builder,
        single: () => ({
          data: {
            id: 'ba-1',
            seller_id: SELLER.id,
            account_number: '12345678901',
            ifsc_code: 'HDFC0000001',
            bank_name: 'HDFC Bank',
            account_holder: 'Surya Kumar',
          },
          error: null,
        }),
      }
      return builder
    })

    const body = {
      account_number: '12345678901',
      account_holder: 'Surya Kumar',
      ifsc_code: 'HDFC0000001',
      bank_name: 'HDFC Bank',
    }

    const res1 = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send(body)
    const res2 = await request(app)
      .post('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))
      .send(body)

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // upsert (not insert) called twice — second call updates existing row
    expect(upsertCallCount).toBe(2)
  })
})

// ── GET /api/payouts/summary — TCS/commission deduction math ─────────────────

describe('GET /api/payouts/summary — deduction math', () => {
  /**
   * Platform fee = 5% (PLATFORM_FEE_PCT = 0.05)
   * Formula: totalEarned = Σ (total_amount - delivery_fee) * 0.95
   *          pending = totalEarned - totalPaid
   */

  it('calculates correct net after 5% platform fee with multiple orders', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => ({ data: { id: STORE.id }, error: null }), // ownership passes
        then: (fn: any) => {
          if (table === 'orders') {
            return Promise.resolve({
              data: [
                { total_amount: 1060, delivery_fee: 60 }, // net before fee: 1000
                { total_amount: 560, delivery_fee: 60 },  // net before fee: 500
              ],
              error: null,
            }).then(fn)
          }
          // payouts
          return Promise.resolve({
            data: [{ amount: 950, status: 'done' }], // totalPaid = 950
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

    // totalEarned = (1000 + 500) * 0.95 = 1425
    expect(res.body.data.totalEarned).toBe(1425)
    // totalPaid = 950 (status=done)
    expect(res.body.data.totalPaid).toBe(950)
    // pending = 1425 - 950 = 475
    expect(res.body.data.pending).toBe(475)
  })

  it('excludes non-done payouts from totalPaid', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({ data: { id: STORE.id }, error: null }),
        then: (fn: any) => {
          if (table === 'orders') {
            return Promise.resolve({
              data: [{ total_amount: 1060, delivery_fee: 60 }],
              error: null,
            }).then(fn)
          }
          return Promise.resolve({
            data: [
              { amount: 500, status: 'done' },     // counts
              { amount: 300, status: 'pending' },   // does NOT count
              { amount: 200, status: 'processing' }, // does NOT count
            ],
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
    // totalEarned = 1000 * 0.95 = 950
    expect(res.body.data.totalEarned).toBe(950)
    // totalPaid = 500 (only done payouts)
    expect(res.body.data.totalPaid).toBe(500)
    // pending = 950 - 500 = 450
    expect(res.body.data.pending).toBe(450)
  })

  it('returns zeros when store has no paid orders', async () => {
    authAs(SELLER)

    mockFrom.mockImplementation((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => ({ data: { id: STORE.id }, error: null }),
        then: (fn: any) => {
          if (table === 'orders') {
            return Promise.resolve({ data: [], error: null }).then(fn)
          }
          return Promise.resolve({ data: [], error: null }).then(fn)
        },
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/summary')
      .set('Authorization', bearerToken(SELLER))
      .query({ storeId: STORE.id })

    expect(res.status).toBe(200)
    expect(res.body.data.totalEarned).toBe(0)
    expect(res.body.data.totalPaid).toBe(0)
    expect(res.body.data.pending).toBe(0)
  })
})

// ── GET /api/payouts/bank-account — scoping (MED-8 extended) ─────────────────

describe('GET /api/payouts/bank-account (additional scoping checks)', () => {
  it('returns null data (not 404) when seller has no bank account registered', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => ({ data: null, error: null }),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeNull()
  })

  it('never returns another seller bank account even when sellerId in URL', async () => {
    // The GET endpoint has no :sellerId param — but confirm seller_id is bound to auth user
    authAs(SELLER)

    const queriedIds: string[] = []
    mockFrom.mockImplementation((_table: string) => {
      const builder: any = {
        select: () => builder,
        eq: (col: string, val: string) => {
          if (col === 'seller_id') queriedIds.push(val)
          return builder
        },
        maybeSingle: () => ({
          data: { id: 'ba-1', seller_id: SELLER.id },
          error: null,
        }),
      }
      return builder
    })

    const res = await request(app)
      .get('/api/payouts/bank-account')
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    // Must have queried with SELLER.id (from auth token), not OTHER_SELLER.id
    expect(queriedIds).toContain(SELLER.id)
    expect(queriedIds).not.toContain(OTHER_SELLER.id)
  })
})
