// Seed end-to-end test accounts (admin / seller / buyer) into Supabase.
//
// Idempotent: re-running updates the same accounts rather than duplicating.
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from reelmart/services/.env.
//
// Run from the repo root:
//   node reelmart/apps/web/scripts/seed-test-accounts.mjs
// Or from reelmart/apps/web/:
//   node scripts/seed-test-accounts.mjs
//
// Note: a DB trigger (handle_new_user) auto-creates the public.users row from
// the auth user's phone, so for each account we createUser → then UPSERT the
// row (role/name/is_admin), rather than inserting it ourselves.
//
// ── Canonical dev test accounts (SOURCE OF TRUTH — also in tests/fixtures/) ──
//
//  ADMIN   email:    admin@reelmart.test
//          password: ReelMartAdmin#2026
//          phone:    +910000000001  (fake — not for OTP)
//          login:    POST /api/admin/login with email+password
//          note:     e2e can do a real Supabase signInWithPassword via /api/admin/login
//                    which writes SSR cookies so the admin RSC layout passes.
//
//  SELLER  phone:    +919999999999
//          OTP:      123456 (MSG91 test number — configured in MSG91 dashboard)
//          store:    suryaboutiques  (Surya Boutiques, clothing, Hyderabad, Telangana)
//          login:    phone + OTP at /seller/login
//
//  BUYER   phone:    +919000000007
//          login:    no configured MSG91 test number — use Playwright session injection
//                    or the admin service-role to set a password for programmatic sign-in
//
//  COD_STORE  slug:  blue-whale  (Blue Whale Gifts, Bapatla, Andhra Pradesh)
//             seller: +919888000001 (dedicated COD store seller — not an OTP test number)
//             gst_verified: true  → interstate-GST block never fires for any buyer address
//             state:  Andhra Pradesh
//             note:   Used exclusively by tests/e2e/buyer-cod-checkout.spec.ts.
//                     The SSR storefront fetches this store live from Supabase on the
//                     Vercel edge; gst_verified=true ensures Place Order is never
//                     disabled regardless of buyer delivery state.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Resolve .env relative to this script regardless of CWD.
const ENV_PATH = resolve(__dirname, '../../../services/.env')

function loadEnv(path) {
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

const env = loadEnv(ENV_PATH)
const SUPABASE_URL = env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY in services/.env')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const syntheticEmail = (phone) => `${phone.replace(/\D/g, '')}@reelmart.local`

// Locate an existing auth user by phone digits or email (Supabase stores the
// auth phone without a leading '+', so we compare on digits).
async function findAuthUser({ phoneDigits, email }) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const hit = data.users.find(u =>
      (u.phone && u.phone.replace(/\D/g, '') === phoneDigits) || u.email === email)
    if (hit) return hit.id
    if (data.users.length < 200) break
  }
  return null
}

// Find-or-create an auth user, then upsert its public.users row (role/name).
// Returns the user's UUID.
async function upsertUser({ phone, email, password, name, role, isAdmin = false }) {
  const phoneDigits = phone.replace(/\D/g, '')

  // 1) Already mirrored in public.users? (phone may be stored with or without +)
  const { data: existing } = await db.from('users')
    .select('id').or(`phone.eq.${phone},phone.eq.${phoneDigits}`).maybeSingle()
  let id = existing?.id

  // 2) Otherwise look in auth, and create if truly absent.
  if (!id) id = await findAuthUser({ phoneDigits, email })
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      email, password, phone, email_confirm: true, phone_confirm: true,
      user_metadata: { role, seeded: true },
    })
    if (error) throw new Error(`createUser(${phone}): ${error.message}`)
    id = data.user.id
  } else if (password) {
    // Keep the password in sync so email/password login (admin) stays valid.
    await db.auth.admin.updateUserById(id, { password })
  }

  // 3) Upsert the public.users row (the auth trigger may have inserted a bare
  // one already; this normalises phone format + sets role/name/is_admin).
  const { error: upErr } = await db.from('users')
    .upsert({ id, phone, name, role, is_admin: isAdmin }, { onConflict: 'id' })
  if (upErr) throw new Error(`users.upsert(${phone}): ${upErr.message}`)
  return id
}

