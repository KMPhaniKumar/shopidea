# AGENT 12: Buyer Profile + Cart + Wishlist + Saved Addresses + Reorder
### File: agents/agent_12_buyer_profile_cart.md

---

## What This Covers

- Buyer profile (name, avatar, preferences)
- Persistent cart (survives app close)
- Saved addresses (add, edit, delete, default)
- Wishlist (save products, get notified)
- Reorder from history
- App install referral tracking

---

## Step 1: Database Migrations

Create `supabase/migrations/007_buyer_features.sql`:

```sql
-- Saved addresses
CREATE TABLE public.saved_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  label TEXT DEFAULT 'Home',   -- Home, Work, Other
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own addresses"
ON public.saved_addresses FOR ALL
USING (user_id = auth.uid());

-- Wishlists
CREATE TABLE public.wishlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist"
ON public.wishlists FOR ALL
USING (user_id = auth.uid());

-- Cart (persisted in DB, synced across devices)
CREATE TABLE public.cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_variant JSONB,  -- {"name":"Size","value":"1kg","price":800}
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id, selected_variant)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cart"
ON public.cart_items FOR ALL
USING (user_id = auth.uid());

-- Loyalty coins transactions
CREATE TABLE public.coin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  coins INT NOT NULL,         -- positive = earned, negative = spent
  reason TEXT NOT NULL,       -- 'order_placed', 'review_submitted', 'referral', 'redeemed'
  order_id UUID REFERENCES public.orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own coin transactions"
ON public.coin_transactions FOR SELECT
USING (user_id = auth.uid());

-- Add loyalty coins function
CREATE OR REPLACE FUNCTION add_loyalty_coins(user_id UUID, coins INT, reason TEXT, order_id UUID DEFAULT NULL)
RETURNS void AS $$
BEGIN
  UPDATE public.users SET loyalty_coins = loyalty_coins + coins WHERE id = user_id;
  INSERT INTO public.coin_transactions (user_id, coins, reason, order_id)
  VALUES (user_id, coins, reason, order_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Buyer referral tracking
CREATE TABLE public.buyer_referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_user_id UUID REFERENCES public.users(id),
  referred_user_id UUID REFERENCES public.users(id) UNIQUE,
  referral_code TEXT,
  coins_awarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Step 2: Cart Service

Create `apps/buyer-app/src/services/cartService.ts`:

```typescript
import { supabase } from '../lib/supabase'

// Cart is per-store — buyer can only have items from ONE store at a time
// If they try to add from different store → show warning

export async function getCart(userId: string) {
  const { data } = await supabase
    .from('cart_items')
    .select(`
      *,
      products (id, name, price, images, stock_quantity, is_available),
      stores (id, store_name, store_slug, logo_url, city)
    `)
    .eq('user_id', userId)
  return data ?? []
}

export async function addToCart(data: {
  userId: string
  productId: string
  storeId: string
  quantity: number
  selectedVariant?: any
}): Promise<{ success: boolean; error?: string }> {
  // Check if cart has items from different store
  const { data: existing } = await supabase
    .from('cart_items')
    .select('store_id')
    .eq('user_id', data.userId)
    .limit(1)
    .single()

  if (existing && existing.store_id !== data.storeId) {
    return {
      success: false,
      error: 'Your cart has items from another store. Clear cart to add from this store.'
    }
  }

  // Check stock
  const { data: product } = await supabase
    .from('products')
    .select('stock_quantity, is_available')
    .eq('id', data.productId)
    .single()

  if (!product?.is_available) return { success: false, error: 'Product not available' }
  if (product.stock_quantity !== -1 && product.stock_quantity < data.quantity) {
    return { success: false, error: `Only ${product.stock_quantity} left in stock` }
  }

  const { error } = await supabase
    .from('cart_items')
    .upsert({
      user_id: data.userId,
      product_id: data.productId,
      store_id: data.storeId,
      quantity: data.quantity,
      selected_variant: data.selectedVariant ?? null,
    }, { onConflict: 'user_id,product_id,selected_variant' })

  return { success: !error }
}

export async function updateCartQuantity(
  userId: string,
  cartItemId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) {
    await supabase.from('cart_items').delete().eq('id', cartItemId).eq('user_id', userId)
  } else {
    await supabase.from('cart_items').update({ quantity }).eq('id', cartItemId).eq('user_id', userId)
  }
}

export async function clearCart(userId: string): Promise<void> {
  await supabase.from('cart_items').delete().eq('user_id', userId)
}

export function calculateCartTotals(items: any[]) {
  const subtotal = items.reduce((sum, item) => {
    const price = item.selected_variant?.price ?? item.products.price
    return sum + price * item.quantity
  }, 0)
  return { subtotal, itemCount: items.reduce((s, i) => s + i.quantity, 0) }
}
```

---

## Step 3: Cart Store (Zustand)

Create `apps/buyer-app/src/store/cartStore.ts`:

```typescript
import { create } from 'zustand'
import { getCart, addToCart, updateCartQuantity, clearCart, calculateCartTotals } from '../services/cartService'

interface CartState {
  items: any[]
  itemCount: number
  subtotal: number
  store: any | null       // which store the cart belongs to
  loading: boolean
  fetchCart: (userId: string) => Promise<void>
  addItem: (data: any) => Promise<{ success: boolean; error?: string }>
  updateQuantity: (userId: string, itemId: string, qty: number) => Promise<void>
  clear: (userId: string) => Promise<void>
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  itemCount: 0,
  subtotal: 0,
  store: null,
  loading: false,

