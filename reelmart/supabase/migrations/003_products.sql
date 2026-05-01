-- Migration 003: Products table with variants + search

CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_price DECIMAL(10,2),
  images TEXT[] DEFAULT '{}',
  category TEXT,
  is_available BOOLEAN DEFAULT true,
  stock_type TEXT DEFAULT 'unlimited' CHECK (stock_type IN ('unlimited', 'counted')),
  stock_count INT DEFAULT 0,
  low_stock_threshold INT DEFAULT 5,
  sort_order INT DEFAULT 0,
  total_sold INT DEFAULT 0,
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  variant_type TEXT NOT NULL CHECK (variant_type IN ('size', 'color', 'flavor', 'weight', 'other')),
  name TEXT NOT NULL,
  price_adjustment DECIMAL(10,2) DEFAULT 0,
  stock_count INT DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Available products publicly readable"
  ON public.products FOR SELECT
  USING (is_available = true);

CREATE POLICY "Sellers read all own products"
  ON public.products FOR SELECT
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Sellers insert own products"
  ON public.products FOR INSERT
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Sellers update own products"
  ON public.products FOR UPDATE
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Sellers delete own products"
  ON public.products FOR DELETE
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Product variants publicly readable"
  ON public.product_variants FOR SELECT USING (true);

CREATE POLICY "Sellers manage own product variants"
  ON public.product_variants FOR ALL
  USING (product_id IN (
    SELECT p.id FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
    WHERE s.seller_id = auth.uid()
  ));

CREATE INDEX products_store_idx ON public.products (store_id);
CREATE INDEX products_search_idx ON public.products USING GIN (search_vector);

-- Full-text search vector
CREATE OR REPLACE FUNCTION update_product_search()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := TO_TSVECTOR('english', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_update
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_product_search();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