// Upsert a store row by slug. The service-role key is used throughout this
// script, so ownership checks are policy-level only — the seed is authoritative.
// Strategy:
//   1. If a store with this slug exists, update it in-place (regardless of
//      seller_id — the seed script owns all test stores). This handles the case
//      where a previous seed run created the store under a different seller UUID
//      because the seller auth user was re-created with a new id.
//   2. If no store with this slug exists but the given seller already has a store,
//      update that store's slug + fields.
//   3. Otherwise insert a new row.
// Returns the store id.
async function upsertStore(storeFields) {
  const { store_slug, seller_id } = storeFields

  // 1) Check by slug (unique constraint) — slug is the stable identity.
  const { data: bySlug } = await db.from('stores').select('id, seller_id')
    .eq('store_slug', store_slug).maybeSingle()

  if (bySlug) {
    if (bySlug.seller_id !== seller_id) {
      // The slug belongs to a different seller. For test seed purposes we update
      // the canonical fields (gst_verified, approval_status, etc.) but leave
      // seller_id unchanged to avoid reassigning orders/products.
      console.log(`  NOTE: slug "${store_slug}" owned by different seller — updating fields only (not reassigning owner)`)
      const { store_slug: _s, seller_id: _sid, ...updateFields } = storeFields
      const { error } = await db.from('stores').update(updateFields).eq('id', bySlug.id)
      if (error) throw new Error(`stores.update(${store_slug}): ${error.message}`)
    } else {
      const { error } = await db.from('stores').update(storeFields).eq('id', bySlug.id)
      if (error) throw new Error(`stores.update(${store_slug}): ${error.message}`)
    }
    return bySlug.id
  }

  // 2) No store with this slug: check if seller already has a store.
  const { data: bySeller } = await db.from('stores').select('id, store_slug')
    .eq('seller_id', seller_id).maybeSingle()

  if (bySeller) {
    // Seller has a different slug — update it to the canonical slug+fields.
    const { error } = await db.from('stores').update(storeFields).eq('id', bySeller.id)
    if (error) throw new Error(`stores.update(seller ${seller_id} → ${store_slug}): ${error.message}`)
    return bySeller.id
  }

  // 3) Truly new — insert.
  const { data, error } = await db.from('stores').insert(storeFields).select('id').single()
  if (error) throw new Error(`stores.insert(${store_slug}): ${error.message}`)
  return data.id
}

async function ensureProduct(storeId, productName, productFields) {
  const { data: existing } = await db.from('products')
    .select('id').eq('store_id', storeId).eq('name', productName).maybeSingle()
  if (existing) return existing.id
  const { data, error } = await db.from('products')
    .insert({ store_id: storeId, name: productName, ...productFields })
    .select('id').single()
  if (error) throw new Error(`products.insert(${productName}): ${error.message}`)
  return data.id
}

