import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { registerStorePickup } from '@/lib/pickup'

// POST /api/seller/pickup/sync  { storeId }
// Called by the seller Settings page after the address is saved, so a verified
// pickup gets re-registered with NimbusPost when the address changes. Pickups
// for not-yet-approved stores are skipped — they register at approval time.
export async function POST(req: NextRequest) {
  const { storeId } = await req.json().catch(() => ({}))
  if (!storeId) return NextResponse.json({ success: false, error: 'storeId required' }, { status: 400 })

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  // Confirm the caller owns this store before touching its pickup.
  const { data: store } = await supabase
    .from('stores').select('id, seller_id, approval_status').eq('id', storeId).single()
  if (!store || store.seller_id !== user.id) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // Only approved stores have (or should have) a registered pickup.
  if (store.approval_status !== 'approved') {
    return NextResponse.json({ success: true, data: { skipped: 'not_approved' } })
  }

  const pickup = await registerStorePickup(storeId)
  return NextResponse.json({ success: true, data: { pickup } })
}
