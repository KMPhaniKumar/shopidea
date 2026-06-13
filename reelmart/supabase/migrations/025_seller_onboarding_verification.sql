-- Migration 025: Seller onboarding verification — new columns, view, and
-- privilege-escalation fix on public.users
--
-- Implements ADR: agents_reports/ADR_seller_onboarding_verification.md
--
-- CHANGES IN THIS MIGRATION
-- --------------------------
-- A. New columns
--      users:  full_name, email, email_verified, phone_verified, password_hash
--      stores: pan_verified, signature_path
--
-- B. phone_verified backfill
--      Existing users are in the table because they completed MSG91 OTP at
--      signup — their mobile is already verified.  Set phone_verified=true
--      for all rows that have a phone.
--      Going forward, the admin-service auth-bridge MUST set phone_verified=true
--      when it creates (or upserts) the users row after OTP verification.
--      (Backend follow-up note — no service code is changed in this migration.)
--
-- C. seller_verification view
--      Per-seller computed status booleans consumed by the dashboard
--      SellerGate and the onboarding status panel.
--
-- D. CRITICAL: privilege-escalation fix on public.users
--      The "Users can update own profile" RLS policy (migration 001) is
--      column-unrestricted — an authenticated user can:
--        UPDATE public.users SET is_admin=true, role='admin'
--      from their browser or curl with a valid JWT.
--
--      THE ONLY CORRECT FIX in Postgres / Supabase is:
--        1. REVOKE the TABLE-LEVEL privilege from the role entirely.
--        2. GRANT the privilege back column-by-column for ONLY the safe cols.
--      A column-level REVOKE alone is INEFFECTIVE because a pre-existing
--      TABLE-LEVEL privilege overrides any column REVOKE for the same role.
--      (This is the same pattern established by migration 024 for stores.)
--
--      service_role is NOT touched — it bypasses Postgres grant machinery
--      entirely and must remain unrestricted for backend routes.
--
-- ============================================================
-- SECTION A — New columns on public.users
-- ============================================================

-- Full legal name (per PAN), set during seller registration "Your details" step
-- via the service-role POST /api/seller/onboard route.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Email address — collected for notifications and email-OTP verification.
-- The user submits this; server-side route stores it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT;

-- email_verified: set to true by the notification-service / Supabase email OTP
-- confirmation flow.  NON-blocking for feature gating (shown in status panel
-- but does NOT block dashboard access).
-- NOT DEFAULT true — starts false for all new rows; set by service route only.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

-- phone_verified: MSG91 OTP verifies mobile at signup, so by definition every
-- user in the table has a verified phone.  Default is false for defence-in-depth
-- (new rows that slip through a non-OTP path stay unverified until explicitly
-- set); backfill below corrects existing rows.
-- Written only by service_role (admin-service auth-bridge) — excluded from the
-- authenticated UPDATE grant in Section D.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false;

-- password_hash: bcrypt (cost >= 10) of a password collected during seller
-- onboarding.  Stored here for a future password-login flow.
-- CRITICAL — must NEVER be readable by the client (anon/authenticated SELECT
-- grant is stripped in Section D).  Set only via the service-role onboard route.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ============================================================
-- SECTION A (cont.) — New columns on public.stores
-- ============================================================

-- pan_verified: set true by an admin action on the KYC review page after
-- manual review of pan_number + pan_doc_path.  Part of the feature-gate
-- computation in the seller_verification view below.
-- NOT user-settable — excluded from the authenticated UPDATE grant on stores
-- (migration 024 already did REVOKE UPDATE / column-level GRANT for stores;
-- pan_verified is NOT in that grant list, so it is already protected).
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pan_verified BOOLEAN NOT NULL DEFAULT false;

-- signature_path: object path in the seller-documents storage bucket of the
-- seller's digital signature (uploaded or auto-generated as a script-font PNG
-- of full_name).  Non-blocking for feature gating — shown in onboarding panel
-- but not required for feature unlock.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS signature_path TEXT;

-- ============================================================
-- SECTION B — phone_verified backfill
-- ============================================================
-- All existing users completed MSG91 OTP at signup and therefore have a
-- verified phone.  Set phone_verified=true retrospectively.
-- The WHERE phone IS NOT NULL guard is a no-op (phone NOT NULL in schema)
-- but makes the intent explicit and safe for re-runs.
UPDATE public.users
  SET phone_verified = true
  WHERE phone IS NOT NULL
    AND phone_verified = false;

