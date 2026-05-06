-- Migration 015: Store approval workflow

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Existing active stores are considered approved
UPDATE public.stores SET approval_status = 'approved' WHERE is_active = true;

CREATE INDEX IF NOT EXISTS stores_approval_idx ON public.stores (approval_status);
