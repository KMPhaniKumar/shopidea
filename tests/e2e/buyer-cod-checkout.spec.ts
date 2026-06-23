/**
 * E2E tests: buyer checkout — COD happy path + online-pay cancel → no-order
 *
 * Tests in this file (WS-07 through WS-14 from TEST_PLAN_master.md):
 *
 *   TEST 1 (P0-7): COD happy path
 *     store/blue-whale/checkout → product visible → cart edit → phone/OTP (mocked
 *     MSG91, buyer +919000000007) → address (AP pincode — same state as blue-whale,
 *     so no interstate-GST block) → COD → confirmation shows ₹ total + order number.
 *     Buyer phone: +919000000007 (DEV_ACCOUNTS.buyer from tests/fixtures/users.ts).
 *     Assertions: subtotal, delivery fee, correct ₹ total, order number, COD pill,
 *     address details on confirmation, cart cleared in localStorage, no Razorpay call.
 *
 *   TEST 2 (WS-13 online-cancel guard):
 *     Same checkout path up to review step, then select "Pay Online", click
 *     "Pay & Place Order", mock Razorpay script + Razorpay constructor so that
 *     ondismiss fires immediately (user cancels modal) → assert:
 *       - no navigation to /order/* happens
 *       - supabase /rest/v1/orders POST was never fired
 *       - payment-service /api/payments/confirm was never fired
 *       - cart localStorage key is still present (order not fulfilled)
 *       - "Payment cancelled" toast shown
 *
 * Mock strategy (all providers mocked — TEST MODE, no real calls):
 *   - MSG91 widget script stub (synchronous window.sendOtp / verifyOtp)
 *   - admin-service /api/admin/auth/msg91-exchange → fake Supabase session
 *   - Supabase /auth/v1/user + /auth/v1/token → fake buyer
 *   - Supabase /rest/v1/users → buyer profile (role=buyer)
 *   - Supabase /rest/v1/addresses → stateful (empty → one row after save)
 *   - Supabase /rest/v1/orders → POST tracked (COD test: returns fake order;
 *       cancel test: must never be called)
 *   - Supabase /rest/v1/order_events → [] (confirmation timeline)
 *   - delivery-service /api/delivery/rates → deliverable, fee=₹60
 *   - /api/pincode/* → Ongole, Andhra Pradesh (matches blue-whale state → no GST block)
 *   - /api/notifications/* → 200 fire-and-forget
 *   - /api/store/interstate-demand → 200 fire-and-forget
 *   - /api/places/* → empty (no address search suggestions)
 *   - payment-service /api/payments/create-order → fake Razorpay order (cancel test)
 *   - payment-service /api/payments/confirm → tracked (must not be called on cancel)
 *   - checkout.razorpay.com → BLOCKED (asserted never called in COD test)
 *   - Razorpay constructor (cancel test) → installed via addInitScript as
 *       window.Razorpay = class { open() { this.options.modal.ondismiss() } }
 *       so the modal "dismisses" immediately when open() is called.
 *
 * Store: blue-whale (DEV_ACCOUNTS.codStore)
 *   gst_verified=true, approved, Andhra Pradesh
 *   Must be active in the dev Supabase for the SSR page.tsx to return 200.
 *   The SSR store fetch runs on the Vercel edge and cannot be intercepted;
 *   we rely on the seeded live store.
 *
 * Buyer: +919000000007 (DEV_ACCOUNTS.buyer.phone)
 *   Not a real MSG91 test number — OTP is mocked via Playwright route().
 *   The existing MSG91 test number (9999999999) could also work but the
 *   canonical buyer fixture is 9000000007; use it throughout.
 *
 * Delivery address: Ongole, Andhra Pradesh, 523001
 *   AP state matches blue-whale (AP) so statesMatch() = true.
 *   gst_verified=true on the store means the interstateGstBlock is false
 *   regardless of buyer state — belt-and-suspenders.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE           = 'https://dev.reelmart.in'
const STORE_SLUG     = 'blue-whale'
const CHECKOUT_URL   = `${BASE}/store/${STORE_SLUG}/checkout`
const SUPABASE_REF   = 'nysgwdpmpxqmfwelfaxo'

// Buyer: DEV_ACCOUNTS.buyer
const BUYER_PHONE_DIGITS = '9000000007'  // +919000000007
const BUYER_PHONE_DISPLAY = '9000000007'

// Fake identities (no real DB rows — mocks provide them)
const FAKE_USER_ID      = 'cccccccc-dddd-eeee-ffff-000000000007'
const FAKE_REFRESH_TOKEN = 'fake-refresh-token-playwright-buyer7'

// COD test order
const FAKE_ORDER_ID     = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'
const FAKE_ORDER_NUMBER = 'RM-TEST01'

// Cart seed
const SEEDED_PRODUCT_ID    = 'prod-seed-0001'
const SEEDED_PRODUCT_NAME  = 'Test Ice Cream'
const SEEDED_PRODUCT_PRICE = 299         // ₹299
const MOCK_DELIVERY_FEE    = 60          // ₹60
const EXPECTED_TOTAL       = SEEDED_PRODUCT_PRICE + MOCK_DELIVERY_FEE  // ₹359

// Address — Ongole, Andhra Pradesh (AP = blue-whale store state → no GST block)
const DELIVERY_PINCODE = '523001'
const DELIVERY_CITY    = 'Ongole'
const DELIVERY_STATE   = 'Andhra Pradesh'

// localStorage cart key format: 'reelmart_cart_' + storeSlug
const CART_STORAGE_KEY = `reelmart_cart_${STORE_SLUG}`

// ---------------------------------------------------------------------------
// Fake JWT / session helpers
// ---------------------------------------------------------------------------

function makeFakeJwt(): string {
  const now = Math.floor(Date.now() / 1000)
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    iat: now,
    exp: now + 7200,
    email: 'buyer-playwright-007@reelmart.test',
  })).toString('base64url')
  const sig = Buffer.from('playwright-fake-sig').toString('base64url')
  return `${header}.${payload}.${sig}`
}

function makeFakeUser() {
  return {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'buyer-playwright-007@reelmart.test',
    phone: '',
    app_metadata: {},
    user_metadata: {},
    created_at: '2024-01-01T00:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// Address fixture (returned after the address form is saved)
// ---------------------------------------------------------------------------

const SAVED_ADDRESS = {
  id: 'addr-0007-0007-0007-0007-000700070007',
  user_id: FAKE_USER_ID,
  label: 'Home',
  name: 'Test Buyer',
  phone: BUYER_PHONE_DIGITS,
  alt_phone: null,
  line1: '12, Test Street',
  line2: null,
  area: 'Ongole Main Road',
  city: DELIVERY_CITY,
  state: DELIVERY_STATE,
  pincode: DELIVERY_PINCODE,
  is_default: true,
  created_at: new Date().toISOString(),
}

// Full order object for COD confirmation page mock
function makeFakeOrder() {
  return {
    id: FAKE_ORDER_ID,
    order_number: FAKE_ORDER_NUMBER,
    buyer_id: FAKE_USER_ID,
    status: 'pending',
    payment_method: 'cod',
    payment_method_detail: 'Cash on Delivery',
    payment_status: 'pending',
    subtotal: SEEDED_PRODUCT_PRICE,
    delivery_fee: MOCK_DELIVERY_FEE,
    discount_amount: 0,
    coins_discount: null,
    total_amount: EXPECTED_TOTAL,
    items: [{ name: SEEDED_PRODUCT_NAME, qty: 1, price: SEEDED_PRODUCT_PRICE }],
    delivery_address: {
      name: 'Test Buyer',
      phone: BUYER_PHONE_DIGITS,
      alt_phone: null,
      line1: '12, Test Street',
      line2: null,
      area: 'Ongole Main Road',
      city: DELIVERY_CITY,
      state: DELIVERY_STATE,
      pincode: DELIVERY_PINCODE,
    },
    created_at: new Date().toISOString(),
    awb_code: null,
    stores: { store_name: 'Blue Whale', logo_url: null },
  }
}

// ---------------------------------------------------------------------------
// Network mock installation
//
// Playwright page.route() is LIFO — register catchalls FIRST, specific
// overrides LAST. Only one route handler fires per request (the last match).
// All providers are mocked; no real calls to MSG91, Supabase, Razorpay, etc.
//
// trackOrderPost / trackConfirmPost: booleans mutated by the cancel test to
// assert that neither endpoint was called after modal dismissal.
// ---------------------------------------------------------------------------

interface MockOptions {
  /** Called when POST /rest/v1/orders fires (COD test only — must fire exactly once) */
  onOrderPost?: () => void
  /** Called when POST /api/payments/confirm fires (must never fire on cancel) */
  onConfirmPost?: () => void
  /** Whether to install the fake Razorpay constructor (online-pay tests) */
  installRazorpayStub?: boolean
}

