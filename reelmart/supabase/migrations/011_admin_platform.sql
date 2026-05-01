-- Migration 011: Platform settings + announcements for admin

CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings readable by all authenticated"
  ON public.platform_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admins can modify settings"
  ON public.platform_settings FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

INSERT INTO public.platform_settings (key, value) VALUES
  ('delivery_fee_base', '"60"'),
  ('platform_commission_percent', '"2"'),
  ('free_delivery_threshold', '"500"'),
  ('coin_to_rupee_rate', '"0.10"'),
  ('return_window_hours', '"24"'),
  ('payout_day', '"monday"'),
  ('maintenance_mode', 'false'),
  ('min_order_amount', '"100"'),
  ('max_cart_items', '"20"');

CREATE TABLE public.announcements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target TEXT DEFAULT 'all' CHECK (target IN ('all', 'sellers', 'buyers')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active announcements public"
  ON public.announcements FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > NOW()));

CREATE POLICY "Admins manage announcements"
  ON public.announcements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));
