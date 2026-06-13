-- Migration 030: Rebuild seller_verification as a security-DEFINER view
--
-- BUG FIXED
-- ----------
-- Migration 024 did REVOKE SELECT ON public.stores FROM authenticated, then
-- re-granted SELECT column-by-column for a fixed list.  That list did NOT include
-- pan_verified or signature_path (both added later by migration 025).
--
-- Migration 025 created the seller_verification view WITH (security_invoker=true).
-- Because the view runs as the querying role, the caller needs column-level SELECT
-- on every stores column the view touches.  pan_verified and signature_path were
-- never in the column grant, so any authenticated query against seller_verification
-- (or a direct `stores?select=pan_verified` call) returns HTTP 401 / "permission
-- denied for table stores".
--
-- SOLUTION: Two-pronged fix.
--
-- Part 1 — Rebuild the view as security_invoker=false (DEFINER semantics).
--   The view now runs as its owner (postgres / Supabase superuser role), which
--   bypasses the per-column SELECT restrictions on the underlying tables.
--   auth.uid() is still evaluated in the caller's context (it reads the current
--   request JWT), so the WHERE s.seller_id = auth.uid() filter is fully effective.
--   Each seller sees only their own row; an anon call (auth.uid()=null) returns
--   zero rows.  Admins and the service_role read per-seller directly via the API
--   routes with the service key — they are unaffected.
--
--   The view also adopts the revised verification model:
--     • pan_provided   (bool): PAN number is on file — no admin approval required.
--                     The old pan_verified column (admin-approved) is GONE from
--                     the output; pan_provided counts as done once the seller
--                     has submitted the PAN number.
--     • gst_provided   (bool): GST number is on file (non-blocking informational).
--     • gst_verified   (bool): admin has verified the GST number.
--     • features_unlocked now gates on approval_status='approved' AND NOT suspended
--                     (admin approves the whole store; individual field approvals
--                      are no longer blocking).
--
-- Part 2 — Belt-and-suspenders: add pan_verified and signature_path to the
--   authenticated and anon SELECT column grants on stores.
--   pan_verified is a non-sensitive boolean (true/false — does not expose the PAN
--   number itself); signature_path is an object path in the seller-documents bucket
--   (non-sensitive metadata, not the document).  Adding them to the grant ensures
--   any other client-side read (direct stores select, other views) does not 401.
--   KYC columns (pan_number, aadhaar_url, gst_number, pan_doc_path, selfie_path,
--   kyc_submitted_at) remain excluded from both grants.
--
-- ============================================================
-- SECTION 1 — Belt-and-suspenders column grants on public.stores
-- ============================================================
-- Add pan_verified (bool) and signature_path (text/object-path) to the existing
-- anon and authenticated SELECT grants.
-- Postgres column GRANTs are additive — granting an already-granted column is a
-- no-op, so this is idempotent and safe to re-run.
-- No KYC content columns are added here.

GRANT SELECT (pan_verified, signature_path) ON public.stores TO anon;
GRANT SELECT (pan_verified, signature_path) ON public.stores TO authenticated;

-- ============================================================
-- SECTION 2 — Rebuild public.seller_verification (security-DEFINER)
-- ============================================================
-- DROP is required because CREATE OR REPLACE cannot change the column list of an
-- existing view (Postgres rejects column additions/renamings via REPLACE).
-- The GRANT below re-establishes SELECT privileges after the DROP.

DROP VIEW IF EXISTS public.seller_verification;

CREATE VIEW public.seller_verification
  -- security_invoker = false → runs as owner (postgres), bypassing the
  -- per-column SELECT restrictions on stores and users that the caller's role
  -- would otherwise face.  auth.uid() still reflects the caller's JWT.
  WITH (security_invoker = false)