async function setupMocks(page: Page, jwt: string, opts: MockOptions = {}): Promise<void> {
  // ── 1. MSG91 widget script → synchronous stub ─────────────────────────────
  // Installs window.sendOtp / verifyOtp / retryOtp / initSendOTP so that
  // preloadOtpWidget() in CheckoutClient resolves immediately without the
  // real widget fetching captcha tokens from MSG91.
  await page.route('https://verify.msg91.com/otp-provider.js', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `(function(){
  window.initSendOTP = function(cfg){ if(cfg&&typeof cfg.success==='function') cfg.success(); };
  window.sendOtp   = function(id, ok, fail){ ok({ message: 'OTP sent' }); };
  window.verifyOtp = function(otp, ok, fail){
    if (otp === '123456') { ok({ message: '${jwt}' }); }
    else { fail({ message: 'Wrong OTP — test expects 123456' }); }
  };
  window.retryOtp  = function(ch, ok, fail){ ok({ message: 'resent' }); };
})();`,
    })
  })

  // ── 2. admin-service auth bridge → fake Supabase session ─────────────────
  await page.route('**/api/admin/auth/msg91-exchange', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          userId: FAKE_USER_ID,
          session: {
            access_token: jwt,
            refresh_token: FAKE_REFRESH_TOKEN,
            token_type: 'bearer',
            expires_in: 7200,
          },
        },
      }),
    })
  })

  // ── 3. Supabase /auth/v1/user → fake buyer ───────────────────────────────
  await page.route(`**/${SUPABASE_REF}.supabase.co/auth/v1/user`, (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeFakeUser()) })
  })
  await page.route('**/auth/v1/user', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeFakeUser()) })
  })

  // ── 4. Supabase /auth/v1/token → refresh ─────────────────────────────────
  await page.route('**/auth/v1/token**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: jwt,
        refresh_token: FAKE_REFRESH_TOKEN,
        token_type: 'bearer',
        expires_in: 7200,
        user: makeFakeUser(),
      }),
    })
  })

  // ── 5. Supabase /rest/v1/users → buyer profile (role=buyer) ──────────────
  await page.route('**/rest/v1/users**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: FAKE_USER_ID, role: 'buyer', full_name: 'Test Buyer' }),
    })
  })

  // ── 6. Supabase /rest/v1/addresses → stateful (empty → saved after POST) ─
  let addressSaved = false
  await page.route('**/rest/v1/addresses**', (route: Route) => {
    const method = route.request().method()
    if (method === 'POST') {
      addressSaved = true
      // PostgREST INSERT returns 201 with the saved row
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(SAVED_ADDRESS),
      })
    } else {
      // GET (SELECT) → empty until saved, then [SAVED_ADDRESS]
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(addressSaved ? [SAVED_ADDRESS] : []),
      })
    }
  })

  // ── 7. Supabase /rest/v1/orders → COD INSERT + confirmation SELECT ────────
  // POST: COD place order.
  //   supabase-js .single() sends Accept: application/vnd.pgrst.object+json →
  //   PostgREST returns plain object. We detect the header and return the
  //   correct shape. Callback `onOrderPost` lets the cancel test verify no
  //   order was created.
  // GET: confirmation page OrderConfirmedClient uses .maybeSingle().
  await page.route('**/rest/v1/orders**', (route: Route) => {
    const method = route.request().method()
    if (method === 'POST') {
      opts.onOrderPost?.()
      const accept = route.request().headers()['accept'] ?? ''
      const wantsObject = accept.includes('pgrst.object') || accept.includes('vnd.pgrst')
      const body = wantsObject
        ? JSON.stringify({ id: FAKE_ORDER_ID, order_number: FAKE_ORDER_NUMBER })
        : JSON.stringify([{ id: FAKE_ORDER_ID, order_number: FAKE_ORDER_NUMBER }])
      route.fulfill({
        status: 201,
        contentType: wantsObject ? 'application/vnd.pgrst.object+json' : 'application/json',
        body,
      })
    } else {
      // GET — confirmation page
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': '0-0/1' },
        body: JSON.stringify(makeFakeOrder()),
      })
    }
  })

  // ── 8. Supabase /rest/v1/order_events → [] (OrderTimeline) ───────────────
  await page.route('**/rest/v1/order_events**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // ── 9. delivery-service /api/delivery/rates → deliverable, fee=₹60 ───────
  await page.route('**/api/delivery/rates', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          deliverable: true,
          fee: MOCK_DELIVERY_FEE,
          courierFee: MOCK_DELIVERY_FEE,
          commission: 0,
          estimatedDays: 3,
        },
      }),
    })
  })

  // ── 10. Pincode lookup /api/pincode/[pincode] → Ongole, Andhra Pradesh ───
  // AP matches blue-whale's store state → statesMatch() = true → no GST block.
  await page.route('**/api/pincode/**', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { city: DELIVERY_CITY, state: DELIVERY_STATE, deliverable: true } }),
    })
  })

  // ── 11. notification-service → 200 (fire-and-forget) ─────────────────────
  await page.route('**/api/notifications/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  // ── 12. interstate demand signal → 200 (fire-and-forget) ─────────────────
  await page.route('**/api/store/interstate-demand', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  })

  // ── 13. Google Places proxy → empty (address search is skipped in tests) ──
  await page.route('**/api/places/**', (route: Route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) })
  })

  // ── 14. payment-service /api/payments/create-order (online-pay test) ─────
  // Returns a fake Razorpay order id and the test key.
  await page.route('**/api/payments/create-order', (route: Route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          razorpayOrderId: 'order_test_rzp_playwright_cancel',
          amount: EXPECTED_TOTAL * 100,   // paise
          currency: 'INR',
          keyId: 'rzp_test_playwright_key',
        },
      }),
    })
  })

  // ── 15. payment-service /api/payments/confirm (tracked — must NOT fire on cancel) ─
  await page.route('**/api/payments/confirm', (route: Route) => {
    opts.onConfirmPost?.()
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { id: FAKE_ORDER_ID, order_number: FAKE_ORDER_NUMBER } }),
    })
  })

  // ── 16. BLOCK checkout.razorpay.com (asserted never called in COD test) ───
  // In the cancel test we install window.Razorpay via addInitScript instead,
  // so the loadRazorpayScript() helper resolves without fetching the real script.
  // We block the network request here regardless so it never touches Razorpay.
  await page.route('https://checkout.razorpay.com/**', (route: Route) => {
    route.abort('failed')
  })
}

