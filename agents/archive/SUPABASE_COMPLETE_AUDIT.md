# Supabase Complete Audit Report
### Every table, RLS policy, storage bucket, edge function and client pattern verified

---

## What Was Found Missing

| Area | Issue |
|---|---|
| RLS Policies | 7 tables missing INSERT/UPDATE/DELETE policies |
| Storage | Buckets not created in code, no storage RLS policies |
| Edge Functions | 3 functions not fully implemented |
| Realtime | Tables not explicitly enabled for realtime |
| Admin Client | supabaseAdmin never properly defined in backend |
| Next.js Client | Server and browser Supabase clients missing |
| TypeScript Types | No type regeneration script after migrations |
| Tables Missing | followed_stores, platform_settings, announcements, coupon_uses |
| RPC Functions | add_loyalty_coins and redeem_loyalty_coins incomplete |
| Deep Linking | App scheme not configured for store links |
| Supabase Auth | Twilio setup and redirect URLs not documented |
| Production | Local to production linking steps missing |

---

## Missing Tables to Add

### Migration 010 — followed_stores
```sql
CREATE TABLE public.followed_stores (
  buyer_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (buyer_id, store_id)
);
ALTER TABLE public.followed_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers manage followed stores"
ON public.followed_stores FOR ALL USING (buyer_id = auth.uid());
CREATE POLICY "Followed stores publicly readable"
ON public.followed_stores FOR SELECT TO anon, authenticated USING (true);
```

### Migration 011 — platform_settings + admin
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

CREATE TABLE public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins access platform settings"
ON public.platform_settings FOR ALL
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

INSERT INTO public.platform_settings (key, value) VALUES
  ('delivery_fee_base', '60'),
  ('platform_commission_percent', '2'),
  ('free_delivery_threshold', '500'),
  ('coin_to_rupee_rate', '0.10'),
  ('return_window_hours', '24'),
  ('payout_day', '"monday"'),
  ('maintenance_mode', 'false');

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
```

### Migration 012 — coupon_uses
```sql
CREATE TABLE public.coupon_uses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_id UUID REFERENCES public.coupons(id),
  order_id UUID REFERENCES public.orders(id),
  buyer_id UUID REFERENCES public.users(id),
  discount_amount DECIMAL(10,2),
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coupon_id, order_id)
);
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers see own coupon uses"
ON public.coupon_uses FOR SELECT USING (buyer_id = auth.uid());
CREATE POLICY "Buyers insert coupon use"
ON public.coupon_uses FOR INSERT WITH CHECK (buyer_id = auth.uid());
```

---

## Missing RLS Policies

### Migration 013 — All missing RLS policies
```sql
-- Orders: buyers can INSERT
CREATE POLICY "Buyers create orders"
ON public.orders FOR INSERT WITH CHECK (buyer_id = auth.uid());

-- Products: sellers can INSERT/UPDATE/DELETE
CREATE POLICY "Sellers insert own products"
ON public.products FOR INSERT
WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));
CREATE POLICY "Sellers update own products"
ON public.products FOR UPDATE
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));
CREATE POLICY "Sellers delete own products"
ON public.products FOR DELETE
USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

-- Stores: sellers can INSERT
CREATE POLICY "Sellers insert own store"
ON public.stores FOR INSERT WITH CHECK (seller_id = auth.uid());

-- Reviews: verified buyers only
CREATE POLICY "Only verified buyers review"
ON public.reviews FOR INSERT
WITH CHECK (
  buyer_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = order_id AND buyer_id = auth.uid()
    AND store_id = reviews.store_id AND status = 'delivered'
  )
);

-- Cart items: full CRUD for buyer
CREATE POLICY "Buyers insert cart items"
ON public.cart_items FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Buyers update cart items"
ON public.cart_items FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Buyers delete cart items"
ON public.cart_items FOR DELETE USING (user_id = auth.uid());

-- Device tokens: full CRUD for user
CREATE POLICY "Users insert device tokens"
ON public.device_tokens FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete device tokens"
ON public.device_tokens FOR DELETE USING (user_id = auth.uid());
```

---

## Missing RPC Functions

### Add to migration 007
```sql
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
DECLARE v_current INT; v_value DECIMAL; v_rate DECIMAL;
BEGIN
  SELECT loyalty_coins INTO v_current FROM public.users WHERE id = p_user_id;
  IF v_current < p_coins THEN RAISE EXCEPTION 'Insufficient coins'; END IF;
  SELECT (value::TEXT)::DECIMAL INTO v_rate FROM public.platform_settings WHERE key = 'coin_to_rupee_rate';
  v_value := p_coins * COALESCE(v_rate, 0.10);
  UPDATE public.users SET loyalty_coins = loyalty_coins - p_coins WHERE id = p_user_id;
  INSERT INTO public.coin_transactions (user_id, coins, reason, order_id)
  VALUES (p_user_id, -p_coins, 'redeemed', p_order_id);
  RETURN v_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto award coins on delivery
