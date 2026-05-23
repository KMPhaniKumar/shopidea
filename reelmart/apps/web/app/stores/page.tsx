// Browse stores: active sellers grouped into category widgets (Clothing,
// Jewellery, …). Each widget is a scrolling row of seller cards (store name +
// Instagram). "View all" opens the full category at /stores/[category].
// Server component — anon SSR client (RLS allows public reads of active
// stores + available products).
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIES, bucketCategory, instaUsername } from '@/lib/categories'
import { SellerCarousel, type CarouselSeller } from '@/components/home/SellerCarousel'

// Re-render fresh so new approved sellers appear without a redeploy.
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Browse stores · ReelMart',
  description: 'Browse Instagram sellers by category on ReelMart — clothing, jewellery, food and more. Real stores, real products across India.',
}

export default async function StoresPage() {
  const sellersByCat = await loadSellersByCategory()
  const sections = CATEGORIES.filter(c => (sellersByCat.get(c.id)?.length ?? 0) > 0)

  return (
    <main className="min-h-screen bg-white text-text">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="ReelMart home">
            <Image src="/logo.png" alt="ReelMart" width={140} height={50} priority className="object-contain" />
          </Link>
          <Link
            href="/seller"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 px-5 items-center rounded-btn border border-border text-primary text-sm font-medium hover:bg-surface transition"
          >
            Sell on ReelMart →
          </Link>
        </div>
      </header>

      <section className="px-6 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold">Browse stores</h1>
            <p className="mt-3 text-secondary">Discover Instagram sellers by category across India.</p>
          </div>

          {sections.length === 0 ? (
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold">Stores are on their way</h2>
              <p className="mt-2 text-secondary">New sellers are joining ReelMart every day. Check back soon!</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sections.map(cat => {
                const sellers = sellersByCat.get(cat.id) ?? []
                return (
                  <div key={cat.id} className="rounded-card p-5 sm:p-7" style={{ backgroundColor: cat.bg }}>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">{cat.icon}</span>
                      <h2 className="text-xl font-bold" style={{ color: cat.accent }}>{cat.label}</h2>
                      <span className="text-sm text-secondary">· {sellers.length} {sellers.length === 1 ? 'seller' : 'sellers'}</span>
                      <Link
                        href={`/stores/${cat.id}`}
                        className="ml-auto text-sm font-semibold hover:opacity-80 shrink-0"
                        style={{ color: cat.accent }}
                      >
                        View all →
                      </Link>
                    </div>

                    <SellerCarousel sellers={sellers} accent={cat.accent} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

// Shared loader: returns active sellers (with product counts) bucketed by category.
export async function loadSellersByCategory(): Promise<Map<string, CarouselSeller[]>> {
  const supabase = createClient()

  const [{ data: stores }, { data: products }] = await Promise.all([
    supabase
      .from('stores')
      .select('id, store_slug, store_name, instagram_handle, logo_url, city, category')
      .eq('is_active', true),
    supabase
      .from('products')
      .select('store_id')
      .eq('is_available', true),
  ])

  // Count available products per store.
  const counts = new Map<string, number>()
  for (const p of (products ?? []) as any[]) {
    if (!p.store_id) continue
    counts.set(p.store_id, (counts.get(p.store_id) ?? 0) + 1)
  }

  const byCat = new Map<string, CarouselSeller[]>()
  for (const s of (stores ?? []) as any[]) {
    if (!s.store_slug) continue
    const cat = bucketCategory(s.category)
    const seller: CarouselSeller = {
      store_slug: s.store_slug,
      store_name: s.store_name,
      store_instagram: instaUsername(s.instagram_handle),
      logo_url: s.logo_url ?? null,
      city: s.city ?? null,
      product_count: counts.get(s.id) ?? 0,
    }
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat)!.push(seller)
  }
  return byCat
}
