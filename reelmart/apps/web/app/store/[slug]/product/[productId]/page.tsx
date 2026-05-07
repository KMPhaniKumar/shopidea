import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import ProductClient from './ProductClient'

interface Props { params: { slug: string; productId: string } }

export const revalidate = 60

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data } = await supabase
    .from('products')
    .select('name, description, images, price, stores!inner(store_name, store_slug)')
    .eq('id', params.productId)
    .eq('stores.store_slug', params.slug)
    .maybeSingle()

  if (!data) return { title: 'Product not found · ReelMart' }

  const store = data.stores as any
  const img = data.images?.[0]

  return {
    title: `${data.name} · ${store?.store_name ?? 'ReelMart'}`,
    description: data.description ?? `Order ${data.name} from ${store?.store_name} on ReelMart — ₹${data.price}`,
    openGraph: {
      title: data.name,
      description: data.description ?? `₹${data.price} · Order on ReelMart`,
      images: img ? [{ url: img }] : [],
      siteName: 'ReelMart',
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function ProductPage({ params }: Props) {
  const supabase = createClient()

  // Single round-trip: pull store + product joined on slug + id
  const { data: product } = await supabase
    .from('products')
    .select(`
      id, name, description, price, compare_price, images,
      is_available, stock_type, stock_count,
      store_id,
      stores!inner(id, store_name, store_slug, logo_url, city, area, is_verified, is_open, rating_avg, total_reviews, is_active)
    `)
    .eq('id', params.productId)
    .eq('stores.store_slug', params.slug)
    .eq('is_available', true)
    .maybeSingle()

  if (!product || !(product.stores as any)?.is_active) notFound()

  return <ProductClient product={product as any} storeSlug={params.slug} />
}
