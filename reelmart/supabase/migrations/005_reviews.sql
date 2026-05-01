-- Migration 005: Reviews + auto-update store rating

CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) NOT NULL,
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  photos TEXT[] DEFAULT '{}',
  seller_reply TEXT,
  seller_replied_at TIMESTAMPTZ,
  is_verified_purchase BOOLEAN DEFAULT true,
  coins_awarded INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, buyer_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews publicly readable"
  ON public.reviews FOR SELECT USING (true);

CREATE POLICY "Only verified buyers review"
  ON public.reviews FOR INSERT
  WITH CHECK (
    buyer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id
        AND buyer_id = auth.uid()
        AND store_id = reviews.store_id
        AND status = 'delivered'
    )
  );

CREATE POLICY "Sellers reply to own store reviews"
  ON public.reviews FOR UPDATE
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE INDEX reviews_store_idx ON public.reviews (store_id);
CREATE INDEX reviews_buyer_idx ON public.reviews (buyer_id);

-- Auto-update store rating on review insert/update/delete
CREATE OR REPLACE FUNCTION update_store_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id UUID;
BEGIN
  v_store_id := COALESCE(NEW.store_id, OLD.store_id);
  UPDATE public.stores
  SET
    rating_avg = (SELECT AVG(rating)::DECIMAL(3,2) FROM public.reviews WHERE store_id = v_store_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE store_id = v_store_id)
  WHERE id = v_store_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_store_rating();
