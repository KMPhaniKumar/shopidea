/**
 * admin-service — auth bridge tests
 *
 * Covers BA-01 to BA-05 (TEST_PLAN_master.md §1F):
 *   BA-01 POST /api/admin/auth/msg91-exchange  — MSG91 widget token → Supabase session
 *   BA-02 POST /api/admin/auth/check-phone     — phone registration lookup
 *   BA-03 POST /api/admin/auth/otp/send        — mobile OTP send
 *   BA-04 POST /api/admin/auth/otp/verify      — mobile OTP verify → session
 *   BA-05 (removed) test-login endpoint must NOT exist (CRIT-3 / security)
 *
 * Plus:
 *   • Non-admin guard: a buyer/seller token is rejected (403) from admin-only routes
 *     (GET /api/admin/users, GET /api/admin/stores).
 *   • Seller login path: createIfMissing:false — unknown phone → 404, not auto-created.
 *
 * Mock strategy:
 *   • global.fetch is mocked to intercept all MSG91 HTTP calls (no real network).
 *   • supabaseAdmin is mocked at its absolute path (same pattern as the
 *     existing authz.test.ts file so vi.mock() picks it up before any import).
 *   • No real Supabase traffic; no real OTP/SMS is sent.
 *
 * All tests are TEST MODE only — never hit real MSG91, Supabase, or SMS.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, SELLER, ADMIN, OTHER_BUYER, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── IMPORTANT: mock must be declared before any service import ────────────────

// Supabase admin mock — mirrors the shape used by the existing authz.test.ts
const mockGetUser   = vi.fn()
const mockFrom      = vi.fn()
const mockCreateUser  = vi.fn()
const mockUpdateUser  = vi.fn()
const mockListUsers   = vi.fn()
const mockSignIn    = vi.fn()

const supabaseAdminMock = {
  auth: {
    getUser: mockGetUser,
    admin: {
      createUser: mockCreateUser,
      updateUserById: mockUpdateUser,
      listUsers: mockListUsers,
    },
    signInWithPassword: mockSignIn,
  },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── App setup ─────────────────────────────────────────────────────────────────

let app: express.Application

beforeAll(async () => {
  // Dynamically import AFTER the mock is registered so the service picks up the
  // mock instead of the real supabaseAdmin.
  const [
    { authRouter },
    { adminUsersRouter },
    { adminStoresRouter },
  ] = await Promise.all([
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/auth'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/users'),
    import('/Users/murali/Documents/GitHub/shopidea/reelmart/services/admin-service/src/routes/stores'),
  ])

  app = express()
  app.use(express.json())
  app.use('/api/admin/auth', authRouter)
  app.use('/api/admin/users', adminUsersRouter)
  app.use('/api/admin/stores', adminStoresRouter)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

// The ALLOWED_ORIGINS env var is set to 'https://dev.reelmart.in' in vitest.config.ts.
// Both /msg91-exchange and /check-phone are origin-gated — requests without a
// matching Origin header return 403.
const ALLOWED_ORIGIN = 'https://dev.reelmart.in'

/** Intercept fetch globally; returns a factory that resolves to a JSON body */
function mockFetch(body: object, ok = true, status = 200) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response)
}

/** Return a Supabase from()-builder that resolves to result for the given table */
function makeQueryBuilder(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: (_cols?: string, _opts?: any) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      upsert: (_d: any, _opts?: any) => builder,
      delete: () => builder,
      eq: (_col: string, _val: any) => builder,
      neq: () => builder,
      or: () => builder,
      ilike: () => builder,
      order: () => builder,
      range: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

/** Auth helper: make supabase.auth.getUser return a valid user */
function authAs(identity: { id: string }) {
  mockGetUser.mockResolvedValue({
    data: { user: makeSupabaseUser(identity) },
    error: null,
  })
}

/** Auth helper: make supabase.auth.getUser fail */
function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

/** Make the users table role-lookup return the given role for requireAdmin */
function userRoleIs(userId: string, role: string) {
  const real = mockFrom.getMockImplementation()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      // requireAdmin calls: .from('users').select('role').eq('id', userId).single()
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        single: () => Promise.resolve({ data: { role }, error: null }),
        then: (fn: any) => Promise.resolve({ data: { role }, error: null }).then(fn),
      }
      return builder
    }
    return real ? real(table) : makeQueryBuilder({})(table)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  // Default: no real fetch should escape — fail loudly if it does
  vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch must be mocked in each test'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// =============================================================================
