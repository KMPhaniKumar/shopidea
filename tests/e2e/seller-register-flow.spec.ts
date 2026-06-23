/**
 * e2e tests: seller registration flow — re-registration guard
 *
 * Covers the behaviour change in:
 *   reelmart/apps/web/app/seller/(auth)/register/page.tsx
 *
 * What changed (LOCAL CODE — not yet deployed as of this test run):
 *   Previously an already-registered (pending or approved) seller who went
 *   through the register flow again would land on the "Application Submitted!"
 *   pending screen, falsely implying a fresh submission.
 *
 *   The fix:
 *   - verifyOTP: pending/approved → toast.error("This number is already
 *     registered as a seller. Taking you to your dashboard.") +
 *     router.push('/seller/dashboard')
 *   - detectSession (mount): pending → router.replace('/seller/dashboard')
 *   - rejected path (both verifyOTP and detectSession) → unchanged
 *
 * Test target: https://dev.reelmart.in (Vercel, NODE_ENV=production)
 * Seller routes are redirected via middleware to:
 *   https://seller.dev.reelmart.in/seller/*
 *
 * EXPECTED PASS/FAIL STATUS AGAINST DEPLOYED CODE:
 *   The deployed chunk (page-3e177ba3e98bf64b.js) still contains the OLD
 *   behavior (pending → setStep('pending'); approved → toast.success +
 *   router.push). Scenarios 2, 3, 5, 5b will FAIL against the old deployment
 *   and PASS only after the new code is deployed. This is intentional — these
 *   tests serve as a regression guard for the change.
 *
 * Network mocking strategy:
 *   NODE_ENV=production means the DEV fill-buttons (pre-fill phone/OTP) are
 *   not rendered. Instead we mock:
 *
 *   1. https://verify.msg91.com/otp-provider.js
 *      → stub that installs window.sendOtp / verifyOtp / retryOtp / initSendOTP
 *        synchronously so preloadOtpWidget() resolves without the real widget.
 *
 *   2. https://api-dev.reelmart.in/api/admin/auth/msg91-exchange  (POST)
 *      → returns a fake Supabase session with a structurally valid JWT (exp 2 h
 *        from now). supabase-js's setSession() calls decodeJWT on the
 *        access_token; if exp > now it does NOT call the refresh endpoint, it
 *        calls _getUser(token) instead.
 *
 *   3. https://nysgwdpmpxqmfwelfaxo.supabase.co/auth/v1/user  (GET)
 *      → returns the fake user object so setSession's _getUser succeeds; also
 *        used by detectSession (scenario 5) after the stored cookie is found.
 *
 *   4. https://nysgwdpmpxqmfwelfaxo.supabase.co/rest/v1/stores*  (GET)
 *      → returns different approval_status per scenario.
 *
 * For scenario 5 (logged-in pending seller opens /seller/register directly):
 *   We pre-populate the browser context with the @supabase/ssr cookie
 *   (sb-nysgwdpmpxqmfwelfaxo-auth-token) before navigating. The cookie value
 *   is: 'base64-' + base64url(JSON.stringify(sessionObject)). This matches the
 *   exact format written by @supabase/ssr's createBrowserClient.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = 'https://dev.reelmart.in'
/** The seller subdomain that the middleware redirects /seller/* to */
const SELLER_HOST = 'https://seller.dev.reelmart.in'
const FAKE_USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const FAKE_STORE_ID = '11111111-2222-3333-4444-555555555555'
const FAKE_REFRESH_TOKEN = 'fake-refresh-token-for-playwright'
const SUPABASE_PROJECT_REF = 'nysgwdpmpxqmfwelfaxo'

// ---------------------------------------------------------------------------
// Helpers — fakes
// ---------------------------------------------------------------------------

/**
 * Generate a structurally valid fake JWT with exp 2 hours from now.
 * supabase-js decodes the payload client-side to read exp; it does NOT verify
 * the signature. A non-expired JWT causes setSession to call _getUser(token)
 * (a GET /auth/v1/user with Bearer), which we mock to return the fake user.
 */
function makeFakeJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 7200,
    email: 'playwright-test@reelmart.test',
  })).toString('base64url')
  const sig = Buffer.from('playwright-fake-sig').toString('base64url')
  return `${header}.${payload}.${sig}`
}

