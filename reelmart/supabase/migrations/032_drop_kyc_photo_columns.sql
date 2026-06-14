-- Migration 032: Remove the PAN-card-photo and shop-selfie KYC document columns
--
-- WHY
-- ---
-- The PAN Card Photo and Shop Selfie uploads were removed from the product —
-- sellers now self-certify with their PAN/GST *numbers* only (the verification
-- gate `seller_verification.pan_provided` reads `pan_number`, not the photo).
-- These two columns held object paths into the `seller-documents` bucket and
-- are no longer written or read by any surface (settings page, my-store route,
-- and admin KYC review were all updated in the same change).
--
-- SAFE TO DROP
-- ------------
--   • The `seller_verification` SECURITY DEFINER view (migration 030) does NOT
--     reference pan_doc_path / selfie_path — it derives signature_present from
--     the separate `signature_path` column and pan_provided from `pan_number`.
--   • The column-level SELECT/UPDATE grants on these columns (migrations 023/024)
--     are dropped automatically by Postgres when the column is dropped.
--
-- NOTE: existing object files in the private `seller-documents` bucket are NOT
-- touched here (storage is out of scope for a SQL migration). They are now
-- orphaned and can be purged separately if desired.

ALTER TABLE public.stores
  DROP COLUMN IF EXISTS pan_doc_path,
  DROP COLUMN IF EXISTS selfie_path;
