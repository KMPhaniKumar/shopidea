// Shared helper: append an event to order_status_events.
//
// This is fire-and-forget-safe — any error is logged but never re-thrown into
// the request path, matching the pattern in order-service and delivery-service.
//
// Standalone copy: payment-service compiles independently; do not import from
// another service.

import { supabaseAdmin } from './supabase'

// ---------------------------------------------------------------------------
// Canonical code → default title map.
// Web + mobile read these codes; keep values exactly in sync with the table
// comment in migration 033 and the copies in order-service / delivery-service.
// ---------------------------------------------------------------------------
export const EVENT_TITLES: Record<string, string> = {
  order_placed: 'Order placed',
  order_accepted: 'Order confirmed',
  order_packed: 'Packed & ready',
  shipment_booked: 'Shipment booked',
  picked_up: 'Picked up by courier',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivery_failed: "Delivery attempted — couldn't deliver",
  delivered: 'Delivered',
  rto_initiated: 'Return to seller started',
  rto_delivered: 'Returned to seller',
  order_cancelled: 'Order cancelled',
  order_rejected: 'Order rejected',
  return_requested: 'Return requested',
  returned: 'Returned',
}

// Codes whose is_exception defaults to true when not explicitly set by the caller.
const EXCEPTION_CODES = new Set([
  'delivery_failed',
  'rto_initiated',
  'rto_delivered',
  'order_cancelled',
  'order_rejected',
  'returned',
])

export interface RecordEventParams {
  orderId: string
  code: string
  title?: string           // defaults to EVENT_TITLES[code] if omitted
  description?: string | null
  location?: string | null
  source: 'system' | 'seller' | 'courier' | 'buyer' | 'admin'
  isException?: boolean    // defaults to EXCEPTION_CODES membership
  estimatedDelivery?: string | null  // ISO date string (YYYY-MM-DD)
  occurredAt?: string      // ISO timestamptz; defaults to now
  meta?: Record<string, unknown> | null
  dedupKey?: string | null // set for any event that could be written more than once
}

/**
 * Append one event to `order_status_events`.
 *
 * Uses upsert with `onConflict: 'dedup_key'` + `ignoreDuplicates: true` when
 * `dedupKey` is provided, so re-runs (idempotent retries) are safe.
 * For one-off events without a dedupKey a plain insert is used.
 *
 * Never throws — all failures are logged with console.error.
 */
export async function recordOrderEvent(params: RecordEventParams): Promise<void> {
  try {
    const {
      orderId,
      code,
      title,
      description = null,
      location = null,
      source,
      isException,
      estimatedDelivery = null,
      occurredAt,
      meta = null,
      dedupKey = null,
    } = params

    const row = {
      order_id: orderId,
      code,
      title: title ?? EVENT_TITLES[code] ?? code,
      description,
      location,
      source,
      is_exception: isException !== undefined ? isException : EXCEPTION_CODES.has(code),
      estimated_delivery: estimatedDelivery ?? null,
      occurred_at: occurredAt ?? new Date().toISOString(),
      meta,
      dedup_key: dedupKey,
    }

    if (dedupKey) {
      const { error } = await supabaseAdmin
        .from('order_status_events')
        .upsert(row, { onConflict: 'dedup_key', ignoreDuplicates: true })
      if (error) {
        console.error('[orderEvents] upsert failed', { code, orderId, error: error.message })
      }
    } else {
      const { error } = await supabaseAdmin
        .from('order_status_events')
        .insert(row)
      if (error) {
        console.error('[orderEvents] insert failed', { code, orderId, error: error.message })
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[orderEvents] unexpected error', { code: params.code, orderId: params.orderId, error: msg })
  }
}
