/**
 * orderEvents.ts — Mobile mirror of web/lib/orderEvents.ts
 *
 * Canonical code→stage catalog + deriveTimelineState.
 * Keep in sync with the web version so both surfaces behave identically.
 */

import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

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

/** Row shape from public.order_status_events (not yet in generated types) */
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
  isTerminal: boolean
  isException: boolean
}

export interface TimelineState {
  railStage: RailStage
  headline: string
  subtext: string | null
  etaDate: string | null
  isException: boolean
  isTerminalSuccess: boolean
  isTerminalFailure: boolean
  latestEvent: OrderStatusEvent | null
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

const EXCEPTION_CODES = new Set<string>([
  'order_cancelled',
  'order_rejected',
  'rto_initiated',
  'rto_delivered',
  'return_requested',
  'returned',
])

const CODE_CATALOG: Record<string, EventMeta> = {
  order_placed:     { railStage: 0,  icon: 'receipt',        label: 'Order placed',       isTerminal: false, isException: false },
  order_accepted:   { railStage: 0,  icon: 'checkmark',      label: 'Order accepted',     isTerminal: false, isException: false },
  order_packed:     { railStage: 0,  icon: 'cube',           label: 'Order packed',       isTerminal: false, isException: false },
  shipment_booked:  { railStage: 1,  icon: 'tag',            label: 'Shipment booked',    isTerminal: false, isException: false },
  picked_up:        { railStage: 1,  icon: 'car',            label: 'Picked up',          isTerminal: false, isException: false },
  in_transit:       { railStage: 1,  icon: 'location',       label: 'In transit',         isTerminal: false, isException: false },
  out_for_delivery: { railStage: 2,  icon: 'bicycle',        label: 'Out for delivery',   isTerminal: false, isException: false },
  delivery_failed:  { railStage: 2,  icon: 'warning',        label: 'Delivery attempted', isTerminal: false, isException: true  },
  delivered:        { railStage: 3,  icon: 'checkmark-done', label: 'Delivered',          isTerminal: true,  isException: false },
  rto_initiated:    { railStage: -1, icon: 'return-up-back', label: 'Return to origin',   isTerminal: false, isException: true  },
  rto_delivered:    { railStage: -1, icon: 'home',           label: 'Returned to seller', isTerminal: true,  isException: true  },
  order_cancelled:  { railStage: -1, icon: 'close',          label: 'Order cancelled',    isTerminal: true,  isException: true  },
  order_rejected:   { railStage: -1, icon: 'close',          label: 'Order rejected',     isTerminal: true,  isException: true  },
  return_requested: { railStage: -1, icon: 'refresh',        label: 'Return requested',   isTerminal: false, isException: true  },
  returned:         { railStage: -1, icon: 'refresh',        label: 'Item returned',      isTerminal: true,  isException: true  },
}

export function getEventMeta(code: string): EventMeta {
  return (
    CODE_CATALOG[code] ?? {
      railStage: 0,
      icon: 'ellipse',
      label: code,
      isTerminal: false,
      isException: false,
    }
  )
}

/** Progress-rail node definitions (4-node rail) */
export const RAIL_NODES: { label: string; stage: 0 | 1 | 2 | 3 }[] = [
  { label: 'Confirmed',        stage: 0 },
  { label: 'Shipped',          stage: 1 },
  { label: 'Out for delivery', stage: 2 },
  { label: 'Delivered',        stage: 3 },
]

// ─── deriveTimelineState ──────────────────────────────────────────────────────

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

  // Events are ascending (oldest first). Latest = last.
  const latest = events[events.length - 1]
  const meta = getEventMeta(latest.code)

  // Best ETA = the most recent event that carries an estimated_delivery
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
    isTerminalFailure:
      meta.isTerminal && (meta.isException || EXCEPTION_CODES.has(latest.code)),
    latestEvent: latest,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** "DD/MM/YYYY, HH:MM AM/PM" */
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

/** "DD MMM YYYY" from a date-only "YYYY-MM-DD" */
export function formatIndianDate(iso: string): string {
  try {
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

// ─── Supabase data + realtime ─────────────────────────────────────────────────

export async function fetchOrderEvents(
  orderId: string
): Promise<OrderStatusEvent[]> {
  const { data, error } = await supabase
    .from('order_status_events' as any)
    .select('*')
    .eq('order_id', orderId)
    .order('occurred_at', { ascending: true })

  if (error) {
    console.error('[orderEvents] fetch error', error.message)
    return []
  }
  return (data ?? []) as OrderStatusEvent[]
}

/**
 * Subscribe to new INSERTs on order_status_events filtered by orderId.
 * Returns the RealtimeChannel; call supabase.removeChannel(channel) on unmount.
 */
export function subscribeToOrderEvents(
  orderId: string,
  onInsert: (event: OrderStatusEvent) => void
) {
  return supabase
    .channel(`order-events-${orderId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_status_events',
        filter: `order_id=eq.${orderId}`,
      },
      payload => onInsert(payload.new as OrderStatusEvent)
    )
    .subscribe()
}
