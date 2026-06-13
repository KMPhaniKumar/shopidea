import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { registerStorePickup } from '@/lib/pickup'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Resolve the caller from the SSR session and confirm they're an admin
// (server-side, via service role — never trust client-supplied role). Returns
// an error response if not an admin, else null.
async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabaseAdmin()
    .from('users').select('role, is_admin').eq('id', user.id).single()
  if (!(profile?.role === 'admin' || profile?.is_admin)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const action = new URL(req.url).searchParams.get('action')

  let update: Record<string, unknown> | null = null

  if (action === 'activate') {
    update = { is_active: true }
  } else if (action === 'deactivate') {
    update = { is_active: false }
  } else if (action === 'approve') {
    update = { approval_status: 'approved', is_active: true }
  } else if (action === 'reject') {
    update = { approval_status: 'rejected', is_active: false }
  }

  if (!update) {
    return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('stores')
    .update(update)
    .eq('id', params.id)
    .select('id, store_name, is_active, approval_status')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 })

  // On approval, register the seller's address as a NimbusPost pickup warehouse.
  // Best-effort: a courier hiccup must not block the store going live — the
  // pickup can be retried later, and shipments fall back to the platform
  // warehouse until this store's pickup is verified.
  let pickup = null
  if (action === 'approve') {
    pickup = await registerStorePickup(params.id)
  }

  return NextResponse.json({ success: true, data: { ...data, pickup } })
}
