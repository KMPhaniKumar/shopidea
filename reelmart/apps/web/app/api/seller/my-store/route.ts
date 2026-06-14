import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// GET /api/seller/my-store
//
// Returns the authenticated seller's own store row, including the KYC fields
// (pan_number, gst_number, kyc_submitted_at) and the pickup-contact fields.
//
// These KYC columns are NOT accessible to the `authenticated` Supabase role
// after migration 024 — direct client-side select('*') on stores will omit
// them.  This server route uses the service_role key to read all columns, then
// verifies the caller owns the store via their SSR session before returning.

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function GET() {
  // --- Resolve the caller from their SSR session cookie ---
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

  // --- Fetch the store row via service_role (bypasses column grants) ---
  const admin = supabaseAdmin()

  const { data: store, error } = await admin
    .from('stores')
    .select(
      'id, seller_id, pan_number, gst_number, kyc_submitted_at, pickup_contact_name, pickup_phone, pickup_email'
    )
    .eq('seller_id', user.id)
    .single()

  if (error || !store) {
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
  }

  // Ownership is implicitly guaranteed by querying with seller_id = user.id,
  // but double-check in case of a future schema change.
  if (store.seller_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    success: true,
    data: {
      pan_number: store.pan_number ?? null,
      gst_number: store.gst_number ?? null,
      kyc_submitted_at: store.kyc_submitted_at ?? null,
      pickup_contact_name: store.pickup_contact_name ?? null,
      pickup_phone: store.pickup_phone ?? null,
      pickup_email: store.pickup_email ?? null,
    },
  })
}
