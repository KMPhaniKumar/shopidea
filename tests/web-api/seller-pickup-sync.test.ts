/**
 * POST /api/seller/pickup/sync — NimbusPost pickup re-sync route handler tests
 *
 * Route: reelmart/apps/web/app/api/seller/pickup/sync/route.ts
 *
 * The handler:
 *   1. Requires storeId in body (400 without it)
 *   2. Authenticates caller via SSR session cookie (401 without session)
 *   3. Confirms caller owns the store via seller_id check (403 for wrong owner)
 *   4. Skips pickup registration for non-approved stores (200 with skipped=not_approved)
 *   5. Calls registerStorePickup for approved stores (200 with pickup result)
 *
 * Security: ownership check (non-owner cannot re-sync another seller's pickup)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Cookie stub ───────────────────────────────────────────────────────────────
const cookiesMock = vi.fn(() => ({ getAll: () => [], set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

// ── SSR supabase client mock ──────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockSsrFrom = vi.fn()
const mockSsrClient = { auth: { getUser: mockGetUser }, from: mockSsrFrom }
const mockCreateServerClient = vi.fn(() => mockSsrClient)
vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

// ── @supabase/supabase-js not used by this route, but mock to prevent import errors
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

// ── NimbusPost pickup registration mock ─────────────────────────────────────
const mockRegisterStorePickup = vi.fn()
vi.mock('@/lib/pickup', () => ({ registerStorePickup: mockRegisterStorePickup }))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/app/api/seller/pickup/sync/route.ts'
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SELLER_USER = { id: 'seller-001', email: 'seller@test.com' }
const OTHER_SELLER_USER = { id: 'seller-999', email: 'other@test.com' }
const STORE_ID = 'store-abc'

const APPROVED_STORE = {
  id: STORE_ID,
  seller_id: SELLER_USER.id,
  approval_status: 'approved',
}

const PENDING_STORE = {
  id: STORE_ID,
  seller_id: SELLER_USER.id,
  approval_status: 'pending',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSession(user: Record<string, unknown> | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

function mockStoreRead(store: Record<string, unknown> | null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: store, error: store ? null : { message: 'not found' } }),
  }
  mockSsrFrom.mockReturnValue(builder)
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/seller/pickup/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() })
  mockRegisterStorePickup.mockResolvedValue({ pickupId: 'pk-001', status: 'pending' })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/seller/pickup/sync', () => {
  describe('400 — missing storeId', () => {
    it('returns 400 when storeId is not provided', async () => {
      // Don't need auth — storeId check happens first
      const res = await POST(makeRequest({}))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/storeid/i)
    })

    it('returns 400 when body is empty JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/seller/pickup/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
    })
  })

  describe('401 — unauthenticated', () => {
    it('returns 401 when there is no session', async () => {
      mockSession(null)
      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('403 — ownership check', () => {
    it('returns 403 when caller does not own the store (IDOR block)', async () => {
      mockSession(OTHER_SELLER_USER) // different seller is authenticated
      mockStoreRead(APPROVED_STORE)  // store belongs to SELLER_USER, not OTHER

      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.success).toBe(false)
    })

    it('returns 403 when store is not found (treated as forbidden — no info leak)', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(null)

      const res = await POST(makeRequest({ storeId: 'nonexistent-store' }))
      expect(res.status).toBe(403)
    })
  })

  describe('200 — not-approved stores skip registration', () => {
    it('returns skipped=not_approved for a pending store', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(PENDING_STORE)

      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.skipped).toBe('not_approved')
      // NimbusPost should NOT be called for unapproved stores
      expect(mockRegisterStorePickup).not.toHaveBeenCalled()
    })

    it('returns skipped=not_approved for a rejected store', async () => {
      mockSession(SELLER_USER)
      mockStoreRead({ ...PENDING_STORE, approval_status: 'rejected' })

      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.skipped).toBe('not_approved')
      expect(mockRegisterStorePickup).not.toHaveBeenCalled()
    })
  })

  describe('200 — approved store triggers pickup registration', () => {
    it('calls registerStorePickup and returns pickup result', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(APPROVED_STORE)
      const pickupResult = { pickupId: 'pk-xyz', status: 'pending' }
      mockRegisterStorePickup.mockResolvedValue(pickupResult)

      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.pickup).toEqual(pickupResult)
      expect(mockRegisterStorePickup).toHaveBeenCalledWith(STORE_ID)
    })

    it('still returns 200 when registerStorePickup returns null (best-effort)', async () => {
      mockSession(SELLER_USER)
      mockStoreRead(APPROVED_STORE)
      mockRegisterStorePickup.mockResolvedValue(null)

      const res = await POST(makeRequest({ storeId: STORE_ID }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.data.pickup).toBeNull()
    })
  })
})
