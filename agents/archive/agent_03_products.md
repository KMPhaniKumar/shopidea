# SKILL: Product Management
### File: skills/product-management/SKILL.md

---

## What This Feature Does

Sellers add, edit, delete and manage their product catalogue.
Each product has photos, price, variants and stock tracking.

## User Stories

- As a seller, I can add a product with up to 5 photos
- As a seller, I can add variants (size, color, flavor, weight)
- As a seller, I can set stock quantity or mark as unlimited
- As a seller, I can hide/show products instantly
- As a seller, I can edit any product detail
- As a seller, I get low stock alerts when stock is below 3

## Business Rules

- Max 5 photos per product
- Min photo size: 300x300px
- Max photo size: 2MB per photo
- Price must be positive number
- Stock -1 means unlimited
- Variants are optional
- Product is live immediately after adding

---

# AGENT: Product Management Builder
### File: agents/agent_03_products.md

---

## Step 1: Database Migration

Create `supabase/migrations/003_products.sql`:

```sql
CREATE TABLE public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price > 0),
  compare_price DECIMAL(10,2),
  stock_quantity INT DEFAULT -1,   -- -1 = unlimited
  images TEXT[] DEFAULT '{}',
  variants JSONB DEFAULT '[]',
  -- variants format: [{"name":"Size","options":["500g","1kg"],"prices":{"500g":450,"1kg":800}}]
  category TEXT,
  tags TEXT[],
  is_available BOOLEAN DEFAULT true,
  total_sold INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Products from active stores are publicly readable
CREATE POLICY "Products are public"
ON public.products FOR SELECT
USING (
  is_available = true AND
  store_id IN (SELECT id FROM public.stores WHERE is_active = true)
);

-- Sellers manage their own products
CREATE POLICY "Sellers manage own products"
ON public.products FOR ALL
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE seller_id = auth.uid()
  )
);

-- Full text search index
CREATE INDEX products_name_search ON public.products
USING GIN (to_tsvector('english', name));

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## Step 2: Storage Bucket for Products

```typescript
await supabase.storage.createBucket('product-images', {
  public: true,
  fileSizeLimit: 2097152, // 2MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
})
```

## Step 3: Product Service

Create `apps/seller-app/src/services/productService.ts`:

```typescript
import { supabase } from '../lib/supabase'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'

// Pick and compress image
export async function pickProductImage(): Promise<Blob | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  })
  if (result.canceled) return null

  // Compress to max 800x800
  const compressed = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 800, height: 800 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  )
  const response = await fetch(compressed.uri)
  return await response.blob()
}

// Upload single product image
export async function uploadProductImage(
  storeId: string,
  productId: string,
  imageBlob: Blob,
  index: number
): Promise<string> {
  const path = `stores/${storeId}/${productId}_${index}.jpg`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, imageBlob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}

// Create product
export async function createProduct(data: {
  storeId: string
  name: string
  description?: string
  price: number
  comparePrice?: number
  stockQuantity?: number
  variants?: any[]
  images?: Blob[]
}): Promise<string> {
  // Insert product first to get ID
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      store_id: data.storeId,
      name: data.name,
      description: data.description,
      price: data.price,
      compare_price: data.comparePrice,
      stock_quantity: data.stockQuantity ?? -1,
      variants: data.variants ?? [],
    })
    .select('id')
    .single()
  if (error) throw error

  // Upload images if provided
  if (data.images && data.images.length > 0) {
    const imageUrls = await Promise.all(
      data.images.map((img, i) =>
        uploadProductImage(data.storeId, product.id, img, i)
      )
    )
    await supabase
      .from('products')
      .update({ images: imageUrls })
      .eq('id', product.id)
  }

  return product.id
}

// Update product availability
export async function toggleProductAvailability(
  productId: string,
  isAvailable: boolean
): Promise<void> {
  await supabase
    .from('products')
    .update({ is_available: isAvailable })
    .eq('id', productId)
}

// Update stock
export async function updateStock(
  productId: string,
  quantity: number
): Promise<void> {
  await supabase
    .from('products')
    .update({ stock_quantity: quantity })
    .eq('id', productId)
}

// Get low stock products (below 3)
export async function getLowStockProducts(storeId: string) {
  const { data } = await supabase
    .from('products')
    .select('id, name, stock_quantity')
    .eq('store_id', storeId)
    .gt('stock_quantity', -1)   // not unlimited
    .lt('stock_quantity', 3)    // below 3
    .eq('is_available', true)
  return data ?? []
}
```

## Step 4: Product Screens

Create in `apps/seller-app/src/screens/products/`:

**ProductListScreen.tsx**
- Grid view of all products (2 columns)
- Each product card: photo, name, price, stock badge, available toggle
- FAB button to add new product
- Filter: All / Available / Hidden / Low Stock
- Swipe left on product → delete option

**AddProductScreen.tsx**
- Photo picker (up to 5 images) — horizontal scroll
- Product name input
- Description input (optional)
- Price input — show ₹ prefix
- Compare price input (optional — shows strikethrough)
- Stock quantity — toggle unlimited vs specific number
- Variants section — add variant groups
- Save button

**VariantBuilder.tsx** (component)
- Add variant group: "Size", "Color", "Flavor", "Weight"
- Add options within group: "500g", "1kg"
- Optional: different price per variant

**ProductDetailScreen.tsx**
- Edit all fields
- Photo management — add/remove/reorder
- Delete product (with confirmation)

## Step 5: Product Store (Zustand)

Create `apps/seller-app/src/store/productStore.ts`:

```typescript
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface ProductState {
  products: any[]
  loading: boolean
  fetchProducts: (storeId: string) => Promise<void>
  addProduct: (product: any) => void
  updateProduct: (id: string, data: any) => void
  removeProduct: (id: string) => void
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  loading: false,

  fetchProducts: async (storeId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
    set({ products: data ?? [], loading: false })
  },

  addProduct: (product) =>
    set(state => ({ products: [product, ...state.products] })),

  updateProduct: (id, data) =>
    set(state => ({
      products: state.products.map(p => p.id === id ? { ...p, ...data } : p)
    })),

  removeProduct: (id) =>
    set(state => ({
      products: state.products.filter(p => p.id !== id)
    })),
}))
```

## Done When

- Seller can add product with photos in under 1 minute
- Product appears on storefront immediately
- Variants work correctly
- Stock tracking works
- Low stock warning shows