function makeFakeUser() {
  return {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'playwright-test@reelmart.test',
    phone: '',
    app_metadata: {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00Z',
  }
}

function makeStoreRow(status: 'pending' | 'approved' | 'rejected') {
  return {
    id: FAKE_STORE_ID,
    store_name: 'Test Store',
    approval_status: status,
    approval_notes: status === 'rejected' ? 'Please update your PAN details.' : null,
  }
}

type StoreApprovalStatus = 'pending' | 'approved' | 'rejected' | null

// ---------------------------------------------------------------------------
// Helpers — session cookie for scenario 5/5b
// ---------------------------------------------------------------------------

/**
 * Build the @supabase/ssr session cookie value.
 * Format: 'base64-' + base64url(JSON.stringify(sessionObject))
 * Cookie name: sb-<project-ref>-auth-token
 * Domain: seller.dev.reelmart.in (where the seller pages actually run)
 */
function makeSessionCookieValue(jwt: string): string {
  const now = Math.floor(Date.now() / 1000)
  const session = {
    access_token: jwt,
    refresh_token: FAKE_REFRESH_TOKEN,
    user: makeFakeUser(),
    token_type: 'bearer',
    expires_in: 7200,
    expires_at: now + 7200,
  }
  return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
}

/**
 * Pre-populate the browser context with a valid Supabase session cookie so
 * that supabase.auth.getUser() in detectSession() (mount) finds it and makes
 * an HTTP call to /auth/v1/user that we can mock to return the fake user.
 *
 * Must be called BEFORE page.goto().
 */
async function injectSessionCookie(page: Page, jwt: string): Promise<void> {
  await page.context().addCookies([{
    name: `sb-${SUPABASE_PROJECT_REF}-auth-token`,
    value: makeSessionCookieValue(jwt),
    domain: 'seller.dev.reelmart.in',
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'Lax',
  }])
}

// ---------------------------------------------------------------------------
// Core mock setup
// ---------------------------------------------------------------------------

/**
 * Install all network mocks for the register page.
 *
 * storeStatus: what the Supabase stores table returns
 *   null     → no store row (new registration)
 *   pending  → already-registered pending seller
 *   approved → already-registered approved seller
 *   rejected → rejected seller (edit/resubmit path)
 */
async function setupMocks(page: Page, storeStatus: StoreApprovalStatus, fakeJwt: string): Promise<void> {
  // 1. MSG91 widget script → synchronous stub
  await page.route('https://verify.msg91.com/otp-provider.js', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `(function(){
  window.initSendOTP = function(cfg){};
  window.sendOtp = function(id,ok,fail){ ok({message:'OTP sent'}); };
  window.verifyOtp = function(otp,ok,fail){
    if(otp==='123456'){ ok({message:'${fakeJwt}'}); }
    else { fail({message:'Wrong OTP'}); }
  };
  window.retryOtp = function(ch,ok,fail){ ok({message:'resent'}); };
})();`,
    })
  })

  // 2. Admin-service auth bridge → fake session
  await page.route('**/api/admin/auth/msg91-exchange', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          userId: FAKE_USER_ID,
          session: {
            access_token: fakeJwt,
            refresh_token: FAKE_REFRESH_TOKEN,
            token_type: 'bearer',
            expires_in: 7200,
          },
        },
      }),
    })
  })

  // 3. Supabase /auth/v1/user — called by setSession's _getUser(accessToken)
  //    AND by detectSession's getUser() when a stored session cookie is found.
  await page.route('**/auth/v1/user', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeFakeUser()),
    })
  })

  // 4. Supabase stores REST query
  await page.route('**/rest/v1/stores**', (route: Route) => {
    if (storeStatus === null) {
      // No store row — .maybeSingle() returns null when body is null + content-range 0
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
        headers: { 'content-range': '0-0/0' },
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeStoreRow(storeStatus)),
      })
    }
  })

  // 5. Supabase users REST query (edit-mode prefill — non-critical for flow)
  await page.route('**/rest/v1/users**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: FAKE_USER_ID, full_name: 'Test Seller' }),
    })
  })

  // 6. Seller my-store API (edit-mode KYC prefill — non-critical for flow)
  await page.route('**/api/seller/my-store', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { pan_number: 'ABCDE1234F', gst_number: '' } }),
    })
  })

  // 7. Supabase token refresh endpoint (called if JWT expires, or by Realtime)
  await page.route('**/auth/v1/token**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: fakeJwt,
        refresh_token: FAKE_REFRESH_TOKEN,
        token_type: 'bearer',
        expires_in: 7200,
        user: makeFakeUser(),
      }),
    })
  })
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate to /seller/register on the bare host.
 * The middleware redirects to seller.dev.reelmart.in/seller/register.
 * Wait for the initLoading spinner to clear (detectSession has finished).
 */