AS
  SELECT
    s.seller_id,

    -- Mobile: every user who completed MSG91 OTP at signup has phone_verified=true
    -- (backfilled by migration 025; set by admin-service auth-bridge on new signups).
    u.phone_verified,

    -- PAN: provided once the seller submits their PAN number.  No admin approval
    -- required in this model — submission itself unlocks the PAN step.
    (s.pan_number IS NOT NULL AND s.pan_number <> '')  AS pan_provided,

    -- GST: informational — provided once submitted.  Admin verification is separate.
    (s.gst_number IS NOT NULL AND s.gst_number <> '')  AS gst_provided,

    -- GST admin-verified flag (set by admin route via service_role).
    s.gst_verified,

    -- Pickup: admin / NimbusPost marks pickup_status='verified'.
    (s.pickup_status = 'verified')                     AS pickup_verified,

    -- Email: non-blocking; collected and verified separately.
    u.email_verified,

    -- Digital signature: present once seller has uploaded or auto-generated one.
    (s.signature_path IS NOT NULL)                     AS signature_present,

    -- Current admin approval status for the store.
    s.approval_status,

    -- Whether the store is suspended by an admin action.
    s.suspended,

    -- Master feature-gate: features unlock when admin has approved the store AND
    -- the store is not suspended.  Individual verification steps (phone, PAN,
    -- pickup) are shown in the onboarding status panel for guidance but the gate
    -- is now driven by the admin approval decision.
    (s.approval_status = 'approved' AND s.suspended = false)
                                                       AS features_unlocked

  FROM public.stores  s
  JOIN public.users   u ON u.id = s.seller_id
  -- Scope to the calling seller only.
  -- auth.uid() is evaluated in the caller's JWT context even inside a DEFINER
  -- view, so this correctly returns one row for the authenticated seller and zero
  -- rows for anon (auth.uid() = null matches no seller_id).
  WHERE s.seller_id = auth.uid();

-- Re-grant SELECT after the DROP+CREATE.
-- anon: auth.uid() returns null → WHERE clause returns 0 rows, but granting anon
-- avoids a "permission denied for view" error (the empty result is correct).
-- authenticated: sellers need this to read their own verification status.
GRANT SELECT ON public.seller_verification TO anon;
GRANT SELECT ON public.seller_verification TO authenticated;

-- ============================================================
-- VERIFICATION NOTES (run after supabase db push)
-- ============================================================
--
-- 1. View exists with correct columns (anon key, PostgREST):
--    GET /rest/v1/seller_verification?limit=0
--    → HTTP 200 (not 401); column list in Content-Range or response shape.
--    (Returns 0 rows for anon — that is correct; the WHERE auth.uid() filter.)
--
-- 2. Direct stores column grant — pan_verified no longer 401s (anon key):
--    GET /rest/v1/stores?select=pan_verified&limit=1
--    → HTTP 200 (may return 0 rows if no approved+active+non-suspended stores,
--      but must NOT return 401 / permission denied).
--
-- 3. signature_path grant (anon key):
--    GET /rest/v1/stores?select=signature_path&limit=1
--    → HTTP 200
--
-- 4. View definition check (SQL editor):
--    SELECT view_definition FROM information_schema.views
--      WHERE table_schema = 'public' AND table_name = 'seller_verification';
--    → should contain "security_barrier" false and "security_invoker" false
--      (Postgres stores definer views without the security_invoker attribute).
--    Alternatively:
--    \d+ public.seller_verification
--    → "security_invoker: off" or no security_invoker annotation.
--
-- 5. Column grants (SQL editor):
--    SELECT column_name, grantee, privilege_type
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='stores'
--        AND grantee IN ('anon','authenticated')
--        AND column_name IN ('pan_verified','signature_path')
--      ORDER BY grantee, column_name;
--    → 4 rows (2 per column, one per role).
--
-- 6. KYC columns still excluded (SQL editor):
--    SELECT column_name
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='stores'
--        AND grantee IN ('anon','authenticated')
--        AND column_name IN ('pan_number','gst_number','pan_doc_path',
--                            'selfie_path','aadhaar_url','kyc_submitted_at');
--    → 0 rows
--
-- ============================================================
-- DEPENDENT CHANGES (backend / UI — not in this migration)
-- ============================================================
-- • SellerGate (web): update to read features_unlocked from the new view shape.
--   The old check (phone_verified AND pan_verified AND pickup_verified) is gone;
--   the gate is now purely features_unlocked = (approval_status='approved' AND NOT suspended).
--   The onboarding status panel can still show pan_provided, gst_provided,
--   pickup_verified etc. as progress indicators.
-- • Admin KYC route (set stores.pan_verified): still exists as a DB column and is
--   readable by service_role; it is simply no longer part of the feature gate.
--   No backend route change needed — pan_verified remains a useful audit field.
-- • seller_verification callers that previously read pan_verified must switch to
--   pan_provided (different semantics: provided vs admin-approved).
