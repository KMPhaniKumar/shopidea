-- Migration 033: Order status event log (unified order→delivery timeline)
--
-- Backs the buyer-facing "all updates" timeline (web + buyer-app). Every
-- meaningful transition in an order's life — placed, accepted, packed,
-- shipment booked, courier scans (picked up / in transit / out for delivery /
-- delivery attempted-failed / delivered / RTO), cancellation, returns — is
-- appended here as an immutable event. Buyers read their own order's feed via
-- RLS + Supabase realtime; services write with the service role.
--
-- `code` is intentionally free TEXT (not a CHECK) so the courier sync can add
-- new states without a migration. Canonical codes (validated in app layer,
-- see services/*/src/lib/orderEvents + apps shared constants):
--   order_placed, order_accepted, order_packed, shipment_booked,
--   picked_up, in_transit, out_for_delivery, delivery_failed, delivered,
--   rto_initiated, rto_delivered, order_cancelled, order_rejected,
--   return_requested, returned

CREATE TABLE public.order_status_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,                 -- buyer-facing headline, e.g. "Out for delivery"
  description TEXT,                     -- detail / courier message / NDR reason
  location TEXT,                        -- optional courier scan location
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('system', 'seller', 'courier', 'buyer', 'admin')),
  is_exception BOOLEAN NOT NULL DEFAULT false,  -- failed delivery / RTO etc.
  estimated_delivery DATE,             -- revised ETA known at time of event
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB,                          -- raw courier payload / extra context
  -- Idempotency for the courier sync: stable key per (order, code, scan time)
  -- so re-running bulk-track never duplicates a scan event.
  dedup_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX order_status_events_order_idx
  ON public.order_status_events (order_id, occurred_at);

ALTER TABLE public.order_status_events ENABLE ROW LEVEL SECURITY;

-- Buyers read their own order's events
CREATE POLICY "Buyers see own order events"
  ON public.order_status_events FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid()));

-- Sellers read events for their store's orders
CREATE POLICY "Sellers see store order events"
  ON public.order_status_events FOR SELECT
  USING (order_id IN (
    SELECT o.id FROM public.orders o
    JOIN public.stores s ON s.id = o.store_id
    WHERE s.seller_id = auth.uid()
  ));

-- Admins read all
CREATE POLICY "Admins see all order events"
  ON public.order_status_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- NOTE: no INSERT/UPDATE/DELETE policies — writes happen only via the service
-- role (backend services), which bypasses RLS. The feed is append-only by design.

-- Supporting columns on orders for stages that lacked timestamps / ETA.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_delivery DATE;

-- Realtime: let buyer surfaces subscribe to live event inserts.
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_events;

-- ---------------------------------------------------------------------------
-- Backfill: synthesize events for existing orders from known timestamps so
-- current orders show a populated timeline immediately. Dedup keys prefixed
-- "backfill:" keep these distinct from future live/courier events.
-- ---------------------------------------------------------------------------

-- order_placed (every order)
INSERT INTO public.order_status_events (order_id, code, title, source, occurred_at, dedup_key)
SELECT id, 'order_placed', 'Order placed', 'system', created_at,
       'backfill:' || id || ':order_placed'
FROM public.orders
ON CONFLICT (dedup_key) DO NOTHING;

-- order_accepted
INSERT INTO public.order_status_events (order_id, code, title, source, occurred_at, dedup_key)
SELECT id, 'order_accepted', 'Order confirmed', 'seller', accepted_at,
       'backfill:' || id || ':order_accepted'
FROM public.orders WHERE accepted_at IS NOT NULL
ON CONFLICT (dedup_key) DO NOTHING;

-- order_packed (only where we can infer it shipped/packed; use shipped_at as lower bound if packed_at absent)
INSERT INTO public.order_status_events (order_id, code, title, source, occurred_at, dedup_key)
SELECT id, 'order_packed', 'Packed & ready', 'seller',
       COALESCE(packed_at, shipped_at), 'backfill:' || id || ':order_packed'
FROM public.orders
WHERE status IN ('packed','shipped','delivered','returned','return_requested')
  AND COALESCE(packed_at, shipped_at) IS NOT NULL
ON CONFLICT (dedup_key) DO NOTHING;

-- shipment_booked / shipped
INSERT INTO public.order_status_events (order_id, code, title, description, source, occurred_at, dedup_key)
SELECT id, 'shipment_booked', 'Shipment booked',
       NULLIF(courier_name, '') , 'courier', shipped_at,
       'backfill:' || id || ':shipment_booked'
FROM public.orders WHERE shipped_at IS NOT NULL
ON CONFLICT (dedup_key) DO NOTHING;

-- delivered
INSERT INTO public.order_status_events (order_id, code, title, source, occurred_at, dedup_key)
SELECT id, 'delivered', 'Delivered', 'courier', delivered_at,
       'backfill:' || id || ':delivered'
FROM public.orders WHERE delivered_at IS NOT NULL
ON CONFLICT (dedup_key) DO NOTHING;

-- cancelled / rejected / returned (use updated_at as best-known time)
INSERT INTO public.order_status_events (order_id, code, title, description, source, occurred_at, is_exception, dedup_key)
SELECT id,
       CASE status WHEN 'cancelled' THEN 'order_cancelled'
                   WHEN 'rejected'  THEN 'order_rejected'
                   WHEN 'returned'  THEN 'returned'
                   WHEN 'return_requested' THEN 'return_requested' END,
       CASE status WHEN 'cancelled' THEN 'Order cancelled'
                   WHEN 'rejected'  THEN 'Order rejected'
                   WHEN 'returned'  THEN 'Returned'
                   WHEN 'return_requested' THEN 'Return requested' END,
       NULLIF(rejection_reason, ''),
       'system', updated_at,
       status IN ('cancelled','rejected'),
       'backfill:' || id || ':' || status
FROM public.orders
WHERE status IN ('cancelled','rejected','returned','return_requested')
ON CONFLICT (dedup_key) DO NOTHING;