async function goToRegister(page: Page): Promise<void> {
  await page.goto(`${BASE}/seller/register`, { waitUntil: 'networkidle', timeout: 20_000 })
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 12_000 },
  )
}

/**
 * Drive the phone → OTP steps using keyboard input.
 * The MSG91 stub resolves sendOtp/verifyOtp immediately.
 */
async function fillPhoneAndOTP(page: Page): Promise<void> {
  await page.getByPlaceholder('9876543210').fill('9999999999')
  await page.getByRole('button', { name: /Send OTP/i }).click()
  await page.waitForSelector('text=Verify your number', { timeout: 10_000 })
  await page.getByPlaceholder('• • • • • •').fill('123456')
  await page.getByRole('button', { name: /Verify & Continue/i }).click()
}

// ---------------------------------------------------------------------------
// Scenario 1: Brand-new number → profile step
// ---------------------------------------------------------------------------

test('scenario 1 — new number proceeds to profile step', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, null, jwt) // null = no existing store
  await goToRegister(page)

  // Should land on the phone step (no session stored, no existing store)
  await expect(page.getByText('Create your account')).toBeVisible()
  await expect(page.getByText('Enter your phone number to get started')).toBeVisible()

  await fillPhoneAndOTP(page)

  // verifyOTP finds no existing store → setStep('profile')
  await expect(
    page.getByRole('heading', { name: /Your details/i }),
  ).toBeVisible({ timeout: 8_000 })

  // Form fields must be visible
  await expect(page.getByPlaceholder('Rahul Sharma')).toBeVisible()
  // PAN field — use exact: true to avoid substring match against the GST
  // placeholder ("22ABCDE1234F1Z5") which also contains "ABCDE1234F".
  await expect(page.getByPlaceholder('ABCDE1234F', { exact: true })).toBeVisible()
  // Password field is present for new registration (absent in edit mode)
  await expect(page.getByPlaceholder(/Min\. 8 characters/i)).toBeVisible()
  // Register & Continue button (not Resubmit)
  await expect(page.getByRole('button', { name: /Register & Continue/i })).toBeVisible()

  // Must NOT have navigated away
  expect(page.url()).toContain('/seller/register')
})

// ---------------------------------------------------------------------------
// Scenario 2: Already-registered PENDING seller re-registers
// ---------------------------------------------------------------------------

test('scenario 2 — pending seller re-registration shows already-registered toast and redirects to dashboard', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, 'pending', jwt)
  await goToRegister(page)

  await expect(page.getByText('Create your account')).toBeVisible()

  // Watch for dashboard navigation before triggering the OTP flow
  const navigationPromise = page.waitForURL(`${SELLER_HOST}/seller/dashboard`, {
    timeout: 12_000,
  })

  await fillPhoneAndOTP(page)

  // NEW BEHAVIOR: toast saying already registered, then navigate to dashboard.
  // The toast is rendered by react-hot-toast into a portal (div[role=status] or
  // top-level div with the Toaster). We poll for it with a generous timeout.
  await expect(
    page.getByText('This number is already registered as a seller', { exact: false }),
  ).toBeVisible({ timeout: 8_000 })

  await navigationPromise
  expect(page.url()).toContain('/seller/dashboard')

  // Must NOT have shown the misleading "Application Submitted!" screen
  // (this is the regression this test guards against)
  // Note: after navigation to /seller/dashboard the register page is unmounted,
  // so we verify we are not on /seller/register.
  expect(page.url()).not.toContain('/seller/register')
})