CREATE OR REPLACE FUNCTION award_order_coins() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status != 'delivered' THEN
    PERFORM add_loyalty_coins(NEW.buyer_id, FLOOR(NEW.total_amount / 10)::INT, 'order_delivered', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION award_order_coins();

-- Atomically use coupon
CREATE OR REPLACE FUNCTION use_coupon(
  p_coupon_id UUID, p_order_id UUID, p_buyer_id UUID, p_discount DECIMAL
) RETURNS void AS $$
BEGIN
  INSERT INTO public.coupon_uses (coupon_id, order_id, buyer_id, discount_amount)
  VALUES (p_coupon_id, p_order_id, p_buyer_id, p_discount);
  UPDATE public.coupons SET total_uses = total_uses + 1 WHERE id = p_coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Missing Storage Buckets + Policies

### Migration 014 — Storage setup
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('store-logos', 'store-logos', true, 2097152, ARRAY['image/jpeg','image/png','image/webp']),
  ('review-photos', 'review-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('seller-documents', 'seller-documents', false, 10485760, ARRAY['image/jpeg','image/png','application/pdf'])
ON CONFLICT DO NOTHING;

-- Product images
CREATE POLICY "Product images public read"
ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');
CREATE POLICY "Sellers upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND
  EXISTS (SELECT 1 FROM public.stores
    WHERE id::TEXT = (storage.foldername(name))[2] AND seller_id = auth.uid()));
CREATE POLICY "Sellers delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND
  EXISTS (SELECT 1 FROM public.stores
    WHERE id::TEXT = (storage.foldername(name))[2] AND seller_id = auth.uid()));

-- Store logos
CREATE POLICY "Store logos public read"
ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'store-logos');
CREATE POLICY "Sellers upload own logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'store-logos' AND
  (storage.foldername(name))[1]::UUID IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

-- Review photos
CREATE POLICY "Review photos public read"
ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'review-photos');
CREATE POLICY "Buyers upload review photos"
ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'review-photos');

-- Seller documents (private)
CREATE POLICY "Sellers read own documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'seller-documents' AND (storage.foldername(name))[1]::UUID = auth.uid());
CREATE POLICY "Sellers upload own documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'seller-documents' AND (storage.foldername(name))[1]::UUID = auth.uid());
```

---

## Missing Realtime Setup

### Migration 015
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
```

---

## Missing Supabase Admin Client

Create `backend/src/lib/supabaseAdmin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/supabase'

export const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
```

Create `apps/web/src/lib/supabase/server.ts`:
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}
```

Create `apps/web/src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

---

## Missing Type Regeneration Script

Add to root `package.json`:
```json
{
  "scripts": {
    "gen:types": "supabase gen types typescript --local > shared/types/supabase.ts && cp shared/types/supabase.ts apps/seller-app/src/types/ && cp shared/types/supabase.ts apps/buyer-app/src/types/ && cp shared/types/supabase.ts apps/web/src/types/ && cp shared/types/supabase.ts backend/src/types/"
  }
}
```

Run after every migration: `npm run gen:types`

---

## Missing: Supabase Auth Dashboard Config

Do these manually in Supabase Dashboard after creating project:

```
1. Authentication > Providers > Phone
   Enable: YES
   SMS Provider: Twilio
   Fill: Account SID, Auth Token, Message Service SID

2. Authentication > URL Configuration
   Site URL: https://platform.com
   Redirect URLs:
     https://platform.com/*
     platform://
     exp://

3. Authentication > Settings
   OTP expiry: 300 seconds
   OTP length: 6
   Disable email provider (phone only)
```

---

## Missing: Deep Linking Config

Add to `apps/buyer-app/app.json`:
```json
{
  "expo": {
    "scheme": "platform",
    "intentFilters": [{
      "action": "VIEW",
      "data": [{ "scheme": "https", "host": "platform.com", "pathPrefix": "/s/" }],
      "category": ["BROWSABLE", "DEFAULT"]
    }]
  }
}
```

---

## Complete Migration Order — Final

```
supabase migration new users
supabase migration new stores
supabase migration new products
supabase migration new orders
supabase migration new reviews
supabase migration new seller_payouts
supabase migration new buyer_features
supabase migration new marketing
supabase migration new returns
supabase migration new followed_stores
supabase migration new admin_platform
supabase migration new coupon_uses
supabase migration new rls_fixes
supabase migration new storage_buckets
supabase migration new realtime
supabase migration new cron_jobs

supabase db push
npm run gen:types
```

---

## Final Supabase Checklist Before Launch

```
DATABASE
[ ] All 16 migrations pushed — supabase db push
[ ] All tables visible in Studio
[ ] RLS enabled on every table — verify in Studio Auth Policies
[ ] All INSERT/UPDATE/DELETE policies exist
[ ] Triggers tested — create test order, check coins awarded
[ ] RPC functions tested in Studio SQL editor
[ ] Realtime enabled — test live order update

AUTH
[ ] Twilio connected and tested with real Indian number
[ ] OTP arrives within 10 seconds
[ ] Redirect URLs configured in Dashboard
[ ] JWT expiry set to 3600

STORAGE
[ ] All 4 buckets created and visible in Studio
[ ] Storage RLS policies active
[ ] Upload test from mobile works
[ ] Public image URL accessible in browser

EDGE FUNCTIONS
[ ] order-notifications deployed
[ ] store-router deployed
[ ] process-payouts deployed
[ ] Database webhook pointing to order-notifications
[ ] Cron job scheduled for Monday payouts
[ ] All secrets set: supabase secrets list

TYPES
[ ] npm run gen:types runs without error
[ ] Generated types copied to all 4 apps
[ ] Zero TypeScript type errors in any app

PRODUCTION
[ ] supabase link --project-ref done
[ ] supabase db push run on production
[ ] All functions deployed to production
[ ] Production env vars set in all apps
[ ] Test full flow on production: signup > create store > add product > place order > pay
```
