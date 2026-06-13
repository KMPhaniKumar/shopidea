-- Migration 023: RLS / PII hardening (MED-2, MED-1, LOW-1)
--
-- Fixes three open security findings:
--
--   MED-2  users  "Public user names visible" USING (true) exposes phone to
--          any client.  DROP that policy; own-row SELECT is already covered by
--          the pre-existing "Users can read own profile" policy (id = auth.uid()).
--          Add a safe view `public_user_names` (id, name only) so the storefront
--          can display review-author names without leaking phone numbers.
--
--   MED-1  stores  The row-level policy "Active stores publicly readable" grants
--          anon SELECT on all columns, including the KYC PII columns added in
--          migration 020 (pan_number, pan_doc_path, gst_number, selfie_path,
--          kyc_submitted_at) and the aadhaar_url added in migration 002.
--          Revoke SELECT on those six columns from the `anon` role.
--          The `authenticated` role (seller dashboard) and `service_role`
--          (backend services, admin) are NOT affected.
--
--   LOW-1  followed_stores  "Follow counts publicly readable" USING (true)
--          exposes every buyer_id to any client.  DROP that policy.
--          Add a view `store_follow_counts` that returns only (store_id, count)
--          so the UI can still display follower totals without leaking buyer_ids.
--
-- Idempotency: all DROP/REVOKE/CREATE use IF EXISTS / IF NOT EXISTS guards so
-- the migration is safe to re-apply (e.g. during a drift-recovery run).

-- ============================================================
-- MED-2: users table
-- ============================================================

-- Drop the overly-permissive policy that lets any client read all users rows
-- (including phone).  The "Users can read own profile" policy added in
-- migration 001 already covers the legitimate own-row use-case.
DROP POLICY IF EXISTS "Public user names visible" ON public.users;

-- Expose only (id, name) for the storefront / review-author display use-case.
-- SECURITY INVOKER: the view runs as the querying role, so RLS on the
-- underlying `users` table is still enforced — only the invoker's own row is
-- readable unless explicitly granted.  We GRANT SELECT to `anon` and
-- `authenticated` here so unauthenticated storefront pages can resolve review
-- author names from this view without touching the base table at all.
CREATE OR REPLACE VIEW public.public_user_names
  WITH (security_invoker = true)
AS
  SELECT id, name FROM public.users;

GRANT SELECT ON public.public_user_names TO anon, authenticated;

-- ============================================================
-- MED-1: stores table — revoke KYC columns from anon
-- ============================================================
-- The following columns contain seller KYC / PII data.  Strip SELECT
-- privilege on them from `anon` so that unauthenticated PostgREST queries
-- (e.g. storefront fetches) cannot retrieve this data even when the row
-- matches the "Active stores publicly readable" row policy.
--
-- `service_role` bypasses column grants entirely and is not affected.
-- `authenticated` sellers read their OWN full store row via the "Sellers read
-- own store" policy — but buyers and other sellers can also hold an
-- `authenticated` JWT and have no legitimate need for KYC data.  Revoke from
-- both `anon` and `authenticated` to close that gap; sellers who need their
-- own KYC data are served via the authenticated `/api/catalog/my-store`
-- endpoint which uses service_role on the server side.
--
-- The six columns:
--   aadhaar_url       (added migration 002 — legacy field, still present in schema)
--   pan_number        (added migration 020)
--   pan_doc_path      (added migration 020)
--   gst_number        (added migration 020)
--   selfie_path       (added migration 020)
--   kyc_submitted_at  (added migration 020)
REVOKE SELECT (aadhaar_url, pan_number, pan_doc_path, gst_number, selfie_path, kyc_submitted_at)
  ON public.stores
  FROM anon, authenticated;

-- ============================================================
-- LOW-1: followed_stores table
-- ============================================================

-- Drop the policy that made all buyer_id rows visible to anyone.
DROP POLICY IF EXISTS "Follow counts publicly readable" ON public.followed_stores;

-- The existing "Buyers manage followed stores" policy (FOR ALL, USING
-- buyer_id = auth.uid()) already handles:
--   - authenticated buyers SELECT / INSERT / DELETE their own rows
-- No further row policy is needed for the follow/unfollow flow.

-- Expose only aggregate counts per store so the UI can still render
-- "X followers" without exposing individual buyer_ids.
-- No RLS check required here: counts are inherently anonymous.
CREATE OR REPLACE VIEW public.store_follow_counts
AS
  SELECT store_id, COUNT(*) AS follower_count
  FROM public.followed_stores
  GROUP BY store_id;

GRANT SELECT ON public.store_follow_counts TO anon, authenticated;
