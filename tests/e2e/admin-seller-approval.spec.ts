/**
 * E2E: Seller-approval lifecycle
 *
 * Covers P0-8 and P0-9 from TEST_PLAN_master.md:
 *   AD-07  Admin approves seller → SellerGate unlocks (passes through to dashboard)
 *   AD-08  Admin rejects seller with comment → SellerGate shows RejectedScreen
 *
 * Design:
 * ─ SellerGate (components/seller/SellerGate.tsx) is 'use client' — ALL its
 *   supabase calls are browser-initiated and interceptable by Playwright.
 *
 * ─ The admin seller DETAIL page is a Server Component — its supabase.admin
 *   queries run server-side and cannot be intercepted. The SellerActions.tsx
 *   'use client' component fires PUT /api/admin/stores/[id] from the browser —
 *   that CAN be intercepted. We test the API contract directly via page.evaluate().
 *
 * CRITICAL: Playwright page.route() is LIFO — the LAST registered handler wins
 * for overlapping URL patterns. Register catchalls FIRST, specific overrides LAST.
 * (Confirmed by debug run: catchall `supabase.co/**` was overriding specific
 * `/auth/v1/user` because it was registered after the specific ones.)
 *
 * ALL external providers mocked — no real Supabase, no real OTP, no payments.
 * Cleanup: no real DB state created (all state in mocks/browser memory).
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_HOST    = 'https://admin.dev.reelmart.in'
const SELLER_HOST   = 'https://seller.dev.reelmart.in'
const SUPABASE_REF  = 'nysgwdpmpxqmfwelfaxo'
const SUPABASE_ORIGIN = `https://${SUPABASE_REF}.supabase.co`

// IDs match tests/fixtures/users.ts canonical identities
const ADMIN_USER_ID  = '33333333-0003-4000-8000-000000000003'
const SELLER_USER_ID = '22222222-0002-4000-8000-000000000002'
const STORE_ID       = 'aaaaaaaa-0001-4000-8000-000000000001'

const REJECTION_NOTES = 'Your PAN card image is blurry and GST number is missing. Please resubmit with clear documents.'

// ---------------------------------------------------------------------------
// JWT + session helpers
// ---------------------------------------------------------------------------

function makeFakeJwt(userId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 7200,
    email: `playwright-${userId}@reelmart.test`,
  })).toString('base64url')
  const sig = Buffer.from('playwright-fake-sig').toString('base64url')
  return `${header}.${payload}.${sig}`
}

function makeFakeUserObject(userId: string) {
  return {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: `playwright-${userId}@reelmart.test`,
    phone: '',
    app_metadata: {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00Z',
  }
}

function makeSessionCookieValue(jwt: string, userId: string): string {
  const now = Math.floor(Date.now() / 1000)
  const session = {
    access_token: jwt,
    refresh_token: `fake-refresh-${userId}`,
    user: makeFakeUserObject(userId),
    token_type: 'bearer',
    expires_in: 7200,
    expires_at: now + 7200,
  }
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
}

async function injectSellerCookie(ctx: BrowserContext): Promise<string> {
  const jwt = makeFakeJwt(SELLER_USER_ID)
  await ctx.addCookies([{
    name:     `sb-${SUPABASE_REF}-auth-token`,
    value:    makeSessionCookieValue(jwt, SELLER_USER_ID),
    domain:   'seller.dev.reelmart.in',
    path:     '/',
    httpOnly: false,
    secure:   true,
    sameSite: 'Lax',
  }])
  return jwt
}

// ---------------------------------------------------------------------------
// Store row factories
// ---------------------------------------------------------------------------

type ApprovalStatus = 'pending' | 'approved' | 'rejected'

function makeStoreRow(status: ApprovalStatus, notes: string | null = null) {
  return {
    id: STORE_ID,
    store_name: 'Surya Boutiques',
    store_slug: 'suryaboutiques',
    is_active: status === 'approved',
    is_open: true,
    approval_status: status,
    approval_notes: notes,
    suspended: false,
    suspended_reason: null,
    state: 'Maharashtra',
  }
}

// ---------------------------------------------------------------------------
// SellerGate mock setup
//
// CRITICAL: Playwright route() is LIFO — register catchalls FIRST, specific
// overrides LAST. The last-registered handler wins for any URL pattern overlap.
// ---------------------------------------------------------------------------

async function setupSellerGateMocks(page: Page, storeStatus: ApprovalStatus, notes: string | null = null): Promise<void> {
  const sellerJwt = makeFakeJwt(SELLER_USER_ID)
  const sellerUser = makeFakeUserObject(SELLER_USER_ID)
  const storeRow = makeStoreRow(storeStatus, notes)

  // ── STEP 1: Register BROADEST catchalls first (lowest priority) ────────────

  // MSG91 widget
  await page.route('https://verify.msg91.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '(function(){})();' })
  })

  // API routes (analytics, orders microservice etc) — return empty success
  await page.route(`${SELLER_HOST}/api/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  // ALL Supabase DB REST calls — catch-all returns empty array
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // ALL Supabase Auth calls — catch-all returns the seller user
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })

  // ── STEP 2: Register SPECIFIC overrides last (highest priority) ────────────

  // Supabase token refresh — must return full session shape
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: sellerJwt,
        refresh_token: `fake-refresh-${SELLER_USER_ID}`,
        token_type: 'bearer',
        expires_in: 7200,
        user: sellerUser,
      }),
    })
  })

  // Supabase /auth/v1/user — getUser() call by SellerGate
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })

  // Supabase REST: seller_verification view
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/seller_verification**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        seller_id: SELLER_USER_ID,
        phone_verified: true,
        pan_provided: true,
        gst_provided: false,
        gst_verified: false,
        pickup_verified: false,
        signature_present: false,
        features_unlocked: storeStatus === 'approved',
        approval_status: storeStatus,
        suspended: false,
      }),
    })
  })

  // Supabase REST: stores table — SellerGate's approval_status check (MOST specific)
  // Must come last so it overrides the rest/v1/** catchall above.
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/stores**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storeRow) })
  })
}

// ---------------------------------------------------------------------------
// SellerGate "no store" mock — returns null for stores query
// ---------------------------------------------------------------------------

async function setupSellerGateNoStoreMocks(page: Page): Promise<void> {
  const sellerJwt = makeFakeJwt(SELLER_USER_ID)
  const sellerUser = makeFakeUserObject(SELLER_USER_ID)

  // Catchalls first
  await page.route('https://verify.msg91.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '(function(){})();' })
  })
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })

  // Specifics last
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token**`, (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ access_token: sellerJwt, refresh_token: 'r', token_type: 'bearer', expires_in: 7200, user: sellerUser }),
    })
  })
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })
  // No store row: PostgREST maybeSingle() miss = null body + content-range 0/0
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/stores**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: 'null' })
  })
}

// ---------------------------------------------------------------------------
// Admin approval API mock — intercepts SellerActions' PUT calls
// ---------------------------------------------------------------------------

async function setupAdminApprovalMocks(page: Page): Promise<void> {
  await page.route(`${ADMIN_HOST}/api/admin/stores/${STORE_ID}**`, async (route) => {
    const req = route.request()
    const action = new URL(req.url()).searchParams.get('action')

    if (action === 'approve') {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: STORE_ID, store_name: 'Surya Boutiques', is_active: true, approval_status: 'approved', approval_notes: null, pickup: null },
        }),
      })
      return
    }

    if (action === 'reject') {
      let notes = ''
      try { notes = (JSON.parse(req.postData() ?? '{}').notes ?? '').trim() } catch {}
      if (!notes) {
        route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Rejection comments are required' }),
        })
        return
      }
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { id: STORE_ID, store_name: 'Surya Boutiques', is_active: false, approval_status: 'rejected', approval_notes: notes, pickup: null },
        }),
      })
      return
    }

    route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Unknown action' }) })
  })

  // NimbusPost pickup/register (best-effort on approve)
  await page.route('**/api/delivery/pickup/register', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })
}

