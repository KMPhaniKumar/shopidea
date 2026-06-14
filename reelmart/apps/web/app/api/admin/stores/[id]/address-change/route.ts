import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { registerStorePickup } from '@/lib/pickup'

// PUT /api/admin/stores/[id]/address-change?action=approve|reject
// Admin approves or rejects a pending address-change request.
//
// approve:
//   - Loads the open pending request.
//   - Writes the proposed address back to stores.(address,area,city,state,pincode)
//     via service-role (authenticated role has REVOKE UPDATE on those columns).
//   - Marks the request approved (reviewed_by, reviewed_at).
//   - Re-registers the NimbusPost pickup with the new address (best-effort).
//   - Fires the approved notification (best-effort).
//
// reject:
//   - Requires ?reason= or a JSON body { reason }.
//   - Marks the request rejected + stores reason.
//   - Leaves stores address untouched.
//   - Fires the rejected notification (best-effort).

const supabaseAdminClient = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? ''

async function notifyApproved(storeId: string) {
  try {
    await fetch(`${API_URL}/api/notifications/address-change-approved`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_KEY,
      },
      body: JSON.stringify({ storeId }),
    })
  } catch {
    // best-effort — notification failure must not block the approval
  }
}

async function notifyRejected(storeId: string, rejectReason?: string) {
  try {
    await fetch(`${API_URL}/api/notifications/address-change-rejected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': INTERNAL_KEY,
      },
      body: JSON.stringify({ storeId, rejectReason }),
    })
  } catch {
    // best-effort
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const storeId = params.id
  const action = new URL(req.url).searchParams.get('action')

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json(
      { success: false, error: 'action must be approve or reject' },
      { status: 400 }
    )
  }

  // --- Auth: verify admin ---
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

  const admin = supabaseAdminClient()

  // --- Load the open pending request ---
  const { data: changeRequest, error: fetchErr } = await admin
    .from('store_address_changes')
    .select('id, store_id, proposed')
    .eq('store_id', storeId)
    .eq('status', 'pending')
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 })
  }
  if (!changeRequest) {
    return NextResponse.json(
      { success: false, error: 'No pending address change request found for this store' },
      { status: 404 }
    )
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    const proposed = changeRequest.proposed as {
      address: string
      area: string
      city: string
      state: string
      pincode: string
      contact_name?: string
      phone?: string
      email?: string
      gst_number?: string
    }

    // Apply the proposed address + pickup-contact to the stores row (service
    // role bypasses the column-level REVOKE on authenticated).
    const { error: storeUpdateErr } = await admin
      .from('stores')
      .update({
        address: proposed.address,
        area: proposed.area,
        city: proposed.city,
        state: proposed.state,
        pincode: proposed.pincode,
        ...(proposed.contact_name ? { pickup_contact_name: proposed.contact_name } : {}),
        ...(proposed.phone ? { pickup_phone: proposed.phone } : {}),
        ...(proposed.email !== undefined ? { pickup_email: proposed.email || null } : {}),
        ...(proposed.gst_number ? { gst_number: proposed.gst_number } : {}),
      })
      .eq('id', storeId)

    if (storeUpdateErr) {
      return NextResponse.json({ success: false, error: storeUpdateErr.message }, { status: 500 })
    }

    // Mark the request as approved.
    const { data: updated, error: reqUpdateErr } = await admin
      .from('store_address_changes')
      .update({ status: 'approved', reviewed_by: user.id, reviewed_at: now })
      .eq('id', changeRequest.id)
      .select('id, status, reviewed_at')
      .single()

    if (reqUpdateErr) {
      return NextResponse.json({ success: false, error: reqUpdateErr.message }, { status: 500 })
    }

    // Re-register the NimbusPost pickup with the new address (best-effort).
    const pickup = await registerStorePickup(storeId)

    // Notify the seller (best-effort).
    await notifyApproved(storeId)

    return NextResponse.json({ success: true, data: { request: updated, pickup } })
  }

  // action === 'reject'
  const REASON_MAX = 500
  let reason: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined
  } catch {
    reason = undefined
  }

  // Also allow ?reason= as a query param fallback.
  if (!reason) {
    reason = new URL(req.url).searchParams.get('reason')?.trim() ?? undefined
  }

  if (!reason) {
    return NextResponse.json(
      { success: false, error: 'A rejection reason is required' },
      { status: 400 }
    )
  }

  if (reason.length > REASON_MAX) {
    return NextResponse.json(
      { success: false, error: `Rejection reason must be ${REASON_MAX} characters or fewer` },
      { status: 400 }
    )
  }

  const { data: rejected, error: rejectErr } = await admin
    .from('store_address_changes')
    .update({
      status: 'rejected',
      reject_reason: reason,
      reviewed_by: user.id,
      reviewed_at: now,
    })
    .eq('id', changeRequest.id)
    .select('id, status, reject_reason, reviewed_at')
    .single()

  if (rejectErr) {
    return NextResponse.json({ success: false, error: rejectErr.message }, { status: 500 })
  }

  // Notify the seller (best-effort).
  await notifyRejected(storeId, reason)

  return NextResponse.json({ success: true, data: { request: rejected } })
}
