import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/store/interstate-demand
//
// Fire-and-forget: records (or increments) the demand signal when a buyer is
// blocked from ordering due to the interstate-GST rule.
//
// Body: { storeId: string (UUID), buyerState: string }
//
// Auth: none required — this is a public, intentionally low-privilege write.
// The table's RLS allows INSERT only via service_role (this route); reads are
// seller-only via the anon/authenticated key.
//
// Increment strategy:
//   1. INSERT a new row (attempts defaults to 1 per the table default).
//   2. On unique-key conflict (pg 23505), SELECT the existing row to read the
//      current attempts count, then UPDATE with attempts + 1 and last_at = now().
//      This avoids the `supabase.rpc` dependency on a specific DB function while
//      remaining correct under low-concurrency conditions (analytics counter,
//      not a transactional balance).

const VALID_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Title-case a single word: "KARNATAKA" → "Karnataka" */
function titleCaseWord(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * Normalise a buyer-state string:
 *  - trim whitespace
 *  - title-case each space-separated word
 *  - reject clearly invalid values (< 3 chars, contains digits)
 */
function normaliseBuyerState(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length < 3 || /\d/.test(trimmed)) return null
  return trimmed.split(/\s+/).map(titleCaseWord).join(' ')
}

function supabaseAdmin() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: NextRequest) {
  // ── Parse & validate body ──────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, error: 'Bad request' }, { status: 400 })
  }

  const { storeId, buyerState } = body as Record<string, unknown>

  if (typeof storeId !== 'string' || !VALID_UUID.test(storeId)) {
    return NextResponse.json({ success: false, error: 'storeId must be a valid UUID' }, { status: 400 })
  }

  if (typeof buyerState !== 'string' || !buyerState.trim()) {
    return NextResponse.json({ success: false, error: 'buyerState is required' }, { status: 400 })
  }

  const normalisedState = normaliseBuyerState(buyerState)
  if (!normalisedState) {
    return NextResponse.json(
      { success: false, error: 'buyerState does not look like an Indian state name' },
      { status: 400 },
    )
  }

  // ── Insert-or-increment via try-INSERT / on-conflict-UPDATE ───────────
  try {
    const admin = supabaseAdmin()

    // 1. Attempt a fresh INSERT. The table's DEFAULT for attempts is 1,
    //    so this is a clean single-row creation on first contact.
    const { error: insertErr } = await admin
      .from('interstate_demand')
      .insert({ store_id: storeId, buyer_state: normalisedState })

    if (!insertErr) {
      // First time this (store, state) pair was seen — row created, done.
      return NextResponse.json({ success: true })
    }

    if (insertErr.code !== '23505') {
      // Unexpected DB error (not a unique-violation) — log but don't surface.
      console.error('[interstate-demand] insert error:', insertErr.message)
      return NextResponse.json({ success: true })
    }

    // 2. Unique-key conflict: row already exists — increment the counter.
    //    Read current attempts so the UPDATE is a deterministic +1.
    const { data: existing } = await admin
      .from('interstate_demand')
      .select('attempts')
      .eq('store_id', storeId)
      .eq('buyer_state', normalisedState)
      .single()

    const nextAttempts = (existing?.attempts ?? 1) + 1

    const { error: updateErr } = await admin
      .from('interstate_demand')
      .update({ attempts: nextAttempts, last_at: new Date().toISOString() })
      .eq('store_id', storeId)
      .eq('buyer_state', normalisedState)

    if (updateErr) {
      console.error('[interstate-demand] update error:', updateErr.message)
    }
  } catch (err) {
    // Never throw to the client — this is fire-and-forget analytics.
    console.error('[interstate-demand] unexpected error:', err)
  }

  return NextResponse.json({ success: true })
}
