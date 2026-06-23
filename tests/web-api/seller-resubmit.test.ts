/**
 * POST /api/seller/resubmit — rejected seller re-submission route handler tests
 *
 * Route: reelmart/apps/web/app/api/seller/resubmit/route.ts
 *
 * The handler:
 *   1. Authenticates via SSR session cookie
 *   2. Loads the caller's store (queried by seller_id = user.id — implicit ownership)
 *   3. Guards: only rejected stores can be resubmitted (409 for pending/approved/suspended)
 *   4. Whitelists the body fields (prevents spoofing approval_status, seller_id, etc.)
 *   5. Normalises PAN / GST to uppercase; changing GST resets gst_verified=false
 *   6. Always sets approval_status='pending', approval_notes=null
 *   7. Writes via service-role client
 *
 * Security:
 *   - 401 no session
 *   - 403 ownership check (seller_id !== user.id — belt-and-suspenders)
 *   - 409 when store is not in rejected state
 *   - Caller cannot inject approval_status, seller_id, or other non-whitelisted fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Cookie stub ───────────────────────────────────────────────────────────────
const cookiesMock = vi.fn(() => ({ getAll: () => [], set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

// ── SSR supabase client (anon — used for session + RLS-gated store read) ─────
const mockGetUser = vi.fn()
const mockSsrFrom = vi.fn()
const mockSsrClient = { auth: { getUser: mockGetUser }, from: mockSsrFrom }
const mockCreateServerClient = vi.fn(() => mockSsrClient)
vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

// ── Service-role admin client (used for the write) ────────────────────────────
const mockAdminFrom = vi.fn()
const mockAdminClient = { from: mockAdminFrom }
const mockCreateAdminClient = vi.fn(() => mockAdminClient)
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateAdminClient }))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/app/api/seller/resubmit/route.ts'
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SELLER_USER = { id: 'seller-001', email: 'seller@test.com' }
const OTHER_SELLER_USER = { id: 'seller-999', email: 'other@test.com' }
const STORE_ID = 'store-abc'

const REJECTED_STORE = {
  id: STORE_ID,
  seller_id: SELLER_USER.id,
  approval_status: 'rejected',
}

const RESUBMIT_BODY = {
  store_name: 'Updated Boutique Name',
  city: 'Hyderabad',
  state: 'Telangana',
  pan_number: 'abcde1234f', // lowercase — should be normalised to uppercase
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(user: Record<string, unknown> | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

function mockStoreRead(store: Record<string, unknown> | null, error: any = null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: store, error }),
  }
  mockSsrFrom.mockReturnValue(builder)
}

function mockAdminWrite(error: any = null) {
  const builder: any = {
    update: () => builder,
    eq: () => Promise.resolve({ data: null, error }),
  }
  mockAdminFrom.mockReturnValue(builder)
}

function makeRequest(body: Record<string, unknown> = RESUBMIT_BODY) {
  return new NextRequest('http://localhost:3000/api/seller/resubmit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/seller/resubmit', () => {
  describe('401 — unauthenticated', () => {
    it('returns 401 when there is no session', async () => {
      mockSession(null)
      const res = await POST(makeRequest())
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('404 — store not found', () => {
    it('returns 404 when the caller has no store', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(null)

      const res = await POST(makeRequest())
      expect(res.status).toBe(404)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('403 — ownership', () => {
    it('returns 403 when store.seller_id does not match user.id', async () => {
      // Simulate a store row where seller_id was somehow returned for the wrong user
      mockSession(OTHER_SELLER_USER)
      mockStoreRead({
        id: STORE_ID,
        seller_id: SELLER_USER.id, // belongs to different seller
        approval_status: 'rejected',
      })

      const res = await POST(makeRequest())
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('409 — guard: not-rejected stores', () => {
    it('returns 409 when store is pending', async () => {
      mockSession(SELLER_USER)
      mockStoreRead({ ...REJECTED_STORE, approval_status: 'pending' })

      const res = await POST(makeRequest())
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/pending/)
    })

    it('returns 409 when store is approved', async () => {
      mockSession(SELLER_USER)
      mockStoreRead({ ...REJECTED_STORE, approval_status: 'approved' })

      const res = await POST(makeRequest())
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/approved/)
    })

    it('returns 409 when store is suspended', async () => {
      mockSession(SELLER_USER)
      mockStoreRead({ ...REJECTED_STORE, approval_status: 'suspended' })

      const res = await POST(makeRequest())
      expect(res.status).toBe(409)
    })
  })

  describe('200 — successful resubmission', () => {
    it('returns 200 success for a rejected store', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)
      mockAdminWrite()

      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
    })

    it('normalises pan_number to uppercase', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)

      // Capture the update payload
      let capturedUpdate: Record<string, unknown> = {}
      const builder: any = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload
          return builder
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
      mockAdminFrom.mockReturnValue(builder)

      await POST(makeRequest({ pan_number: 'abcde1234f' }))
      expect(capturedUpdate.pan_number).toBe('ABCDE1234F')
    })

    it('sets approval_status=pending and clears approval_notes on resubmit', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)

      let capturedUpdate: Record<string, unknown> = {}
      const builder: any = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload
          return builder
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
      mockAdminFrom.mockReturnValue(builder)

      await POST(makeRequest(RESUBMIT_BODY))
      expect(capturedUpdate.approval_status).toBe('pending')
      expect(capturedUpdate.approval_notes).toBeNull()
    })

    it('changing gst_number resets gst_verified to false', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)

      let capturedUpdate: Record<string, unknown> = {}
      const builder: any = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload
          return builder
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
      mockAdminFrom.mockReturnValue(builder)

      await POST(makeRequest({ gst_number: '27ABCDE1234F1Z5' }))
      expect(capturedUpdate.gst_number).toBe('27ABCDE1234F1Z5')
      expect(capturedUpdate.gst_verified).toBe(false)
    })

    it('does NOT allow injecting approval_status via body (non-whitelisted field)', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)

      let capturedUpdate: Record<string, unknown> = {}
      const builder: any = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload
          return builder
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
      mockAdminFrom.mockReturnValue(builder)

      // Attacker tries to set approval_status=approved via body
      await POST(makeRequest({ store_name: 'Legit Update', approval_status: 'approved' }))
      // The whitelist must strip approval_status from the attacker's body;
      // the handler always forces it to 'pending'
      expect(capturedUpdate.approval_status).toBe('pending')
    })

    it('does NOT allow injecting seller_id via body', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)

      let capturedUpdate: Record<string, unknown> = {}
      const builder: any = {
        update: (payload: Record<string, unknown>) => {
          capturedUpdate = payload
          return builder
        },
        eq: () => Promise.resolve({ data: null, error: null }),
      }
      mockAdminFrom.mockReturnValue(builder)

      await POST(makeRequest({ store_name: 'OK Name', seller_id: 'hacker-999' }))
      expect(capturedUpdate.seller_id).toBeUndefined()
    })
  })

  describe('400 — downstream DB error', () => {
    it('returns 400 when Supabase write fails', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(REJECTED_STORE)
      mockAdminWrite({ message: 'constraint violation' })

      const res = await POST(makeRequest())
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })
})