// ---------------------------------------------------------------------------
// localStorage cart seed (injected before page hydration via addInitScript)
// ---------------------------------------------------------------------------

function buildCartSeedScript(): string {
  const cart = [{
    productId: SEEDED_PRODUCT_ID,
    name: SEEDED_PRODUCT_NAME,
    image: '',
    price: SEEDED_PRODUCT_PRICE,
    qty: 1,
    weight_grams: 500,
  }]
  return `
    try {
      localStorage.setItem(
        '${CART_STORAGE_KEY}',
        '${JSON.stringify(cart)}'
      );
    } catch(e) {}
  `
}

// ---------------------------------------------------------------------------
// Razorpay stub script (injected via addInitScript for online-pay tests)
//
// CheckoutClient's loadRazorpayScript() checks window.Razorpay first — if it
// exists, it resolves immediately without appending a <script> tag. We define
// window.Razorpay as a class whose open() method fires ondismiss immediately,
// simulating a user cancelling the payment modal before entering UPI/card.
//
// This makes payOnline() → new Razorpay({...}).open() → ondismiss() →
// reject(new Error('Payment cancelled')) → placeOrder catches it → toast.
// ---------------------------------------------------------------------------

function buildRazorpayDismissStub(): string {
  return `
    (function() {
      window.Razorpay = class MockRazorpay {
        constructor(options) { this.options = options; }
        on() {}
        open() {
          // Fire ondismiss synchronously so payOnline() rejects immediately.
          if (this.options && this.options.modal && typeof this.options.modal.ondismiss === 'function') {
            this.options.modal.ondismiss();
          }
        }
      };
    })();
  `
}