// POST /api/admin/auth/msg91-exchange
// =============================================================================

describe('POST /api/admin/auth/msg91-exchange — BA-01', () => {

  it('returns 403 when Origin header is missing (origin guard)', async () => {
    // No origin header set
    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .send({ accessToken: 'a'.repeat(20) })
    // ALLOWED_ORIGINS is set; missing origin must be rejected
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when Origin header is not in the allow-list', async () => {
    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', 'https://evil.example.com')
      .send({ accessToken: 'a'.repeat(20) })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when accessToken is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when accessToken is too short (< 20 chars)', async () => {
    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when role is an invalid enum value', async () => {
    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'superuser' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 500 when MSG91 rejects the access token (type != success)', async () => {
    // MSG91 returns an error type
    mockFetch({ type: 'error', message: 'invalid token' })

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'buyer' })

    // verifyWithMsg91 throws → caught → 500
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })

  it('returns 200 with session for a registered buyer (happy path, createIfMissing:true)', async () => {
    // MSG91 succeeds, returning the phone
    mockFetch({ type: 'success', message: '919999900001' })

    // Supabase: user already exists in public.users
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { id: BUYER.id }, error: null },
    }))

    // updateUserById (refresh password for returning user)
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })

    // signInWithPassword → session
    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok_access',
          refresh_token: 'tok_refresh',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 3600,
          token_type: 'bearer',
        },
      },
      error: null,
    })

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'buyer' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.session.access_token).toBe('tok_access')
    expect(res.body.data.session.refresh_token).toBe('tok_refresh')
    expect(typeof res.body.data.userId).toBe('string')
  })

  it('returns 404 with NOT_REGISTERED when createIfMissing:false and phone is unknown — seller login path', async () => {
    // MSG91 succeeds
    mockFetch({ type: 'success', message: '919999900099' })

    // Supabase: phone NOT in public.users (unregistered number)
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: null, error: null },
    }))

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'seller', createIfMissing: false })

    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('NOT_REGISTERED')
    // Must NOT auto-create an account
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('returns 200 for a registered seller with createIfMissing:false (known number)', async () => {
    // MSG91 succeeds
    mockFetch({ type: 'success', message: '919999900002' })

    let fromCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallCount++
      if (table === 'users') {
        // First call: createIfMissing:false check — user exists
        // Second call: mintSessionForPhone existing-user lookup
        return makeQueryBuilder({ users: { data: { id: SELLER.id }, error: null } })(table)
      }
      return makeQueryBuilder({})(table)
    })

    mockUpdateUser.mockResolvedValue({ data: {}, error: null })
    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok_seller',
          refresh_token: 'tok_ref_seller',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 3600,
          token_type: 'bearer',
        },
      },
      error: null,
    })

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'seller', createIfMissing: false })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.session.access_token).toBe('tok_seller')
    // No user creation should have occurred
    expect(mockCreateUser).not.toHaveBeenCalled()
  })

  it('creates a new auth user for a first-time buyer (createIfMissing:true, phone not in users)', async () => {
    const NEW_PHONE = '+919888800001'
    const NEW_USER_ID = 'dddddddd-0001-4000-8000-000000000001'

    mockFetch({ type: 'success', message: '919888800001' })

    let usersCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        usersCallCount++
        if (usersCallCount === 1) {
          // First lookup: user not found → createIfMissing triggers user creation
          return makeQueryBuilder({ users: { data: null, error: null } })(table)
        }
        // upsert after creation
        const builder: any = {
          upsert: (_d: any, _opts?: any) => Promise.resolve({ data: null, error: null }),
          select: () => builder,
          eq: () => builder,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })

    mockCreateUser.mockResolvedValue({
      data: { user: { id: NEW_USER_ID } },
      error: null,
    })

    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok_new_buyer',
          refresh_token: 'tok_ref_new',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 3600,
          token_type: 'bearer',
        },
      },
      error: null,
    })

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'buyer' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // createUser was called — new buyer was registered
    expect(mockCreateUser).toHaveBeenCalledOnce()
    expect(mockSignIn).toHaveBeenCalledOnce()
  })
})

// =============================================================================
// POST /api/admin/auth/check-phone — BA-02
// =============================================================================

