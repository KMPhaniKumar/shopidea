-- Migration 026: Seller moderation controls — suspension + GST verification
--
-- SUMMARY OF CHANGES
-- ------------------
-- A. New columns on public.stores (idempotent ADD COLUMN IF NOT EXISTS):
--      gst_verified      BOOLEAN NOT NULL DEFAULT false  — admin sets after GST review
--      suspended         BOOLEAN NOT NULL DEFAULT false  — admin sets for fraud/policy violation
--      suspended_reason  TEXT                            — human-readable reason for suspension
--      suspended_at      TIMESTAMPTZ                     — timestamp of suspension action
--
-- B. Column privilege update on public.stores:
--    Migration 024 did REVOKE UPDATE ON stores FROM authenticated then a
--    column-level re-grant. That grant list deliberately excluded admin-only
--    columns (is_active, approval_status, pan_verified, etc.).  The four new
--    columns are admin-only write and must NOT be added to the authenticated
--    UPDATE grant — no UPDATE grant change is needed here.
--
--    However, these four columns are NOT sensitive (they are visible in the
--    storefront so buyers know a store is suspended; gst_verified is a trust
--    signal). They must be added to the anon and authenticated SELECT grants so
--    the storefront, buyer-app, and seller dashboard can read them.
--
--    Since migration 024 did a column-level GRANT (not table-level) for anon and
--    authenticated SELECT, adding new columns requires re-issuing an extended
--    GRANT.  Postgres column GRANTs are additive — granting a column that is
--    already granted is a no-op, so we simply add the four new columns to the
--    existing grant.  No REVOKE is needed.
--
-- C. Products public-read RLS — defense-in-depth:
--    Migration 003 created policy "Available products publicly readable" with
--    USING (is_available = true).  This does not enforce the store approval state:
--    an anon client can currently retrieve products belonging to pending/rejected
--    or suspended stores.
--
--    Replace this policy with a stricter USING clause that requires the parent
--    store to be approved + active + not-suspended.  Seller own-product access
--    and admin/service access are already covered by separate policies in
--    migration 003 and are unchanged.
--
-- D. Stores public-read RLS — defense-in-depth:
--    Migration 002 created policy "Active stores publicly readable" with
--    USING (is_active = true).  After migration 015 added approval_status, this
--    still leaks stores that are pending/rejected but have is_active=true.
--    After this migration it also needs to exclude suspended stores.
--
--    Replace this policy with the correct three-way gate:
--    approval_status = 'approved' AND is_active = true AND suspended = false.
--
-- ADMIN/SERVICE WRITE
--    All four new columns are only written by the admin API routes and the
--    service_role backend.  The service_role bypasses Postgres column grants
--    entirely so no additional grant is needed for backend writes.
--    The authenticated role lacks UPDATE grant on these columns (they were never
--    included in the migration 024 UPDATE grant list), which is the desired state.
--
-- BACKWARD COMPATIBILITY
--    All new columns have safe defaults (false / NULL), so existing rows are
--    unaffected.  The stricter RLS policies only change what anon/authenticated
--    can query — not what service_role can access.

-- ============================================================
-- SECTION A — New columns on public.stores
-- ============================================================

-- GST verification flag: admin sets this to true after reviewing the seller's
-- GST registration number.  Analogous to pan_verified (added in migration 025).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS gst_verified BOOLEAN NOT NULL DEFAULT false;

-- Suspended flag: admin sets to true when a seller is found to be fraudulent or
-- violates platform policies.  When suspended=true the store and its products are
-- hidden from all public queries (enforced in Sections C and D below).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;

-- Suspension reason: free-text explanation stored alongside the flag.  Written by
-- the admin action; readable by the seller so they understand why they were suspended.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Suspension timestamp: when the admin performed the suspension action.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Index to make admin "list suspended stores" queries fast.
CREATE INDEX IF NOT EXISTS stores_suspended_idx ON public.stores (suspended)
  WHERE suspended = true;

-- ============================================================
-- SECTION B — Extend the anon + authenticated SELECT grants on stores
-- ============================================================
-- Migration 024 did REVOKE + column-level GRANT for both roles.  The new columns
-- must be added to the existing grants.  Postgres treats additional GRANT on
-- already-granted columns as a no-op, so all previously granted columns remain
-- intact — we only extend the list.
--
-- These four columns are non-sensitive (no PII) and needed by:
--   • storefront/marketplace:  hide suspended stores; show "verified by GST" badge
--   • seller dashboard:        seller sees their own suspension state + reason
--   • buyer-app:               same as storefront

GRANT SELECT (gst_verified, suspended, suspended_reason, suspended_at)
  ON public.stores TO anon;

GRANT SELECT (gst_verified, suspended, suspended_reason, suspended_at)
  ON public.stores TO authenticated;