// ---------------------------------------------------------------------------
// Scenario 3: Already-registered APPROVED seller re-registers
// ---------------------------------------------------------------------------

test('scenario 3 — approved seller re-registration shows already-registered toast and redirects to dashboard', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, 'approved', jwt)
  await goToRegister(page)

  await expect(page.getByText('Create your account')).toBeVisible()

  const navigationPromise = page.waitForURL(`${SELLER_HOST}/seller/dashboard`, {
    timeout: 12_000,
  })

  await fillPhoneAndOTP(page)

  // NEW BEHAVIOR: same toast + redirect as scenario 2 (was previously:
  // toast.success("Welcome back!") + redirect, which is slightly less clear
  // and might still be confusing — the new code unifies both into the same
  // "already registered" message).
  await expect(
    page.getByText('This number is already registered as a seller', { exact: false }),
  ).toBeVisible({ timeout: 8_000 })

  await navigationPromise
  expect(page.url()).toContain('/seller/dashboard')
  expect(page.url()).not.toContain('/seller/register')
})

// ---------------------------------------------------------------------------
// Scenario 4: REJECTED seller → edit / resubmit mode (regression check)
// ---------------------------------------------------------------------------

test('scenario 4 — rejected seller enters edit/resubmit mode with rejection notes banner', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, 'rejected', jwt)
  await goToRegister(page)

  await expect(page.getByText('Create your account')).toBeVisible()

  await fillPhoneAndOTP(page)

  // Edit mode heading
  await expect(
    page.getByRole('heading', { name: /Update your details/i }),
  ).toBeVisible({ timeout: 8_000 })

  // Rejection notes banner (with the mocked notes text from makeStoreRow)
  await expect(page.getByText('Changes requested')).toBeVisible()
  await expect(page.getByText('Please update your PAN details.')).toBeVisible()

  // Submit button says "Resubmit for approval" in edit mode
  await expect(page.getByRole('button', { name: /Resubmit for approval/i })).toBeVisible()

  // Password field must NOT appear (edit mode — seller already has an account)
  await expect(page.getByPlaceholder(/Min\. 8 characters/i)).not.toBeVisible()

  // Must NOT have navigated away
  expect(page.url()).toContain('/seller/register')
})

// ---------------------------------------------------------------------------
// Scenario 5: Logged-in PENDING seller opens /seller/register directly
// ---------------------------------------------------------------------------

test('scenario 5 — logged-in pending seller opening /seller/register is redirected to dashboard', async ({ page }) => {
  const jwt = makeFakeJwt()

  // Inject the session cookie BEFORE navigating. The @supabase/ssr
  // createBrowserClient will read this cookie on mount, call _getUser, find
  // the user, query stores (pending), and in the NEW code call
  // router.replace('/seller/dashboard').
  await injectSessionCookie(page, jwt)
  await setupMocks(page, 'pending', jwt)

  const navigationPromise = page.waitForURL(`${SELLER_HOST}/seller/dashboard`, {
    timeout: 15_000,
  })
  await page.goto(`${BASE}/seller/register`)

  // NEW BEHAVIOR: detectSession() finds pending store → router.replace(dashboard)
  await navigationPromise
  expect(page.url()).toContain('/seller/dashboard')

  // Register page UI must NOT be visible at the landing URL
  await expect(page.getByText('Application Submitted!')).not.toBeVisible()
  await expect(page.getByText('Admin review in progress')).not.toBeVisible()
  await expect(page.getByText('Create your account')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Scenario 5b: Logged-in APPROVED seller opens /seller/register directly
// ---------------------------------------------------------------------------

test('scenario 5b — logged-in approved seller opening /seller/register is redirected to dashboard', async ({ page }) => {
  const jwt = makeFakeJwt()
  await injectSessionCookie(page, jwt)
  await setupMocks(page, 'approved', jwt)

  const navigationPromise = page.waitForURL(`${SELLER_HOST}/seller/dashboard`, {
    timeout: 15_000,
  })
  await page.goto(`${BASE}/seller/register`)

  await navigationPromise
  expect(page.url()).toContain('/seller/dashboard')

  await expect(page.getByText('Application Submitted!')).not.toBeVisible()
  await expect(page.getByText('Create your account')).not.toBeVisible()
})
