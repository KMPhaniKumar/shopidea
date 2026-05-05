import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import StorefrontClient from './StorefrontClient'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('store_name, description, logo_url, city')
    .eq('store_slug', params.slug)
    .single()

  if (!store) return { title: 'Store not found' }

  return {
    title: store.store_name,
    description: store.description ?? `Shop from ${store.store_name} on ReelMart — ${store.city}`,
    openGraph: {
      title: store.store_name,
      description: store.description ?? `Shop from ${store.store_name} on ReelMart`,
      images: store.logo_url ? [{ url: store.logo_url }] : [],
      siteName: 'ReelMart',
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function StorefrontPage({ params }: Props) {
  const supabase = createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('id, store_name, description, logo_url, city, area, whatsapp_number, is_verified, is_open, category')
    .eq('store_slug', params.slug)
    .single()

  if (!store) notFound()

  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, price, compare_price, images, variants, is_available, stock_type, stock_count')
    .eq('store_id', store.id)
    .eq('is_available', true)
    .order('created_at', { ascending: false })

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, rating, comment, created_at, users!reviewer_id(name)')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const avgRating = reviews && reviews.length > 0
    ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length
    : 0

  return (
    <StorefrontClient
      store={store as any}
      products={(products ?? []) as any}
      reviews={(reviews ?? []) as any}
      avgRating={avgRating}
      storeSlug={params.slug}
    />
  )
}
