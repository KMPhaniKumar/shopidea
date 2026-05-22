// Seed end-to-end test accounts (admin / seller / buyer) into Supabase.
//
// Idempotent: re-running updates the same accounts rather than duplicating.
// Reads SUPABASE_URL + SUPABASE_SERVICE_KEY from reelmart/services/.env.
//
// Run from the repo:  node apps/web/scripts/seed-test-accounts.mjs
// (Lives under apps/web so it can resolve @supabase/supabase-js.)
//
// Note: a DB trigger (handle_new_user) auto-creates the public.users row from
// the auth user's phone, so for each account we createUser → then UPDATE the
// row (role/name/is_admin), rather than inserting it ourselves.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
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

async function main() {
  console.log(`Seeding into ${SUPABASE_URL}\n`)

  // ── Admin (email + password login at /admin/login) ───────────────────────
  const adminId = await upsertUser({
    phone: '+910000000001',
    email: 'admin@reelmart.test',
    password: 'ReelMartAdmin#2026',
    name: 'Test Admin',
    role: 'admin',
    isAdmin: true,
  })
  console.log('✓ Admin   admin@reelmart.test / ReelMartAdmin#2026')

  // ── Seller (phone OTP login at /seller/login) ────────────────────────────
  const sellerId = await upsertUser({
    phone: '+919999999999',
    email: syntheticEmail('+919999999999'),
    password: null, // OTP bridge sets the real password on login
    name: 'Test Seller',
    role: 'seller',
  })

  // Approved store with full pickup details so the dashboard is unlocked.
  const storeFields = {
    seller_id: sellerId,
    store_name: 'Test Bazaar',
    store_slug: 'test-bazaar',
    description: 'A seeded store for end-to-end testing.',
    category: 'clothing',
    city: 'Bangalore',
    area: 'Koramangala',
    address: '12, 5th Block, Koramangala',
    state: 'Karnataka',
    pincode: '560034',
    whatsapp_number: '+919999999999',
    pan_number: 'ABCDE1234F',
    approval_status: 'approved',
    is_active: true,
    is_open: true,
  }
  const { data: existingStore } = await db.from('stores').select('id').eq('seller_id', sellerId).maybeSingle()
  let storeId = existingStore?.id
  if (storeId) {
    await db.from('stores').update(storeFields).eq('id', storeId)
  } else {
    const { data, error } = await db.from('stores').insert(storeFields).select('id').single()
    if (error) throw new Error(`stores.insert: ${error.message}`)
    storeId = data.id
  }
  console.log('✓ Seller  +91 99999 99999  (store: Test Bazaar /test-bazaar, approved)')

  // A visible product so the storefront + buyer flow has something to order.
  const { data: existingProduct } = await db.from('products')
    .select('id').eq('store_id', storeId).eq('name', 'Sample Tee').maybeSingle()
  if (!existingProduct) {
    const { error } = await db.from('products').insert({
      store_id: storeId,
      name: 'Sample Tee',
      description: 'Soft cotton t-shirt — seeded test product.',
      price: 499,
      category: 'clothing',
      is_available: true,
      stock_type: 'unlimited',
    })
    if (error) throw new Error(`products.insert: ${error.message}`)
  }
  console.log('  └ product: Sample Tee (₹499, visible)')

  // ── Buyer (phone OTP login; storefront checkout) ─────────────────────────
  const buyerId = await upsertUser({
    phone: '+919000000007',
    email: syntheticEmail('+919000000007'),
    password: null,
    name: 'Test Buyer',
    role: 'buyer',
  })

  // Give the buyer a saved address so the "existing buyer" path is testable.
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
      console.log('✓ Buyer   +91 90000 00007  (with a saved address)')
    } else {
      console.log('✓ Buyer   +91 90000 00007')
    }
  } catch (e) {
    console.log(`✓ Buyer   +91 90000 00007  (address skipped: ${e.message})`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('\n✗ Seed failed:', err.message); process.exit(1) })
