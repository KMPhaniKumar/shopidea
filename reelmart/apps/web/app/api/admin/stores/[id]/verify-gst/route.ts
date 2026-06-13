import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/admin/stores/[id]/verify-gst
//
// Admin-only action: sets stores.gst_verified = true after manual GST review.
// Mirrors the pattern in app/api/admin/stores/[id]/pan-verify/route.ts.
// Returns 400 if the store has no gst_number on file.

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAdmin()
    .from('users')
    .select('role, is_admin')
    .eq('id', user.id)
    .single()
  if (!(profile?.role === 'admin' || profile?.is_admin))
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  return null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin()
  if (denied) return denied

  // Guard: store must have a GST number before we can verify it
  const { data: store, error: fetchErr } = await supabaseAdmin()
    .from('stores')
    .select('id, gst_number')
    .eq('id', params.id)
    .single()

  if (fetchErr || !store)
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })

  if (!store.gst_number || store.gst_number.trim() === '')
    return NextResponse.json(
      { success: false, error: 'No GST number on file for this store' },
      { status: 400 }
    )

  const { data, error } = await supabaseAdmin()
    .from('stores')
    .update({ gst_verified: true })
    .eq('id', params.id)
    .select('id, store_name, gst_number, gst_verified')
    .single()

  if (error)
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, data })
}
