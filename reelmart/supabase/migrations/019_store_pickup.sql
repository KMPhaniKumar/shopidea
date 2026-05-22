-- Migration 019: NimbusPost pickup-address registration per store
--
-- When an admin approves a store (and whenever the seller later edits their
-- address), we register the store's address as a NimbusPost pickup warehouse.
-- NimbusPost returns a warehouse identifier and may not verify the address
-- immediately, so we track the lifecycle here.

ALTER TABLE public.stores
  -- The identifier NimbusPost returns for the registered warehouse.
  ADD COLUMN IF NOT EXISTS pickup_id TEXT,
  -- The unique warehouse_name we register with NimbusPost and pass back in the
  -- shipment `pickup` block. Derived from the store id so it stays stable.
  ADD COLUMN IF NOT EXISTS pickup_warehouse_name TEXT,
  -- Lifecycle of the pickup registration:
  --   none      -> never attempted (no/incomplete address)
  --   pending   -> registered with NimbusPost but not yet verified
  --   verified  -> usable as a shipment pickup location
  --   failed    -> registration rejected (see pickup_error)
  ADD COLUMN IF NOT EXISTS pickup_status TEXT NOT NULL DEFAULT 'none'
    CHECK (pickup_status IN ('none', 'pending', 'verified', 'failed')),
  -- Last error / rejection reason from NimbusPost, surfaced to the seller.
  ADD COLUMN IF NOT EXISTS pickup_error TEXT,
  ADD COLUMN IF NOT EXISTS pickup_registered_at TIMESTAMPTZ;

-- Lets the delivery service quickly find stores whose pickup is still pending
-- verification (for the refresh/poll endpoint).
CREATE INDEX IF NOT EXISTS stores_pickup_status_idx ON public.stores (pickup_status);
