import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import StoreClient from './StoreClient'

interface Props { params: { slug: string } }

// Cache store page for 60s — products change rarely vs traffic
export const revalidate = 60

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('store_name, description, logo_url, city')
    .eq('store_slug', params.slug)
    .maybeSingle()

  if (!store) return { title: 'Store not found · ReelMart' }

  return {
    title: `${store.store_name} · ReelMart`,
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
    .select('id, store_name, description, logo_url, city, area, whatsapp_number, is_verified, is_open, category, rating_avg, total_reviews')
    .eq('store_slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) notFound()

  const { data: products, error: productsErr } = await supabase
    .from('products')
    .select('id, name, description, price, compare_price, images, is_available, stock_type, stock_count')
    .eq('store_id', store.id)
    .eq('is_available', true)
    .order('created_at', { ascending: false })

  if (productsErr) console.error('[store/[slug]] products query failed:', productsErr)

  return (
    <StoreClient
      store={store as any}
      products={(products ?? []) as any}
      storeSlug={params.slug}
    />
  )
}
