-- Migration 039: Interstate buyer demand tracking for non-GST stores.
--
-- SUMMARY
-- -------
-- Records out-of-state buyer demand against a store that cannot serve them yet
-- because the seller has no admin-verified GST.  This data is surfaced in the
-- seller dashboard GST banner so sellers know "buyers from {state} tried to
-- order — add GST to unlock those orders."
--
-- One row per (store_id, buyer_state) pair; re-attempts increment `attempts`
-- and refresh `last_at` via ON CONFLICT DO UPDATE (upsert).
--
-- WRITES
-- ------
-- There are intentionally NO INSERT/UPDATE RLS policies.  All writes happen
-- exclusively through the order-service backend using the Supabase service-role
-- key, which bypasses RLS.  This avoids buyers being able to spam demand rows
-- directly via the client SDK.
--
-- READS
-- -----
-- • Sellers can SELECT rows for their own store(s).
-- • Admins (is_admin = true) can SELECT all rows.
--
-- ROLLBACK NOTE
-- -------------
-- To undo this migration:
--   DROP TABLE IF EXISTS public.interstate_demand;

-- ============================================================
-- SECTION A — Table
-- ============================================================

CREATE TABLE public.interstate_demand (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  buyer_state TEXT        NOT NULL,
  attempts    INTEGER     NOT NULL DEFAULT 1,
  first_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, buyer_state)
);

-- ============================================================
-- SECTION B — Index
-- ============================================================

-- The seller dashboard lookup pattern is always "all demand for my store",
-- so an index on store_id is the primary access path.
CREATE INDEX interstate_demand_store_idx ON public.interstate_demand (store_id);

-- ============================================================
-- SECTION C — Row Level Security
-- ============================================================

ALTER TABLE public.interstate_demand ENABLE ROW LEVEL SECURITY;

-- Sellers can read demand for their own stores.
CREATE POLICY "sellers see own interstate demand"
  ON public.interstate_demand FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM public.stores WHERE seller_id = auth.uid()
    )
  );

-- Admins can read all rows.
CREATE POLICY "admins see all interstate demand"
  ON public.interstate_demand FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    )
  );

-- No INSERT / UPDATE / DELETE policies: only the service-role backend writes here.

-- ============================================================
-- VERIFICATION NOTES (post-apply)
-- ============================================================
--
-- 1. Table + UNIQUE constraint:
--    SELECT conname, contype, conkey
--      FROM pg_constraint
--      WHERE conrelid = 'public.interstate_demand'::regclass
--        AND contype = 'u';
--    → 1 row; conname = 'interstate_demand_store_id_buyer_state_key'
--
-- 2. RLS enabled + policies:
--    SELECT relrowsecurity FROM pg_class
--      WHERE oid = 'public.interstate_demand'::regclass;
--    → relrowsecurity = true
--
--    SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'interstate_demand';
--    → 2 rows: "sellers see own interstate demand" (SELECT)
--              "admins see all interstate demand"  (SELECT)
--
-- 3. Upsert smoke-test (rolled-back tx — see below for live test guidance):
--    BEGIN;
--    INSERT INTO public.interstate_demand (store_id, buyer_state)
--      VALUES ('<a real store_id>', 'Maharashtra')
--      ON CONFLICT (store_id, buyer_state)
--      DO UPDATE SET attempts = interstate_demand.attempts + 1, last_at = now();
--    -- run twice → attempts = 2 on the second
--    ROLLBACK;
--
-- ============================================================
-- BACKEND / FRONTEND FOLLOW-UPS
-- ============================================================
-- • order-service: on INTERSTATE_GST trigger exception (from migration 038),
--   after returning the error to the buyer, also call an internal upsert:
--     INSERT INTO public.interstate_demand (store_id, buyer_state)
--     VALUES ($store_id, $buyer_state_from_delivery_address)
--     ON CONFLICT (store_id, buyer_state)
--     DO UPDATE SET attempts = interstate_demand.attempts + 1, last_at = now();
--   Use the service-role Supabase client so RLS is bypassed.
--
-- • Seller dashboard GST banner: query
--     GET /rest/v1/interstate_demand?store_id=eq.<id>&order=attempts.desc
--   (with seller JWT) and render "X buyers from {state} tried to order".
