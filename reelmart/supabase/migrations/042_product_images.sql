-- Migration 042: product_images table — WebP variant pipeline
--
-- DESIGN REF: agents_reports/DESIGN_product_image_pipeline.md (sections 3, 4.3)
--
-- SUMMARY
-- -------
-- 1. Creates public.product_images with per-image metadata (thumb/medium/full URLs,
--    dimensions, position ordering).
-- 2. RLS: public SELECT for images on approved/active/non-suspended stores;
--    seller SELECT for their own images (dashboard); no client-side INSERT/UPDATE/DELETE
--    (all writes go through catalog-service with service_role, which bypasses RLS).
-- 3. Trigger: after any insert/update/delete on product_images, syncs the
--    products.images TEXT[] column to an ordered list of thumb_url values.
--    This keeps all existing images[0] consumers (storefront, buyer-app) working
--    without code changes. Products with zero product_images rows are not touched.
-- 4. Storage bucket: raises product-images file_size_limit from 2 MB to 12 MB;
--    adds image/gif to allowed_mime_types (rejected by decode-verify in code,
--    but prevents browser-level bucket rejection edge cases).
-- 5. Old client-side storage write policies are DEFERRED — see note below.
--
-- CLIENT-SIDE STORAGE POLICY DECISION (Risk R6 from design)
-- ----------------------------------------------------------
-- Two active call sites upload directly from the browser today:
--   reelmart/apps/web/app/seller/(dashboard)/products/new/page.tsx:68
--   reelmart/apps/web/app/seller/(dashboard)/products/[id]/page.tsx:79
-- Both are being replaced by the ProductImageUploader component (ui-engineer work).
-- Dropping "Sellers upload product images" and "Sellers delete product images"
-- NOW would break these pages before the frontend migration lands.
-- ACTION: do NOT drop those policies in this migration.
-- FOLLOW-UP (flag for ui-engineer + database-engineer):
--   After the frontend product form pages are migrated to POST via catalog-service,
--   run the commented-out DROP POLICY statements in the ADDENDUM section at the
--   bottom of this file. That is a one-line migration (043 or appended to a
--   combined cutover migration).
--
-- BACKWARD COMPATIBILITY
-- ----------------------
-- Existing products.images[] rows are untouched — no backfill.
-- Old image URLs (JPEG/PNG, absolute public storage URLs) continue to render fine.
-- New uploads via the pipeline write product_images rows → trigger updates
-- products.images to thumb_url values; old uploads leave products.images
-- as the previously stored URL strings.
--
-- IDEMPOTENCY
-- -----------
-- All DDL uses IF NOT EXISTS / IF EXISTS guards so this migration is safe
-- to re-apply in a drift-recovery run.

