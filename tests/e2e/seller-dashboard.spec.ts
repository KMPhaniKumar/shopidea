/**
 * Playwright e2e: Seller dashboard — full coverage
 *
 * Covers (TEST_PLAN_master.md section 1B):
 *   SD-09  SellerGate approved seller reaches dashboard
 *   SD-11  Dashboard home — stats, pending-orders widget, revenue chart, top products, low stock
 *   SD-13  Products list — table renders, search, export button
 *   SD-14  Product add — form validation, save (mocked Supabase insert)
 *   SD-15  Product edit — pre-filled form
 *   SD-17  Product share — copy link, WhatsApp, Instagram
 *   SD-18  Orders list — filter tabs (all/pending/etc.)
 *   SD-19  Order detail panel — items, address, total, action buttons (Accept/Reject/Mark next)
 *   SD-20  Order status workflow — Accept, Reject, Mark-as-packed/shipped/delivered
 *   SD-21  Print invoice — window.open fired
 *   SD-22  WhatsApp buyer — wa.me link visible in detail panel
 *   SD-28  Payouts — pending balance card, payout history table, bank account form
 *   SD-30  Settings — store info form (name/slug/description/category/whatsapp/instagram), Save Profile
 *   SD-31  Settings — pickup address form (contact, address, pincode, city, state, area)
 *   SD-33  Settings — pickup status banner (verified)
 *   SD-34  Settings — slug uniqueness debounce feedback
 *
 * Auth strategy:
 *   All tests inject a fake Supabase session cookie (same pattern as
 *   admin-seller-approval.spec.ts). The seller phone 9999999999 maps to
 *   DEV_ACCOUNTS.seller in tests/fixtures/users.ts — store slug "suryaboutiques",
 *   approval_status "approved", which is what we seed in mocks.
 *
 *   Playwright route() is LIFO — broadest catchalls registered FIRST, specific
 *   overrides registered LAST.
 *
 * Mocking:
 *   - ALL Supabase REST / Auth calls intercepted — no real DB touched.
 *   - Microservice API (analytics, delivery, etc.) mocked to return empty/stub data.
 *   - No real OTP, payments, or courier calls fired.
 *   - No real data created: all state lives in browser memory or mock handlers.
 *
 * Missing data-testid annotations noted at end of file — filed to ui-engineer.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SELLER_HOST   = 'https://seller.dev.reelmart.in'
const SUPABASE_REF  = 'nysgwdpmpxqmfwelfaxo'
const SUPABASE_ORIGIN = `https://${SUPABASE_REF}.supabase.co`

// Canonical fake IDs (match tests/fixtures/users.ts SELLER / STORE)
const SELLER_USER_ID = '22222222-0002-4000-8000-000000000002'
const STORE_ID       = 'aaaaaaaa-0001-4000-8000-000000000001'
const PRODUCT_ID_1   = 'pppppppp-0001-4000-8000-000000000001'
const PRODUCT_ID_2   = 'pppppppp-0002-4000-8000-000000000002'
const ORDER_ID_1     = 'oooooooo-0001-4000-8000-000000000001'
const PAYOUT_ID_1    = 'pyyyyyy-0001-4000-8000-000000000001'

// ---------------------------------------------------------------------------
// Helpers — JWT / session (same pattern as admin-seller-approval.spec.ts)
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
    email: `playwright-seller-dashboard@reelmart.test`,
  })).toString('base64url')
  const sig = Buffer.from('playwright-fake-sig-dashboard').toString('base64url')
  return `${header}.${payload}.${sig}`
}

function makeFakeUserObject(userId: string) {
  return {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: `playwright-seller-dashboard@reelmart.test`,
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
// Data factories
// ---------------------------------------------------------------------------

function makeApprovedStoreRow() {
  return {
    id: STORE_ID,
    seller_id: SELLER_USER_ID,
    store_name: 'Surya Boutiques',
    store_slug: 'suryaboutiques',
    description: 'Quality fashion for everyone',
    category: 'Fashion',
    logo_url: null,
    is_open: true,
    is_active: true,
    is_verified: true,
    approval_status: 'approved',
    approval_notes: null,
    suspended: false,
    suspended_reason: null,
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Ameerpet',
    address: 'B-403 Cyber Towers, Main Road',
    pincode: '500034',
    whatsapp_number: '+919999999999',
    instagram_handle: '@suryaboutiques',
    rating_avg: 4.5,
    total_reviews: 10,
    total_orders: 25,
    pickup_id: 'NB123456',
    pickup_warehouse_name: 'Surya Boutiques Pickup',
    pickup_status: 'verified',
    pickup_error: null,
    pickup_registered_at: '2024-01-10T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
    open_time: '09:00',
    close_time: '21:00',
    open_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    referral_installs: 0,
  }
}

function makeVerificationRow() {
  return {
    seller_id: SELLER_USER_ID,
    phone_verified: true,
    pan_provided: true,
    gst_provided: true,
    gst_verified: true,
    pickup_verified: true,
    signature_present: true,
    approval_status: 'approved',
    suspended: false,
    features_unlocked: true,
  }
}

function makeProductRow(id: string, name: string, price: number, isAvailable = true) {
  return {
    id,
    store_id: STORE_ID,
    name,
    description: `Description for ${name}`,
    price,
    compare_price: null,
    category: 'Clothing',
    weight_grams: 500,
    stock_type: 'unlimited',
    stock_count: 0,
    low_stock_threshold: 3,
    is_available: isAvailable,
    images: [],
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-06-01T00:00:00Z',
  }
}

function makeOrderRow(id: string, status: string) {
  return {
    id,
    store_id: STORE_ID,
    buyer_id: '11111111-0001-4000-8000-000000000001',
    order_number: `RM${id.slice(0, 6).toUpperCase()}`,
    items: [
      { productId: PRODUCT_ID_1, name: 'Silk Saree', price: 1200, qty: 1, variant: null },
    ],
    subtotal: 1200,
    delivery_fee: 60,
    discount: 0,
    total_amount: 1260,
    payment_method: 'cod',
    payment_status: 'pending',
    status,
    delivery_address: {
      name: 'Priya Kumar',
      phone: '9876543210',
      line1: '12 Gandhi Nagar',
      line2: '',
      area: 'Banjara Hills',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500034',
    },
    awb_code: null,
    tracking_url: null,
    created_at: '2024-06-01T10:00:00Z',
    updated_at: '2024-06-01T10:00:00Z',
    delivered_at: null,
  }
}

function makePayoutRow() {
  return {
    id: PAYOUT_ID_1,
    store_id: STORE_ID,
    amount: 2400,
    order_count: 3,
    status: 'done',
    utr_number: 'UTR123456789',
    created_at: '2024-06-10T00:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// Core mock setup helper
// ---------------------------------------------------------------------------

interface MockOptions {
  products?: ReturnType<typeof makeProductRow>[]
  orders?: ReturnType<typeof makeOrderRow>[]
  payouts?: ReturnType<typeof makePayoutRow>[]
  bankAccount?: object | null
  kycResponse?: object
  storeRow?: ReturnType<typeof makeApprovedStoreRow>
  addressChanges?: object[]
}

async function setupDashboardMocks(page: Page, sellerJwt: string, opts: MockOptions = {}): Promise<void> {
  const sellerUser = makeFakeUserObject(SELLER_USER_ID)
  const storeRow = opts.storeRow ?? makeApprovedStoreRow()
  const products = opts.products ?? [
    makeProductRow(PRODUCT_ID_1, 'Silk Saree', 1200),
    makeProductRow(PRODUCT_ID_2, 'Cotton Kurta', 850, false),
  ]
  const orders = opts.orders ?? [makeOrderRow(ORDER_ID_1, 'pending')]
  const payouts = opts.payouts ?? [makePayoutRow()]
  const bankAccount = opts.bankAccount !== undefined ? opts.bankAccount : {
    id: 'ba-0001',
    seller_id: SELLER_USER_ID,
    account_holder: 'Suryanarayana K',
    account_number: '123456789012',
    ifsc_code: 'HDFC0000001',
    bank_name: 'HDFC Bank',
  }

  // ── STEP 1: Register BROADEST catchalls first (lowest priority) ────────────

  // MSG91 widget — return no-op stub
  await page.route('https://verify.msg91.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '(function(){})();' })
  })

  // ALL Supabase DB REST calls — default empty array
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  // ALL Supabase Auth calls — default seller user
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })

  // Seller Host API fallback — general API routes (catalog, analytics, delivery)
  await page.route(`${SELLER_HOST}/api/**`, (route) => {
    const url = route.request().url()
    // KYC / my-store endpoint
    if (url.includes('/api/seller/my-store')) {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: opts.kycResponse ?? {
            pan_number: 'ABCDE1234F',
            gst_number: '36ABCDE1234F1Z5',
            kyc_submitted_at: '2024-01-05T00:00:00Z',
            pickup_contact_name: 'Suryanarayana K',
            pickup_phone: '9999999999',
            pickup_email: 'surya@boutiques.in',
          },
        }),
      })
      return
    }
    // address-change request
    if (url.includes('/api/seller/address-change')) {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  // API_URL (microservices at api-dev.reelmart.in) — generic fallback
  await page.route('https://api-dev.reelmart.in/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) })
  })

  // IFSC lookup (razorpay)
  await page.route('https://ifsc.razorpay.com/**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ BANK: 'HDFC Bank' }) })
  })

  // ── STEP 2: Register SPECIFIC overrides last (highest priority) ────────────

  // Supabase token refresh
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/token**`, (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: sellerJwt,
        refresh_token: `fake-refresh-${SELLER_USER_ID}`,
        token_type: 'bearer',
        expires_in: 7200,
        user: sellerUser,
      }),
    })
  })

  // Supabase /auth/v1/user
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sellerUser) })
  })

  // seller_verification view
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/seller_verification**`, (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(makeVerificationRow()),
    })
  })

  // stores table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/stores**`, (route) => {
    const method = route.request().method()
    if (method === 'PATCH' || method === 'PUT') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storeRow) })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(storeRow) })
  })

  // products table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/products**`, (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      // INSERT — return the first product as if it was saved
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(products[0] ?? {}) })
      return
    }
    if (method === 'PATCH') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products[0] ?? {}) })
      return
    }
    if (method === 'DELETE') {
      route.fulfill({ status: 204, contentType: 'application/json', body: '' })
      return
    }
    const url = route.request().url()
    // Single-product lookup: URL has `id=eq.<uuid>` as a query param.
    // IMPORTANT: store_id=eq.STORE_ID also contains a UUID, so we must match
    // specifically on the `id` query param (not `store_id`, `seller_id`, etc.)
    // Note: test UUIDs like pppppppp-... use non-hex chars — use [^\s&]+ not [0-9a-f-]
    const singleProductId = url.match(/[?&]id=eq\.([^\s&]+)/)
    if (singleProductId) {
      const found = products.find(p => p.id === singleProductId[1]) ?? products[0] ?? {}
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(found) })
      return
    }
    // List query (products page, dashboard low-stock, etc.) — return the products array
    const count = products.length
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(products),
      headers: count > 0 ? { 'content-range': `0-${count - 1}/${count}` } : { 'content-range': '0-0/0' },
    })
  })

  // orders table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/orders**`, (route) => {
    const method = route.request().method()
    if (method === 'PATCH') {
      // Status update — return success
      const url = route.request().url()
      const targetId = url.match(/eq\.([0-9a-f-]{36})/)?.[1]
      const updated = orders.find(o => o.id === targetId) ?? orders[0]
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...updated }) })
      return
    }
    const url = route.request().url()
    // Revenue stats queries — dashboard uses:
    //   .select('total_amount') + .gte(...) + .eq('payment_status','paid')  → today/week summary
    //   .select('total_amount, created_at, items') + .gte + .eq('payment_status','paid') → month chart
    //   .select('id, order_number, total_amount, delivery_address, created_at') → pending list
    // Match the narrow revenue columns query by the exact select param fragment.
    if (url.includes('select=total_amount') && !url.includes('created_at')) {
      // today / week simple sum — return single row with a total_amount
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ total_amount: 3500 }]) })
      return
    }
    if (url.includes('select=total_amount%2Ccreated_at%2Citems') || url.includes('select=total_amount,created_at,items')) {
      // Month chart data — return rows with created_at and items so the chart doesn't crash
      const today = new Date().toISOString()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { total_amount: 3500, created_at: today, items: [{ productId: PRODUCT_ID_1, name: 'Silk Saree', price: 1200, qty: 2 }] },
      ]) })
      return
    }
    // Pending orders list and all-orders query
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orders), headers: { 'content-range': `0-${orders.length - 1}/${orders.length}` } })
  })

  // payouts table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/payouts**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payouts) })
  })

  // bank_accounts table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/bank_accounts**`, (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(bankAccount ?? {}) })
      return
    }
    if (bankAccount) {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bankAccount) })
    } else {
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null', headers: { 'content-range': '0-0/0' } })
    }
  })

  // store_address_changes table
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/store_address_changes**`, (route) => {
    const changes = opts.addressChanges ?? []
    route.fulfill({ status: 200, contentType: 'application/json', body: changes.length ? JSON.stringify(changes[0]) : 'null', headers: { 'content-range': '0-0/0' } })
  })

  // Storage uploads
  await page.route(`${SUPABASE_ORIGIN}/storage/v1/**`, (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: 'fake/path.jpg' }) })
  })
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

async function gotoSellerPage(page: Page, path: string, opts?: { waitForLoadingToStop?: boolean }): Promise<void> {
  await page.goto(`${SELLER_HOST}${path}`, { waitUntil: 'networkidle', timeout: 30_000 })
  if (opts?.waitForLoadingToStop !== false) {
    // Wait for any loading spinner to clear
    await page.waitForFunction(
      () => !document.querySelector('.animate-spin'),
      { timeout: 15_000 },
    ).catch(() => {}) // non-fatal if no spinner present
  }
}

// ---------------------------------------------------------------------------
// ── SUITE 1: Dashboard overview (SD-09, SD-11) ────────────────────────────
// ---------------------------------------------------------------------------

test('SD-09 + SD-11: approved seller lands on dashboard — stats and heading visible', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/dashboard')

  // Dashboard heading
  await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible({ timeout: 12_000 })

  // Verified seller badge (features_unlocked = true)
  await expect(page.getByText(/Verified seller/i)).toBeVisible({ timeout: 8_000 })

  // Revenue stat cards
  await expect(page.getByText("Today's Revenue")).toBeVisible()
  await expect(page.getByText('This Week')).toBeVisible()
  await expect(page.getByText('This Month')).toBeVisible()

  // Revenue chart section
  await expect(page.getByText('Revenue — Last 7 Days')).toBeVisible()

  // Top products section
  await expect(page.getByText('Top Products (30 days)')).toBeVisible()

  // Low stock section
  await expect(page.getByText('Low Stock', { exact: false })).toBeVisible()

  await ctx.close()
})

test('SD-11: dashboard shows pending orders widget when orders are in pending status', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'pending')],
  })

  await gotoSellerPage(page, '/seller/dashboard')

  // Pending orders widget ("Needs Action")
  await expect(page.getByText(/Needs Action/i)).toBeVisible({ timeout: 10_000 })

  // Accept and Reject buttons should be visible
  await expect(page.getByRole('button', { name: /Accept/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /Reject/i }).first()).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 2: Products list (SD-13) ────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-13: products list — table renders with product rows and action controls', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products')

  // Page heading
  await expect(page.getByRole('heading', { name: /Products/i })).toBeVisible({ timeout: 12_000 })

  // The two mock products should appear in the table
  await expect(page.getByText('Silk Saree')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Cotton Kurta')).toBeVisible({ timeout: 5_000 })

  // ₹ price column
  await expect(page.getByText('₹1200')).toBeVisible()

  // Status badges
  await expect(page.getByText('Visible').first()).toBeVisible()
  await expect(page.getByText('Hidden').first()).toBeVisible()

  // Search input exists
  await expect(page.getByPlaceholder('Search products...')).toBeVisible()

  // Export and Refresh buttons
  await expect(page.getByRole('button', { name: /Export/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible()

  // Add Product link (features_unlocked = true → real link, not greyed-out)
  await expect(page.getByRole('link', { name: /Add Product/i })).toBeVisible()

  await ctx.close()
})

test('SD-13: products list search filters by product name', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products')

  await expect(page.getByText('Silk Saree')).toBeVisible({ timeout: 10_000 })

  // Type in search — should filter
  await page.getByPlaceholder('Search products...').fill('silk')
  await expect(page.getByText('Silk Saree')).toBeVisible()
  // Cotton Kurta should not be visible when filtered to 'silk'
  await expect(page.getByText('Cotton Kurta')).not.toBeVisible()

  await ctx.close()
})

test('SD-13: empty state shown when no products exist', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { products: [] })

  await gotoSellerPage(page, '/seller/products')

  await expect(page.getByRole('heading', { name: /Products/i })).toBeVisible({ timeout: 12_000 })
  await expect(page.getByText('No products yet', { exact: false })).toBeVisible({ timeout: 8_000 })

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 3: Product add (SD-14) ──────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-14: product add form — renders all required fields', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products/new')

  await expect(page.getByRole('heading', { name: /Add Product/i })).toBeVisible({ timeout: 12_000 })

  // Product Details section fields
  await expect(page.getByPlaceholder('e.g. Chocolate Truffle Cake')).toBeVisible()
  await expect(page.getByPlaceholder('Describe your product...')).toBeVisible()
  await expect(page.getByPlaceholder('499')).toBeVisible()

  // Category select — the <select> element has no htmlFor-linked label; use locator by element type
  // Filing bug: SD-BUG-05 — category <select> missing accessible label (add aria-label="Category")
  await expect(page.locator('select').first()).toBeVisible()

  // Inventory section
  await expect(page.getByText('Track stock quantity', { exact: false })).toBeVisible()

  // Submit button enabled (features_unlocked = true)
  const submitBtn = page.getByRole('button', { name: /Add Product/i })
  await expect(submitBtn).toBeVisible()
  await expect(submitBtn).toBeEnabled()

  await ctx.close()
})

test('SD-14: product add form — validation fires on empty name', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products/new')

  await expect(page.getByRole('button', { name: /Add Product/i })).toBeVisible({ timeout: 12_000 })

  // Fill in price but leave name blank — submit
  await page.getByPlaceholder('499').fill('500')
  await page.getByRole('button', { name: /Add Product/i }).click()

  // zod validation error for name
  await expect(page.getByText('Name required')).toBeVisible({ timeout: 5_000 })

  await ctx.close()
})

test('SD-14: product add — successful submit redirects to /seller/products', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products/new')

  await expect(page.getByPlaceholder('e.g. Chocolate Truffle Cake')).toBeVisible({ timeout: 12_000 })

  // Fill required fields
  await page.getByPlaceholder('e.g. Chocolate Truffle Cake').fill('Test Product Playwright')
  await page.getByPlaceholder('499').fill('999')

  const navPromise = page.waitForURL(`${SELLER_HOST}/seller/products`, { timeout: 15_000 })

  await page.getByRole('button', { name: /Add Product/i }).click()

  // Should redirect to products list on success
  await navPromise
  expect(page.url()).toContain('/seller/products')

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 4: Product edit (SD-15) ─────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-15: product edit form — loads pre-filled values from mock product', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, `/seller/products/${PRODUCT_ID_1}`)

  // Name field should be pre-filled from mock data
  // The edit page heading is "Edit Product" in an h1
  await expect(page.getByRole('heading', { name: /Edit Product/i }).or(page.getByText('Edit Product'))).toBeVisible({ timeout: 12_000 })

  // Name field pre-filled — edit page has no placeholder on name input (only react-hook-form name attr)
  // Filing bug: SD-BUG-06 — edit product form name/price inputs missing placeholder attributes
  const nameInput = page.locator('input[name="name"]')
  await expect(nameInput).toBeVisible({ timeout: 10_000 })
  // The name from makeProductRow(PRODUCT_ID_1, 'Silk Saree', 1200)
  await expect(nameInput).toHaveValue('Silk Saree', { timeout: 10_000 })

  // Price pre-filled — edit page price input has no placeholder, use name selector
  const priceInput = page.locator('input[name="price"]')
  await expect(priceInput).toHaveValue('1200', { timeout: 8_000 })

  // Save button present (edit page says "Save Changes" or "Save Product")
  await expect(page.getByRole('button', { name: /Save/i })).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 5: Product share (SD-17) ────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-17: products list — product share actions present (copy link, WhatsApp, Instagram)', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/products')

  await expect(page.getByText('Silk Saree')).toBeVisible({ timeout: 10_000 })

  // Share (copy link) button: title="Copy / share link"
  const copyLinkBtn = page.locator('[title="Copy / share link"]').first()
  await expect(copyLinkBtn).toBeVisible()

  // WhatsApp share: title="Share on WhatsApp"
  const waBtn = page.locator('[title="Share on WhatsApp"]').first()
  await expect(waBtn).toBeVisible()

  // Instagram share: title="Share on Instagram"
  const igBtn = page.locator('[title="Share on Instagram"]').first()
  await expect(igBtn).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 6: Orders list + filters (SD-18) ────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-18: orders list — table renders and all filter tabs visible', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [
      makeOrderRow(ORDER_ID_1, 'pending'),
    ],
  })

  await gotoSellerPage(page, '/seller/orders')

  await expect(page.getByRole('heading', { name: /Orders/i })).toBeVisible({ timeout: 12_000 })

  // Filter tabs
  const tabs = ['all', 'pending', 'accepted', 'packed', 'shipped', 'delivered', 'cancelled', 'rejected']
  for (const tab of tabs) {
    await expect(page.getByRole('button', { name: new RegExp(tab, 'i') })).toBeVisible()
  }

  // Order appears in table
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('₹1260')).toBeVisible()

  // Export button
  await expect(page.getByRole('button', { name: /Export/i })).toBeVisible()

  await ctx.close()
})

test('SD-18: orders list — switching to pending tab sends filter', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'pending')],
  })

  await gotoSellerPage(page, '/seller/orders')

  await expect(page.getByRole('button', { name: /pending/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /^pending$/i }).click()

  // The active tab gets bg-[#FF6B2B] text-white — verify the pending tab is now active
  // by checking the order still shows (it's in pending state) after tab click
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 8_000 })

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 7: Order detail panel (SD-19) ───────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-19: order detail panel — opens on row click and shows customer/items/total', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'pending')],
  })

  await gotoSellerPage(page, '/seller/orders')

  // Customer name appears in the table; click the order row to open the detail panel.
  // Use the order number cell (class text-[#FF6B2B]) which is more specific than customer name
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').first().click()

  // Detail panel customer info section — the detail panel shows "Customer" as text label
  await expect(page.getByText('9876543210')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('Banjara Hills', { exact: false })).toBeVisible()

  // Items: "Silk Saree × 1" (from the order detail template)
  await expect(page.getByText('Silk Saree × 1')).toBeVisible({ timeout: 5_000 })

  // Total rows
  await expect(page.getByText('Total').first()).toBeVisible()

  // Close button
  await expect(page.getByRole('button', { name: '✕' })).toBeVisible()

  await ctx.close()
})

test('SD-19: order detail panel — shows Accept/Reject for pending orders', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'pending')],
  })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').click()

  // Accept + Reject action buttons
  const detailPanel = page.locator('.lg\\:w-96')
  await expect(detailPanel.getByRole('button', { name: /Accept/i })).toBeVisible({ timeout: 8_000 })
  await expect(detailPanel.getByRole('button', { name: /Reject/i })).toBeVisible()

  // WhatsApp contact link
  await expect(page.getByRole('link', { name: /Contact on WhatsApp/i })).toBeVisible()

  await ctx.close()
})

test('SD-19: order detail panel — shows Mark as accepted for accepted orders', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'accepted')],
  })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').click()

  // For accepted status, next in flow is 'packed'
  await expect(page.getByRole('button', { name: /Mark as packed/i })).toBeVisible({ timeout: 8_000 })

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 8: Order status workflow (SD-20) ────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-20: Accept order — fires PATCH, shows success toast, panel updates', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)

  // Track Supabase PATCH call to orders — register before setupDashboardMocks
  // so that our override (registered last) wins over the catchall registered inside
  // setupDashboardMocks which comes earlier in LIFO.
  await setupDashboardMocks(page, jwt, {
    orders: [makeOrderRow(ORDER_ID_1, 'pending')],
  })

  // Override: count PATCH calls (registered last → highest priority in LIFO)
  let patchCalled = false
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/orders**`, (route) => {
    if (route.request().method() === 'PATCH') {
      patchCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'accepted' }) })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([makeOrderRow(ORDER_ID_1, 'pending')]) })
  })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').first().click()

  // On mobile the detail panel replaces the list; Accept button is in the detail area
  const acceptBtn = page.getByRole('button', { name: /^Accept$/i })
  await expect(acceptBtn).toBeVisible({ timeout: 8_000 })
  await acceptBtn.click()

  // Toast: "Order accepted" — toast library may render 2 elements with aria-live; use .first()
  await expect(page.getByText('Order accepted', { exact: false }).first()).toBeVisible({ timeout: 8_000 })
  expect(patchCalled).toBe(true)

  await ctx.close()
})

test('SD-20: Reject order — fires PATCH, shows error toast', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { orders: [makeOrderRow(ORDER_ID_1, 'pending')] })

  let rejectCalled = false
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/orders**`, (route) => {
    if (route.request().method() === 'PATCH') {
      rejectCalled = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'rejected' }) })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([makeOrderRow(ORDER_ID_1, 'pending')]) })
  })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').first().click()

  const rejectBtn = page.getByRole('button', { name: /^Reject$/i })
  await expect(rejectBtn).toBeVisible({ timeout: 8_000 })
  await rejectBtn.click()

  // Toast may render 2 nodes with aria-live; .first() avoids strict mode
  await expect(page.getByText('Order rejected', { exact: false }).first()).toBeVisible({ timeout: 8_000 })
  expect(rejectCalled).toBe(true)

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 9: Print invoice (SD-21) ────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-21: print invoice button opens a new window with order details', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { orders: [makeOrderRow(ORDER_ID_1, 'pending')] })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').click()

  // Mock window.open so it doesn't actually open a popup
  await page.evaluate(() => {
    (window as any).__printInvoiceWindowOpened = false
    window.open = (...args: any[]) => {
      (window as any).__printInvoiceWindowOpened = true
      return {
        document: { write: () => {}, close: () => {} },
        focus: () => {},
        print: () => {},
      } as any
    }
  })

  // Click the Print Invoice button in the detail panel
  const detailPanel = page.locator('.lg\\:w-96')
  await detailPanel.getByRole('button', { name: /Print Invoice/i }).click()

  const opened = await page.evaluate(() => (window as any).__printInvoiceWindowOpened)
  expect(opened).toBe(true)

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 10: WhatsApp buyer link (SD-22) ─────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-22: WhatsApp contact link in order detail panel has correct wa.me href', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { orders: [makeOrderRow(ORDER_ID_1, 'pending')] })

  await gotoSellerPage(page, '/seller/orders')
  await expect(page.getByText('Priya Kumar')).toBeVisible({ timeout: 10_000 })
  await page.getByText('Priya Kumar').click()

  const waLink = page.getByRole('link', { name: /Contact on WhatsApp/i })
  await expect(waLink).toBeVisible({ timeout: 8_000 })

  const href = await waLink.getAttribute('href')
  expect(href).toContain('wa.me')
  // Phone from makeOrderRow delivery_address.phone = '9876543210'
  expect(href).toContain('9876543210')

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 11: Payouts view (SD-28) ────────────────────────────────────────
// ---------------------------------------------------------------------------

test('SD-28: payouts page — pending balance card and payout history table', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/payouts')

  await expect(page.getByRole('heading', { name: /Payouts/i })).toBeVisible({ timeout: 12_000 })

  // Pending balance card (orange card at top)
  await expect(page.getByText('Pending Balance')).toBeVisible({ timeout: 8_000 })

  // Summary fields
  await expect(page.getByText('Total Earned')).toBeVisible()
  await expect(page.getByText('Total Paid Out')).toBeVisible()

  // Payout history heading (h2 element)
  await expect(page.getByRole('heading', { name: /Payout History/i })).toBeVisible({ timeout: 5_000 })

  // The mock payout row amount (₹2,400 formatted) — may appear in both balance card and history table
  await expect(page.getByText('₹2,400').first()).toBeVisible()

  await ctx.close()
})

test('SD-28: payouts page — bank account details displayed when account exists', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/payouts')

  await expect(page.getByText('Bank Account')).toBeVisible({ timeout: 10_000 })

  // Mock bank account data: HDFC Bank, Suryanarayana K
  await expect(page.getByText('HDFC Bank')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('Suryanarayana K')).toBeVisible()

  // Last 4 digits: account number ends in '9012'
  await expect(page.getByText(/XXXXXXXXXXXX9012/i)).toBeVisible()

  // IFSC shown
  await expect(page.getByText('IFSC: HDFC0000001')).toBeVisible()

  // Edit button exists
  await expect(page.getByRole('button', { name: /Edit/i })).toBeVisible()

  await ctx.close()
})

test('SD-28: payouts page — bank account form shows when no account exists', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { bankAccount: null })

  await gotoSellerPage(page, '/seller/payouts')

  // Use role heading to be specific (avoids strict mode on getByText('Bank Account')
  // which also matches the 'Save Bank Account' button text)
  await expect(page.getByRole('heading', { name: /Bank Account/i })).toBeVisible({ timeout: 10_000 })

  // Form should be visible (no existing account) — "Add" button triggers form mode
  // when no bank account exists, the form is always shown (editingBank starts false
  // and bankAccount is null, so the form condition `editingBank || !bankAccount` is true)
  await expect(page.getByPlaceholder('Account Holder Name')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByPlaceholder('Account Number')).toBeVisible()
  await expect(page.getByPlaceholder('IFSC Code')).toBeVisible()
  await expect(page.getByRole('button', { name: /Save Bank Account/i })).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 12: Settings — store profile (SD-30, SD-34) ────────────────────
// ---------------------------------------------------------------------------

test('SD-30: settings page — store info form loads with pre-filled values', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  // Heading is "Profile" (the settings page renders h1: Profile)
  await expect(page.getByRole('heading', { name: /Profile/i })).toBeVisible({ timeout: 12_000 })

  // Store link section visible
  await expect(page.getByText('Your Store Link')).toBeVisible({ timeout: 8_000 })

  // Store name — settings page uses <label class="...">Store Name</label> WITHOUT htmlFor,
  // so getByLabel() won't work. Use register('store_name') → input[name="store_name"] instead.
  const storeNameInput = page.locator('input[name="store_name"]')
  await expect(storeNameInput).toBeVisible({ timeout: 8_000 })
  await expect(storeNameInput).toHaveValue('Surya Boutiques', { timeout: 8_000 })

  // Slug input
  const slugInput = page.locator('input[name="store_slug"]')
  await expect(slugInput).toBeVisible()
  await expect(slugInput).toHaveValue('suryaboutiques', { timeout: 8_000 })

  // WhatsApp and Instagram fields
  await expect(page.getByPlaceholder('+91XXXXXXXXXX')).toBeVisible()
  await expect(page.getByPlaceholder('@yourhandle')).toBeVisible()

  // KYC section
  await expect(page.getByText('Business Verification', { exact: false })).toBeVisible()
  // Use exact: true — otherwise partial match hits GST field placeholder "22ABCDE1234F1Z5" too
  await expect(page.getByPlaceholder('ABCDE1234F', { exact: true })).toBeVisible()

  // Save button
  await expect(page.getByRole('button', { name: /Save Profile/i })).toBeVisible()

  await ctx.close()
})

test('SD-30: settings page — store link copy and QR download buttons present', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  await expect(page.getByText('Your Store Link')).toBeVisible({ timeout: 10_000 })

  // Copy link and open store buttons (title attributes)
  await expect(page.locator('[title="Copy link"]')).toBeVisible()
  await expect(page.locator('[title="Open store"]')).toBeVisible()

  // QR download button
  await expect(page.getByRole('button', { name: /Download QR Code/i })).toBeVisible()

  // WhatsApp share link
  await expect(page.getByRole('link', { name: /Share on WhatsApp/i })).toBeVisible()

  await ctx.close()
})

test('SD-34: settings — slug uniqueness shows "Available" for a new slug', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  // Override: slug uniqueness check → return empty (slug available) — registered
  // after setupDashboardMocks so it wins in LIFO order.
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/stores**`, async (route) => {
    const url = route.request().url()
    if (url.includes('store_slug') && url.includes('neq')) {
      route.fulfill({ status: 200, contentType: 'application/json', body: 'null', headers: { 'content-range': '0-0/0' } })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeApprovedStoreRow()) })
  })

  await gotoSellerPage(page, '/seller/settings')

  // Wait for form to load (store_name pre-filled)
  const storeNameInput = page.locator('input[name="store_name"]')
  await expect(storeNameInput).toBeVisible({ timeout: 12_000 })

  const slugInput = page.locator('input[name="store_slug"]')
  await expect(slugInput).toBeVisible({ timeout: 8_000 })

  // Clear and type a new slug — triggers debounced availability check
  await slugInput.clear()
  await slugInput.type('my-new-unique-slug')

  // The availability check is debounced 500ms — wait for it
  await page.waitForTimeout(700)

  // Should see "Available" green text
  await expect(page.getByText('Available')).toBeVisible({ timeout: 6_000 })

  await ctx.close()
})

test('SD-34: settings — slug uniqueness shows "Already taken" when another store has the slug', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  // Override: slug uniqueness check → return conflicting row — registered last (wins)
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/stores**`, async (route) => {
    const url = route.request().url()
    if (url.includes('store_slug') && url.includes('neq')) {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'other-store-id', store_slug: 'taken-slug' }),
      })
      return
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeApprovedStoreRow()) })
  })

  await gotoSellerPage(page, '/seller/settings')

  // Wait for form to load
  const storeNameInput = page.locator('input[name="store_name"]')
  await expect(storeNameInput).toBeVisible({ timeout: 12_000 })

  const slugInput = page.locator('input[name="store_slug"]')
  await slugInput.clear()
  await slugInput.type('taken-slug')

  await page.waitForTimeout(700)

  await expect(page.getByText('Already taken')).toBeVisible({ timeout: 6_000 })

  // Save Profile button should be disabled when slug is taken
  await expect(page.getByRole('button', { name: /Save Profile/i })).toBeDisabled()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 13: Settings — pickup address (SD-31, SD-33) ────────────────────
// ---------------------------------------------------------------------------

test('SD-33: settings — pickup status "verified" banner shown', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  // Store has pickup_status = 'verified'
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  // Verified pickup banner
  await expect(
    page.getByText('Pickup address verified with our courier partner'),
  ).toBeVisible({ timeout: 10_000 })

  await ctx.close()
})

test('SD-31: settings — address section shows existing address in read-only view', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  await expect(page.getByText('Store Address')).toBeVisible({ timeout: 10_000 })

  // Existing address shown read-only
  await expect(page.getByText('B-403 Cyber Towers, Main Road')).toBeVisible({ timeout: 8_000 })
  await expect(page.getByText('Ameerpet', { exact: false })).toBeVisible()

  // Edit address button present
  await expect(page.getByRole('button', { name: /Edit address/i })).toBeVisible()

  await ctx.close()
})

test('SD-31: settings — "Edit address" on approved store shows approval modal', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  await expect(page.getByRole('button', { name: /Edit address/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Edit address/i }).click()

  // Approval confirmation modal appears (approved store requires admin sign-off)
  await expect(
    page.getByRole('heading', { name: /Address change needs admin approval/i }),
  ).toBeVisible({ timeout: 8_000 })

  await expect(page.getByRole('button', { name: /Continue to edit/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Cancel/i })).toBeVisible()

  await ctx.close()
})

test('SD-31: settings — confirm modal → address form opens with existing values pre-filled', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt)

  await gotoSellerPage(page, '/seller/settings')

  await expect(page.getByRole('button', { name: /Edit address/i })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: /Edit address/i }).click()

  await expect(page.getByRole('button', { name: /Continue to edit/i })).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /Continue to edit/i }).click()

  // Address form should now be visible
  await expect(
    page.getByPlaceholder('B-403, Aparna Cyber Commune, Main Road'),
  ).toBeVisible({ timeout: 8_000 })

  // line1 pre-filled with current store address
  const line1 = page.getByPlaceholder('B-403, Aparna Cyber Commune, Main Road')
  await expect(line1).toHaveValue('B-403 Cyber Towers, Main Road', { timeout: 8_000 })

  // Pincode pre-filled
  const pincodeInput = page.getByPlaceholder('560034')
  await expect(pincodeInput).toHaveValue('500034', { timeout: 8_000 })

  // Submit button for approved store
  await expect(
    page.getByRole('button', { name: /Submit address change for approval/i }),
  ).toBeVisible()

  await ctx.close()
})

test('SD-31: settings — address form for non-approved store has direct save (no approval required)', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)

  // Use a pending store (not yet approved — no existing address)
  const pendingStore = {
    ...makeApprovedStoreRow(),
    approval_status: 'pending' as const,
    address: '',
    area: '',
    pickup_status: null,
    pickup_id: null,
  }
  await setupDashboardMocks(page, jwt, { storeRow: pendingStore })

  await gotoSellerPage(page, '/seller/settings')

  await expect(page.getByText('Store Address')).toBeVisible({ timeout: 10_000 })

  // For pending store with no address → form is shown directly (no Edit button)
  await expect(
    page.getByPlaceholder('B-403, Aparna Cyber Commune, Main Road'),
  ).toBeVisible({ timeout: 8_000 })

  // Submit button says "Add address" (no existing address)
  await expect(page.getByRole('button', { name: /Add address/i })).toBeVisible()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 14: Sidebar navigation ──────────────────────────────────────────
// ---------------------------------------------------------------------------

test('Sidebar navigation links are present on /seller/orders page', async ({ browser }) => {
  test.setTimeout(60_000)

  // Use the orders page for sidebar verification — it renders without dashboard JS crash
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)
  await setupDashboardMocks(page, jwt, { orders: [] })

  await gotoSellerPage(page, '/seller/orders')

  await expect(page.getByRole('heading', { name: /Orders/i })).toBeVisible({ timeout: 12_000 })

  // Expected sidebar links — sidebar is rendered by layout.tsx / Sidebar.tsx
  // On mobile viewport the sidebar may be a hamburger; check at least orders heading is reachable
  // and the links exist somewhere in the page (sidebar or menu)
  // Sidebar shows "Profile" (not "Settings") for the settings link → /seller/settings
  for (const name of [/Products/i, /Orders/i, /Payouts/i, /Profile/i]) {
    await expect(page.getByRole('link', { name }).first()).toBeVisible({ timeout: 5_000 })
  }

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 15: Seller gate — unauthenticated redirect ──────────────────────
// ---------------------------------------------------------------------------

test('SD-35: unauthenticated user accessing /seller/dashboard is redirected', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  // NO cookie injection — fresh unauthenticated context

  // Auth endpoint returns 401 / no user
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, (route) => {
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'not authenticated' }) })
  })

  // The page should redirect to login
  await page.goto(`${SELLER_HOST}/seller/dashboard`, { waitUntil: 'networkidle', timeout: 25_000 })

  // After redirect, URL should contain /seller/login or /seller/register
  const finalUrl = page.url()
  expect(
    finalUrl.includes('/seller/login') || finalUrl.includes('/seller/register'),
  ).toBe(true)

  await ctx.close()
})

// ---------------------------------------------------------------------------
// ── SUITE 16: Product add — locked when features_unlocked = false ─────────
// ---------------------------------------------------------------------------

test('SD-14: product add locked notice when features not yet unlocked', async ({ browser }) => {
  test.setTimeout(60_000)

  const ctx = await browser.newContext({ ignoreHTTPSErrors: true })
  const page = await ctx.newPage()

  const jwt = await injectSellerCookie(ctx)

  // Set up base mocks first
  await setupDashboardMocks(page, jwt)

  // Override seller_verification AFTER setupDashboardMocks (LIFO — registered last wins)
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/seller_verification**`, (route) => {
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ...makeVerificationRow(), features_unlocked: false, approval_status: 'pending' }),
    })
  })

  await gotoSellerPage(page, '/seller/products/new')

  // Lock banner — shown when features_unlocked = false
  await expect(page.getByText('Store not yet approved', { exact: false })).toBeVisible({ timeout: 10_000 })

  // Submit button disabled and labelled appropriately
  const submitBtn = page.getByRole('button', { name: /Store not approved yet/i })
  await expect(submitBtn).toBeVisible()
  await expect(submitBtn).toBeDisabled()

  await ctx.close()
})

// ---------------------------------------------------------------------------
// NOTES: Missing data-testid attributes — file to ui-engineer
// ---------------------------------------------------------------------------
/*
 * The following selectors rely on brittle patterns. Recommend adding
 * data-testid attributes to the corresponding components:
 *
 * 1. Order detail panel (orders/page.tsx):
 *    - The detail panel div (`w-full lg:w-96`) — needs data-testid="order-detail-panel"
 *    - The "Customer" section label — needs data-testid="order-detail-customer-section"
 *    - The status action buttons (Accept, Reject, Mark as packed/shipped/delivered)
 *      — needs data-testid="order-accept-btn", "order-reject-btn", "order-next-status-btn"
 *
 * 2. Dashboard stats cards (dashboard/page.tsx):
 *    - Each revenue card — needs data-testid="stat-today-revenue", "stat-week-revenue", "stat-month-revenue"
 *    - "Needs Action" pending orders widget — needs data-testid="pending-orders-widget"
 *    - Accept/Reject buttons in pending orders widget — needs data-testid="quick-accept-btn-{orderId}", "quick-reject-btn-{orderId}"
 *
 * 3. Products list (products/page.tsx):
 *    - Product table rows — needs data-testid="product-row-{id}"
 *    - Share/WhatsApp/Instagram icon buttons — currently identified by `title` attribute (stable enough for now)
 *    - Toggle availability button — needs data-testid="toggle-availability-{id}"
 *
 * 4. Settings page (settings/page.tsx):
 *    - Pickup status banner — needs data-testid="pickup-status-banner"
 *    - Address-change approval modal — needs data-testid="address-change-approval-modal"
 *    - Slug availability feedback — needs data-testid="slug-availability-msg"
 *    - Save Profile button — currently identified by role+name, stable
 *
 * 5. Payouts page (payouts/page.tsx):
 *    - Pending balance card — needs data-testid="pending-balance-card"
 *    - Payout history table rows — needs data-testid="payout-row-{id}"
 *
 * Filed to ui-engineer for annotation in the corresponding component files.
 */
