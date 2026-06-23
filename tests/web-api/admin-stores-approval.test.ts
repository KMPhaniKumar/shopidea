/**
 * PUT /api/admin/stores/[id] — store approval / rejection route handler tests
 *
 * Route: reelmart/apps/web/app/api/admin/stores/[id]/route.ts
 * This is the REAL store-approval path (admin-service stores.ts is secondary/stale).
 *
 * The handler supports ?action=approve|reject|activate|deactivate
 * All actions require an authenticated admin session.
 *
 * Security focus:
 *   - 401 with no session
 *   - 403 for authenticated non-admin users (IDOR boundary)
 *   - 400 for reject without notes (validation)
 *   - 400 for unknown action
 *   - approve sets approval_status=approved, is_active=true, clears approval_notes
 *   - approve triggers registerStorePickup (best-effort — not blocking)
 *   - reject requires non-empty notes, sets approval_status=rejected, is_active=false
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Cookie stub ───────────────────────────────────────────────────────────────
const cookiesMock = vi.fn(() => ({ getAll: () => [], set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: cookiesMock }))

// ── Session SSR client mock ───────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockSsrClient = { auth: { getUser: mockGetUser } }
const mockCreateServerClient = vi.fn(() => mockSsrClient)
vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

// ── Service-role admin client mock ───────────────────────────────────────────
const mockAdminFrom = vi.fn()
const mockAdminClient = { from: mockAdminFrom }
const mockCreateAdminClient = vi.fn(() => mockAdminClient)
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateAdminClient }))

// ── NimbusPost pickup registration mock ─────────────────────────────────────
const mockRegisterStorePickup = vi.fn()
vi.mock('@/lib/pickup', () => ({ registerStorePickup: mockRegisterStorePickup }))

// ── Import handler after mocks ────────────────────────────────────────────────
const { PUT } = await import(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/app/api/admin/stores/[id]/route.ts'
)

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STORE_ID = 'aaaaaaaa-0001-4000-8000-000000000001'
const ADMIN_USER = { id: 'admin-001', email: 'admin@reelmart.test' }
const SELLER_USER = { id: 'seller-001', email: 'seller@test.com' }

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mock SSR getUser to return a given user object (or null for unauthenticated).
 */
function mockSession(user: Record<string, unknown> | null) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null })
}

/**
 * Build a minimal fluent Supabase query chain that returns `result` at `.single()`.
 * All chained methods return the same builder (fluent).
 */
function makeChain(result: { data: any; error: any }) {
  const builder: any = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    single: () => Promise.resolve(result),
  }
  return builder
}

/**
 * Set up mockAdminFrom to:
 *   - First call: users table (profile/admin check) → profileData
 *   - Second call: stores table (the actual update) → storeData
 */
function mockAdminSequence(
  profileData: Record<string, unknown> | null,
  storeData: Record<string, unknown> | null = { id: STORE_ID, store_name: 'Test Store', is_active: true, approval_status: 'approved', approval_notes: null },
  storeError: any = null,
) {
  let callCount = 0
  mockAdminFrom.mockImplementation((_table: string) => {
    callCount++
    if (callCount === 1) return makeChain({ data: profileData, error: null }) // users profile
    return makeChain({ data: storeData, error: storeError }) // stores update
  })
}

