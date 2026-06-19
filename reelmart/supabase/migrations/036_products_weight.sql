-- Per-product shipping weight (grams), set once by the seller. Drives accurate
-- NimbusPost rate/courier selection and the shipment's package_weight at booking.
-- Nullable: existing products fall back to a 500g default until a weight is set.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight_grams INTEGER;
