-- Migration 022: Seller pickup-address changes require admin approval
--
-- Implements ADR: ADR_seller_address_change_approval.md (Option A — store stays
-- LIVE on old address until admin approves the change).
--
-- Three coordinated changes:
--
--   1. New table `store_address_changes` — holds pending/approved/rejected
--      change requests.  A partial unique index enforces at most one OPEN
--      (pending) request per store at a time.
--
--   2. RLS on `store_address_changes` — sellers can INSERT/SELECT their own
--      store's requests; only admins can UPDATE (approve/reject).  The
--      service role bypasses RLS and is used by the admin-approval route.
--
--   3. Column-level REVOKE on `stores` — strips UPDATE permission for the
--      five address columns (address, area, city, state, pincode) from the
--      `authenticated` role.  This is the enforcement layer that makes the
--      approval flow non-bypassable:
--
--      WHY THIS IS NECESSARY:
--      Supabase's PostgREST client (and the JS SDK) runs as the `authenticated`
--      role for every logged-in user.  The existing RLS policy "Sellers update
--      own store" (migration 002) already grants row-level UPDATE to a seller
--      for their own store row.  But RLS policies only control WHICH ROWS can
--      be touched — they cannot restrict WHICH COLUMNS within those rows.
--      Without the column-level REVOKE, a seller could call
--        supabase.from('stores').update({ address: '...' })
--      directly from their browser (or via curl with their JWT) and bypass the
--      new UI flow entirely.
--
--      The REVOKE works independently of, and in addition to, RLS:
--        authenticated role  →  no UPDATE privilege on (address, area, city, state, pincode)
--        service_role        →  not affected (bypasses both RLS and column grants)
--        anon role           →  never had UPDATE on stores; no change needed
--
--      A seller can still UPDATE all other columns (store_name, description,
--      logo_url, whatsapp_number, store_slug, category, is_open, open_time,
--      close_time, open_days, instagram_handle, etc.) exactly as today — the
--      REVOKE is column-specific, not table-wide.
--
--      INSERT is NOT restricted: a seller still sets the address when they
--      first create their store (onboarding INSERT), and that INSERT goes
--      through the normal store-approval flow unaffected.  This REVOKE only
--      governs post-creation UPDATEs.

-- ============================================================
-- 1. New table: store_address_changes
-- ============================================================

CREATE TABLE public.store_address_changes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID        NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  -- Proposed new address as a JSON snapshot.
  -- Expected shape: { address, area, city, state, pincode }
  proposed       JSONB       NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Populated by admin when rejecting; NULL for approved/pending rows.
  reject_reason  TEXT,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The admin user who acted on this request (NULL while still pending).
  reviewed_by    UUID        REFERENCES public.users(id),
  reviewed_at    TIMESTAMPTZ
);

-- At most one OPEN (pending) request per store.
-- A new submission while one is pending must UPDATE the existing row
-- (or the server route can close the old one before inserting the new).
-- Approved/rejected rows are kept for audit; the unique constraint only
-- covers the single 'pending' row.
CREATE UNIQUE INDEX store_address_changes_one_open
  ON public.store_address_changes (store_id)
  WHERE status = 'pending';

-- Composite index to make "find all requests for store X with status Y"
-- fast — used by the admin review queue and seller status banner.
CREATE INDEX store_address_changes_store_status_idx
  ON public.store_address_changes (store_id, status);

-- ============================================================
-- 2. RLS on store_address_changes
-- ============================================================

ALTER TABLE public.store_address_changes ENABLE ROW LEVEL SECURITY;

-- Sellers: SELECT their own store's requests (any status, for the UI banner).
CREATE POLICY "Sellers select own address change requests"
  ON public.store_address_changes FOR SELECT
  USING (
    store_id IN (
      SELECT id FROM public.stores WHERE seller_id = auth.uid()
    )
  );

-- Sellers: INSERT a new request only for a store they own.
-- WITH CHECK enforces the inserted row is status='pending' AND carries no
-- review metadata — so a seller can neither self-approve nor pre-populate
-- reviewed_by/reviewed_at (review fields are set only by the service-role
-- admin path on approve/reject).
CREATE POLICY "Sellers insert address change request"
  ON public.store_address_changes FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT id FROM public.stores WHERE seller_id = auth.uid()
    )
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

-- Sellers: no UPDATE policy at all — they cannot change status, withdraw a
-- request, or alter reviewed_by/reviewed_at.  If a seller needs to supersede
-- a pending request, the server route (service role) handles it.

-- Admins: full access (SELECT all requests, UPDATE status/reject_reason/
-- reviewed_by/reviewed_at when approving or rejecting).
-- Matches the pattern established in migrations 004 (orders) and 009 (returns).
CREATE POLICY "Admins manage all address change requests"
  ON public.store_address_changes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================================
-- 3. Column-level REVOKE on stores — address fields
-- ============================================================
-- The `authenticated` role is what every Supabase JS client / PostgREST
-- request runs as when a user is logged in.  We strip UPDATE for the five
-- address columns so that even if the client constructs a direct Supabase
-- call, Postgres will reject it with "permission denied for column …"
-- before RLS is even evaluated.
--
-- This does NOT affect:
--   - INSERT (onboarding sets address; INSERT privilege is unchanged)
--   - SELECT (any column is still readable as per RLS)
--   - service_role (used by backend routes; bypasses column grants)
--   - Non-address columns (seller can still UPDATE name, logo, etc.)
REVOKE UPDATE (address, area, city, state, pincode) ON public.stores FROM authenticated;