-- ============================================================
-- SECTION C — seller_verification view
-- ============================================================
--
-- Returns one row per seller with all verification booleans and the computed
-- feature-gate flag.  Used by:
--   • web dashboard onboarding status panel
--   • SellerGate component (hides products/orders/payouts until gate unlocks)
--
-- SECURITY INVOKER: the view executes as the querying role, so the underlying
-- table RLS policies are still enforced.  An authenticated seller only sees
-- their own row (users RLS: id = auth.uid(); stores RLS: seller_id = auth.uid()).
-- An unauthenticated (anon) call returns no rows — correct.
--
-- SELECT granted to `authenticated` only (not anon) — sellers need it, public
-- does not.  Anon users have no seller dashboard.
--
-- Columns:
--   seller_id         — users.id (= stores.seller_id)
--   phone_verified    — mobile OTP verified (auto-true after signup)
--   email_verified    — email OTP verified (non-blocking)
--   pan_verified      — admin reviewed & approved PAN (blocking)
--   pickup_verified   — pickup_status='verified' at NimbusPost (blocking)
--   signature_present — digital signature uploaded/generated (non-blocking)
--   features_unlocked — phone_verified AND pan_verified AND pickup_status='verified'
--                       (the master gate the SellerGate component checks)

CREATE OR REPLACE VIEW public.seller_verification
  WITH (security_invoker = true)
AS
  SELECT
    u.id                                          AS seller_id,
    u.phone_verified,
    u.email_verified,
    s.pan_verified,
    (s.pickup_status = 'verified')                AS pickup_verified,
    (s.signature_path IS NOT NULL)                AS signature_present,
    -- Feature gate: mobile + PAN + pickup must all be verified.
    -- Email and signature are informational in v1 (non-blocking).
    (u.phone_verified AND s.pan_verified AND s.pickup_status = 'verified')
                                                  AS features_unlocked
  FROM public.users  u
  JOIN public.stores s ON s.seller_id = u.id
  WHERE u.role = 'seller';

-- Grant SELECT to authenticated only.  The view is security_invoker, so RLS on
-- the base tables additionally ensures each seller sees only their own row.
GRANT SELECT ON public.seller_verification TO authenticated;

-- ============================================================
-- SECTION D — Privilege-escalation fix on public.users
-- ============================================================
--
-- FULL users COLUMN INVENTORY (all migrations up to and including 025):
--
--   From migration 001:
--     id, phone, name, avatar_url, role, is_admin, loyalty_coins,
--     referral_code, referred_by, created_at, updated_at
--
--   Added by migration 025 (this file):
--     full_name, email, email_verified, phone_verified, password_hash
--
-- PRIVILEGED columns (set only by service_role / admin — excluded from
-- authenticated UPDATE and/or SELECT grants):
--   id              — primary key, immutable
--   role            — role assignment is service-role/admin only
--   is_admin        — admin flag is service-role/admin only
--   phone           — set at signup by auth trigger, immutable post-create
--   phone_verified  — set by auth-bridge (service_role) after OTP; not self-settable
--   email_verified  — set by notification/email-OTP flow (service_role)
--   password_hash   — server-side bcrypt only; ALSO excluded from SELECT (never
--                     readable by client — see SELECT grant below)
--   referred_by     — set at signup by referral logic, immutable post-create
--   referral_code   — server-generated unique code, immutable post-create
--   loyalty_coins   — anti-cheat: modified only by order/payout service routes
--   created_at      — set at INSERT, immutable
--   updated_at      — managed by trigger, immutable by user
--
-- USER-EDITABLE columns (included in authenticated UPDATE grant):
--   name            — display / short name
--   full_name       — legal name per PAN (also set by service route on onboard,
--                     but a user can correct it via a profile-edit flow)
--   avatar_url      — profile picture URL
--   email           — email address (raw collect; verified flag is separate)
--
-- Note: email is user-editable here for a future "change email" flow.  The
-- email_verified flag is NOT user-editable (excluded), so changing email
-- automatically requires re-verification by the notification service.

-- ---- Step D1: Restrict authenticated SELECT (hide password_hash) ----
--
-- Pattern: revoke table-level SELECT, then re-grant column-by-column.
-- All columns EXCEPT password_hash are granted to authenticated.
-- anon cannot read users rows at all (RLS policy "Users can read own profile"
-- requires id = auth.uid(), which anon never satisfies) — the column grant
-- here is defence-in-depth so even a future policy relaxation cannot leak
-- password_hash.