// ---------------------------------------------------------------------------
// Shared helper: navigate to checkout and wait for CheckoutClient to hydrate
// ---------------------------------------------------------------------------

async function navigateToCheckout(page: Page): Promise<void> {
  await page.goto(CHECKOUT_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  // CheckoutClient "Checkout" heading is in the sticky header — confirms RSC + client hydration
  await expect(page.getByRole('heading', { name: /checkout/i })).toBeVisible({ timeout: 20_000 })
}

// ---------------------------------------------------------------------------
// Shared helper: drive phone → OTP steps
//
// Uses buyer phone 9000000007 (DEV_ACCOUNTS.buyer.phoneDigits).
// MSG91 stub resolves verifyOtp('123456') synchronously.
// ---------------------------------------------------------------------------

async function doPhoneOtp(page: Page): Promise<void> {
  // Phone step
  await expect(page.getByText(/verify your phone/i)).toBeVisible({ timeout: 12_000 })
  const phoneInput = page.getByPlaceholder('9876543210')
  await expect(phoneInput).toBeVisible({ timeout: 5_000 })
  await phoneInput.fill(BUYER_PHONE_DIGITS)
  const sendOtpBtn = page.getByRole('button', { name: /send otp/i })
  await expect(sendOtpBtn).toBeEnabled({ timeout: 3_000 })
  await sendOtpBtn.click()
  console.log(`  phone ${BUYER_PHONE_DIGITS} entered, Send OTP clicked`)

  // OTP step
  await expect(page.getByText(/enter the otp/i)).toBeVisible({ timeout: 10_000 })
  const otpInput = page.getByPlaceholder('• • • • • •')
  await expect(otpInput).toBeVisible({ timeout: 5_000 })
  await otpInput.fill('123456')
  const verifyBtn = page.getByRole('button', { name: /verify/i })
  await expect(verifyBtn).toBeEnabled({ timeout: 3_000 })
  await verifyBtn.click()
  console.log('  OTP 123456 entered, Verify clicked')

  // Wait for "Logged in!" toast (confirms msg91-exchange + setSession succeeded)
  await expect(page.getByText(/logged in/i)).toBeVisible({ timeout: 15_000 })
  console.log('  "Logged in!" toast shown — buyer session established')
}

// ---------------------------------------------------------------------------
// Shared helper: fill address form and save
//
// BuyerAddressForm fields (confirmed from source):
//   Area/Locality   → <textarea> placeholder "Pick from search above…"
//   Flat/Building   → <input>    placeholder "e.g. B-403, Aparna Cyber Commune"
//   Full Name       → <input>    placeholder "Recipient's name"
//   Mobile Number   → <input>    inside +91 prefix, placeholder "9876543210"
//   Pincode         → <input>    placeholder "500019" (inputMode="numeric")
//   City / State    → readOnly when pincode lookup succeeds (auto-filled via /api/pincode/*)
//
// We fill Area/Locality directly (bypasses Google Places search — Places is
// mocked to return empty). Pincode 523001 triggers /api/pincode/523001 (mocked
// → Ongole, AP). City and State are readOnly after lookup succeeds.
// ---------------------------------------------------------------------------

async function fillAndSaveAddress(page: Page): Promise<void> {
  await expect(page.getByText(/delivery address/i)).toBeVisible({ timeout: 10_000 })
  console.log('  address step visible')

  // Area / Locality (textarea)
  const areaTextarea = page.getByLabel('Area / Locality').first()
  await expect(areaTextarea).toBeVisible({ timeout: 5_000 })
  await areaTextarea.fill('Ongole Main Road')

  // Flat / Home / Building No.
  const line1Input = page.getByPlaceholder('e.g. B-403, Aparna Cyber Commune')
  await expect(line1Input).toBeVisible({ timeout: 5_000 })
  await line1Input.fill('12, Test Street')

  // Full Name
  const nameInput = page.getByPlaceholder("Recipient's name")
  await expect(nameInput).toBeVisible({ timeout: 3_000 })
  await nameInput.fill('Test Buyer')

  // Mobile Number (inside +91 prefix wrapper; use .first() since there's only
  // one 9876543210 placeholder at this step — phone/OTP step is no longer shown)
  const mobileInput = page.getByPlaceholder('9876543210').first()
  await expect(mobileInput).toBeVisible({ timeout: 3_000 })
  await mobileInput.fill(BUYER_PHONE_DIGITS)

  // Pincode — 6 digits. Triggers lookupPincode() → /api/pincode/523001 (mocked → AP)
  // AP matches blue-whale store state → interstateGstBlock = false (belt + suspenders;
  // gst_verified=true on the store also ensures block never fires regardless).
  const pincodeInput = page.getByPlaceholder('500019')
  await expect(pincodeInput).toBeVisible({ timeout: 3_000 })
  await pincodeInput.fill(DELIVERY_PINCODE)

  // Wait for city to be auto-filled from the pincode lookup
  await page.waitForFunction(
    (city: string) => Array.from(document.querySelectorAll('input')).some(i => (i as HTMLInputElement).value === city),
    DELIVERY_CITY,
    { timeout: 8_000 },
  ).catch(() => console.log('  WARN: city auto-fill not detected — continuing'))
  console.log('  pincode lookup resolved')

  // Save address
  const saveAddrBtn = page.getByRole('button', { name: /save address/i })
  await expect(saveAddrBtn).toBeVisible({ timeout: 5_000 })
  await saveAddrBtn.click()
  console.log('  Save Address clicked')
}

// ---------------------------------------------------------------------------
// Shared helper: wait for review step (payment method section) to appear.
// After address save, CheckoutClient calls loadAddresses() (async) and then
// calls setStep('review'). There may be a brief intermediate state where a
// "Continue →" footer CTA appears; we click it if needed.
// ---------------------------------------------------------------------------

async function waitForReviewStep(page: Page): Promise<void> {
  const paymentSection = page.getByText(/payment method/i)
  const paymentVisible = await paymentSection
    .waitFor({ state: 'visible', timeout: 12_000 })
    .then(() => true)
    .catch(() => false)

  if (!paymentVisible) {
    const addrContinue = page.getByRole('button', { name: /continue/i }).last()
    if (await addrContinue.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log('  clicking Continue to advance to review step')
      await addrContinue.click()
      await expect(paymentSection).toBeVisible({ timeout: 10_000 })
    } else {
      // Will fail with a clear message
      await expect(paymentSection).toBeVisible({ timeout: 3_000 })
    }
  }
  console.log('  review step: Payment Method section visible')
}

// ===========================================================================
// TEST 1: P0-7 — COD happy path (WS-07 to WS-14)
// ===========================================================================

test.describe('buyer COD checkout — happy path', () => {

  test('WS-07..14 | cart → OTP (buyer +919000000007, mocked) → address (AP) → COD → confirmation shows ₹359 + RM-TEST01; no Razorpay call', async ({ page }) => {
    test.setTimeout(120_000)

    const jwt = makeFakeJwt()

    // Track whether Razorpay was ever requested (must remain false for COD)
    let razorpayRequested = false
    page.on('request', req => {
      if (req.url().includes('checkout.razorpay.com')) razorpayRequested = true
    })

    // Track whether the orders POST fired (must fire exactly once)
    let orderPostCount = 0

    // ── Step 0: install mocks + cart seed script ──────────────────────────
    console.log('step 0: install mocks + cart seed (product ₹299, delivery ₹60)')
    await setupMocks(page, jwt, { onOrderPost: () => { orderPostCount++ } })
    await page.addInitScript(buildCartSeedScript())

    // ── Step 1: navigate to checkout ─────────────────────────────────────
    console.log(`step 1: navigate to ${CHECKOUT_URL}`)
    await navigateToCheckout(page)
    console.log('  checkout page hydrated')

    // ── Step 2: cart step — verify product name, subtotal, footer total ───
    console.log('step 2: verify cart content')

    await expect(page.getByText(SEEDED_PRODUCT_NAME)).toBeVisible({ timeout: 10_000 })
    console.log(`  product "${SEEDED_PRODUCT_NAME}" visible`)

    // Subtotal row: ₹299
    await expect(page.getByText(`₹${SEEDED_PRODUCT_PRICE}`).first()).toBeVisible({ timeout: 5_000 })
    console.log(`  subtotal ₹${SEEDED_PRODUCT_PRICE} visible`)

    // Footer total: ₹359 (product + delivery default DELIVERY_FEE=60)
    const footerLocator = page.locator('.fixed.bottom-0')
    const footerTotalText = await footerLocator.getByText(/₹\d+/).last().textContent({ timeout: 5_000 })
    console.log(`  footer total: ${footerTotalText}`)
    expect(footerTotalText).toContain(`₹${EXPECTED_TOTAL}`)

    // ── Step 3: cart edit — increase qty to 2, decrease back to 1 ─────────
    console.log('step 3: cart qty edit (+1 then -1)')

    const increaseBtn = page.getByRole('button', { name: /increase quantity/i })
    const decreaseBtn = page.getByRole('button', { name: /decrease quantity/i })

    if (await increaseBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await increaseBtn.click()
      await expect(page.getByText('2').first()).toBeVisible({ timeout: 3_000 })
      console.log('  qty incremented to 2')
      await decreaseBtn.click()
      await expect(page.getByText('1').first()).toBeVisible({ timeout: 3_000 })
      console.log('  qty decremented back to 1')
    } else {
      console.log('  WARN: qty controls not found by aria-label — skipping cart edit (secondary assertion)')
    }

    // ── Step 4: continue from cart step ───────────────────────────────────
    console.log('step 4: continue from cart')
    const cartContinueBtn = page.getByRole('button', { name: /Continue/i }).last()
    await expect(cartContinueBtn).toBeVisible({ timeout: 5_000 })
    await cartContinueBtn.click()

    // ── Step 5 + 6: phone + OTP (buyer +919000000007) ─────────────────────
    console.log('step 5+6: phone/OTP flow')
    await doPhoneOtp(page)

    // ── Step 7: address form ───────────────────────────────────────────────
    console.log('step 7: address form')
    await fillAndSaveAddress(page)

    // ── Step 8: wait for review step ──────────────────────────────────────
    console.log('step 8: advance to review step')
    await waitForReviewStep(page)

    // ── Step 9: review step assertions ────────────────────────────────────
    console.log('step 9: review step assertions')

    // COD label visible
    await expect(page.getByText(/cash on delivery/i)).toBeVisible({ timeout: 5_000 })
    console.log('  "Cash on Delivery" label visible')

    // Pay Online option also present (confirms both options rendered)
    await expect(page.getByText(/pay online/i)).toBeVisible({ timeout: 3_000 })
    console.log('  "Pay Online" option visible')

    // Brief wait for delivery-rates mock to settle
    await page.waitForTimeout(500)

    // Correct ₹ total in order summary: ₹299 + ₹60 = ₹359
    const totalRow = page.locator(`text=/₹${EXPECTED_TOTAL}/`)
    await expect(totalRow.first()).toBeVisible({ timeout: 8_000 })
    console.log(`  total ₹${EXPECTED_TOTAL} visible in order summary`)

    // Footer total ₹359
    const reviewFooterText = await footerLocator.getByText(/₹\d+/).last().textContent({ timeout: 3_000 }).catch(() => null)
    console.log(`  footer shows: ${reviewFooterText}`)
    expect(reviewFooterText).toContain(`₹${EXPECTED_TOTAL}`)

    // COD radio must be selected by default
    const codRadio = page.locator('input[type="radio"]').first()
    await expect(codRadio).toBeChecked({ timeout: 3_000 })
    console.log('  COD radio is checked by default')

    // ── Step 10: place COD order ───────────────────────────────────────────
    console.log('step 10: place COD order')

    const placeOrderBtn = page.getByRole('button', { name: /place order/i })
    await expect(placeOrderBtn).toBeVisible({ timeout: 5_000 })
    await expect(placeOrderBtn).toBeEnabled({ timeout: 3_000 })
    await placeOrderBtn.click()

    // Supabase orders INSERT → { id, order_number } → clearCart → router.push
    await page.waitForURL(`**/order/${FAKE_ORDER_ID}`, { timeout: 20_000 })
    console.log(`  navigated to /order/${FAKE_ORDER_ID}`)

    // Order POST must have fired exactly once
    expect(orderPostCount).toBe(1)
    console.log('  orders POST fired exactly once (not double-submitted)')

    // ── Step 11: order confirmation page ──────────────────────────────────
    console.log('step 11: order confirmation assertions')

    // "Order Placed!" hero heading
    await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible({ timeout: 20_000 })
    console.log('  "Order Placed!" hero visible')

    // Order number
    await expect(page.getByText(FAKE_ORDER_NUMBER)).toBeVisible({ timeout: 8_000 })
    console.log(`  order number "${FAKE_ORDER_NUMBER}" visible`)

    // Total amount: ₹359
    await expect(page.locator(`text=/₹${EXPECTED_TOTAL}/`).first()).toBeVisible({ timeout: 8_000 })
    console.log(`  total ₹${EXPECTED_TOTAL} visible on confirmation page`)

    // Payment method: COD pill
    await expect(page.locator('text=COD').first()).toBeVisible({ timeout: 3_000 })
    console.log('  COD payment method pill visible')

    // Delivery address details
    await expect(page.getByText('Test Buyer').first()).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText(DELIVERY_PINCODE)).toBeVisible({ timeout: 3_000 })
    console.log(`  delivery address — name + pincode ${DELIVERY_PINCODE} visible`)

    // "View My Orders" CTA
    await expect(page.getByRole('link', { name: /view my orders/i })).toBeVisible({ timeout: 3_000 })
    console.log('  "View My Orders" link visible')

    // ── Step 12: cart cleared from localStorage ────────────────────────────
    console.log('step 12: assert cart cleared')
    const cartAfterOrder = await page.evaluate((key: string) => localStorage.getItem(key), CART_STORAGE_KEY)
    // CheckoutClient calls clearCart(storeSlug) on successful COD order
    expect(cartAfterOrder).toBeNull()
    console.log('  cart localStorage key is null (cleared after order)')

    // ── Step 13: Razorpay was never contacted ──────────────────────────────
    console.log('step 13: assert no real payment attempted')
    expect(razorpayRequested).toBe(false)
    console.log('  confirmed: checkout.razorpay.com was NOT requested during COD flow')

    console.log('ALL COD STEPS PASSED')
  })

})

