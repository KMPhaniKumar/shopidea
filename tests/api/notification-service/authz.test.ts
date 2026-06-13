/**
 * notification-service — authorization tests
 *
 * Tests verify the security sweep fix for HIGH-9:
 *  - POST /register-token: requires auth (401 without token)
 *  - POST /register-token: 403 when userId in body !== req.user.id (HIGH-9 fix)
 *  - POST /register-token: 200 when userId matches the authenticated user
 *  - POST /push: requires x-internal-key (401 without it)
 *
 * Mock strategy: mock lib/supabase.ts + lib/fcm.ts + lib/gupshup.ts + lib/sms.ts
 * by absolute paths.  No real FCM, Gupshup, MSG91, or Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  BUYER, OTHER_BUYER, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Mock external notification providers ───────────────────────────────────
vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/fcm',
  () => ({ sendPush: vi.fn().mockResolvedValue(undefined) }),
)

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/gupshup',
  () => ({ sendWhatsApp: vi.fn().mockResolvedValue(undefined) }),
)

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/lib/sms',
  () => ({ sendSMS: vi.fn().mockResolvedValue(undefined) }),
)

// ── 3. Test app ───────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { notificationsRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/notification-service/src/routes/notifications'
  )
  app = express()
  app.use(express.json())
  app.use('/api/notifications', notificationsRouter)
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
      select: () => builder,
      insert: () => builder,
      update: () => builder,
      upsert: (_d: any, _opts?: any) => builder,
      eq: () => builder,
      then: (fn: any) => Promise.resolve(result).then(fn),
      single: () => result,
      maybeSingle: () => result,
    }
    return builder
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
})

// ── POST /api/notifications/register-token — HIGH-9 ──────────────────────────

describe('POST /api/notifications/register-token — HIGH-9 auth + userId ownership', () => {
  it('returns 401 when no auth token is provided — HIGH-9 fix', async () => {
    const res = await request(app)
      .post('/api/notifications/register-token')
      .send({ userId: BUYER.id, token: 'fcm-token-abc', platform: 'android' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 400 when required fields are missing', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', bearerToken(BUYER))
      .send({ userId: BUYER.id }) // missing token and platform
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when userId in body does not match req.user.id — HIGH-9 fix', async () => {
    authAs(BUYER) // authenticated as BUYER
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', bearerToken(BUYER))
      .send({
        userId: OTHER_BUYER.id, // attacker tries to register a token for another user
        token: 'fcm-token-attacker',
        platform: 'android',
      })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('USER_ID_MISMATCH')
  })

  it('returns 200 when userId matches authenticated user — HIGH-9 fix', async () => {
    authAs(BUYER)
    mockFrom.mockImplementation(makeQueryBuilder({
      fcm_tokens: { data: { user_id: BUYER.id, token: 'fcm-token-abc' }, error: null },
    }))
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', bearerToken(BUYER))
      .send({ userId: BUYER.id, token: 'fcm-token-abc', platform: 'android' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('returns 400 for invalid platform value', async () => {
    authAs(BUYER)
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', bearerToken(BUYER))
      .send({ userId: BUYER.id, token: 'fcm-token-abc', platform: 'windows' })
    expect(res.status).toBe(400)
  })
})

// ── POST /api/notifications/push — internal key required ─────────────────────

describe('POST /api/notifications/push — x-internal-key gating', () => {
  it('returns 401 without internal key', async () => {
    const res = await request(app)
      .post('/api/notifications/push')
      .send({ userId: BUYER.id, title: 'Test', body: 'Hello' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 200 with valid internal key', async () => {
    mockFrom.mockImplementation(makeQueryBuilder({
      fcm_tokens: { data: [], error: null },
    }))
    const res = await request(app)
      .post('/api/notifications/push')
      .set('x-internal-key', process.env.INTERNAL_API_KEY ?? 'test-internal-key')
      .send({ userId: BUYER.id, title: 'Order Update', body: 'Your order is on the way' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})
