import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/admin/stores/[id]/pan-verify
//
// Admin-only action: sets stores.pan_verified = true after manual PAN review.
// Mirrors the pattern in app/api/admin/stores/[id]/route.ts.
// Verified by checking the session user's role = 'admin' via the users table.

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // --- Resolve and authorize caller ---
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

  // Check the caller is an admin
  const { data: caller } = await supabaseAdmin()
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .single()

  if (!caller || (caller.role !== 'admin' && !caller.is_admin)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // --- Set pan_verified = true ---
  const { data, error } = await supabaseAdmin()
    .from('stores')
    .update({ pan_verified: true })
    .eq('id', params.id)
    .select('id, store_name, pan_number, pan_verified')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, data })
}