function makeRequest(action: string, body?: Record<string, unknown>) {
  return new NextRequest(
    `http://localhost:3000/api/admin/stores/${STORE_ID}?action=${action}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }
  )
}

const PARAMS = { params: { id: STORE_ID } }

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() })
  mockRegisterStorePickup.mockResolvedValue({ pickupId: 'pick-001', status: 'pending' })
})

// ── Auth boundary ─────────────────────────────────────────────────────────────

describe('PUT /api/admin/stores/[id] — auth boundary', () => {
  it('returns 401 when there is no session', async () => {
    mockSession(null)
    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/unauthorized/i)
  })

  it('returns 403 when caller is authenticated but not an admin (seller role)', async () => {
    mockSession(SELLER_USER)
    // Profile returns seller role, is_admin=false
    mockAdminFrom.mockImplementation(() =>
      makeChain({ data: { role: 'seller', is_admin: false }, error: null })
    )
    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/forbidden/i)
  })

  it('returns 403 when caller is authenticated but profile is null (unknown user)', async () => {
    mockSession({ id: 'unknown-user' })
    mockAdminFrom.mockImplementation(() =>
      makeChain({ data: null, error: null })
    )
    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
  })
})

// ── Input validation ──────────────────────────────────────────────────────────

describe('PUT /api/admin/stores/[id] — input validation', () => {
  beforeEach(() => {
    mockSession(ADMIN_USER)
    // Admin profile — only called once for auth check; no DB call expected after 400
    mockAdminFrom.mockImplementation(() =>
      makeChain({ data: { role: 'admin', is_admin: true }, error: null })
    )
  })

  it('returns 400 for unknown action', async () => {
    const res = await PUT(makeRequest('nuke'), PARAMS)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 400 for reject without notes', async () => {
    const res = await PUT(makeRequest('reject', {}), PARAMS)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toMatch(/rejection comments/i)
  })

  it('returns 400 for reject with empty notes string', async () => {
    const res = await PUT(makeRequest('reject', { notes: '   ' }), PARAMS)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })
})

// ── Approve action ────────────────────────────────────────────────────────────

describe('PUT /api/admin/stores/[id]?action=approve', () => {
  it('returns 200 with approved status and triggers pickup registration', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: true, approval_status: 'approved', approval_notes: null }
    )

    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.approval_status).toBe('approved')
    expect(json.data.is_active).toBe(true)
    expect(json.data.approval_notes).toBeNull()
    // Pickup registration must be called on approval
    expect(mockRegisterStorePickup).toHaveBeenCalledWith(STORE_ID)
  })

  it('includes pickup result in response even when pickup registration returns null (best-effort)', async () => {
    mockSession(ADMIN_USER)
    mockRegisterStorePickup.mockResolvedValue(null) // NimbusPost offline
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: true, approval_status: 'approved', approval_notes: null }
    )

    const res = await PUT(makeRequest('approve'), PARAMS)
    // Must still return 200 — pickup failure must not block approval
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.pickup).toBeNull()
  })

  it('returns 400 when Supabase update returns an error on approve', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      null,
      { message: 'Row not found' }
    )

    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })
})

// ── Reject action ─────────────────────────────────────────────────────────────

describe('PUT /api/admin/stores/[id]?action=reject', () => {
  it('returns 200 with rejection notes and is_active=false', async () => {
    const NOTES = 'PAN document is blurry — please reupload'
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: false, approval_status: 'rejected', approval_notes: NOTES }
    )

    const res = await PUT(makeRequest('reject', { notes: NOTES }), PARAMS)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.approval_status).toBe('rejected')
    expect(json.data.is_active).toBe(false)
    expect(json.data.approval_notes).toBe(NOTES)
  })

  it('does NOT call registerStorePickup on rejection', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: false, approval_status: 'rejected', approval_notes: 'bad docs' }
    )

    await PUT(makeRequest('reject', { notes: 'bad docs' }), PARAMS)
    expect(mockRegisterStorePickup).not.toHaveBeenCalled()
  })
})

// ── Activate / deactivate actions ────────────────────────────────────────────

describe('PUT /api/admin/stores/[id] — activate / deactivate', () => {
  it('activate sets is_active=true', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: true, approval_status: 'approved', approval_notes: null }
    )

    const res = await PUT(makeRequest('activate'), PARAMS)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    // pickup must NOT be triggered for activate (only for approve)
    expect(mockRegisterStorePickup).not.toHaveBeenCalled()
  })

  it('deactivate sets is_active=false', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      { id: STORE_ID, store_name: 'Test Store', is_active: false, approval_status: 'approved', approval_notes: null }
    )

    const res = await PUT(makeRequest('deactivate'), PARAMS)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})

// ── Status transition: approve after rejection ────────────────────────────────

describe('PUT /api/admin/stores/[id] — status transitions', () => {
  it('admin can approve a previously rejected store', async () => {
    mockSession(ADMIN_USER)
    mockAdminSequence(
      { role: 'admin', is_admin: true },
      // After approve: rejection notes must be cleared
      { id: STORE_ID, store_name: 'Test Store', is_active: true, approval_status: 'approved', approval_notes: null }
    )

    const res = await PUT(makeRequest('approve'), PARAMS)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.approval_notes).toBeNull()
    expect(json.data.approval_status).toBe('approved')
  })
})
