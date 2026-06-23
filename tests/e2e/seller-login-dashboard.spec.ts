/**
 * e2e tests: seller login → dashboard (SD-01 + SD-02)
 *
 * SD-01: Registered seller phone → OTP → lands on /seller/dashboard
 * SD-02: Unregistered phone → check-phone rejects → "not registered" error shown, no OTP step
 *
 * Architecture notes:
 *   - Seller routes live on seller.dev.reelmart.in via host-based middleware.
 *     Navigating to dev.reelmart.in/seller/login triggers a middleware redirect
 *     to seller.dev.reelmart.in/seller/login.
 *   - Auth flow (login page):
 *       1. check-phone  → POST /api/admin/auth/check-phone  (via admin-service)
 *       2. sendOtp      → calls MSG91 widget
 *       3. verifyOtp    → resolves accessToken
 *       4. msg91-exchange → POST to admin-service, mints Supabase session
 *
 * Mocking strategy (same pattern as seller-register-flow.spec.ts):
 *   - MSG91 widget script replaced with a synchronous stub.
 *   - /api/admin/auth/check-phone mocked: registered returns {registered:true},
 *     unregistered returns {registered:false}.
 *   - /api/admin/auth/msg91-exchange returns a valid fake Supabase session.
 *   - Supabase /auth/v1/user returns the fake user.
 *   - Supabase /rest/v1/stores returns an approved store row (dashboard gate).
 *   - Supabase /rest/v1/seller_verification returns a verification row so
 *     SellerGate passes and does not redirect.
 *
 * Missing data-testid notes (filed to ui-engineer):
 *   - The "not registered" error banner uses a className-only div; no data-testid.
 *     We assert by text content, which is stable enough.
 *   - Phone input has no data-testid; identified by placeholder "9876543210".
 *   - Send OTP button has no data-testid; identified by role+name.
 *   - OTP input has no data-testid; identified by placeholder "• • • • • •".
 *   - Verify button has no data-testid; identified by role+name "Verify & Sign In".
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = 'https://dev.reelmart.in'
const SELLER_HOST = 'https://seller.dev.reelmart.in'
const FAKE_USER_ID = 'cccccccc-dddd-eeee-ffff-000000000001'
const FAKE_STORE_ID = '22222222-3333-4444-5555-666666666666'
const FAKE_REFRESH_TOKEN = 'fake-refresh-seller-login'
const SUPABASE_PROJECT_REF = 'nysgwdpmpxqmfwelfaxo'

// ---------------------------------------------------------------------------
// Helpers — fake JWT / user / store (mirrors seller-register-flow.spec.ts)
// ---------------------------------------------------------------------------

function makeFakeJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 7200,
    email: 'playwright-seller-login@reelmart.test',
  })).toString('base64url')
  const sig = Buffer.from('playwright-fake-sig-login').toString('base64url')
  return `${header}.${payload}.${sig}`
}

function makeFakeUser() {
  return {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'playwright-seller-login@reelmart.test',
    phone: '',
    app_metadata: {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00Z',
  }
}

function makeApprovedStoreRow() {
  return {
    id: FAKE_STORE_ID,
    store_name: 'Surya Boutiques',
    store_slug: 'suryaboutiques',
    is_open: true,
    is_active: true,
    approval_status: 'approved',
    approval_notes: null,
    suspended: false,
    suspended_reason: null,
    category: 'Fashion',
    logo_url: null,
    state: 'Telangana',
  }
}

function makeVerificationRow() {
  return {
    seller_id: FAKE_USER_ID,
    phone_verified: true,
    pan_provided: true,
    gst_provided: false,
    gst_verified: false,
    pickup_verified: true,
    signature_present: true,
    approval_status: 'approved',
    suspended: false,
    features_unlocked: true,
  }
}

// ---------------------------------------------------------------------------
// Mock wiring
// ---------------------------------------------------------------------------

interface SetupOptions {
  /** true = check-phone reports number is registered */
  isRegistered: boolean
}

async function setupMocks(page: Page, fakeJwt: string, opts: SetupOptions): Promise<void> {
  // 1. MSG91 widget script → synchronous stub (same as register spec)
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

  // 2. check-phone — gatekeeper before OTP is sent.
  // Real response shape from admin-service (checkPhoneRegistered reads json.data.registered):
  //   { success: true, data: { registered: boolean, approval_status?: string } }
  await page.route('**/api/admin/auth/check-phone', (route: Route) => {
    if (opts.isRegistered) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { registered: true, approval_status: 'approved' },
        }),
      })
    } else {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { registered: false },
        }),
      })
    }
  })

  // 3. msg91-exchange → fake Supabase session
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

  // 4. Supabase /auth/v1/user → fake user
  await page.route('**/auth/v1/user', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeFakeUser()),
    })
  })

  // 5. Supabase token refresh
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

  // 6. Supabase stores REST — returns approved store so SellerGate passes
  await page.route('**/rest/v1/stores**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeApprovedStoreRow()),
    })
  })

  // 7. Supabase seller_verification — returns passing row
  await page.route('**/rest/v1/seller_verification**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeVerificationRow()),
    })
  })

  // 8. Supabase orders, products — empty results (dashboard still renders)
  await page.route('**/rest/v1/orders**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
      headers: { 'content-range': '0-0/0' },
    })
  })
  await page.route('**/rest/v1/products**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
      headers: { 'content-range': '0-0/0' },
    })
  })

  // 9. Analytics-service (dashboard fallback) — 200 with zeroed stats
  await page.route('**/api/analytics/**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        gmv: 0, platformFee: 0, totalOrders: 0, paidOrders: 0,
        newStores: 0, newBuyers: 0, newSellers: 0, payoutsPaid: 0,
      }),
    })
  })
}

