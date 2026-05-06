import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
  return NextResponse.json({ success: true, data })
}
