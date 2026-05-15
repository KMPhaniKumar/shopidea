-- Migration 018: Track whether the buyer was notified of order placement
--
-- Used by the order-placed notification flow to make it idempotent: the
-- web checkout calls /api/notifications/order-placed after a successful
-- order insert; the endpoint only fires once per order.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT false;
