# SKILL: Seller Onboarding
### File: skills/seller-onboarding/SKILL.md

---

## What This Feature Does

After a user logs in and selects "seller" role, they go through a quick
store setup flow. At the end they have a live store with a shareable link.

## User Stories

- As a new seller, I can create my store in under 2 minutes
- As a seller, I get a unique store URL → myshop.platform.com
- As a seller, I can upload my shop logo from my phone gallery
- As a seller, I can edit my store details anytime
- As a seller, I can see my unique store link and share it

## Business Rules

- Store slug auto-generated from store name (unique)
- If slug taken → append number → myshop2
- Logo upload → stored in Supabase Storage store-logos bucket
- Store is live immediately after creation
- One seller can have only one store (Phase 1)

---

# AGENT: Seller Onboarding Builder
### File: agents/agent_02_seller.md

---

## Step 1: Database Migration

Create `supabase/migrations/002_stores.sql`:

```sql
CREATE TABLE public.stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES public.users(id) NOT NULL,
  store_name TEXT NOT NULL,
  store_slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'food', 'jewellery', 'clothing', 'organic',
    'crafts', 'plants', 'skincare', 'other'
  )),
  description TEXT,
  logo_url TEXT,
  city TEXT NOT NULL,
  area TEXT,
  rating_avg DECIMAL DEFAULT 0,
  total_orders INT DEFAULT 0,
  total_reviews INT DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  whatsapp_number TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- Public can read active stores
CREATE POLICY "Active stores are public"
ON public.stores FOR SELECT
USING (is_active = true);

-- Sellers can only update their own store
CREATE POLICY "Sellers manage own store"
ON public.stores FOR ALL
USING (seller_id = auth.uid());

-- Referrals table
CREATE TABLE public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id),
  buyer_id UUID REFERENCES public.users(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, buyer_id)
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Step 2: Storage Bucket

```typescript
// Run this once to create storage bucket
const { data, error } = await supabase.storage.createBucket('store-logos', {
  public: true,
  fileSizeLimit: 2097152, // 2MB max
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
})
```

## Step 3: Store Service

Create `apps/seller-app/src/services/storeService.ts`:

```typescript
import { supabase } from '../lib/supabase'

// Generate unique slug from store name
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 30)
}

// Check if slug is available
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const { data } = await supabase
    .from('stores')
    .select('id')
    .eq('store_slug', slug)
    .single()
  return !data
}

// Get unique slug (append number if taken)
export async function getUniqueSlug(name: string): Promise<string> {
  let slug = generateSlug(name)
  let counter = 1
  while (!(await isSlugAvailable(slug))) {
    slug = `${generateSlug(name)}${counter}`
    counter++
  }
  return slug
}

// Upload store logo
export async function uploadLogo(storeId: string, file: Blob): Promise<string> {
  const path = `${storeId}/logo.jpg`
  const { error } = await supabase.storage
    .from('store-logos')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('store-logos').getPublicUrl(path)
  return data.publicUrl
}

// Create store
export async function createStore(data: {
  sellerId: string
  storeName: string
  category: string
  city: string
  area?: string
  description?: string
  whatsappNumber?: string
}): Promise<{ storeId: string; slug: string }> {
  const slug = await getUniqueSlug(data.storeName)
  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      seller_id: data.sellerId,
      store_name: data.storeName,
      store_slug: slug,
      category: data.category,
      city: data.city,
      area: data.area,
      description: data.description,
      whatsapp_number: data.whatsappNumber,
    })
    .select('id, store_slug')
    .single()
  if (error) throw error
  return { storeId: store.id, slug: store.store_slug }
}
```

## Step 4: Seller Onboarding Screens

Create these screens in `apps/seller-app/src/screens/onboarding/`:

**StoreNameScreen.tsx**
- Input: store name
- Auto-preview the URL as they type → yourshop.platform.com
- Validate: min 3 chars, max 30 chars

**CategoryScreen.tsx**
- Grid of category options with icons
- Food / Jewellery / Clothing / Organic / Crafts / Plants / Skincare / Other
- Single select

**LocationScreen.tsx**
- City input with autocomplete (Google Maps Places)
- Area/locality input (optional)
- WhatsApp number (pre-filled from auth)

**LogoScreen.tsx**
- Upload from gallery or skip
- Preview selected image
- Circular crop

**StoreReadyScreen.tsx**
- Show: "Your store is live! 🎉"
- Show store URL
- Big "Share on WhatsApp" button
- Big "Share on Instagram" button
- "Go to Dashboard" button

## Step 5: Share Store Logic

```typescript
import { Share } from 'react-native'

export async function shareStore(storeName: string, slug: string) {
  await Share.share({
    message: `🛍️ Check out ${storeName}!\n\nOrder now: https://platform.com/s/${slug}\n\n✅ Secure payments\n📦 Fast delivery`,
    url: `https://platform.com/s/${slug}`,
  })
}
```

## Step 6: Seller Store (Zustand)

Create `apps/seller-app/src/store/sellerStore.ts`:

```typescript
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface SellerState {
  store: any | null
  loading: boolean
  fetchStore: (sellerId: string) => Promise<void>
  updateStore: (data: Partial<any>) => Promise<void>
}

export const useSellerStore = create<SellerState>((set, get) => ({
  store: null,
  loading: false,

  fetchStore: async (sellerId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('seller_id', sellerId)
      .single()
    set({ store: data, loading: false })
  },

  updateStore: async (data) => {
    const { store } = get()
    if (!store) return
    await supabase.from('stores').update(data).eq('id', store.id)
    set(state => ({ store: { ...state.store, ...data } }))
  },
}))
```

## Done When

- Seller can complete store setup in under 2 minutes
- Store URL is generated and shareable
- Logo upload works
- Store appears in Supabase dashboard
