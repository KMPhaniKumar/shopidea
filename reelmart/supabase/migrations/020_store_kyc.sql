-- Migration 020: Seller KYC fields (PAN, GST, shop selfie)
--
-- Collected during onboarding (and editable in Settings) so an admin can verify
-- the seller before approving the store. Document images live in the existing
-- private `seller-documents` storage bucket (see migration 012), keyed by the
-- seller's user id; we store only the object path here, never a public URL.
-- (Aadhaar is intentionally not collected.)

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  -- Object path of the uploaded PAN card image in `seller-documents`.
  ADD COLUMN IF NOT EXISTS pan_doc_path TEXT,
  -- GSTIN — optional (many micro-sellers aren't GST-registered).
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  -- Object path of the shop selfie in `seller-documents`.
  ADD COLUMN IF NOT EXISTS selfie_path TEXT,
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;