  fetchCart: async (userId) => {
    set({ loading: true })
    const items = await getCart(userId)
    const { subtotal, itemCount } = calculateCartTotals(items)
    set({ items, subtotal, itemCount, store: items[0]?.stores ?? null, loading: false })
  },

  addItem: async (data) => {
    const result = await addToCart(data)
    if (result.success) await get().fetchCart(data.userId)
    return result
  },

  updateQuantity: async (userId, itemId, qty) => {
    await updateCartQuantity(userId, itemId, qty)
    await get().fetchCart(userId)
  },

  clear: async (userId) => {
    await clearCart(userId)
    set({ items: [], itemCount: 0, subtotal: 0, store: null })
  },
}))
```

---

## Step 4: Saved Addresses Service

Create `apps/buyer-app/src/services/addressService.ts`:

```typescript
import { supabase } from '../lib/supabase'

export async function getSavedAddresses(userId: string) {
  const { data } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
  return data ?? []
}

export async function saveAddress(userId: string, address: {
  label: string
  recipientName: string
  phone: string
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
  isDefault?: boolean
}): Promise<void> {
  if (address.isDefault) {
    // Remove default from all other addresses first
    await supabase
      .from('saved_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
  }
  await supabase.from('saved_addresses').insert({
    user_id: userId,
    label: address.label,
    recipient_name: address.recipientName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    is_default: address.isDefault ?? false,
  })
}

export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  await supabase.from('saved_addresses').delete().eq('id', addressId).eq('user_id', userId)
}

export async function setDefaultAddress(addressId: string, userId: string): Promise<void> {
  await supabase.from('saved_addresses').update({ is_default: false }).eq('user_id', userId)
  await supabase.from('saved_addresses').update({ is_default: true }).eq('id', addressId)
}
```

---

## Step 5: Wishlist Service

```typescript
export async function getWishlist(userId: string) {
  const { data } = await supabase
    .from('wishlists')
    .select('*, products(id, name, price, images, is_available, stores(store_name, store_slug))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single()

  if (existing) {
    await supabase.from('wishlists').delete().eq('id', existing.id)
    return false  // removed
  } else {
    await supabase.from('wishlists').insert({ user_id: userId, product_id: productId })
    return true   // added
  }
}

export async function isWishlisted(userId: string, productId: string): Promise<boolean> {
  const { data } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .single()
  return !!data
}
```

---

## Step 6: Reorder Feature

```typescript
// One-tap reorder from order history
export async function reorderFromHistory(
  userId: string,
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  // Fetch the original order
  const { data: order } = await supabase
    .from('orders')
    .select('items, store_id')
    .eq('id', orderId)
    .single()

  if (!order) return { success: false, error: 'Order not found' }

  // Clear current cart
  await clearCart(userId)

  // Add all items from old order to cart
  const errors: string[] = []
  for (const item of order.items) {
    const result = await addToCart({
      userId,
      productId: item.product_id,
      storeId: order.store_id,
      quantity: item.qty,
      selectedVariant: item.variant ? { value: item.variant, price: item.price } : null,
    })
    if (!result.success) errors.push(`${item.name}: ${result.error}`)
  }

  if (errors.length > 0) {
    return { success: false, error: `Some items unavailable: ${errors.join(', ')}` }
  }
  return { success: true }
}
```

---

## Step 7: App Install Referral Tracking

Track which seller link brought the buyer when they install:

```typescript
// In web storefront (Next.js) — store referral in localStorage before redirect to app store
// After app install and signup — read the referral and save it

// apps/buyer-app/src/services/referralService.ts
export async function trackReferral(data: {
  newBuyerId: string
  storeId?: string           // came via seller link
  referrerUserId?: string    // came via friend referral
}) {
  if (data.storeId) {
    // Track seller referral — for seller analytics and buyer coin bonus
    await supabase.from('referrals').upsert({
      store_id: data.storeId,
      buyer_id: data.newBuyerId,
    })
    // Award 50 coins to new buyer for installing via seller link
    await supabase.rpc('add_loyalty_coins', {
      user_id: data.newBuyerId,
      coins: 50,
      reason: 'app_install_via_seller',
    })
  }

  if (data.referrerUserId) {
    // Friend referral — both get coins
    await supabase.from('buyer_referrals').insert({
      referrer_user_id: data.referrerUserId,
      referred_user_id: data.newBuyerId,
    })
    await supabase.rpc('add_loyalty_coins', { user_id: data.referrerUserId, coins: 100, reason: 'referral_bonus' })
    await supabase.rpc('add_loyalty_coins', { user_id: data.newBuyerId, coins: 100, reason: 'referred_bonus' })
  }
}
```

---

## Step 8: Buyer Profile Screen

Create `apps/buyer-app/src/screens/profile/ProfileScreen.tsx`:

```
PROFILE
├── Avatar + Name + Phone (edit button)
├── Loyalty Coins balance + history link

MY ORDERS
├── Active orders count
├── Past orders list with reorder button

MY ADDRESSES
├── Saved addresses list
├── Add new address button
├── Set default address

WISHLIST
├── Grid of saved products
├── Add to cart from wishlist

REFERRAL
├── My referral code / link
├── "Share and earn ₹100" button
├── Referral history

ACCOUNT
├── Notification preferences
├── Privacy Policy
├── Help & Support
├── Logout
```

---

## Done When

- [ ] Cart persists across app restarts
- [ ] Cart warns when adding from different store
- [ ] Saved addresses work (add, edit, delete, default)
- [ ] Wishlist heart icon toggles on all product cards
- [ ] Reorder button pre-fills cart from history
- [ ] Referral link generated for each buyer
- [ ] Coins awarded on install and referral
- [ ] Buyer profile shows correct info
