-- Migration 007: Buyer features — addresses, wishlist, cart, coins, referrals

CREATE TABLE public.addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  label TEXT DEFAULT 'Home',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  area TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL CHECK (pincode ~ '^\d{6}$'),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.wishlists (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE public.cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id, variant_id)
);

CREATE TABLE public.coin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  coins INT NOT NULL,
  reason TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.referral_installs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_slug TEXT REFERENCES public.stores(store_slug),
  new_user_id UUID REFERENCES public.users(id),
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own addresses"
  ON public.addresses FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users manage own wishlist"
  ON public.wishlists FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Users read own cart"
  ON public.cart_items FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Buyers insert cart items"
  ON public.cart_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Buyers update cart items"
  ON public.cart_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Buyers delete cart items"
  ON public.cart_items FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users see own coin transactions"
  ON public.coin_transactions FOR SELECT USING (user_id = auth.uid());

CREATE INDEX cart_user_idx ON public.cart_items (user_id);
CREATE INDEX addresses_user_idx ON public.addresses (user_id);
CREATE INDEX coin_transactions_user_idx ON public.coin_transactions (user_id);

-- Loyalty coins RPC functions
CREATE OR REPLACE FUNCTION add_loyalty_coins(
  p_user_id UUID, p_coins INT, p_reason TEXT, p_order_id UUID DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE public.users SET loyalty_coins = loyalty_coins + p_coins WHERE id = p_user_id;
  INSERT INTO public.coin_transactions (user_id, coins, reason, order_id)
  VALUES (p_user_id, p_coins, p_reason, p_order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION redeem_loyalty_coins(
  p_user_id UUID, p_coins INT, p_order_id UUID
) RETURNS DECIMAL AS $$
DECLARE
  v_current INT;
  v_value DECIMAL;
  v_rate DECIMAL := 0.10;
BEGIN
  SELECT loyalty_coins INTO v_current FROM public.users WHERE id = p_user_id;
  IF v_current < p_coins THEN
    RAISE EXCEPTION 'Insufficient coins: have %, need %', v_current, p_coins;
  END IF;
  v_value := p_coins * v_rate;
  UPDATE public.users SET loyalty_coins = loyalty_coins - p_coins WHERE id = p_user_id;
  INSERT INTO public.coin_transactions (user_id, coins, reason, order_id)
  VALUES (p_user_id, -p_coins, 'redeemed', p_order_id);
  RETURN v_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-award coins on order delivery
CREATE OR REPLACE FUNCTION award_order_coins() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    PERFORM add_loyalty_coins(
      NEW.buyer_id,
      GREATEST(1, FLOOR(NEW.total_amount / 10)::INT),
      'order_delivered',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION award_order_coins();
