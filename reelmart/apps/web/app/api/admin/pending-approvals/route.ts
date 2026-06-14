import { NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// GET /api/admin/pending-approvals
//
// Lightweight feed for the admin dashboard's live notification popups. Returns
// the stores awaiting approval (new seller registrations) and the pending
// store_address_changes (new address-change requests). Admin-only; reads via
// the service-role client (RLS/column grants would otherwise hide pending,
// not-yet-active stores from the authenticated role).

export const dynamic = 'force-dynamic'

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function GET() {
  // --- Auth: verify the caller is an admin ---
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const admin = supabaseAdmin()

  const [sellersRes, changesRes] = await Promise.all([
    admin
      .from('stores')
      .select('id, store_name, created_at, users:seller_id(name, phone)')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('store_address_changes')
      .select('id, store_id, requested_at, stores!store_id(store_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(25),
  ])

  const sellers = (sellersRes.data ?? []).map((s: any) => ({
    id: s.id as string,
    store_name: (s.store_name as string) ?? 'New store',
    phone: (s.users?.phone as string) ?? null,
    created_at: s.created_at as string,
  }))

  const addressChanges = (changesRes.data ?? []).map((c: any) => ({
    id: c.id as string,
    storeId: c.store_id as string,
    store_name: (c.stores?.store_name as string) ?? 'A store',
    requested_at: c.requested_at as string,
  }))

  return NextResponse.json({ success: true, data: { sellers, addressChanges } })
}
