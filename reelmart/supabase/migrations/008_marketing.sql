-- Migration 008: Coupons + broadcasts + coupon usage tracking

CREATE TABLE public.coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value DECIMAL(10,2) NOT NULL CHECK (value > 0),
  min_order_amount DECIMAL(10,2) DEFAULT 0,
  max_discount DECIMAL(10,2),
  max_uses INT,
  per_user_limit INT DEFAULT 1,
  total_uses INT DEFAULT 0,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, code)
);

CREATE TABLE public.coupon_uses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID REFERENCES public.coupons(id) NOT NULL,
  order_id UUID REFERENCES public.orders(id) NOT NULL,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  discount_amount DECIMAL(10,2),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coupon_id, order_id)
);

CREATE TABLE public.broadcasts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  recipient_count INT DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed'))
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active coupons readable by authenticated users"
  ON public.coupons FOR SELECT
  USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()));

CREATE POLICY "Sellers manage own coupons"
  ON public.coupons FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Buyers see own coupon uses"
  ON public.coupon_uses FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "Buyers insert coupon use"
  ON public.coupon_uses FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Sellers manage own broadcasts"
  ON public.broadcasts FOR ALL
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

-- Atomically record coupon use and increment counter
CREATE OR REPLACE FUNCTION use_coupon(
  p_coupon_id UUID, p_order_id UUID, p_buyer_id UUID, p_discount DECIMAL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.coupon_uses (coupon_id, order_id, buyer_id, discount_amount)
  VALUES (p_coupon_id, p_order_id, p_buyer_id, p_discount);
  UPDATE public.coupons SET total_uses = total_uses + 1 WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