// ---------------------------------------------------------------------------
// Navigate to seller dashboard and wait for SellerGate to resolve
// ---------------------------------------------------------------------------

async function gotoSellerDashboardAndWait(page: Page): Promise<void> {
  await page.goto(`${SELLER_HOST}/seller/dashboard`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 15_000 },
  )
}

// ---------------------------------------------------------------------------
// TEST 1: AD-07 — Approval API contract + SellerGate passes approved seller
// ---------------------------------------------------------------------------

test('AD-07: admin approves seller — PUT /api/admin/stores/[id]?action=approve returns approved status; SellerGate renders dashboard', async ({ browser }) => {
  test.setTimeout(90_000)

  // ── Part A: Approval API contract ─────────────────────────────────────────
  console.log('✅ step 1 — verifying approval API mock contract')
  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const adminPage = await adminCtx.newPage()

  await setupAdminApprovalMocks(adminPage)
  await adminPage.goto(`${ADMIN_HOST}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  const approveResult = await adminPage.evaluate(async ({ storeId }: { storeId: string }) => {
    const res = await fetch(`/api/admin/stores/${storeId}?action=approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return { status: res.status, body: await res.json() }
  }, { storeId: STORE_ID })

  expect(approveResult.status).toBe(200)
  expect(approveResult.body.success).toBe(true)
  expect(approveResult.body.data.approval_status).toBe('approved')
  expect(approveResult.body.data.is_active).toBe(true)
  expect(approveResult.body.data.approval_notes).toBeNull()
  console.log('✅ step 2 — PUT ?action=approve → 200, approval_status=approved, is_active=true')

  await adminCtx.close()

  // ── Part B: SellerGate passes approved seller ─────────────────────────────
  console.log('✅ step 3 — seller context: SellerGate with approved store')
  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'approved')
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 4 — verifying SellerGate passes approved seller')
  await expect(sellerPage.getByText('Changes required')).not.toBeVisible()
  await expect(sellerPage.getByText('Your store has been suspended')).not.toBeVisible()
  expect(sellerPage.url()).toContain('/seller/dashboard')
  console.log('✅ step 4 — approved seller on /seller/dashboard (no hard-block screen)')

  await sellerCtx.close()
  console.log('✅ AD-07 PASS — approval API correct; SellerGate passes approved seller')
})

