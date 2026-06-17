/**
 * Shared catalog for order_status_events — used by both OrderTimeline (web)
 * and the track page. Defines the code→stage mapping and the deriveTimelineState
 * helper that collapses an event list into the state a timeline needs.
 */

export type EventCode =
  | 'order_placed'
  | 'order_accepted'
  | 'order_packed'
  | 'shipment_booked'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivery_failed'
  | 'delivered'
  | 'rto_initiated'
  | 'rto_delivered'
  | 'order_cancelled'
  | 'order_rejected'
  | 'return_requested'
  | 'returned'

export interface OrderStatusEvent {
  id: string
  order_id: string
  code: string
  title: string
  description: string | null
  location: string | null
  source: string
  is_exception: boolean
  estimated_delivery: string | null
  occurred_at: string
  meta: Record<string, unknown> | null
  created_at: string
}

/** 0=Confirmed, 1=Shipped, 2=Out for delivery, 3=Delivered, -1=exception/terminal */
export type RailStage = 0 | 1 | 2 | 3 | -1

export interface EventMeta {
  railStage: RailStage
  icon: string
  label: string
  /** True when this code ends the happy path */
  isTerminal: boolean
  /** True when this is the exception path (cancelled/rejected/return/rto) */
  isException: boolean
}

const EXCEPTION_CODES = new Set<string>([
  'order_cancelled',
  'order_rejected',
  'rto_initiated',
  'rto_delivered',
  'return_requested',
  'returned',
])

const CODE_CATALOG: Record<string, EventMeta> = {
  order_placed:       { railStage: 0, icon: '🧾', label: 'Order placed',           isTerminal: false, isException: false },
  order_accepted:     { railStage: 0, icon: '✅', label: 'Order accepted',          isTerminal: false, isException: false },
  order_packed:       { railStage: 0, icon: '📦', label: 'Order packed',            isTerminal: false, isException: false },
  shipment_booked:    { railStage: 1, icon: '🏷️', label: 'Shipment booked',         isTerminal: false, isException: false },
  picked_up:          { railStage: 1, icon: '🚚', label: 'Picked up',               isTerminal: false, isException: false },
  in_transit:         { railStage: 1, icon: '📍', label: 'In transit',              isTerminal: false, isException: false },
  out_for_delivery:   { railStage: 2, icon: '🛵', label: 'Out for delivery',        isTerminal: false, isException: false },
  delivery_failed:    { railStage: 2, icon: '⚠️', label: 'Delivery attempted',      isTerminal: false, isException: true },
  delivered:          { railStage: 3, icon: '🎉', label: 'Delivered',               isTerminal: true,  isException: false },
  rto_initiated:      { railStage: -1, icon: '↩️', label: 'Return to origin',       isTerminal: false, isException: true },
  rto_delivered:      { railStage: -1, icon: '🏠', label: 'Returned to seller',     isTerminal: true,  isException: true },
  order_cancelled:    { railStage: -1, icon: '✕',  label: 'Order cancelled',        isTerminal: true,  isException: true },
  order_rejected:     { railStage: -1, icon: '✕',  label: 'Order rejected',         isTerminal: true,  isException: true },
  return_requested:   { railStage: -1, icon: '↩️', label: 'Return requested',       isTerminal: false, isException: true },
  returned:           { railStage: -1, icon: '↩️', label: 'Item returned',          isTerminal: true,  isException: true },
}

export function getEventMeta(code: string): EventMeta {
  return CODE_CATALOG[code] ?? { railStage: 0, icon: '●', label: code, isTerminal: false, isException: false }
}

export interface TimelineState {
  /** How far the 4-node progress rail is filled (0-3). -1 = exception/terminal */
  railStage: RailStage
  /** Buyer-facing headline from the latest event */
  headline: string
  /** Supporting text (description or friendly fallback) */
  subtext: string | null
  /** ISO date string for ETA, e.g. "2024-12-25" */
  etaDate: string | null
  /** True when the latest event is an exception (delivery_failed, cancelled, etc.) */
  isException: boolean
  /** True when delivered */
  isTerminalSuccess: boolean
  /** True when an exception terminates the order (cancelled/rejected/rto/returned) */
  isTerminalFailure: boolean
  /** The latest event */
  latestEvent: OrderStatusEvent | null
}

export function deriveTimelineState(events: OrderStatusEvent[]): TimelineState {
  if (!events.length) {
    return {
      railStage: 0,
      headline: 'Order placed',
      subtext: 'Your order has been received.',
      etaDate: null,
      isException: false,
      isTerminalSuccess: false,
      isTerminalFailure: false,
      latestEvent: null,
    }
  }

  // Events arrive ascending (oldest first). Latest = last.
  const latest = events[events.length - 1]
  const meta = getEventMeta(latest.code)

  // Collect the best ETA from the most recent event that has one.
  const etaDate =
    [...events]
      .reverse()
      .find(e => e.estimated_delivery != null)
      ?.estimated_delivery ?? null

  return {
    railStage: meta.railStage,
    headline: latest.title,
    subtext: latest.description ?? null,
    etaDate,
    isException: meta.isException || latest.is_exception,
    isTerminalSuccess: latest.code === 'delivered',
    isTerminalFailure: meta.isTerminal && (meta.isException || EXCEPTION_CODES.has(latest.code)),
    latestEvent: latest,
  }
}

/** Progress-rail node definitions for rendering */
export const RAIL_NODES: { label: string; stage: 0 | 1 | 2 | 3 }[] = [
  { label: 'Confirmed',         stage: 0 },
  { label: 'Shipped',           stage: 1 },
  { label: 'Out for delivery',  stage: 2 },
  { label: 'Delivered',         stage: 3 },
]

/** Format an ISO timestamp to Indian locale "DD/MM/YYYY, HH:MM AM/PM" */
export function formatIndianDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return iso
  }
}

/** Format a date-only string like "2024-12-25" to "25 Dec 2024" */
export function formatIndianDate(iso: string): string {
  try {
    // Parse as local date to avoid UTC-shift on a date-only value
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