REVOKE SELECT ON public.users FROM anon;
GRANT SELECT (
  id,
  phone,
  name,
  avatar_url,
  role,
  is_admin,
  loyalty_coins,
  referral_code,
  referred_by,
  created_at,
  updated_at,
  full_name,
  email,
  email_verified,
  phone_verified
  -- password_hash intentionally EXCLUDED — never readable by client
) ON public.users TO anon;

REVOKE SELECT ON public.users FROM authenticated;
GRANT SELECT (
  id,
  phone,
  name,
  avatar_url,
  role,
  is_admin,
  loyalty_coins,
  referral_code,
  referred_by,
  created_at,
  updated_at,
  full_name,
  email,
  email_verified,
  phone_verified
  -- password_hash intentionally EXCLUDED — never readable by client
) ON public.users TO authenticated;

-- ---- Step D2: Restrict authenticated UPDATE (prevent privilege escalation) ----
--
-- The existing "Users can update own profile" RLS policy (migration 001) has
-- no column restriction — a logged-in user can:
--   UPDATE public.users SET role='admin', is_admin=true WHERE id = auth.uid()
-- which is a critical privilege-escalation vector.
--
-- Fix: revoke table-level UPDATE, then re-grant only the four safe profile
-- columns.  RLS (id = auth.uid()) continues to control WHICH ROW; the column
-- grant controls WHICH COLUMNS within that row.
--
-- Columns NOT granted for UPDATE (service_role only):
--   role, is_admin, phone, phone_verified, email_verified, password_hash,
--   id, referred_by, referral_code, loyalty_coins, created_at, updated_at

REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (
  name,
  full_name,
  avatar_url,
  email
  -- email_verified is NOT granted — changing email must re-trigger verification
  -- via the notification service; the flag is reset by the service route, not
  -- the client.
) ON public.users TO authenticated;

-- anon should never UPDATE users — explicit revoke for safety.
REVOKE UPDATE ON public.users FROM anon;

-- ============================================================
-- VERIFICATION NOTES (for post-apply checks)
-- ============================================================
--
-- 1. New columns exist:
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='users'
--      ORDER BY ordinal_position;
--    → should include full_name, email, email_verified, phone_verified,
--      password_hash
--
--    SELECT column_name FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='stores'
--      ORDER BY ordinal_position;
--    → should include pan_verified, signature_path
--
-- 2. View exists:
--    SELECT * FROM public.seller_verification LIMIT 1;
--    → should return shape: seller_id, phone_verified, email_verified,
--      pan_verified, pickup_verified, signature_present, features_unlocked
--
-- 3. Column grants — password_hash NOT in SELECT:
--    SELECT grantee, privilege_type, column_name
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='users'
--        AND grantee IN ('authenticated','anon')
--        AND column_name='password_hash';
--    → should return 0 rows
--
-- 4. role/is_admin NOT in UPDATE grant:
--    SELECT grantee, privilege_type, column_name
--      FROM information_schema.column_privileges
--      WHERE table_schema='public' AND table_name='users'
--        AND grantee='authenticated' AND privilege_type='UPDATE'
--        AND column_name IN ('role','is_admin','phone_verified','email_verified',
--                            'password_hash');
--    → should return 0 rows
--
-- 5. phone_verified backfill:
--    SELECT COUNT(*) FROM public.users WHERE phone IS NOT NULL AND phone_verified=false;
--    → should return 0
--
-- ============================================================
-- BACKEND FOLLOW-UPS (not in this migration)
-- ============================================================
-- • admin-service auth-bridge: after MSG91 OTP success + users INSERT/upsert,
--   set phone_verified=true (service_role UPDATE) on the new/existing row.
-- • POST /api/seller/onboard (service_role): set users.full_name, users.password_hash
--   (bcrypt, cost>=10); upsert stores.store_name, pan_number, gst_number.
-- • Admin KYC route: set stores.pan_verified=true after manual review.
-- • notification-service / Supabase email OTP: set users.email_verified=true.
-- • SellerGate (web): read seller_verification view; gate products/orders/payouts
--   on features_unlocked; also enforce gating in backend seller-feature API routes.
