-- Migration 004: Orders table with sequence for order numbers

CREATE SEQUENCE order_number_seq START 10000;

CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE DEFAULT 'ORD-' || NEXTVAL('order_number_seq'),
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'packed', 'shipped', 'delivered', 'cancelled', 'return_requested', 'returned')),
  payment_status TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  payment_method TEXT DEFAULT 'online'
    CHECK (payment_method IN ('online', 'cod')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  coins_redeemed INT DEFAULT 0,
  coins_discount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  delivery_address JSONB NOT NULL,
  shiprocket_order_id TEXT,
  tracking_url TEXT,
  awb_code TEXT,
  rejection_reason TEXT,
  accepted_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see own orders"
  ON public.orders FOR SELECT
  USING (buyer_id = auth.uid());

CREATE POLICY "Buyers create orders"
  ON public.orders FOR INSERT
  WITH CHECK (buyer_id = auth.uid());

CREATE POLICY "Sellers see store orders"
  ON public.orders FOR SELECT
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Sellers update order status"
  ON public.orders FOR UPDATE
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Admins see all orders"
  ON public.orders FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX orders_buyer_idx ON public.orders (buyer_id);
CREATE INDEX orders_store_idx ON public.orders (store_id);
CREATE INDEX orders_status_idx ON public.orders (status);
CREATE INDEX orders_created_idx ON public.orders (created_at DESC);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
