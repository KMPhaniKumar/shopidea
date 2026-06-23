/**
 * Canonical test identity fixtures.
 *
 * TWO DISTINCT LAYERS — read carefully:
 *
 *  1. API / unit test identities (BUYER, SELLER, ADMIN, STORE, …)
 *     These are RFC 4122 valid UUIDs used by Vitest/Supertest API authz tests
 *     that MOCK the Supabase auth.getUser() call. They do NOT correspond to
 *     real rows in the dev Supabase.
 *
 *  2. Dev Supabase (live DB) identities — DEV_ACCOUNTS
 *     These are the seed accounts applied by seed-test-accounts.mjs.
 *     They ARE real rows in the dev Supabase project nysgwdpmpxqmfwelfaxo.
 *     Playwright e2e tests use these for real sign-in flows.
 *
 * ── Dev Supabase live test accounts ─────────────────────────────────────────
 *
 *  ADMIN
 *    email:    admin@reelmart.test
 *    password: ReelMartAdmin#2026
 *    phone:    +910000000001  (synthetic — not a real OTP number)
 *    is_admin: true
 *    e2e flow: POST https://admin.dev.reelmart.in/api/admin/login
 *              with { email, password } → Supabase signInWithPassword writes
 *              SSR session cookies → admin RSC layout (getUser() server-side)
 *              sees a real session. No mocking needed for the auth gate.
 *    NOTE:     Do NOT use a fake/mock session for admin e2e. The admin dashboard
 *              layout is a Next.js RSC that calls supabase.auth.getUser() on the
 *              Vercel edge — Playwright cannot intercept server-side fetch.
 *              A real cookie-based sign-in is the only way to pass the gate.
 *
 *  SELLER (canonical seller test number — configured in MSG91 dashboard)
 *    phone:    +919999999999
 *    OTP:      123456
 *    store:    suryaboutiques (slug)
 *    e2e flow: phone OTP via MSG91 widget (mocked in Playwright specs)
 *    MSG91:    9999999999 IS the configured MSG91 test number (123456).
 *              No other numbers are configured; do not assume 9000000000 works.
 *
 *  COD_STORE  (dedicated store for buyer-cod-checkout.spec.ts)
 *    slug:       blue-whale
 *    store_name: Blue Whale
 *    state:      Andhra Pradesh
 *    pincode:    522101
 *    gst_verified: true
 *    Why gst_verified=true:
 *      CheckoutClient disables "Place Order" when:
 *        store.gst_verified !== true AND buyer state != store state
 *      Setting gst_verified=true means the interstate-GST block NEVER fires,
 *      regardless of buyer delivery address state — so the COD e2e happy path
 *      works with any mocked buyer address (including Ongole AP, pincode 523001).
 *    SSR note: /store/blue-whale/checkout fetches this store live from Supabase
 *      on the Vercel edge. The store MUST exist and be approved in the dev DB.
 *
 *  BUYER
 *    phone:    +919000000007
 *    MSG91:    NOT a configured test number — no OTP flow possible.
 *    e2e flow: Playwright injects a mocked Supabase session / mocks msg91-exchange
 *              (see buyer-cod-checkout.spec.ts). No real OTP needed.
 *
 * ── How to apply to dev ──────────────────────────────────────────────────────
 *
 *  cd reelmart && node apps/web/scripts/seed-test-accounts.mjs
 *
 *  Requires SUPABASE_URL + SUPABASE_SERVICE_KEY in reelmart/services/.env.
 *  The script is idempotent — safe to re-run.
 *
 * ── MSG91 test number note ───────────────────────────────────────────────────
 *
 *  Only 9999999999 / OTP 123456 is configured in the MSG91 dashboard.
 *  Test numbers live in the MSG91 dashboard (not in code). If admin or buyer
 *  need SMS-OTP-based e2e login, add those numbers to the MSG91 dashboard.
 *  For now: admin uses email+password; buyer uses mocked session injection.
 */

// ---------------------------------------------------------------------------
// Layer 1 — API / unit test mock identities (no real DB rows)
// ---------------------------------------------------------------------------

export const BUYER = {
  id: '11111111-0001-4000-8000-000000000001',
  phone: '+919999900001',
  role: 'buyer',
}

