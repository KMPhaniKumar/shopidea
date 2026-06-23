/**
 * POST /api/seller/onboard — seller registration route handler tests
 *
 * Route: reelmart/apps/web/app/api/seller/onboard/route.ts
 *
 * The handler:
 *   1. Resolves caller via Bearer token (preferred) or SSR cookie
 *   2. Validates body: full_name, display_name, pan_number (format), password (min 8)
 *   3. Hashes password via bcrypt (cost 10) — NEVER returns the hash
 *   4. Updates users row with full_name + password_hash
 *   5. Upserts stores row with seller_id, store_name, pan_number, approval_status=pending
 *   6. Returns { success: true, data: { store_id, store_name, pan_number } }
 *
 * Security:
 *   - 401 if no valid session
 *   - 422 if PAN format invalid
 *   - 422 if GST present but format invalid
 *   - password_hash must NEVER appear in the response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Cookie stub ───────────────────────────────────────────────────────────────
const cookiesMock = vi.fn(() => ({ getAll: () => [], set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

// ── Supabase SSR client mock ──────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockSsrClient = { auth: { getUser: mockGetUser } }
const mockCreateServerClient = vi.fn(() => mockSsrClient)
vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

// ── Supabase admin (service-role) mock ───────────────────────────────────────
const mockAdminFrom = vi.fn()
const mockAdminClient = { from: mockAdminFrom }
const mockCreateAdminClient = vi.fn(() => mockAdminClient)
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateAdminClient }))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/app/api/seller/onboard/route.ts'
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SELLER_USER = { id: 'seller-001', email: 'seller@test.com' }
const STORE_ID = 'store-001'

const VALID_BODY = {
  full_name: 'Ravi Kumar',
  display_name: 'Ravi Boutiques',
  pan_number: 'ABCDE1234F',
  password: 'securePass1',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(user: Record<string, unknown> | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

/**
 * Build the admin from() mock that handles:
 *   - users.update → success
 *   - stores.upsert → returns a store row
 */
function mockAdminSuccess(storeRow = { id: STORE_ID, store_name: 'Ravi Boutiques', pan_number: 'ABCDE1234F' }) {
  const updateBuilder: any = {
    update: () => updateBuilder,
    upsert: () => upsertBuilder,
    eq: () => updateBuilder,
    then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
  }
  const upsertBuilder: any = {
    select: () => upsertBuilder,
    single: () => Promise.resolve({ data: storeRow, error: null }),
  }

  let callCount = 0
  mockAdminFrom.mockImplementation((_table: string) => {
    callCount++
    if (callCount === 1) return updateBuilder // users update
    return { upsert: () => upsertBuilder }    // stores upsert
  })
}

function makeRequest(body: Record<string, unknown>, bearerToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`
  return new NextRequest('http://localhost:3000/api/seller/onboard', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/seller/onboard', () => {
  describe('401 — unauthenticated', () => {
    it('returns 401 when no session and no Bearer token', async () => {
      mockSession(null)
      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('422 — validation errors', () => {
    beforeEach(() => mockSession(SELLER_USER))

    it('rejects missing full_name', async () => {
      const { full_name: _omit, ...body } = VALID_BODY
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(422)
      const json = await res.json()
      expect(json.success).toBe(false)
    })

    it('rejects full_name shorter than 2 chars', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, full_name: 'A' }))
      expect(res.status).toBe(422)
    })

    it('rejects missing display_name', async () => {
      const { display_name: _omit, ...body } = VALID_BODY
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(422)
    })

    it('rejects invalid PAN number (lowercase)', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, pan_number: 'abcde1234f' }))
      expect(res.status).toBe(422)
      const json = await res.json()
      expect(json.error).toMatch(/pan/i)
    })

    it('rejects invalid PAN number (wrong pattern)', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, pan_number: '12345678AB' }))
      expect(res.status).toBe(422)
    })

    it('rejects password shorter than 8 chars', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, password: 'short' }))
      expect(res.status).toBe(422)
    })

    it('rejects invalid GST number when provided', async () => {
      const res = await POST(makeRequest({ ...VALID_BODY, gst_number: 'INVALID' }))
      expect(res.status).toBe(422)
      const json = await res.json()
      expect(json.error).toMatch(/gstin/i)
    })

    it('accepts missing gst_number (optional field)', async () => {
      mockAdminSuccess()
      const res = await POST(makeRequest(VALID_BODY))
      // 422 would indicate validation rejected a missing optional — must not happen
      expect(res.status).not.toBe(422)
    })

    it('accepts empty string for gst_number (optional)', async () => {
      mockAdminSuccess()
      const res = await POST(makeRequest({ ...VALID_BODY, gst_number: '' }))
      expect(res.status).not.toBe(422)
    })
  })

  describe('200 — successful onboard', () => {
    it('returns 200 with store_id, store_name, pan_number', async () => {
      mockSession(SELLER_USER)
      mockAdminSuccess()

      const res = await POST(makeRequest(VALID_BODY))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.store_id).toBe(STORE_ID)
      expect(json.data.store_name).toBe('Ravi Boutiques')
      expect(json.data.pan_number).toBe('ABCDE1234F')
    })

    it('does NOT return password or password_hash in the response', async () => {
      mockSession(SELLER_USER)
      mockAdminSuccess()

      const res = await POST(makeRequest(VALID_BODY))
      const text = await res.text()
      expect(text).not.toContain('password_hash')
      expect(text).not.toContain(VALID_BODY.password)
    })

    it('accepts a valid GST number alongside PAN', async () => {
      mockSession(SELLER_USER)
      mockAdminSuccess()

      const body = {
        ...VALID_BODY,
        gst_number: '27ABCDE1234F1Z5',
      }
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(200)
    })

    it('works with Bearer token auth (preferred during registration)', async () => {
      // After setSession() on the client side, Bearer token is sent before cookies exist
      mockGetUser.mockImplementation(async (token?: string) => {
        if (token === 'valid-bearer-token') {
          return { data: { user: SELLER_USER }, error: null }
        }
        return { data: { user: null }, error: null }
      })
      mockAdminSuccess()

      const res = await POST(makeRequest(VALID_BODY, 'valid-bearer-token'))
      expect(res.status).toBe(200)
    })
  })
})
