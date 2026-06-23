/**
 * POST /api/admin/login — Next.js route handler unit tests
 *
 * Route: reelmart/apps/web/app/api/admin/login/route.ts
 *
 * The handler:
 *   1. Validates email + password presence (→ 400 if missing)
 *   2. Calls supabase.auth.signInWithPassword (→ 401 on failure)
 *   3. Checks is_admin flag via service-role client (→ 403 non-admin; signs out)
 *   4. Returns { success: true } on success
 *
 * Mock strategy:
 *   - next/headers (cookies) — module-alias stub, no SSR plumbing needed
 *   - @supabase/ssr createServerClient — returns mock supabase instance
 *   - @supabase/supabase-js createClient (used for service-role admin check)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Cookie stub ───────────────────────────────────────────────────────────────
const mockCookieGetAll = vi.fn(() => [])
const mockCookieSet = vi.fn()
const cookiesMock = vi.fn(() => ({
  getAll: mockCookieGetAll,
  set: mockCookieSet,
}))

vi.mock('next/headers', () => ({ cookies: cookiesMock }))

// ── Supabase SSR client (anon) mock ─────────────────────────────────────────
const mockSignInWithPassword = vi.fn()
const mockSignOut = vi.fn()

const mockSsrClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
}
const mockCreateServerClient = vi.fn(() => mockSsrClient)

vi.mock('@supabase/ssr', () => ({ createServerClient: mockCreateServerClient }))

// ── Supabase admin (service-role) mock ───────────────────────────────────────
const mockAdminFrom = vi.fn()
const mockAdminClient = { from: mockAdminFrom }
const mockCreateClient = vi.fn(() => mockAdminClient)

vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/apps/web/app/api/admin/login/route.ts'
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdminFromChain(profileData: Record<string, unknown> | null, error: any = null) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: profileData, error }),
  }
  return (_table: string) => builder
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost:3000/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() })
  mockSignOut.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/admin/login', () => {
  describe('400 — missing credentials', () => {
    it('rejects empty body', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
    })

    it('rejects missing password', async () => {
      const res = await POST(makeRequest({ email: 'admin@test.com' }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
    })

    it('rejects missing email', async () => {
      const res = await POST(makeRequest({ password: 'secret123' }))
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
    })

    it('rejects malformed JSON body', async () => {
      const req = new NextRequest('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
    })
  })

  describe('401 — invalid credentials', () => {
    it('returns 401 when Supabase signInWithPassword fails', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      })

      const res = await POST(makeRequest({ email: 'bad@test.com', password: 'wrong' }))
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toBeTruthy()
    })
  })

  describe('403 — non-admin user', () => {
    it('signs out and returns 403 when user is not an admin', async () => {
      const fakeUser = { id: 'user-abc', email: 'seller@test.com' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: {} },
        error: null,
      })
      // Service-role profile check: is_admin=false, role='seller'
      mockAdminFrom.mockImplementation(makeAdminFromChain({ is_admin: false, role: 'seller' }))

      const res = await POST(makeRequest({ email: 'seller@test.com', password: 'pass1234' }))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.success).toBe(false)
      // Must sign the user out to prevent a dangling session
      expect(mockSignOut).toHaveBeenCalledOnce()
    })

    it('returns 403 when user profile is missing (no row in users table)', async () => {
      const fakeUser = { id: 'user-xyz', email: 'ghost@test.com' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: {} },
        error: null,
      })
      mockAdminFrom.mockImplementation(makeAdminFromChain(null))

      const res = await POST(makeRequest({ email: 'ghost@test.com', password: 'pass1234' }))
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(mockSignOut).toHaveBeenCalledOnce()
    })
  })

  describe('200 — successful admin login', () => {
    it('returns 200 with success=true for valid admin credentials (is_admin=true)', async () => {
      const fakeUser = { id: 'admin-111', email: 'admin@reelmart.test' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: { access_token: 'tok', refresh_token: 'ref' } },
        error: null,
      })
      mockAdminFrom.mockImplementation(makeAdminFromChain({ is_admin: true, role: 'seller' }))

      const res = await POST(makeRequest({ email: 'admin@reelmart.test', password: 'ReelMartAdmin#2026' }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      // Sign-out must NOT be called on success
      expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('returns 200 with success=true for valid admin credentials (role=admin)', async () => {
      const fakeUser = { id: 'admin-222', email: 'admin2@reelmart.test' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: { access_token: 'tok2', refresh_token: 'ref2' } },
        error: null,
      })
      // role=admin qualifies even if is_admin is not set
      mockAdminFrom.mockImplementation(makeAdminFromChain({ is_admin: false, role: 'admin' }))

      const res = await POST(makeRequest({ email: 'admin2@reelmart.test', password: 'pass1234' }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
    })

    it('does not return password or sensitive session tokens in the body', async () => {
      const fakeUser = { id: 'admin-333', email: 'admin@reelmart.test' }
      mockSignInWithPassword.mockResolvedValue({
        data: { user: fakeUser, session: { access_token: 'secret-tok' } },
        error: null,
      })
      mockAdminFrom.mockImplementation(makeAdminFromChain({ is_admin: true, role: 'admin' }))

      const res = await POST(makeRequest({ email: 'admin@reelmart.test', password: 'ReelMartAdmin#2026' }))
      const text = await res.text()
      // Must not leak the access_token or password in the response body
      expect(text).not.toContain('secret-tok')
      expect(text).not.toContain('ReelMartAdmin')
    })
  })
})
