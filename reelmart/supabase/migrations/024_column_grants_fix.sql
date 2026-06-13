-- Migration 024: Fix column-level privilege enforcement on public.stores
--
-- WHY THIS MIGRATION EXISTS
-- --------------------------
-- Migrations 022 and 023 used REVOKE UPDATE/SELECT (col, ...) ON public.stores
-- FROM anon/authenticated.  Those REVOKEs are INEFFECTIVE in Supabase (and in
-- standard Postgres) because the `anon` and `authenticated` roles already hold
-- a TABLE-LEVEL SELECT (granted by Supabase at project creation) and a
-- TABLE-LEVEL UPDATE (granted by the Supabase PostgREST auto-grant machinery).
--
-- In Postgres, a table-level privilege ALWAYS overrides a column-level REVOKE
-- on the same table for the same role.  Proof from live testing on dev
-- (nysgwdpmpxqmfwelfaxo):
--   • An anon client SELECT id, aadhaar_url FROM stores → HTTP 200 (should be
--     403 / empty column).
--   • An authenticated seller calling .update({ address: '...' }) on their own
--     store row → succeeds, bypassing the address-change approval flow from 022.
--
-- THE CORRECT PATTERN
-- --------------------
-- To restrict specific columns you must:
--   1. REVOKE the table-level privilege from the role entirely.
--   2. GRANT the privilege back column-by-column for only the safe columns.
-- This is the only way column grants work in Postgres.
--
-- service_role bypasses the Postgres grant system entirely (it is a superuser-
-- equivalent role in Supabase); we must NOT touch it here.  RLS row policies
-- continue to control WHICH ROWS can be seen/touched; the column grants here
-- control WHICH COLUMNS within those rows.

-- ============================================================
-- SECTION 1 — anon: restrict SELECT to non-KYC/non-PII columns
-- ============================================================
-- The KYC columns excluded from the anon grant are:
--   aadhaar_url       (migration 002 — legacy field)
--   pan_number        (migration 020)
--   pan_doc_path      (migration 020)
--   gst_number        (migration 020)
--   selfie_path       (migration 020)
--   kyc_submitted_at  (migration 020)
--
-- Every other column is included so the storefront / marketplace / catalog
-- pages continue to work without change.  The "Active stores publicly readable"
-- RLS policy (migration 002) still controls which ROWS anon can see (only
-- is_active=true).
--
-- Client-side KYC reads: grep of the web app and buyer-app confirms:
--   • buyer-app discoveryService.ts — uses an explicit safe column list (no KYC
--     columns). Safe.
--   • web app seller/settings — reads store.pan_doc_path, store.selfie_path,
--     store.pan_number, store.gst_number to pre-fill the KYC form.  This page
--     runs with an `authenticated` JWT (the seller).  After this migration the
--     authenticated role also loses direct SELECT on KYC columns (see Section 2
--     below), BUT the seller dashboard reads its own store via
--     supabase.from('stores').select('*') with the seller's JWT.  The seller's
--     own row is accessible via the "Sellers read own store" RLS policy, but
--     with this grant change the KYC columns will return NULL/be absent.
--     The seller dashboard will need to be updated to fetch KYC data via the
--     /api/catalog/my-store server-side route (service_role) — see the
--     FOLLOW-UP note at the bottom of this file.
--   • web app admin/sellers/[id] — uses createSupabaseAdmin (service_role key,
--     server component). Completely unaffected by column grants.

-- Step 1a: revoke table-level SELECT from anon (nullifies the column-REVOKE
-- workaround attempted in 022/023 and clears the override).
REVOKE SELECT ON public.stores FROM anon;

-- Step 1b: grant SELECT back for every non-KYC column.
GRANT SELECT (
  id,
  seller_id,
  store_name,
  store_slug,
  description,
  category,
  logo_url,
  city,
  area,
  pincode,
  whatsapp_number,
  instagram_handle,
  is_active,
  is_open,
  open_time,
  close_time,
  open_days,
  rating_avg,
  total_reviews,
  total_orders,
  is_verified,
  referral_installs,
  address,
  state,
  approval_status,
  pickup_id,
  pickup_warehouse_name,
  pickup_status,
  pickup_error,
  pickup_registered_at,
  created_at,
  updated_at
) ON public.stores TO anon;

-- ============================================================
-- SECTION 2 — authenticated: restrict SELECT to non-KYC columns
-- ============================================================
-- Authenticated buyers (and sellers viewing OTHER stores) have no legitimate
-- need for KYC data.  Sellers reading their OWN KYC fields for the settings
-- form are now expected to go through the /api/catalog/my-store server-side
-- route (which uses service_role).  See FOLLOW-UP note below.
--
-- The column list granted here is the same as for anon — all non-KYC columns.
-- This revoke also resets the partially-effective REVOKE from migration 023.
REVOKE SELECT ON public.stores FROM authenticated;

