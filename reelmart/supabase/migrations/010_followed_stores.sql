-- Migration 010: Followed stores (buyers follow sellers)

CREATE TABLE public.followed_stores (
  buyer_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (buyer_id, store_id)
);

ALTER TABLE public.followed_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers manage followed stores"
  ON public.followed_stores FOR ALL USING (buyer_id = auth.uid());

CREATE POLICY "Follow counts publicly readable"
  ON public.followed_stores FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX followed_stores_buyer_idx ON public.followed_stores (buyer_id);
CREATE INDEX followed_stores_store_idx ON public.followed_stores (store_id);
