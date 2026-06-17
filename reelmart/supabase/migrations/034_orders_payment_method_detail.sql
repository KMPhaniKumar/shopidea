-- Migration 034: capture the actual online payment instrument (upi/card/netbanking/wallet)
-- so the buyer order screen can show "Paid By: UPI" etc. Null for COD / unknown.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_detail TEXT;
