// Shared helper: append an event to order_status_events.
//
// This is fire-and-forget-safe — any error is logged but never re-thrown into
// the request path, matching the pattern in order-service src/lib/notify.ts.

import { supabaseAdmin } from './supabase'
import type { TrackingEvent, TrackingResult } from './nimbus'

// ---------------------------------------------------------------------------
// Canonical code → default title map.
// Web + mobile read these codes; keep values exactly in sync with the table
// comment in migration 033 and the order-service copy of this map.
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
 * `dedupKey` is provided, so re-runs (bulk-track cron, idempotent retries) are
 * safe. For one-off events without a dedupKey a plain insert is used.
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

// ---------------------------------------------------------------------------
// NimbusPost status_code → canonical event code
// ---------------------------------------------------------------------------

/**
 * Map a NimbusPost status_code (or free-text message) to a canonical event
 * code. Returns null for status codes that don't map to a meaningful event
 * (e.g. unknown / administrative codes we don't want to surface).
 *
 * Preserve `mapNimbusStatus` in delivery.ts for the legacy 5-step response —
 * this mapper is ONLY for the event-feed persistence path.
 */
export function mapNimbusStatusToCode(statusCode: string | undefined, message?: string): string | null {
  const s = (statusCode ?? '').toUpperCase().trim()
  const m = (message ?? '').toUpperCase()

  if (s === 'DL' || m.includes('DELIVERED') && !m.includes('OUT FOR DELIVERY') && !m.includes('UNDELIVERED')) return 'delivered'
  if (s === 'OFD' || m.includes('OUT FOR DELIVERY')) return 'out_for_delivery'
  if (s === 'RT-DL' || m.includes('RTO DELIVERED') || m.includes('RETURNED TO SELLER') || m.includes('RETURN DELIVERED')) return 'rto_delivered'
  if (s === 'RT' || s === 'RTO' || m.includes('RTO INITIATED') || m.includes('RETURN INITIATED') || m.includes('RETURNING TO')) return 'rto_initiated'
  if (s === 'EX' || s === 'NDR' || m.includes('UNDELIVERED') || m.includes('DELIVERY FAILED') || m.includes('DELIVERY ATTEMPT')) return 'delivery_failed'
  if (s === 'IT' || s === 'RT-IT' || m.includes('IN TRANSIT') || m.includes('IN-TRANSIT') || m.includes('INTRANSIT') || m.includes('TRANSIT')) return 'in_transit'
  if (s === 'PP' || m.includes('PICKED UP') || m.includes('PICKUP DONE') || (m.includes('PICKED') && m.includes('COURIER'))) return 'picked_up'

  // Unknown / not worth surfacing (e.g. "manifest", "label created", etc.)
  return null
}

// ---------------------------------------------------------------------------
// Sync a NimbusPost TrackingResult into order_status_events
// ---------------------------------------------------------------------------

/**
 * Iterate every scan in `tracking.history`, map each to a canonical event
 * code, and upsert a row into `order_status_events`.
 *
 * Dedup key: `courier:{awb}:{status_code}:{event_time}` — stable across
 * re-runs so the bulk-track cron is fully idempotent.
 *
 * Also updates `orders.status` and `orders.estimated_delivery` when the
 * tracking reveals a terminal or updated state.
 *
 * Never throws — per-scan errors are logged and skipped.
 */
export async function syncTrackingToEvents(
  orderId: string,
  awb: string,
  tracking: TrackingResult,
): Promise<void> {
  const history: TrackingEvent[] = tracking.history ?? []

  // Extract estimated_delivery from shipment_info if NimbusPost provides it.
  // NimbusPost's shipment_info shape is not documented; probe defensively.
  const shipmentInfo = tracking.shipment_info as Record<string, unknown> | null | undefined
  const rawEdd: unknown =
    shipmentInfo?.expected_delivery_date ??
    shipmentInfo?.expected_date ??
    shipmentInfo?.edd ??
    null
  const estimatedDelivery: string | null =
    typeof rawEdd === 'string' && rawEdd.trim()
      ? rawEdd.trim().slice(0, 10)   // keep YYYY-MM-DD portion only
      : null

  for (const scan of history) {
    try {
      const code = mapNimbusStatusToCode(scan.status_code, scan.message)
      if (!code) continue  // skip unmappable/administrative scans

      // Stable dedup key: courier:{awb}:{status_code}:{event_time}
      // event_time comes from NimbusPost; use raw string for stability.
      const dedupKey = `courier:${awb}:${scan.status_code ?? ''}:${scan.event_time ?? ''}`

      await recordOrderEvent({
        orderId,
        code,
        source: 'courier',
        description: scan.message ?? null,
        location: scan.location ?? null,
        occurredAt: scan.event_time ?? new Date().toISOString(),
        estimatedDelivery,
        meta: { awb, status_code: scan.status_code },
        dedupKey,
      })
    } catch (err: unknown) {
      // Per-scan failures must not abort the rest of the history
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[delivery] syncTrackingToEvents scan error', { awb, scan: scan.status_code, error: msg })
    }
  }

  // Update the order's status + estimated_delivery to reflect the latest
  // courier state. Only update to terminal/forward-progressing statuses.
  try {
    const overallCode = mapNimbusStatusToCode(tracking.status)
    const orderStatusMap: Record<string, string> = {
      delivered: 'delivered',
      rto_delivered: 'returned',
      rto_initiated: 'shipped',  // still in transit (return leg); stay at shipped
      delivery_failed: 'shipped', // NDR: order is still with courier
      in_transit: 'shipped',
      out_for_delivery: 'shipped',
      picked_up: 'shipped',
    }

    const orderUpdates: Record<string, unknown> = {}
    if (overallCode && orderStatusMap[overallCode]) {
      orderUpdates['status'] = orderStatusMap[overallCode]
      if (overallCode === 'delivered') orderUpdates['delivered_at'] = new Date().toISOString()
    }
    if (estimatedDelivery) {
      orderUpdates['estimated_delivery'] = estimatedDelivery
    }

    if (Object.keys(orderUpdates).length > 0) {
      const { error } = await supabaseAdmin
        .from('orders')
        .update(orderUpdates)
        .eq('id', orderId)
      if (error) {
        console.error('[delivery] syncTrackingToEvents order update failed', { orderId, error: error.message })
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[delivery] syncTrackingToEvents order update error', { orderId, error: msg })
  }
}