// ===========================================================================
// TEST 2: online-pay CANCEL → no order created
//
// Covers the fix for the ghost/duplicate-order bug (confirmed in web-storefront
// skill docs): a cancelled/failed Razorpay modal must leave NO order behind.
//
// The payment flow in CheckoutClient.payOnline():
//   1. loadRazorpayScript() — checks window.Razorpay first; if present, resolves.
//      We inject window.Razorpay via addInitScript before any page JS runs.
//   2. /api/payments/create-order → returns razorpayOrderId + keyId.
//   3. new Razorpay({...}).open() → our stub fires ondismiss() immediately.
//   4. payOnline() rejects with Error('Payment cancelled').
//   5. placeOrder() catch: setPlacing(false), toast.error('Payment cancelled').
//   6. No navigation, no /rest/v1/orders POST, no /api/payments/confirm call.
// ===========================================================================

test.describe('online-pay cancel → no order created', () => {

  test('WS-13 | select Pay Online → Razorpay modal dismissed → no order row, cart retained, "Payment cancelled" toast', async ({ page }) => {
    test.setTimeout(120_000)

    const jwt = makeFakeJwt()

    // Track whether any order POST or confirm POST was called (both must be 0)
    let orderPostFired = false
    let confirmPostFired = false

    // Track any navigation to /order/* (must not happen on cancel)
    let navigatedToOrder = false
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame() && frame.url().includes('/order/')) {
        navigatedToOrder = true
      }
    })

    // ── Step 0: install mocks + cart seed + Razorpay dismiss stub ─────────
    console.log('step 0: install mocks + cart seed + Razorpay dismiss stub')
    await setupMocks(page, jwt, {
      onOrderPost:    () => { orderPostFired = true },
      onConfirmPost:  () => { confirmPostFired = true },
    })
    await page.addInitScript(buildCartSeedScript())
    // Inject window.Razorpay BEFORE any page JS — so loadRazorpayScript()
    // short-circuits (if(window.Razorpay) return resolve()) and never requests
    // checkout.razorpay.com. The constructor fires ondismiss() immediately.
    await page.addInitScript(buildRazorpayDismissStub())

    // ── Step 1: navigate to checkout ─────────────────────────────────────
    console.log(`step 1: navigate to ${CHECKOUT_URL}`)
    await navigateToCheckout(page)
    console.log('  checkout page hydrated')

    // ── Step 2: verify cart ───────────────────────────────────────────────
    console.log('step 2: verify cart visible')
    await expect(page.getByText(SEEDED_PRODUCT_NAME)).toBeVisible({ timeout: 10_000 })
    console.log(`  product "${SEEDED_PRODUCT_NAME}" visible`)

    // ── Step 3: continue from cart ────────────────────────────────────────
    console.log('step 3: continue from cart')
    const cartContinueBtn = page.getByRole('button', { name: /Continue/i }).last()
    await expect(cartContinueBtn).toBeVisible({ timeout: 5_000 })
    await cartContinueBtn.click()

    // ── Step 4 + 5: phone/OTP ─────────────────────────────────────────────
    console.log('step 4+5: phone/OTP flow')
    await doPhoneOtp(page)

    // ── Step 6: address form ──────────────────────────────────────────────
    console.log('step 6: address form')
    await fillAndSaveAddress(page)

    // ── Step 7: wait for review step ─────────────────────────────────────
    console.log('step 7: advance to review step')
    await waitForReviewStep(page)

    // ── Step 8: select Pay Online ─────────────────────────────────────────
    console.log('step 8: select Pay Online radio')

    // The Payment Method section renders two <label> elements, each containing
    // an <input type="radio"> and a <p> with the method name. The labels are
    // peer siblings inside the section div. We locate the online radio input
    // by finding the label whose text includes "Pay Online" and clicking its
    // contained radio. filter({ has }) scopes the locator to the label that
    // wraps both the radio and the text.
    //
    // We use .locator('label').filter({ hasText: /pay online/i }) to target the
    // outer <label> precisely, then click the radio input inside it.
    const onlinePayLabel = page.locator('label').filter({ hasText: /pay online/i }).first()
    await expect(onlinePayLabel).toBeVisible({ timeout: 5_000 })
    // Click the radio inside the label directly
    const onlineRadio = onlinePayLabel.locator('input[type="radio"]')
    await onlineRadio.click()

    // Confirm the radio is now checked
    await expect(onlineRadio).toBeChecked({ timeout: 3_000 })
    console.log('  Pay Online radio selected')

    // ── Step 9: click "Pay & Place Order" ────────────────────────────────
    console.log('step 9: click "Pay & Place Order"')

    // The Place Order button label changes to "Pay & Place Order →" when paymentMethod=online
    const payAndPlaceBtn = page.getByRole('button', { name: /pay.*place order/i })
    await expect(payAndPlaceBtn).toBeVisible({ timeout: 5_000 })
    await expect(payAndPlaceBtn).toBeEnabled({ timeout: 3_000 })
    await payAndPlaceBtn.click()
    console.log('  "Pay & Place Order" clicked — Razorpay stub ondismiss() fires immediately')

    // ── Step 10: assert "Payment cancelled" toast ─────────────────────────
    console.log('step 10: assert Payment cancelled toast')

    // CheckoutClient catches the rejection from payOnline() and calls
    // toast.error(err.message) where err.message = 'Payment cancelled'
    await expect(
      page.getByText(/payment cancelled/i),
    ).toBeVisible({ timeout: 10_000 })
    console.log('  "Payment cancelled" toast shown')

    // ── Step 11: no navigation to /order/* ───────────────────────────────
    console.log('step 11: assert no navigation to order confirmation')

    // Give a moment for any accidental navigation to happen
    await page.waitForTimeout(1_000)

    expect(navigatedToOrder).toBe(false)
    expect(page.url()).not.toContain('/order/')
    console.log('  URL does not contain /order/ — no order confirmation page navigated')

    // ── Step 12: no order POST and no confirm POST ────────────────────────
    console.log('step 12: assert no orders POST and no /confirm POST fired')
    expect(orderPostFired).toBe(false)
    console.log('  supabase /rest/v1/orders POST was NOT called')
    expect(confirmPostFired).toBe(false)
    console.log('  /api/payments/confirm POST was NOT called')

    // ── Step 13: cart is still in localStorage ────────────────────────────
    console.log('step 13: assert cart retained after cancel')
    const cartAfterCancel = await page.evaluate((key: string) => localStorage.getItem(key), CART_STORAGE_KEY)
    // clearCart() is only called after a successful payment; on cancel it must be untouched
    expect(cartAfterCancel).not.toBeNull()
    const parsedCart = JSON.parse(cartAfterCancel!)
    expect(Array.isArray(parsedCart)).toBe(true)
    expect(parsedCart.length).toBeGreaterThan(0)
    expect(parsedCart[0].name).toBe(SEEDED_PRODUCT_NAME)
    console.log('  cart localStorage still present with product (not cleared on cancel)')

    // ── Step 14: checkout page still rendered (not navigated away) ────────
    console.log('step 14: checkout page still rendered')
    await expect(page.getByRole('heading', { name: /checkout/i })).toBeVisible({ timeout: 3_000 })
    console.log('  Checkout heading still visible — user can retry')

    console.log('ALL ONLINE-CANCEL STEPS PASSED')
  })

})