async function main() {
  console.log(`Seeding into ${SUPABASE_URL}\n`)

  // ── Admin (email + password login at /admin/login) ───────────────────────
  // The admin login route calls supabase.auth.signInWithPassword then writes
  // SSR session cookies, so Playwright can do a REAL login (no mock needed for
  // the auth gate) by POSTing to /api/admin/login.
  await upsertUser({
    phone: '+910000000001',
    email: 'admin@reelmart.test',
    password: 'ReelMartAdmin#2026',
    name: 'Test Admin',
    role: 'admin',
    isAdmin: true,
  })
  console.log('✓ Admin   admin@reelmart.test / ReelMartAdmin#2026  (is_admin=true)')
  console.log('          e2e: POST /api/admin/login with email+password → SSR cookies')

  // ── Seller (phone OTP login — 9999999999 / 123456 in MSG91 dashboard) ────
  const sellerId = await upsertUser({
    phone: '+919999999999',
    email: syntheticEmail('+919999999999'),
    password: null,
    name: 'Test Seller',
    role: 'seller',
  })

  // Canonical test store: suryaboutiques (Telangana).
  // Used by admin-seller-approval.spec.ts (as mock identity) and by any spec
  // that navigates to /store/suryaboutiques live.
  const surStoreId = await upsertStore({
    seller_id: sellerId,
    store_name: 'Surya Boutiques',
    store_slug: 'suryaboutiques',
    description: 'A seeded store for end-to-end testing.',
    category: 'clothing',
    city: 'Hyderabad',
    area: 'Banjara Hills',
    address: '12, Road No. 2, Banjara Hills',
    state: 'Telangana',
    pincode: '500034',
    whatsapp_number: '+919999999999',
    pan_number: 'ABCDE1234F',
    pan_verified: true,
    gst_number: '36ABCDE1234F1Z5',
    gst_verified: true,
    approval_status: 'approved',
    is_active: true,
    is_open: true,
    suspended: false,
  })
  await ensureProduct(surStoreId, 'Sample Kurta', {
    description: 'Cotton kurta — seeded test product.',
    price: 599,
    category: 'clothing',
    is_available: true,
    stock_type: 'unlimited',
    weight_grams: 300,
  })
  console.log('✓ Seller  +91 99999 99999  OTP: 123456  (store: suryaboutiques, Hyderabad, Telangana)')
  console.log('          gst_verified=true, pan_verified=true, approved, open')

  // ── COD checkout test store (blue-whale, Andhra Pradesh) ─────────────────
  // This store exists specifically for tests/e2e/buyer-cod-checkout.spec.ts.
  // The spec navigates to /store/blue-whale/checkout live (SSR fetches from DB).
  //
  // CRITICAL — gst_verified must be true:
  //   CheckoutClient.interstateGstBlock = (store.gst_verified !== true && states differ)
  //   With gst_verified=true the block is always false, so Place Order is never
  //   disabled regardless of the buyer delivery address state.
  //
  // state='Andhra Pradesh': the spec also mocks the pincode lookup to return AP,
  //   so states match as a belt-and-suspenders safety. But gst_verified=true is
  //   the authoritative fix (makes state matching irrelevant).
  const codSellerId = await upsertUser({
    phone: '+919888000001',
    email: syntheticEmail('+919888000001'),
    password: null,
    name: 'Blue Whale Seller',
    role: 'seller',
  })

  const blueWhaleStoreId = await upsertStore({
    seller_id: codSellerId,
    store_name: 'Blue Whale',
    store_slug: 'blue-whale',
    description: 'Gift and novelty store — seeded for COD checkout e2e tests.',
    category: 'home',
    city: 'Bapatla',
    area: 'Main Road',
    address: '45, Gandhi Road',
    state: 'Andhra Pradesh',
    pincode: '522101',
    whatsapp_number: '+919888000001',
    pan_number: 'BWPQS5678G',
    pan_verified: true,
    gst_number: '37BWPQS5678G1Z1',
    // gst_verified=true: disables interstate-GST block in CheckoutClient
    // so Place Order is enabled for buyers from any state (including the
    // Playwright mock buyer using pincode 523001 = Ongole, AP).
    gst_verified: true,
    approval_status: 'approved',
    is_active: true,
    is_open: true,
    suspended: false,
  })
  await ensureProduct(blueWhaleStoreId, 'Test Ice Cream', {
    description: 'Novelty ice cream — seeded product for COD checkout e2e.',
    price: 299,
    category: 'home',
    is_available: true,
    stock_type: 'unlimited',
    weight_grams: 500,
  })
  console.log('✓ COD store  blue-whale  (Blue Whale, Bapatla, Andhra Pradesh)')
  console.log('             gst_verified=true → Place Order always enabled')
  console.log('             BUG-COD-01 (slug missing) + BUG-COD-02 (gst block) both fixed')

  // ── Buyer (phone OTP — no MSG91 test number configured for 9000000007) ───
  // For e2e specs, Playwright injects a fake session cookie / mocks MSG91 —
  // direct OTP login is NOT needed for the buyer account.
  const buyerId = await upsertUser({
    phone: '+919000000007',
    email: syntheticEmail('+919000000007'),
    password: null,
    name: 'Test Buyer',
    role: 'buyer',
  })

  // Give the buyer a saved Karnataka address (same-state as suryaboutiques for
  // intrastate orders; the COD checkout spec uses a mocked AP address instead).
  try {
    const { data: addr } = await db.from('addresses').select('id').eq('user_id', buyerId).maybeSingle()
    if (!addr) {
      await db.from('addresses').insert({
        user_id: buyerId,
        label: 'Home',
        name: 'Test Buyer',
        phone: '+919000000007',
        line1: '45, 2nd Cross',
        area: 'Indiranagar',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560038',
        is_default: true,
      })
      console.log('✓ Buyer   +91 90000 00007  (saved address: Indiranagar, Bangalore, Karnataka)')
    } else {
      console.log('✓ Buyer   +91 90000 00007  (address already present)')
    }
  } catch (e) {
    console.log(`✓ Buyer   +91 90000 00007  (address skipped: ${e.message})`)
  }

  console.log('\n── Canonical test credentials (see also tests/fixtures/dev-accounts.ts) ──')
  console.log('Admin:    admin@reelmart.test / ReelMartAdmin#2026')
  console.log('Seller:   +91 9999999999 / OTP 123456  → store suryaboutiques')
  console.log('COD store: blue-whale (gst_verified=true, AP)')
  console.log('Buyer:    +91 9000000007 (no MSG91 test number — use mocked session in e2e)')
  console.log('\nDone.')
}

main().catch(err => { console.error('\n✗ Seed failed:', err.message); process.exit(1) })