-- authenticated UPDATE grant: NOT extended — these four columns are intentionally
-- excluded so sellers cannot un-suspend themselves or set their own gst_verified.
-- The REVOKE UPDATE + column-level GRANT from migration 024 already covers this:
-- Postgres only grants UPDATE on the explicitly listed columns, so any column
-- that was not in that list (including these four new ones) is automatically
-- blocked from authenticated UPDATE.

-- ============================================================
-- SECTION C — Replace products public SELECT policy
-- ============================================================
-- Old policy (migration 003):
--   "Available products publicly readable" USING (is_available = true)
--
-- Problem: a product with is_available=true on a pending, rejected, or suspended
-- store is visible to anon — this leaks pre-approval listings.
--
-- New policy: require is_available=true AND the parent store passes the
-- triple gate (approved + active + not-suspended).
--
-- Seller own-product access is unchanged ("Sellers read all own products" in
-- migration 003 uses store_id IN (SELECT id FROM stores WHERE seller_id=auth.uid())).
-- Sellers can still see their own products in the dashboard even if their store
-- is pending/rejected/suspended — the seller-facing policy has no store-state filter.

DROP POLICY IF EXISTS "Available products publicly readable" ON public.products;

CREATE POLICY "Public products from approved active stores"
  ON public.products
  FOR SELECT
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1
      FROM public.stores s
      WHERE s.id = products.store_id
        AND s.approval_status = 'approved'
        AND s.is_active = true
        AND s.suspended = false
    )
  );

-- ============================================================
-- SECTION D — Replace stores public SELECT policy
-- ============================================================
-- Old policy (migration 002):
--   "Active stores publicly readable" USING (is_active = true)
--
-- Problem 1 (migration 015): stores with approval_status='pending' or 'rejected'
--   but is_active=true are visible to anon — pre-approval leakage.
-- Problem 2 (this migration): suspended stores with is_active=true would remain
--   visible under the old policy even after suspension.
--
-- New policy: approval_status='approved' AND is_active=true AND suspended=false.
-- The seller's own-row access ("Sellers read own store") is unchanged.
-- Admin reads via service_role — not affected by RLS policies.

DROP POLICY IF EXISTS "Active stores publicly readable" ON public.stores;

CREATE POLICY "Public approved active non-suspended stores"
  ON public.stores
  FOR SELECT
  USING (
    approval_status = 'approved'
    AND is_active = true
    AND suspended = false
  );

-- ============================================================
-- VERIFICATION NOTES (for post-apply checks)
-- ============================================================
--
-- 1. New columns exist:
--    SELECT column_name, data_type, column_default, is_nullable
--      FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='stores'
--        AND column_name IN ('gst_verified','suspended','suspended_reason','suspended_at')
--      ORDER BY column_name;
--    → 4 rows; gst_verified/suspended boolean NOT NULL default false;
--      suspended_reason text nullable; suspended_at timestamptz nullable
--
-- 2. anon SELECT grant extended (all four new cols):
--    SELECT column_name
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='stores'
--        AND grantee='anon' AND privilege_type='SELECT'
--        AND column_name IN ('gst_verified','suspended','suspended_reason','suspended_at')
--      ORDER BY column_name;
--    → 4 rows
--
-- 3. authenticated UPDATE grant does NOT include new cols:
--    SELECT column_name
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='stores'
--        AND grantee='authenticated' AND privilege_type='UPDATE'
--        AND column_name IN ('gst_verified','suspended','suspended_reason','suspended_at');
--    → 0 rows
--
-- 4. Products policy replaced:
--    SELECT policyname FROM pg_policies
--      WHERE tablename='products' AND schemaname='public';
--    → "Available products publicly readable" should NOT appear
--    → "Public products from approved active stores" SHOULD appear
--
-- 5. Stores policy replaced:
--    SELECT policyname FROM pg_policies
--      WHERE tablename='stores' AND schemaname='public';
--    → "Active stores publicly readable" should NOT appear
--    → "Public approved active non-suspended stores" SHOULD appear
--
-- 6. Anon visibility test: create a store with approval_status='pending', is_active=true
--    and add a product — anon SELECT on products should return 0 rows for that product.
--    Create a store with approval_status='approved', is_active=true, suspended=false
--    and add a product — anon SELECT should return that product.
--
-- ============================================================
-- BACKEND FOLLOW-UPS (not in this migration)
-- ============================================================
-- • admin API: add POST /api/admin/stores/:id/suspend and /unsuspend routes that
--   set suspended=true/false, suspended_reason, suspended_at via service_role.
-- • admin API: add POST /api/admin/stores/:id/verify-gst that sets gst_verified=true.
-- • Seller dashboard: show a "Your store is suspended" banner if suspended=true,
--   display suspended_reason so the seller understands the action taken.
-- • storefront/marketplace: filter out suspended stores (now enforced at DB level,
--   but defensive app-level filter is also good practice).
-- • seller_verification view (migration 025): optionally add gst_verified as an
--   informational column; decide if it gates any feature (not required by this migration).
