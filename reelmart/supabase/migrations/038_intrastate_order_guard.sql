-- Migration 038: Intrastate order guard for sellers without GST verification.
--
-- SUMMARY
-- -------
-- A seller who has not had their GST verified by an admin (stores.gst_verified = false)
-- cannot legally receive inter-state orders under Indian GST law.  This migration
-- adds a BEFORE INSERT trigger on public.orders that raises an exception when:
--
--   1. The store's gst_verified flag is false (or NULL — treated as false).
--   2. The store has a known state (stores.state IS NOT NULL and non-empty).
--   3. The delivery address carries a state field that differs (case-insensitive)
--      from the store's state.
--
-- The exception uses ERRCODE='check_violation' and a message starting with
-- "INTERSTATE_GST:" so the application layer can detect the prefix and show a
-- localised error message to the buyer.
--
-- SECURITY DEFINER is used so the function can query public.stores even when
-- the inserting role (authenticated buyer) would ordinarily need a JOIN through
-- the stores SELECT RLS policies.  The SET search_path = public prevents
-- search-path injection.
--
-- This trigger fires for every INSERT on public.orders regardless of the client
-- (Supabase JS, REST, service_role bypass does NOT skip triggers — triggers fire
-- for ALL roles including service_role).  Orders inserted by the order-service
-- backend that already validated the state check will pass through transparently
-- because gst_verified=true stores are never blocked.
--
-- BACKWARD COMPATIBILITY
-- ----------------------
-- No columns are added or removed.  The trigger only adds enforcement logic;
-- existing rows are untouched.  Stores without a state (state IS NULL or '') are
-- excluded from enforcement to avoid blocking sellers who haven't filled in their
-- state yet — they would otherwise be blocked from all orders.
--
-- ROLLBACK NOTE
-- -------------
-- To remove this guard:
--   DROP TRIGGER IF EXISTS orders_intrastate_guard ON public.orders;
--   DROP FUNCTION IF EXISTS public.enforce_intrastate_for_non_gst();

-- ============================================================
-- SECTION A — Guard function
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_intrastate_for_non_gst()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_state TEXT;
  s_gst   BOOLEAN;
  d_state TEXT;
BEGIN
  -- Fetch the store's state and GST verification flag.
  -- Uses SECURITY DEFINER so this SELECT succeeds even when the inserting
  -- client is an authenticated buyer whose RLS access to stores is limited.
  SELECT state, gst_verified
    INTO s_state, s_gst
    FROM public.stores
    WHERE id = NEW.store_id;

  -- Extract the delivery state from the JSONB address field; strip whitespace
  -- and treat an empty string as NULL so we don't do a spurious compare.
  d_state := NULLIF(btrim(NEW.delivery_address->>'state'), '');

  -- Block only when ALL of the following are true:
  --   • seller has no admin-verified GST                (gst_verified is false/null)
  --   • store's own state is known and non-empty        (s_state is not null/blank)
  --   • delivery address carries a known state          (d_state is not null)
  --   • the two states differ (case-insensitive match)  (lower() comparison)
  --
  -- If gst_verified=true, or either state is unknown, the INSERT passes through.
  IF COALESCE(s_gst, false) = false
     AND s_state IS NOT NULL AND btrim(s_state) <> ''
     AND d_state IS NOT NULL
     AND lower(btrim(s_state)) <> lower(d_state) THEN
    RAISE EXCEPTION 'INTERSTATE_GST: This seller can deliver only within % (no GST on file)', s_state
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- SECTION B — Trigger on public.orders
-- ============================================================

-- Drop and recreate so this migration is idempotent (safe to re-run).
DROP TRIGGER IF EXISTS orders_intrastate_guard ON public.orders;

CREATE TRIGGER orders_intrastate_guard
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intrastate_for_non_gst();

-- ============================================================
-- VERIFICATION NOTES (for post-apply checks)
-- ============================================================
--
-- 1. Function exists:
--    SELECT proname, prosecdef, provolatile
--      FROM pg_proc
--      WHERE proname = 'enforce_intrastate_for_non_gst'
--        AND pronamespace = 'public'::regnamespace;
--    → 1 row; prosecdef = true (SECURITY DEFINER); provolatile = 'v' (VOLATILE)
--
-- 2. Trigger is attached to orders:
--    SELECT tgname, tgenabled, tgtype
--      FROM pg_trigger
--      WHERE tgname = 'orders_intrastate_guard'
--        AND tgrelid = 'public.orders'::regclass;
--    → 1 row; tgenabled = 'O' (origin + local); tgtype includes BEFORE + ROW + INSERT
--
-- 3. Logic simulation (run in a transaction, then ROLLBACK):
--
--    BEGIN;
--
--    -- Optionally override a store's state and gst_verified for the test:
--    -- UPDATE public.stores SET state = 'Telangana', gst_verified = false
--    --   WHERE id = '<your_store_id>';
--
--    -- a) Inter-state order for a non-GST store → MUST raise INTERSTATE_GST
--    INSERT INTO public.orders ( store_id, buyer_id, items, subtotal, total_amount,
--                                delivery_address, payment_method )
--    VALUES (
--      '<non_gst_store_id>',
--      '<buyer_id>',
--      '[{"product_id":"...","qty":1,"price":100}]'::jsonb,
--      100, 100,
--      '{"name":"Test","state":"Maharashtra","pincode":"400001"}'::jsonb,
--      'cod'
--    );
--    -- Expected: ERROR: INTERSTATE_GST: This seller can deliver only within Telangana (no GST on file)
--
--    -- b) Intra-state order for the same store → MUST succeed
--    INSERT INTO public.orders ( store_id, buyer_id, items, subtotal, total_amount,
--                                delivery_address, payment_method )
--    VALUES (
--      '<non_gst_store_id>',
--      '<buyer_id>',
--      '[{"product_id":"...","qty":1,"price":100}]'::jsonb,
--      100, 100,
--      '{"name":"Test","state":"Telangana","pincode":"500075"}'::jsonb,
--      'cod'
--    );
--    -- Expected: INSERT 0 1 (success)
--
--    ROLLBACK;  -- nothing persists
--
-- ============================================================
-- BACKEND / FRONTEND FOLLOW-UPS
-- ============================================================
-- • order-service / checkout: catch the PostgREST error from Supabase.
--   The HTTP 409 body will contain { "message": "INTERSTATE_GST: ..." }.
--   Detect the substring "INTERSTATE_GST" and surface a buyer-friendly message,
--   e.g. "This seller can only deliver within their home state. Please choose a
--   different seller or delivery address."
-- • Web CheckoutClient.tsx and buyer-app CheckoutScreen: handle the new error
--   code from the order insert and show the message inline near the address field.
-- • Admin panel (optional): show a "GST not verified — interstate orders blocked"
--   badge on the seller detail page to indicate the restriction is active.
-- • Seller onboarding: existing gst_number + gst_verified columns (migrations
--   020 + 026) are already the right hooks — admin verifies GST → sets
--   gst_verified=true → trigger no longer blocks interstate orders.