GRANT SELECT (
  id,
  seller_id,
  store_name,
  store_slug,
  description,
  category,
  logo_url,
  city,
  area,
  pincode,
  whatsapp_number,
  instagram_handle,
  is_active,
  is_open,
  open_time,
  close_time,
  open_days,
  rating_avg,
  total_reviews,
  total_orders,
  is_verified,
  referral_installs,
  address,
  state,
  approval_status,
  pickup_id,
  pickup_warehouse_name,
  pickup_status,
  pickup_error,
  pickup_registered_at,
  created_at,
  updated_at
) ON public.stores TO authenticated;

-- ============================================================
-- SECTION 3 — authenticated: restrict UPDATE to non-address columns
-- ============================================================
-- This re-implements the intent of migration 022 correctly.
-- Sellers must NOT be able to directly UPDATE the five address columns
-- (address, area, city, state, pincode) — those changes must go through
-- /api/seller/address-change which creates a store_address_changes row for
-- admin review before applying them to the stores row via service_role.
--
-- The "Sellers update own store" RLS policy (migration 002) still controls
-- which ROWS can be updated (seller_id = auth.uid()).  The column grant below
-- controls which COLUMNS within those rows can be updated.  INSERT is not
-- restricted here — onboarding sets the initial address via INSERT which is
-- still permitted by the "Sellers insert own store" policy.
--
-- Non-address columns that sellers CAN still update directly:
--   store_name, store_slug, description, category, logo_url,
--   whatsapp_number, instagram_handle, is_open, open_time, close_time,
--   open_days, pan_number, gst_number, pan_doc_path, selfie_path,
--   kyc_submitted_at, referral_installs
--
-- Note: is_active, is_verified, approval_status, pickup_*, rating_avg,
--   total_reviews, total_orders are intentionally excluded from the
--   authenticated UPDATE grant — sellers should not be able to self-approve,
--   self-verify, or manipulate counters.  Those are set only via service_role
--   (backend routes / admin actions).
REVOKE UPDATE ON public.stores FROM authenticated;

GRANT UPDATE (
  store_name,
  store_slug,
  description,
  category,
  logo_url,
  whatsapp_number,
  instagram_handle,
  is_open,
  open_time,
  close_time,
  open_days,
  pan_number,
  gst_number,
  pan_doc_path,
  selfie_path,
  kyc_submitted_at,
  referral_installs
) ON public.stores TO authenticated;

-- ============================================================
-- SECTION 4 — anon: ensure no UPDATE at all
-- ============================================================
-- Anon should never be able to UPDATE stores.  Revoke is a no-op if anon
-- never had table-level UPDATE, but it is explicit and safe to include.
REVOKE UPDATE ON public.stores FROM anon;

-- ============================================================
-- VERIFICATION NOTES (for the operator running supabase db push)
-- ============================================================
-- After applying, probe with the anon key (PostgREST / JS SDK):
--
--   1. SELECT id, aadhaar_url FROM stores LIMIT 1
--      Expected: HTTP 400 / PGRST204 "column aadhaar_url does not exist" OR
--                the column is simply absent from the result (PostgREST
--                returns only columns the role can see). Confirmed blocked if
--                the KYC column is absent from the response or an error is
--                returned.
--
--   2. SELECT id, store_name, city FROM stores WHERE is_active=true LIMIT 1
--      Expected: HTTP 200 with data — storefront reads still work.
--
--   3. Authenticated seller JWT: .update({ address: 'new' }).eq('id', ...)
--      Expected: HTTP 403 "permission denied for column address"
--
--   4. Authenticated seller JWT: .update({ store_name: 'new' }).eq('id', ...)
--      Expected: HTTP 200 (non-address column, still permitted by RLS + grant)
--
--   5. Authenticated seller JWT: SELECT id, pan_number FROM stores WHERE seller_id=<own>
--      Expected: pan_number absent / null — seller settings page will need
--      updating to use /api/catalog/my-store (service_role) for KYC fields.
--
-- ============================================================
-- FOLLOW-UP REQUIRED (backend-engineer / ui-engineer)
-- ============================================================
-- The seller settings page at app/seller/(dashboard)/settings/page.tsx
-- currently reads KYC columns (pan_number, gst_number, pan_doc_path,
-- selfie_path) from the stores row via the authenticated Supabase client
-- (supabase.from('stores').select('*')).  After this migration those columns
-- will be absent from the client-side response.
--
-- Required change: update the `load()` function in settings/page.tsx to fetch
-- KYC data from /api/catalog/my-store (or a new /api/seller/my-store route)
-- which uses the service_role key on the server side.  The non-KYC store
-- fields (name, slug, category, etc.) can continue to be read directly from
-- the Supabase client.
--
-- The admin/sellers/[id]/page.tsx already uses createSupabaseAdmin (service_role)
-- for its stores query — no change needed there.
