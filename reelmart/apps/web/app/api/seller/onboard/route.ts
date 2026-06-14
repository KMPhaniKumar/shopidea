import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { hash } from 'bcryptjs'
import { z } from 'zod'

// POST /api/seller/onboard
//
// Saves the "Your details" registration step: full name (as per PAN), display
// name, PAN number, optional GST, and a bcrypt-hashed password (cost 10).
// Uses the service-role client for all writes because:
//   - users UPDATE RLS only grants non-privileged columns to `authenticated`;
//     password_hash is excluded from that grant.
//   - stores INSERT/UPSERT — the store row is new at this point for a fresh
//     registration coming directly from OTP; we want a predictable upsert on
//     conflict (seller_id).
//
// The password is NEVER logged or returned.

const schema = z.object({
  full_name: z.string().min(2, 'Full name required (min 2 chars)').max(100),
  display_name: z.string().min(2, 'Display name required').max(100),
  pan_number: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format (e.g. ABCDE1234F)'),
  gst_number: z
    .string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      'Invalid GSTIN format'
    )
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  // --- Resolve the caller ---
  // Registration calls this immediately after a client-side setSession(), BEFORE
  // any navigation, so the SSR auth cookies aren't reliably established yet.
  // Prefer an explicit `Authorization: Bearer <access_token>` (validated directly
  // against Supabase Auth); fall back to the SSR session cookie for other callers.
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const authHeader = req.headers.get('authorization') ?? ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : null

  const { data: { user } } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // --- Validate body ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' },
      { status: 422 }
    )
  }

  const { full_name, display_name, pan_number, gst_number, password } = parsed.data

  // --- Hash the password (cost 10) server-side only ---
  const password_hash = await hash(password, 10)

  const admin = supabaseAdmin()

  // --- Update users row ---
  const { error: userErr } = await admin
    .from('users')
    .update({
      full_name: full_name.trim(),
      password_hash,
    })
    .eq('id', user.id)

  if (userErr) {
    return NextResponse.json({ success: false, error: userErr.message }, { status: 400 })
  }

  // --- Upsert the store row (create or update on conflict seller_id) ---
  const storePayload: Record<string, unknown> = {
    seller_id: user.id,
    store_name: display_name.trim(),
    pan_number: pan_number.trim().toUpperCase(),
    is_active: false,
    is_open: true, // open by default; seller can toggle Open/Closed from the dashboard
    approval_status: 'pending',
  }
  if (gst_number && gst_number.trim() !== '') {
    storePayload.gst_number = gst_number.trim().toUpperCase()
  }

  // Use insert with onConflict so an existing store row (e.g. re-submission)
  // just updates the relevant fields.
  const { data: store, error: storeErr } = await admin
    .from('stores')
    .upsert(storePayload, { onConflict: 'seller_id', ignoreDuplicates: false })
    .select('id, store_name, pan_number')
    .single()

  if (storeErr) {
    return NextResponse.json({ success: false, error: storeErr.message }, { status: 400 })
  }

  // Never log/return password or hash
  return NextResponse.json({
    success: true,
    data: {
      store_id: store.id,
      store_name: store.store_name,
      pan_number: store.pan_number,
    },
  })
}
