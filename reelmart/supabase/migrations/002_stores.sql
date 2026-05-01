-- Migration 002: Stores table

CREATE TABLE public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  store_name TEXT NOT NULL,
  store_slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('food', 'jewellery', 'clothing', 'electronics', 'home', 'beauty', 'other')),
  logo_url TEXT,
  city TEXT NOT NULL,
  area TEXT,
  pincode TEXT CHECK (pincode ~ '^\d{6}$'),
  whatsapp_number TEXT,
  instagram_handle TEXT,
  is_active BOOLEAN DEFAULT true,
  is_open BOOLEAN DEFAULT true,
  open_time TEXT DEFAULT '09:00',
  close_time TEXT DEFAULT '21:00',
  open_days TEXT[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat'],
  rating_avg DECIMAL(3,2) DEFAULT 0,
  total_reviews INT DEFAULT 0,
  total_orders INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  aadhaar_url TEXT,
  referral_installs INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active stores publicly readable"
  ON public.stores FOR SELECT
  USING (is_active = true);

CREATE POLICY "Sellers read own store"
  ON public.stores FOR SELECT
  USING (seller_id = auth.uid());

CREATE POLICY "Sellers insert own store"
  ON public.stores FOR INSERT
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY "Sellers update own store"
  ON public.stores FOR UPDATE
  USING (seller_id = auth.uid());

CREATE INDEX stores_slug_idx ON public.stores (store_slug);
CREATE INDEX stores_city_idx ON public.stores (city);
CREATE INDEX stores_category_idx ON public.stores (category);
CREATE INDEX stores_seller_idx ON public.stores (seller_id);

CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Generate unique slug from store name
CREATE OR REPLACE FUNCTION generate_store_slug(store_name TEXT)
RETURNS TEXT AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  base_slug := LOWER(REGEXP_REPLACE(store_name, '[^a-zA-Z0-9]', '-', 'g'));
  base_slug := REGEXP_REPLACE(base_slug, '-+', '-', 'g');
  base_slug := TRIM(BOTH '-' FROM base_slug);
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.stores WHERE store_slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  RETURN final_slug;
END;
$$ LANGUAGE plpgsql;