export const SELLER = {
  id: '22222222-0002-4000-8000-000000000002',
  phone: '+919999900002',
  role: 'seller',
}

export const ADMIN = {
  id: '33333333-0003-4000-8000-000000000003',
  phone: '+919999900003',
  role: 'admin',
}

export const OTHER_BUYER = {
  id: '99999999-0099-4000-8000-000000000099',
  phone: '+919999900099',
  role: 'buyer',
}

export const OTHER_SELLER = {
  id: '88888888-0088-4000-8000-000000000088',
  phone: '+919999900088',
  role: 'seller',
}

export const STORE = {
  id: 'aaaaaaaa-0001-4000-8000-000000000001',
  seller_id: SELLER.id,
  store_name: 'Test Store',
  store_slug: 'test-store',
  is_active: true,
}

export const OTHER_STORE = {
  id: 'bbbbbbbb-0002-4000-8000-000000000002',
  seller_id: OTHER_SELLER.id,
  store_name: 'Other Store',
  store_slug: 'other-store',
  is_active: true,
}

export const ORDER = {
  id: 'cccccccc-0001-4000-8000-000000000001',
  buyer_id: BUYER.id,
  store_id: STORE.id,
  order_number: 'RM1TEST',
  items: [{ productId: 'prod-1', name: 'Test Product', price: 500, qty: 2 }],
  subtotal: 1000,
  delivery_fee: 60,
  discount: 0,
  total_amount: 1060,
  payment_status: 'pending',
  status: 'pending',
  razorpay_order_id: 'order_test_razorpay_001',
  razorpay_payment_id: null,
  stores: {
    seller_id: SELLER.id,
    store_name: 'Test Store',
    store_slug: 'test-store',
  },
}

/** A fake Supabase auth user object (what auth.getUser resolves to) */
export function makeSupabaseUser(identity: { id: string; phone?: string }) {
  return {
    id: identity.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${identity.id}@test.local`,
    phone: identity.phone ?? '',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
}

/** Bearer token sentinel — always 'Bearer test-token-<id>' */
export function bearerToken(identity: { id: string }) {
  return `Bearer test-token-${identity.id}`
}

// ---------------------------------------------------------------------------
// Layer 2 — Live dev Supabase seeded accounts (real rows)
// Used by Playwright e2e tests that call the actual dev environment.
// ---------------------------------------------------------------------------

/**
 * Dev Supabase seeded accounts.
 * Applied by: node reelmart/apps/web/scripts/seed-test-accounts.mjs
 */
export const DEV_ACCOUNTS = {
  admin: {
    email: 'admin@reelmart.test',
    password: 'ReelMartAdmin#2026',
    phone: '+910000000001',
    role: 'admin' as const,
    isAdmin: true,
    loginUrl: 'https://admin.dev.reelmart.in/api/admin/login',
    note: 'Real email+password login via /api/admin/login → SSR cookies. Required for admin RSC e2e.',
  },
  seller: {
    phone: '+919999999999',
    phoneDigits: '9999999999',
    otp: '123456',
    role: 'seller' as const,
    store: {
      slug: 'suryaboutiques',
      name: 'Surya Boutiques',
      state: 'Telangana',
      city: 'Hyderabad',
      pincode: '500034',
      gstVerified: true,
      approvalStatus: 'approved' as const,
    },
    note: 'MSG91 test number 9999999999 → OTP 123456 (configured in MSG91 dashboard).',
  },
  codStore: {
    slug: 'blue-whale',
    name: 'Blue Whale',
    state: 'Andhra Pradesh',
    city: 'Bapatla',
    pincode: '522101',
    gstVerified: true,
    approvalStatus: 'approved' as const,
    note: 'Dedicated store for buyer-cod-checkout.spec.ts. gst_verified=true → interstate block never fires.',
  },
  buyer: {
    phone: '+919000000007',
    phoneDigits: '9000000007',
    role: 'buyer' as const,
    savedAddress: {
      state: 'Karnataka',
      city: 'Bangalore',
      pincode: '560038',
    },
    note: 'No MSG91 test number. e2e uses mocked session injection (see buyer-cod-checkout.spec.ts).',
  },
} as const