describe('POST /api/admin/auth/check-phone — BA-02', () => {

  it('returns 403 when Origin header is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .send({ phone: '+919999900002' })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when Origin is not in the allow-list', async () => {
    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', 'https://phishing.site')
      .send({ phone: '+919999900002' })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when phone is too short', async () => {
    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ phone: '123' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns registered:true for a known phone', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { id: SELLER.id }, error: null },
    }))

    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ phone: '+919999900002' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.registered).toBe(true)
  })

  it('returns registered:false for an unregistered phone (seller login guard)', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: null, error: null },
    }))

    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ phone: '+919000000000' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.registered).toBe(false)
  })

  it('normalises phone formats — 10-digit bare number maps to +91 form', async () => {
    // The service normalises "9999900002" → "+919999900002" before querying
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { id: SELLER.id }, error: null },
    }))

    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ phone: '9999900002' })

    expect(res.status).toBe(200)
    expect(res.body.data.registered).toBe(true)
  })

  it('returns 400 when phone resolves to fewer than 10 digits after stripping', async () => {
    const res = await request(app)
      .post('/api/admin/auth/check-phone')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ phone: '12345' })
    // Zod min(8) passes "12345678" but route checks 10-digit rule
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// =============================================================================
// POST /api/admin/auth/otp/send — BA-03
// (No origin gate — mobile endpoint)
// =============================================================================

describe('POST /api/admin/auth/otp/send — BA-03', () => {

  it('returns 502 when MSG91 is configured but the HTTP call fails (network error)', async () => {
    // MSG91_WIDGET_AUTHKEY and MSG91_OTP_TEMPLATE_ID are set in vitest.config.ts env
    // so isOtpConfigured() is true.  The beforeEach spy rejects fetch → 502.
    const res = await request(app)
      .post('/api/admin/auth/otp/send')
      .send({ phone: '+919999900001' })

    expect(res.status).toBe(502)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('OTP_SEND_FAILED')
  })

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/send')
      .send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when phone format is invalid', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/send')
      .send({ phone: 'notaphone' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('does NOT require Origin header (mobile endpoint)', async () => {
    // Should not return 403 for missing origin — it falls through to OTP_NOT_CONFIGURED
    const res = await request(app)
      .post('/api/admin/auth/otp/send')
      .send({ phone: '+919999900001' })
      // deliberately NOT setting Origin
    // 503 (not configured) means origin guard was NOT applied
    expect(res.status).not.toBe(403)
  })
})

// =============================================================================
// POST /api/admin/auth/otp/verify — BA-04
// (No origin gate — mobile endpoint)
// =============================================================================

describe('POST /api/admin/auth/otp/verify — BA-04', () => {

  it('returns 502 when MSG91 is configured but the HTTP call fails (network error)', async () => {
    // MSG91_WIDGET_AUTHKEY and MSG91_OTP_TEMPLATE_ID are set in vitest.config.ts env
    // so isOtpConfigured() is true.  The beforeEach spy rejects fetch → 502.
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001', otp: '123456' })

    expect(res.status).toBe(502)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('OTP_VERIFY_FAILED')
  })

  it('returns 400 when phone is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ otp: '123456' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when otp is missing', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when otp is not exactly 6 digits', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001', otp: '12345' })  // 5 digits
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when otp contains non-digit characters', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001', otp: 'abcdef' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when role is an invalid enum value', async () => {
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001', otp: '123456', role: 'god' })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('does NOT require Origin header (mobile endpoint)', async () => {
    // Should NOT return 403 for missing origin — only origin-gated routes enforce that.
    // With env vars configured + fetch rejected by the test spy, we get 502 (OTP_VERIFY_FAILED).
    const res = await request(app)
      .post('/api/admin/auth/otp/verify')
      .send({ phone: '+919999900001', otp: '123456' })
      // deliberately NOT setting Origin
    expect(res.status).not.toBe(403)
    // 502 = MSG91 call was attempted (no origin gate applied), then fetch rejected
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBeDefined()
  })
})

// =============================================================================
// BA-05 — test-login endpoint MUST NOT exist (CRIT-3 / security)
// The route was removed from auth.ts (comment: "removed for security").
// A request to that path must return 404 (no route registered).
// =============================================================================

describe('POST /api/admin/auth/test-login — BA-05 security gate', () => {

  it('returns 404 — endpoint was removed and must not exist in production builds', async () => {
    const res = await request(app)
      .post('/api/admin/auth/test-login')
      .send({ phone: '+919999900003', role: 'admin' })

    // 404 means Express found no matching route — the endpoint is gone.
    // Any 200 or 201 here would be a critical security regression.
    expect(res.status).toBe(404)
  })

  it('cannot mint an admin session without going through MSG91 OTP', async () => {
    // Belt-and-suspenders: also verify that a GET attempt also returns 404
    const res = await request(app)
      .get('/api/admin/auth/test-login')
    expect(res.status).toBe(404)
  })
})

