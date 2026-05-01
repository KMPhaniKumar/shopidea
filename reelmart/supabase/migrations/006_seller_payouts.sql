-- Migration 006: Seller payouts, bank accounts, device tokens, notification preferences

CREATE TABLE public.bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  account_holder TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL CHECK (ifsc_code ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  bank_name TEXT,
  is_verified BOOLEAN DEFAULT false,
  razorpay_contact_id TEXT,
  razorpay_fund_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.users(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  razorpay_payout_id TEXT,
  period_start DATE,
  period_end DATE,
  order_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE public.device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE TABLE public.notification_preferences (
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  new_order_push BOOLEAN DEFAULT true,
  new_order_whatsapp BOOLEAN DEFAULT true,
  order_update_push BOOLEAN DEFAULT true,
  order_update_whatsapp BOOLEAN DEFAULT true,
  promotions_push BOOLEAN DEFAULT false,
  auto_accept_orders BOOLEAN DEFAULT false
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers read own bank account"
  ON public.bank_accounts FOR SELECT USING (seller_id = auth.uid());
CREATE POLICY "Sellers insert own bank account"
  ON public.bank_accounts FOR INSERT WITH CHECK (seller_id = auth.uid());
CREATE POLICY "Sellers update own bank account"
  ON public.bank_accounts FOR UPDATE USING (seller_id = auth.uid());

CREATE POLICY "Sellers see own payouts"
  ON public.payouts FOR SELECT USING (seller_id = auth.uid());
CREATE POLICY "Admins manage payouts"
  ON public.payouts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Users manage own device tokens"
  ON public.device_tokens FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert device tokens"
  ON public.device_tokens FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete device tokens"
  ON public.device_tokens FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Users manage own notification prefs"
  ON public.notification_preferences FOR ALL USING (user_id = auth.uid());

CREATE TRIGGER bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
