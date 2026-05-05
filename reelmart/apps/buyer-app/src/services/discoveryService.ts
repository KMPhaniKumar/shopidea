import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export interface StoreCard {
  id: string
  store_name: string
  store_slug: string
  category: string
  logo_url: string | null
  city: string
  area: string | null
  rating_avg: number
  total_reviews: number
  total_orders: number
  is_verified: boolean
}

export interface ProductCard {
  id: string
  name: string
  price: number
  images: string[]
  store_id: string
  stores: { store_name: string; store_slug: string; city: string } | null
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

export async function getStoresByCity(city: string, category?: string): Promise<StoreCard[]> {
  const params = new URLSearchParams({ city })
  if (category) params.set('category', category)
  return api.get<StoreCard[]>(`/api/catalog/stores?${params}`)
}

export async function getTopRatedStores(city: string): Promise<StoreCard[]> {
  const stores = await api.get<StoreCard[]>(`/api/catalog/stores?city=${encodeURIComponent(city)}`)
  return stores.filter(s => s.rating_avg >= 4.0 && s.total_reviews >= 3).slice(0, 10)
}

export async function getNewStores(city: string): Promise<StoreCard[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data } = await supabase
    .from('stores')
    .select('id, store_name, store_slug, category, logo_url, city, area, rating_avg, total_reviews, is_verified')
    .eq('city', city)
    .eq('is_active', true)
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data as StoreCard[]) ?? []
}

export async function getFollowedStores(buyerId: string): Promise<StoreCard[]> {
  const { data } = await supabase
    .from('followed_stores')
    .select('stores(id, store_name, store_slug, category, logo_url, city, area, rating_avg, total_reviews, is_verified)')
    .eq('buyer_id', buyerId)
  return (data?.map((d: any) => d.stores).filter(Boolean) as StoreCard[]) ?? []
}

export async function search(query: string, city: string): Promise<{ stores: StoreCard[]; products: ProductCard[] }> {
  const term = query.trim()
  const [stores, productRes] = await Promise.all([
    api.get<StoreCard[]>(`/api/catalog/stores?q=${encodeURIComponent(term)}`),
    supabase
      .from('products')
      .select('id, name, price, images, store_id, stores(store_name, store_slug, city)')
      .ilike('name', `%${term}%`)
      .eq('is_available', true)
      .limit(12),
  ])
  return {
    stores: stores.slice(0, 6),
    products: (productRes.data as ProductCard[]) ?? [],
  }
}

export async function toggleFollowStore(_buyerId: string, storeId: string): Promise<boolean> {
  const result = await api.post<{ following: boolean }>(`/api/catalog/stores/${storeId}/follow`, {})
  return result.following
}

export async function getStoreBySlug(slug: string) {
  return api.get(`/api/catalog/stores/${slug}`)
}

export async function getStoreProducts(storeId: string) {
  return api.get(`/api/catalog/stores/${storeId}/products`)
}