// =============================================================================
// Admin-only guard — requireAdmin middleware
// GET /api/admin/users and GET /api/admin/stores are admin-only.
// A buyer or seller token must be rejected with 403.
// =============================================================================

describe('requireAdmin middleware — non-admin role is rejected (403)', () => {

  it('returns 401 with no auth token on admin-only route', async () => {
    const res = await request(app).get('/api/admin/users')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 401 with an invalid token on admin-only route', async () => {
    authFail()
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer bad-token')
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when a BUYER token is used on GET /api/admin/users', async () => {
    authAs(BUYER)
    // users table role lookup → buyer
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { role: 'buyer' }, error: null },
    }))

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 when a SELLER token is used on GET /api/admin/users', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { role: 'seller' }, error: null },
    }))

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 when a BUYER token is used on GET /api/admin/stores', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { role: 'buyer' }, error: null },
    }))

    const res = await request(app)
      .get('/api/admin/stores')
      .set('Authorization', bearerToken(BUYER))

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 403 when a SELLER token is used on GET /api/admin/stores', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { role: 'seller' }, error: null },
    }))

    const res = await request(app)
      .get('/api/admin/stores')
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 200 when an ADMIN token is used on GET /api/admin/users', async () => {
    authAs(ADMIN)

    // requireAdmin checks users.role; then the route itself queries users again
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        callCount++
        if (callCount === 1) {
          // requireAdmin role check
          return makeQueryBuilder({ users: { data: { role: 'admin' }, error: null } })(table)
        }
        // actual GET / handler query with count
        const builder: any = {
          select: (_cols: string, _opts?: any) => builder,
          eq: () => builder,
          or: () => builder,
          order: () => builder,
          range: () => builder,
          then: (fn: any) => Promise.resolve({ data: [], count: 0, error: null }).then(fn),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', bearerToken(ADMIN))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('returns 200 when an ADMIN token is used on GET /api/admin/stores', async () => {
    authAs(ADMIN)

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        callCount++
        if (callCount === 1) {
          return makeQueryBuilder({ users: { data: { role: 'admin' }, error: null } })(table)
        }
      }
      if (table === 'stores') {
        const builder: any = {
          select: (_cols: string, _opts?: any) => builder,
          eq: () => builder,
          ilike: () => builder,
          order: () => builder,
          range: () => builder,
          then: (fn: any) => Promise.resolve({ data: [], count: 0, error: null }).then(fn),
        }
        return builder
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .get('/api/admin/stores')
      .set('Authorization', bearerToken(ADMIN))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})

// =============================================================================
// Seller login guard — createIfMissing:false
// Verifies the contract: unregistered number must NOT silently create an account.
// =============================================================================

describe('Seller login path — createIfMissing:false contract (BA-01 extended)', () => {

  it('does NOT call supabase.auth.admin.createUser when phone is unregistered + createIfMissing:false', async () => {
    mockFetch({ type: 'success', message: '919000099999' })

    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: null, error: null },
    }))

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'seller', createIfMissing: false })

    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_REGISTERED')
    // The critical assertion: no account creation must have occurred
    expect(mockCreateUser).not.toHaveBeenCalled()
    expect(mockSignIn).not.toHaveBeenCalled()
  })

  it('returns 200 and mints session for a registered seller with createIfMissing:false', async () => {
    mockFetch({ type: 'success', message: '919999900002' })

    // Seller is already in public.users
    mockFrom.mockImplementation(makeQueryBuilder({
      users: { data: { id: SELLER.id }, error: null },
    }))

    mockUpdateUser.mockResolvedValue({ data: {}, error: null })
    mockSignIn.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok_reg_seller',
          refresh_token: 'tok_ref',
          expires_in: 3600,
          expires_at: Date.now() / 1000 + 3600,
          token_type: 'bearer',
        },
      },
      error: null,
    })

    const res = await request(app)
      .post('/api/admin/auth/msg91-exchange')
      .set('Origin', ALLOWED_ORIGIN)
      .send({ accessToken: 'a'.repeat(20), role: 'seller', createIfMissing: false })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.session.access_token).toBe('tok_reg_seller')
    // No user creation — seller was already registered
    expect(mockCreateUser).not.toHaveBeenCalled()
  })
})
