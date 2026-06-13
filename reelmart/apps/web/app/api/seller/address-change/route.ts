import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { z } from 'zod'

// POST /api/seller/address-change
// Seller submits a proposed address change. The address columns on stores are
// REVOKED from the authenticated role (migration 022), so direct client-side
// updates to those columns will fail. This server route uses the service-role
// client to write to store_address_changes, which is the only legal path for
// approved sellers to request an address update.

const ProposedAddressSchema = z.object({
  storeId: z.string().uuid(),
  proposed: z.object({
    address: z.string().min(5, 'Address is too short').max(300, 'Address is too long'),
    area: z.string().min(2, 'Area is required').max(100, 'Area is too long'),
    city: z.string().min(2, 'City is required').max(100, 'City is too long'),
    state: z.string().min(2, 'State is required').max(100, 'State is too long'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  }),
})

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  // --- Auth: resolve caller from SSR cookie session ---
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

  // --- Parse + validate body ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ProposedAddressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' },
      { status: 400 }
    )
  }

  const { storeId, proposed } = parsed.data

  // --- Ownership check (via anon client — RLS is the right gate here) ---
  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id, seller_id, approval_status')
    .eq('id', storeId)
    .single()

  if (storeErr || !store) {
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
  }
  if (store.seller_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // --- Onboarding stores (pending/rejected): write the address DIRECTLY ---
  // The store has no approved address yet, so there's nothing to "change" —
  // we just set the pickup address on the store row so the admin can see it
  // and verify the pickup before approving. The address columns are revoked
  // from the authenticated client (migration 024), so this must go through the
  // service-role client here. (Pickup registration with NimbusPost happens when
  // the admin approves the store.)
  if (store.approval_status !== 'approved') {
    const { error: setErr } = await supabaseAdmin()
      .from('stores')
      .update({
        address: proposed.address,
        area: proposed.area,
        city: proposed.city,
        state: proposed.state,
        pincode: proposed.pincode,
      })
      .eq('id', storeId)
    if (setErr) {
      return NextResponse.json({ success: false, error: setErr.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, data: { applied: true, pending: false } })
  }

  // --- Upsert via service-role client ---
  // The partial unique index (on store_id where status='pending') means a
  // second INSERT would fail. We UPDATE if one exists, INSERT otherwise.
  // Approach: use Supabase upsert with onConflict on the index columns.
  // Because the index is partial (where status='pending'), standard upsert
  // doesn't resolve it — instead we check for an existing pending row and
  // do an explicit UPDATE or INSERT.
  const admin = supabaseAdmin()

  const { data: existing } = await admin
    .from('store_address_changes')
    .select('id')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .maybeSingle()

  let result
  if (existing) {
    // UPDATE the existing pending row (supersede the old proposed address).
    const { data, error } = await admin
      .from('store_address_changes')
      .update({ proposed, requested_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id, store_id, proposed, status, requested_at')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    result = data
  } else {
    // INSERT a fresh pending request.
    const { data, error } = await admin
      .from('store_address_changes')
      .insert({
        store_id: storeId,
        proposed,
        status: 'pending',
        requested_at: new Date().toISOString(),
      })
      .select('id, store_id, proposed, status, requested_at')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    result = data
  }

  return NextResponse.json({ success: true, data: result })
}