async function goToLogin(page: Page): Promise<void> {
  await page.goto(`${BASE}/seller/login`, { waitUntil: 'networkidle', timeout: 20_000 })
}

// ---------------------------------------------------------------------------
// SD-01: Registered seller → OTP → dashboard
// ---------------------------------------------------------------------------

test('SD-01 — registered seller: phone + OTP → redirects to dashboard', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, jwt, { isRegistered: true })
  await goToLogin(page)

  // The middleware redirects dev.reelmart.in/seller/login to seller.dev.reelmart.in/seller/login
  expect(page.url()).toContain('/seller/login')

  // Phone step should be visible
  await expect(page.getByText('Welcome back')).toBeVisible()
  await expect(page.getByPlaceholder('9876543210')).toBeVisible()

  // Enter registered phone
  await page.getByPlaceholder('9876543210').fill('9999999999')

  // send OTP
  await page.getByRole('button', { name: /Send OTP/i }).click()

  // OTP step appears
  await expect(page.getByPlaceholder('• • • • • •')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Sent to \+91/)).toBeVisible()

  // Set up navigation expectation before triggering verify
  const dashboardNav = page.waitForURL(`${SELLER_HOST}/seller/dashboard`, { timeout: 15_000 })

  // Enter correct OTP
  await page.getByPlaceholder('• • • • • •').fill('123456')
  await page.getByRole('button', { name: /Verify & Sign In/i }).click()

  // Should see success toast and navigate to dashboard
  await expect(page.getByText('Login successful!', { exact: false })).toBeVisible({ timeout: 8_000 })
  await dashboardNav

  // Dashboard heading must be visible
  expect(page.url()).toContain('/seller/dashboard')
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 12_000 })
})

// ---------------------------------------------------------------------------
// SD-01b: Countdown timer visible after OTP sent
// ---------------------------------------------------------------------------

test('SD-01b — after OTP sent, resend button shows countdown', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, jwt, { isRegistered: true })
  await goToLogin(page)

  await page.getByPlaceholder('9876543210').fill('9999999999')
  await page.getByRole('button', { name: /Send OTP/i }).click()

  // Wait for OTP step
  await expect(page.getByPlaceholder('• • • • • •')).toBeVisible({ timeout: 10_000 })

  // Resend button must be disabled with countdown visible
  const resendBtn = page.getByRole('button', { name: /Resend in/i })
  await expect(resendBtn).toBeVisible({ timeout: 5_000 })
  await expect(resendBtn).toBeDisabled()
})

// ---------------------------------------------------------------------------
// SD-02: Unregistered phone → error, no OTP step reached
// ---------------------------------------------------------------------------

test('SD-02 — unregistered phone: error banner shown, OTP step never reached', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, jwt, { isRegistered: false })
  await goToLogin(page)

  await expect(page.getByPlaceholder('9876543210')).toBeVisible()

  await page.getByPlaceholder('9876543210').fill('8888888888')
  await page.getByRole('button', { name: /Send OTP/i }).click()

  // Error: "not registered"
  await expect(
    page.getByText("This number isn't registered yet", { exact: false }),
  ).toBeVisible({ timeout: 8_000 })

  // CTA to sign up is present
  await expect(
    page.getByRole('link', { name: /Sign up to start selling/i }),
  ).toBeVisible()

  // OTP input must NOT appear
  await expect(page.getByPlaceholder('• • • • • •')).not.toBeVisible()

  // URL stays on login page
  expect(page.url()).toContain('/seller/login')
})

// ---------------------------------------------------------------------------
// SD-02b: Send OTP button disabled when input is incomplete
// ---------------------------------------------------------------------------

test('SD-02b — Send OTP button disabled for < 10 digit phone', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, jwt, { isRegistered: true })
  await goToLogin(page)

  // Enter 9 digits only — button must stay disabled
  await page.getByPlaceholder('9876543210').fill('123456789')
  const sendBtn = page.getByRole('button', { name: /Send OTP/i })
  await expect(sendBtn).toBeDisabled()

  // Complete the 10th digit
  await page.getByPlaceholder('9876543210').fill('1234567890')
  await expect(sendBtn).toBeEnabled()
})

// ---------------------------------------------------------------------------
// SD-01c: "Change number" goes back to phone step
// ---------------------------------------------------------------------------

test('SD-01c — change number link brings user back to phone step', async ({ page }) => {
  const jwt = makeFakeJwt()
  await setupMocks(page, jwt, { isRegistered: true })
  await goToLogin(page)

  await page.getByPlaceholder('9876543210').fill('9999999999')
  await page.getByRole('button', { name: /Send OTP/i }).click()

  await expect(page.getByPlaceholder('• • • • • •')).toBeVisible({ timeout: 10_000 })

  // Click back
  await page.getByRole('button', { name: /Change number/i }).click()

  // Phone step visible again
  await expect(page.getByPlaceholder('9876543210')).toBeVisible()
  await expect(page.getByPlaceholder('• • • • • •')).not.toBeVisible()
})
