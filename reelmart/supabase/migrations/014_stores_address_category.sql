-- Migration 014: Add address/state columns and update category constraint

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Drop old restrictive category check and replace with open text
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_category_check;