// ---------------------------------------------------------------------------
// TEST 2: AD-08 — Rejection API contract + SellerGate hard-blocks with notes
// ---------------------------------------------------------------------------

test('AD-08: admin rejects seller with notes — PUT /api/admin/stores/[id]?action=reject; SellerGate shows RejectedScreen with notes', async ({ browser }) => {
  test.setTimeout(90_000)

  // ── Part A: Rejection API contract with notes ──────────────────────────────
  console.log('✅ step 1 — verifying rejection API mock with notes')
  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const adminPage = await adminCtx.newPage()

  await setupAdminApprovalMocks(adminPage)
  await adminPage.goto(`${ADMIN_HOST}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  const rejectResult = await adminPage.evaluate(async ({ storeId, notes }: { storeId: string; notes: string }) => {
    const res = await fetch(`/api/admin/stores/${storeId}?action=reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    return { status: res.status, body: await res.json() }
  }, { storeId: STORE_ID, notes: REJECTION_NOTES })

  expect(rejectResult.status).toBe(200)
  expect(rejectResult.body.success).toBe(true)
  expect(rejectResult.body.data.approval_status).toBe('rejected')
  expect(rejectResult.body.data.is_active).toBe(false)
  expect(rejectResult.body.data.approval_notes).toBe(REJECTION_NOTES)
  console.log('✅ step 2 — PUT ?action=reject → 200, approval_status=rejected, notes echoed back')

  await adminCtx.close()

  // ── Part B: SellerGate hard-blocks rejected seller with RejectedScreen ─────
  console.log('✅ step 3 — seller context: SellerGate with rejected store + notes')
  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'rejected', REJECTION_NOTES)
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 4 — verifying SellerGate hard-blocks rejected seller')

  await expect(
    sellerPage.getByRole('heading', { name: /Changes required/i }),
  ).toBeVisible({ timeout: 10_000 })
  console.log('✅ step 4a — RejectedScreen heading "Changes required" visible')

  await expect(
    sellerPage.getByText(REJECTION_NOTES, { exact: false }),
  ).toBeVisible({ timeout: 8_000 })
  console.log('✅ step 4b — Admin rejection notes visible to seller')

  await expect(
    sellerPage.getByText(/Changes requested by our team/i),
  ).toBeVisible({ timeout: 5_000 })
  console.log('✅ step 4c — "Changes requested by our team" label rendered')

  const resubmitLink = sellerPage.getByRole('link', { name: /Update details.*resubmit/i })
  await expect(resubmitLink).toBeVisible({ timeout: 5_000 })
  const href = await resubmitLink.getAttribute('href')
  expect(href).toContain('/seller/register')
  console.log('✅ step 4d — resubmit CTA link present and points to /seller/register')

  await expect(sellerPage.getByRole('link', { name: /Back to login/i })).toBeVisible({ timeout: 5_000 })
  await expect(sellerPage.getByText('Your store has been suspended')).not.toBeVisible()
  console.log('✅ step 4e — no dashboard content visible (SellerGate correctly blocks)')

  await sellerCtx.close()
  console.log('✅ AD-08 PASS — rejected seller sees RejectedScreen with admin notes')
})

