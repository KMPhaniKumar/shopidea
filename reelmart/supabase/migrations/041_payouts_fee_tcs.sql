-- Migration 041: Add platform_fee and tcs_amount to payouts (BUG-TCS-001)
--
-- The payout-service POST /process now records per-payout line items:
--   platform_fee  — 5% of gross order value retained by ReelMart
--   tcs_amount    — 1% TCS deducted under Sec 194-O of the Income Tax Act
--
-- Both columns are nullable so existing rows are valid without a backfill.
-- DECIMAL(10,2) matches the existing `amount` column precision on this table.
-- No RLS changes needed — existing policies on public.payouts cover all columns.

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS tcs_amount   DECIMAL(10,2);

-- Optional documentation comments for schema browsers / Supabase Studio
COMMENT ON COLUMN public.payouts.platform_fee IS '5% platform fee retained by ReelMart (PLATFORM_FEE_PCT × gross)';
COMMENT ON COLUMN public.payouts.tcs_amount   IS '1% Tax Collected at Source under Sec 194-O (TCS_PCT × gross)';
