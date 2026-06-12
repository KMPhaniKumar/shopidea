-- Migration 021: NimbusPost shipment metadata fields on orders
--
-- When delivery-service calls POST /create-shipment and NimbusPost responds,
-- we persist two additional fields alongside the existing awb_code /
-- tracking_url columns:
--
--   label_url    — the courier-generated shipping-label PDF URL returned by
--                  NimbusPost (used by the seller's pack/ship view to print
--                  the label without a separate API call).
--   courier_name — the human-readable courier assigned by NimbusPost
--                  (e.g. "Bluedart", "DTDC"). Surfaced in the seller order
--                  detail and buyer tracking page.
--
-- Both are nullable: orders that were placed before this migration, or orders
-- that ship via a method that doesn't return these values, simply have NULL.
-- No backfill is needed.
--
-- RLS impact: none. These are plain columns on the existing `orders` row.
-- The existing policies already cover all access paths:
--   - "Sellers update order status" (FOR UPDATE on store's orders) allows
--     the delivery-service (running with the service-role key, which bypasses
--     RLS) to write these columns when it updates status to 'shipped'.
--   - "Sellers see store orders" and "Buyers see own orders" (FOR SELECT)
--     already return the full row, so both new columns are automatically
--     readable by the relevant party without any policy change.
--   - "Admins see all orders" (FOR ALL) covers admin reads/writes.
-- No new policies are required.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS courier_name TEXT;
