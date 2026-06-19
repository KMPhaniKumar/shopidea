-- Migration 037: configurable delivery commission slabs.
-- Platform margin added on top of the courier fee, by package weight (grams).
-- Buyer pays (cheapest courier fee + commission). Edit rows here to change
-- pricing without a deploy. up_to_grams is the INCLUSIVE upper bound of the
-- slab; NULL = the topmost slab (no upper bound).
CREATE TABLE public.delivery_commission_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  up_to_grams INTEGER,
  commission_rupees NUMERIC(10,2) NOT NULL CHECK (commission_rupees >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one row per bounded slab; exactly one unbounded (topmost) slab
CREATE UNIQUE INDEX delivery_commission_slabs_bounded_idx
  ON public.delivery_commission_slabs (up_to_grams) WHERE up_to_grams IS NOT NULL;
CREATE UNIQUE INDEX delivery_commission_slabs_top_idx
  ON public.delivery_commission_slabs ((up_to_grams IS NULL)) WHERE up_to_grams IS NULL;

INSERT INTO public.delivery_commission_slabs (up_to_grams, commission_rupees) VALUES
  (500, 20),
  (1000, 25),
  (NULL, 30);

ALTER TABLE public.delivery_commission_slabs ENABLE ROW LEVEL SECURITY;
-- Not sensitive; readable by anyone. Writes happen via the service role only.
CREATE POLICY "commission slabs readable"
  ON public.delivery_commission_slabs FOR SELECT USING (true);
