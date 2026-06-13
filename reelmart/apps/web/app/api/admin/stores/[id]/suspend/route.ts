import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/admin/stores/[id]/suspend?action=suspend|unsuspend
//
// Admin-only action.
//   suspend:   suspended=true, suspended_reason=<body.reason>, suspended_at=now(), is_active=false
//   unsuspend: suspended=false, suspended_reason=null, suspended_at=null, is_active=true
//
// Mirrors the requireAdmin pattern from app/api/admin/stores/[id]/pan-verify/route.ts.

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
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdmin()
  if (denied) return denied

  const action = new URL(req.url).searchParams.get('action')

  if (action === 'unsuspend') {
    const { data, error } = await supabaseAdmin()
      .from('stores')
      .update({
        suspended: false,
        suspended_reason: null,
        suspended_at: null,
        is_active: true,
      })
      .eq('id', params.id)
      .select('id, store_name, suspended, suspended_reason, is_active')
      .single()

    if (error)
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, data })
  }

  if (action === 'suspend') {
    let body: { reason?: string } = {}
    try {
      body = await req.json()
    } catch {
      // body is optional JSON; fall through to validation below
    }

    const reason = (body.reason ?? '').trim()
    if (!reason)
      return NextResponse.json(
        { success: false, error: 'A suspension reason is required' },
        { status: 400 }
      )

    const { data, error } = await supabaseAdmin()
      .from('stores')
      .update({
        suspended: true,
        suspended_reason: reason,
        suspended_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', params.id)
      .select('id, store_name, suspended, suspended_reason, suspended_at, is_active')
      .single()

    if (error)
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })

    return NextResponse.json({ success: true, data })
  }

  return NextResponse.json(
    { success: false, error: 'action must be "suspend" or "unsuspend"' },
    { status: 400 }
  )
}