-- ============================================================
-- SECTION 1 — product_images table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_images (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id   UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  thumb_url   TEXT        NOT NULL,   -- 400x400 cover WebP; used in products.images[] sync
  medium_url  TEXT        NOT NULL,   -- <=800px WebP; product detail hero
  full_url    TEXT        NOT NULL,   -- <=1400px WebP; zoom / og:image
  width       INTEGER,                -- original image width in pixels (from sharp metadata)
  height      INTEGER,                -- original image height in pixels
  position    INTEGER     NOT NULL DEFAULT 0,  -- display order; position=0 is the cover
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: ownership + ordered listing (used by trigger, backend quota check, dashboard)
CREATE INDEX IF NOT EXISTS product_images_product_pos_idx
  ON public.product_images (product_id, position);

-- Index: seller-scoped queries (dashboard, seller RLS policy)
CREATE INDEX IF NOT EXISTS product_images_seller_idx
  ON public.product_images (seller_id);

-- Table comment for Supabase Studio / schema browsers
COMMENT ON TABLE public.product_images IS
  'Per-image metadata for the WebP variant pipeline. Written exclusively by catalog-service (service_role). products.images[] is kept in sync via the sync_product_images_array trigger.';

COMMENT ON COLUMN public.product_images.position IS
  'Display order, 0-based. position=0 is the cover/primary image synced to products.images[0].';

COMMENT ON COLUMN public.product_images.seller_id IS
  'Denormalized from products→stores.seller_id for efficient seller-scoped RLS checks. Populated by catalog-service from the ownership lookup (never from request body).';

-- ============================================================
-- SECTION 2 — RLS on product_images
-- ============================================================

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Public SELECT: mirrors the products public-read policy (migration 026).
-- Only expose image metadata for products in approved, active, non-suspended stores.
-- This prevents image metadata from leaking for pending/rejected/suspended listings.
CREATE POLICY "product_images_public_read"
  ON public.product_images
  FOR SELECT
  USING (
    product_id IN (
      SELECT p.id
      FROM   public.products p
      JOIN   public.stores   s ON s.id = p.store_id
      WHERE  p.is_available      = true
        AND  s.approval_status   = 'approved'
        AND  s.is_active         = true
        AND  s.suspended         = false
    )
  );

-- Seller SELECT: sellers can read all their own image rows regardless of product/store
-- visibility state (they need to manage images in the dashboard even for pending stores).
-- Matches the pattern on products: "Sellers read all own products" uses
--   store_id IN (SELECT id FROM stores WHERE seller_id = auth.uid()).
-- Here we use the denormalized seller_id column for efficiency (avoids a two-hop join).
CREATE POLICY "product_images_seller_read"
  ON public.product_images
  FOR SELECT
  USING (seller_id = auth.uid());

-- Admin SELECT: full access via is_admin flag (mirrors migration 011 pattern).
CREATE POLICY "product_images_admin_all"
  ON public.product_images
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- NOTE ON WRITE POLICIES
-- There are intentionally NO INSERT/UPDATE/DELETE policies for the `authenticated`
-- role. catalog-service uses the service_role key which bypasses RLS entirely.
-- Enforcing ownership, quota, and suspension checks happens in the backend handler
-- (see design section 4). Opening a client-side write path would bypass those guards.

-- ============================================================
-- SECTION 3 — Denormalization sync trigger
-- ============================================================
-- After any image row is inserted, updated (e.g. reorder changes position), or
-- deleted, rebuild products.images for that product as an ordered array of
-- thumb_url values. Position 0 becomes images[0] — the cover thumbnail that
-- all existing consumers read.
--
-- Products with zero product_images rows are NOT touched (their existing
-- products.images[] content is preserved as-is for backward compatibility).
--
-- The function uses SECURITY DEFINER so it can update products even when
-- the calling session is the service_role (which already bypasses RLS, but
-- being explicit avoids any future confusion).

CREATE OR REPLACE FUNCTION public.sync_product_images_array()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_thumb_urls TEXT[];
BEGIN
  -- Determine which product was affected
  IF TG_OP = 'DELETE' THEN
    v_product_id := OLD.product_id;
  ELSE
    v_product_id := NEW.product_id;
  END IF;

  -- Collect ordered thumb URLs for this product
  SELECT ARRAY_AGG(thumb_url ORDER BY position ASC)
  INTO   v_thumb_urls
  FROM   public.product_images
  WHERE  product_id = v_product_id;

  -- Only sync when there are rows; leave products.images untouched when
  -- product_images is empty (preserves legacy URL content).
  IF v_thumb_urls IS NOT NULL AND array_length(v_thumb_urls, 1) > 0 THEN
    UPDATE public.products
    SET    images = v_thumb_urls
    WHERE  id = v_product_id;
  END IF;

  RETURN NULL;  -- AFTER trigger: return value is ignored for row triggers
END;
$$;

-- Attach the trigger; fire AFTER so the row change is already committed to the
-- table before we re-aggregate. STATEMENT-level (FOR EACH STATEMENT) would be
-- ambiguous for which product changed — we use FOR EACH ROW and capture the id.
DROP TRIGGER IF EXISTS trg_sync_product_images_array ON public.product_images;

CREATE TRIGGER trg_sync_product_images_array
  AFTER INSERT OR UPDATE OR DELETE
  ON public.product_images
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_images_array();

-- ============================================================
-- SECTION 4 — Storage bucket updates
-- ============================================================

-- Raise file_size_limit from 2 MB (2097152) to 12 MB (12582912) for raw phone
-- camera shots. The backend applies further validation before accepting the file.
-- Add image/gif to the MIME allowlist at the bucket level — the backend decode-verify
-- step rejects GIFs, but without this some browsers send an unusual MIME type for
-- JPEG/WebP that triggers a bucket rejection before the backend can inspect the file.
UPDATE storage.buckets
SET
  file_size_limit     = 12582912,
  allowed_mime_types  = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'product-images';

-- ============================================================
-- ADDENDUM — Client-side storage policy removal (DEFERRED)
-- ============================================================
-- Run these two statements ONLY after the seller product form pages
-- (products/new/page.tsx and products/[id]/page.tsx) have been migrated to
-- upload via the catalog-service API (ui-engineer task). Until then, dropping
-- these policies will break the live upload flow.
--
-- Suggested trigger: include in the same PR / deploy that ships ProductImageUploader
-- as a follow-up migration (043_drop_client_storage_upload_policies.sql).
--
-- DROP POLICY IF EXISTS "Sellers upload product images" ON storage.objects;
-- DROP POLICY IF EXISTS "Sellers delete product images" ON storage.objects;
--
-- After dropping: the product-images bucket is effectively read-only for all
-- browser sessions. All writes go through the catalog-service service_role.
-- The public read policy ("Product images public read") is unaffected.
-- ============================================================