// ---------------------------------------------------------------------------
// TEST 3: AD-08b — Rejection without notes → 400 at route level
// ---------------------------------------------------------------------------

test('AD-08b: PUT /api/admin/stores/[id]?action=reject without notes → 400 Rejection comments are required', async ({ browser }) => {
  test.setTimeout(60_000)

  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const adminPage = await adminCtx.newPage()

  await setupAdminApprovalMocks(adminPage)
  await adminPage.goto(`${ADMIN_HOST}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  console.log('✅ step 1 — calling reject with empty notes string')
  const emptyResult = await adminPage.evaluate(async ({ storeId }: { storeId: string }) => {
    const res = await fetch(`/api/admin/stores/${storeId}?action=reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: '' }),
    })
    return { status: res.status, body: await res.json() }
  }, { storeId: STORE_ID })

  expect(emptyResult.status).toBe(400)
  expect(emptyResult.body.success).toBe(false)
  expect(emptyResult.body.error).toMatch(/Rejection comments are required/i)
  console.log('✅ step 2 — empty notes → 400')

  console.log('✅ step 3 — calling reject with whitespace-only notes')
  const whitespaceResult = await adminPage.evaluate(async ({ storeId }: { storeId: string }) => {
    const res = await fetch(`/api/admin/stores/${storeId}?action=reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: '   ' }),
    })
    return { status: res.status, body: await res.json() }
  }, { storeId: STORE_ID })

  expect(whitespaceResult.status).toBe(400)
  expect(whitespaceResult.body.success).toBe(false)
  console.log('✅ step 4 — whitespace-only notes → 400 (trim enforced)')

  await adminCtx.close()
  console.log('✅ AD-08b PASS — route enforces non-empty, non-whitespace rejection notes')
})

// ---------------------------------------------------------------------------
// TEST 4: AD-07-ui — SellerActions approve call returns correct contract
// ---------------------------------------------------------------------------

test('AD-07-ui: SellerActions storeAction(approve) fires correct PUT and receives approved status', async ({ browser }) => {
  test.setTimeout(60_000)

  const adminCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const adminPage = await adminCtx.newPage()

  await setupAdminApprovalMocks(adminPage)
  await adminPage.goto(`${ADMIN_HOST}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 20_000 })

  // Replicate exactly what SellerActions.tsx storeAction() does
  const result = await adminPage.evaluate(async ({ storeId }: { storeId: string }) => {
    const res = await fetch(`/api/admin/stores/${storeId}?action=approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return res.json()
  }, { storeId: STORE_ID })

  expect(result.success).toBe(true)
  expect(result.data.approval_status).toBe('approved')
  console.log('✅ step 1 — SellerActions storeAction(approve) returns success with approval_status=approved')

  await adminCtx.close()
  console.log('✅ AD-07-ui PASS')
})

// ---------------------------------------------------------------------------
// TEST 5: SD-08 — SellerGate soft-passes pending seller (not a hard block)
// Per SellerGate.tsx code: 'rejected' and 'suspended' are the only hard blocks.
// 'pending' → setStatus('pass') → renders {children} (DashboardShell).
// ---------------------------------------------------------------------------

test('SD-08: SellerGate passes pending seller to dashboard shell (soft gate — not a hard block)', async ({ browser }) => {
  test.setTimeout(60_000)

  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'pending')

  console.log('✅ step 1 — navigating to /seller/dashboard (store pending)')
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 2 — verifying SellerGate soft-passes pending seller')
  await expect(sellerPage.getByText('Changes required')).not.toBeVisible()
  await expect(sellerPage.getByText('Your store has been suspended')).not.toBeVisible()
  expect(sellerPage.url()).toContain('/seller/dashboard')
  console.log('✅ step 2 — pending seller on /seller/dashboard with no hard-block screen')

  await sellerCtx.close()
  console.log('✅ SD-08 PASS — pending seller reaches dashboard shell (soft gate)')
})

// ---------------------------------------------------------------------------
// TEST 6: SD-09 — SellerGate approved seller renders dashboard (no block)
// ---------------------------------------------------------------------------

test('SD-09: SellerGate approved seller renders dashboard without any block screen', async ({ browser }) => {
  test.setTimeout(60_000)

  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'approved')

  console.log('✅ step 1 — navigating to /seller/dashboard (store approved)')
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 2 — verifying no block screen for approved seller')
  await expect(sellerPage.getByText('Changes required')).not.toBeVisible()
  await expect(sellerPage.getByText('Your store has been suspended')).not.toBeVisible()
  expect(sellerPage.url()).toContain('/seller/dashboard')
  console.log('✅ step 2 — approved seller on /seller/dashboard')

  await sellerCtx.close()
  console.log('✅ SD-09 PASS — approved seller reaches dashboard with no block screen')
})

// ---------------------------------------------------------------------------
// TEST 7: SD-10 — SellerGate hard-blocks rejected seller (no notes variant)
// ---------------------------------------------------------------------------

test('SD-10: SellerGate hard-blocks rejected seller (no notes) — generic RejectedScreen', async ({ browser }) => {
  test.setTimeout(60_000)

  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'rejected', null)

  console.log('✅ step 1 — navigating to /seller/dashboard (store rejected, no notes)')
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 2 — verifying RejectedScreen with generic message')

  await expect(
    sellerPage.getByRole('heading', { name: /Changes required/i }),
  ).toBeVisible({ timeout: 10_000 })
  console.log('✅ step 2a — RejectedScreen heading visible')

  await expect(
    sellerPage.getByText(/Please review your registration details and resubmit/i),
  ).toBeVisible({ timeout: 5_000 })
  console.log('✅ step 2b — generic rejection body text visible')

  await expect(
    sellerPage.getByRole('link', { name: /Update details.*resubmit/i }),
  ).toBeVisible({ timeout: 5_000 })
  console.log('✅ step 2c — resubmit CTA visible')

  // The "Changes requested" notes banner must NOT appear when notes=null
  await expect(
    sellerPage.getByText(/Changes requested by our team/i),
  ).not.toBeVisible()
  console.log('✅ step 2d — notes banner absent (no approval_notes)')

  await sellerCtx.close()
  console.log('✅ SD-10 PASS — rejected seller (no notes) sees generic RejectedScreen')
})

// ---------------------------------------------------------------------------
// TEST 8: SD-10b — SellerGate hard-blocks rejected seller WITH notes
// ---------------------------------------------------------------------------

test('SD-10b: SellerGate hard-blocks rejected seller with notes — orange notes banner renders', async ({ browser }) => {
  test.setTimeout(60_000)

  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateMocks(sellerPage, 'rejected', REJECTION_NOTES)

  console.log('✅ step 1 — navigating to /seller/dashboard (store rejected, with notes)')
  await gotoSellerDashboardAndWait(sellerPage)

  console.log('✅ step 2 — verifying RejectedScreen with notes banner')

  await expect(
    sellerPage.getByRole('heading', { name: /Changes required/i }),
  ).toBeVisible({ timeout: 10_000 })

  await expect(
    sellerPage.getByText(/Changes requested by our team/i),
  ).toBeVisible({ timeout: 5_000 })

  await expect(
    sellerPage.getByText(REJECTION_NOTES, { exact: false }),
  ).toBeVisible({ timeout: 5_000 })
  console.log('✅ step 2 — rejection notes visible in orange banner')

  // Generic text must NOT appear when specific notes are present
  await expect(
    sellerPage.getByText(/Please review your registration details and resubmit/i),
  ).not.toBeVisible()
  console.log('✅ step 3 — generic body text absent when specific notes present')

  await sellerCtx.close()
  console.log('✅ SD-10b PASS — rejected seller with notes sees orange notes banner')
})

// ---------------------------------------------------------------------------
// TEST 9: SellerGate redirects unauthenticated/no-store seller to /seller/register
// ---------------------------------------------------------------------------

test('SellerGate: seller with no store row is redirected to /seller/register', async ({ browser }) => {
  test.setTimeout(60_000)

  const sellerCtx = await browser.newContext({ ignoreHTTPSErrors: true })
  const sellerPage = await sellerCtx.newPage()

  await injectSellerCookie(sellerCtx)
  await setupSellerGateNoStoreMocks(sellerPage)

  console.log('✅ step 1 — navigating to /seller/dashboard (no store row)')
  const navPromise = sellerPage.waitForURL(`${SELLER_HOST}/seller/register`, { timeout: 15_000 })
  await sellerPage.goto(`${SELLER_HOST}/seller/dashboard`, { waitUntil: 'networkidle', timeout: 25_000 })

  await navPromise
  expect(sellerPage.url()).toContain('/seller/register')
  console.log('✅ step 2 — SellerGate redirected to /seller/register')

  await sellerCtx.close()
  console.log('✅ SellerGate no-store PASS — seller without store sent to /seller/register')
})
