-- Migration 009: Returns + refund tracking

CREATE TABLE public.returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) NOT NULL UNIQUE,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  reason TEXT NOT NULL,
  photos TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'refunded')),
  admin_notes TEXT,
  refund_amount DECIMAL(10,2),
  razorpay_refund_id TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT within_return_window CHECK (
    requested_at <= (SELECT created_at + INTERVAL '24 hours' FROM public.orders WHERE id = order_id)
  )
);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see own returns"
  ON public.returns FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "Buyers create returns"
  ON public.returns FOR INSERT WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Sellers see store returns"
  ON public.returns FOR SELECT
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Admins manage all returns"
  ON public.returns FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX returns_order_idx ON public.returns (order_id);
CREATE INDEX returns_status_idx ON public.returns (status);
