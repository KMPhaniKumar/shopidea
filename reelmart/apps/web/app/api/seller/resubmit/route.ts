import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/seller/resubmit
//
// Lets a seller whose store has approval_status='rejected' update their editable
// profile fields and re-queue the store for admin review (sets
// approval_status='pending', clears approval_notes).
//
// Ownership check: the caller's session cookie must resolve to the same user who
// owns the store. This runs BEFORE the service-role write, so an attacker cannot
// resubmit another seller's store.
//
// Guard: only a 'rejected' store can be resubmitted. 'pending' / 'approved' /
// 'suspended' stores return 409 Conflict.
//
// Editable fields (whitelist — these are the only fields the seller filled in
// during registration + address/KYC):
//   store_name, description,
//   address, area, city, state, pincode,
//   pickup_contact_name, pickup_phone, pickup_email,
//   pan_number, gst_number (setting gst_number also resets gst_verified=false)
//
// All other columns (approval_status, seller_id, id, store_slug, …) are set
// server-side only and cannot be spoofed via the request body.

const ALLOWED_FIELDS = new Set([
  'store_name',
  'description',
  'address',
  'area',
  'city',
  'state',
  'pincode',
  'pickup_contact_name',
  'pickup_phone',
  'pickup_email',
  'pan_number',
  'gst_number',
])

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  // --- Authenticate via SSR session cookie ---
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // --- Parse body ---
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  // --- Load the store via anon client (RLS validates seller_id = user.id) ---
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, seller_id, approval_status')
    .eq('seller_id', user.id)
    .maybeSingle()

  if (storeErr || !store) {
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
  }

  // Double-check ownership (belt-and-suspenders).
  if (store.seller_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // --- Guard: only rejected stores can be resubmitted ---
  if (store.approval_status !== 'rejected') {
    return NextResponse.json(
      {
        success: false,
        error: `Cannot resubmit: store is currently '${store.approval_status}'. Only rejected stores can be resubmitted.`,
      },
      { status: 409 }
    )
  }

  // --- Build the update payload from the whitelisted fields present in body ---
  const update: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.has(key)) continue
    // Skip null/undefined values — only apply fields the caller provided.
    if (value === null || value === undefined) continue
    // Strings: trim and reject empty (caller must send non-empty if present).
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') continue
      update[key] = trimmed
    } else {
      update[key] = value
    }
  }

  // Normalise PAN / GST to uppercase.
  if (typeof update.pan_number === 'string') {
    update.pan_number = update.pan_number.toUpperCase()
  }
  if (typeof update.gst_number === 'string') {
    update.gst_number = update.gst_number.toUpperCase()
    // Changing GST number invalidates the previous admin verification.
    update.gst_verified = false
  }

  // Always set these — the whole point of the route.
  update.approval_status = 'pending'
  update.approval_notes = null

  // --- Write via service-role (bypasses column revocations) ---
  const admin = supabaseAdmin()

  const { error: updateErr } = await admin
    .from('stores')
    .update(update)
    .eq('id', store.id)

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
