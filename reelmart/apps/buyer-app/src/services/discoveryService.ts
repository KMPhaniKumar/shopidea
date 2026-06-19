import { supabase } from '../lib/supabase'

export interface StoreCard {
  id: string
  store_name: string
  store_slug: string
  category: string
  logo_url: string | null
  city: string
  area: string | null
  description: string | null
  rating_avg: number
  total_reviews: number
  total_orders: number
  is_verified: boolean
  /** Admin-verified GST — drives the interstate-selling block. */
  gst_verified?: boolean | null
  /** Seller's registered state — compared against buyer's state for GST gating. */
  state?: string | null
}

export interface ProductCard {
  id: string
  name: string
  price: number
  images: string[]
  description: string | null
  store_id: string
  stores: { store_name: string; store_slug: string; city: string; category?: string } | null
}

export const CATEGORIES = [
  { id: 'food',        label: 'Food',        icon: '🍱' },
  { id: 'jewellery',   label: 'Jewellery',   icon: '💍' },
  { id: 'clothing',    label: 'Clothing',    icon: '👗' },
  { id: 'home',        label: 'Home',        icon: '🏠' },
  { id: 'beauty',      label: 'Beauty',      icon: '💄' },
  { id: 'electronics', label: 'Electronics', icon: '📱' },
  { id: 'other',       label: 'Other',       icon: '🎁' },
]

const STORE_SELECT = 'id, store_name, store_slug, category, logo_url, city, area, description, rating_avg, total_reviews, total_orders, is_verified'

export async function getStoresByCity(city: string, category?: string): Promise<StoreCard[]> {
  let query = supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('city', city)
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })
    .limit(20)
  if (category) query = query.eq('category', category)
  const { data } = await query
  return (data as StoreCard[]) ?? []
}

export async function getTopRatedStores(city: string): Promise<StoreCard[]> {
  const { data } = await supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('city', city)
    .eq('is_active', true)
    .gte('rating_avg', 0)
    .order('rating_avg', { ascending: false })
    .limit(10)
  return (data as StoreCard[]) ?? []
}

export async function getNewStores(city: string): Promise<StoreCard[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data } = await supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('city', city)
    .eq('is_active', true)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data as StoreCard[]) ?? []
}

export async function getAllStoresByCategory(category: string): Promise<StoreCard[]> {
  const { data } = await supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('category', category)
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })
    .limit(30)
  return (data as StoreCard[]) ?? []
}

export async function getAllTopRated(): Promise<StoreCard[]> {
  const { data } = await supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('is_active', true)
    .order('rating_avg', { ascending: false })
    .limit(10)
  return (data as StoreCard[]) ?? []
}

export async function getAllNewStores(): Promise<StoreCard[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data } = await supabase
    .from('stores')
    .select(STORE_SELECT)
    .eq('is_active', true)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data as StoreCard[]) ?? []
}

// Available products whose store is in the given category — with descriptions,
// for the home feed's per-category product carousels.
export async function getProductsByCategory(category: string): Promise<ProductCard[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, price, images, description, store_id, stores!inner(store_name, store_slug, city, category, is_active)')
    .eq('is_available', true)
    .eq('stores.category', category)
    .eq('stores.is_active', true)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as unknown as ProductCard[]) ?? []
}

export async function getFollowedStores(buyerId: string): Promise<StoreCard[]> {
  const { data } = await supabase
    .from('followed_stores')
    .select(`stores(${STORE_SELECT})`)
    .eq('buyer_id', buyerId)
  return (data?.map((d: any) => d.stores).filter(Boolean) as StoreCard[]) ?? []
}

export async function search(query: string, city: string): Promise<{ stores: StoreCard[]; products: ProductCard[] }> {
  const term = query.trim()
  const [storeRes, productRes] = await Promise.all([
    supabase
      .from('stores')
      .select(STORE_SELECT)
      .eq('is_active', true)
      .ilike('store_name', `%${term}%`)
      .limit(6),
    supabase
      .from('products')
      .select('id, name, price, images, description, store_id, stores(store_name, store_slug, city)')
      .ilike('name', `%${term}%`)
      .eq('is_available', true)
      .limit(12),
  ])
  return {
    stores: (storeRes.data as StoreCard[]) ?? [],
    products: (productRes.data as ProductCard[]) ?? [],
  }
}

export async function getStoreBySlug(slug: string) {
  // Explicit safe columns only — never select('*') here, which would expose
  // seller KYC/PII (pan_number, aadhaar_url, gst_number, selfie_path, …) and
  // the seller's personal phone. Buyer contact uses stores.whatsapp_number.
  // seller_id is intentionally excluded from the public storefront response —
  // it is a UUID that links the store to its seller's identity and is not
  // needed by buyers.  The seller's display name is fetched via the
  // public_user_names view so the underlying users table is never queried
  // directly by the anon client.
  const { data } = await supabase
    .from('stores')
    .select('id, store_name, store_slug, category, logo_url, description, city, area, state, pincode, whatsapp_number, instagram_handle, rating_avg, total_reviews, total_orders, is_verified, gst_verified, is_active, created_at, public_user_names:seller_id(name)')
    .eq('store_slug', slug)
    .eq('is_active', true)
    .single()
  return data
}

export async function getStoreProducts(storeId: string) {
  const { data } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function toggleFollowStore(buyerId: string, storeId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('followed_stores')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('store_id', storeId)
    .single()

  if (existing) {
    await supabase.from('followed_stores').delete().eq('buyer_id', buyerId).eq('store_id', storeId)
    return false
  } else {
    await supabase.from('followed_stores').insert({ buyer_id: buyerId, store_id: storeId })
    return true
  }
}
