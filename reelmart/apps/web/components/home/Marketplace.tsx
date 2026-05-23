// Public marketplace: every active store as its own block — seller name +
// Instagram handle on top, then an auto-scrolling strip of that seller's products.
// Server component — reads via the anon SSR client (RLS allows public reads of
// active stores + available products).
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ProductCarousel, type CarouselProduct } from './ProductCarousel'

// Category id (as stored on stores.category) → display + accent colour.
const CATEGORY_META: Record<string, { label: string; icon: string; accent: string }> = {
  food:        { label: 'Food & Beverages',   icon: '🍱', accent: '#FF6B2B' },
  clothing:    { label: 'Clothing & Fashion', icon: '👗', accent: '#D6336C' },
  jewellery:   { label: 'Jewellery',          icon: '💍', accent: '#C99A00' },
  electronics: { label: 'Electronics',        icon: '📱', accent: '#1E88E5' },
  home:        { label: 'Home & Decor',       icon: '🏡', accent: '#1A8F5A' },
  beauty:      { label: 'Beauty & Wellness',  icon: '💄', accent: '#7C3AED' },
  other:       { label: 'Store',              icon: '🛍️', accent: '#555555' },
}

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null
}

// Normalise a stored Instagram handle to a bare username (no @, no URL).
function instaUsername(handle: string | null | undefined): string | null {
  if (!handle) return null
  let h = handle.trim()
  if (!h) return null
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '')
  h = h.replace(/^@/, '')
  return h || null
}

export async function Marketplace() {
  const supabase = createClient()

  const [{ data: stores }, { data: products }] = await Promise.all([
    supabase
      .from('stores')
      .select('id, store_name, store_slug, category, logo_url, city, description, instagram_handle, rating_avg, is_verified')
      .eq('is_active', true)
      .order('rating_avg', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, price, images, description, stores!inner(store_slug, is_active)')
      .eq('is_available', true)
      .eq('stores.is_active', true)
      .order('created_at', { ascending: false })
      .limit(400),
  ])

  const allStores = stores ?? []
  const allProducts = products ?? []

  if (allStores.length === 0) {
    return (
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Stores are on their way</h2>
        <p className="mt-2 text-secondary">New sellers are joining ReelMart every day. Check back soon!</p>
      </section>
    )
  }

  // Group products by their store's slug.
  const productsByStore = new Map<string, CarouselProduct[]>()
  for (const p of allProducts as any[]) {
    const slug = p.stores?.store_slug
    if (!slug) continue
    const item: CarouselProduct = {
      id: p.id, name: p.name, price: p.price, description: p.description,
      image: firstImage(p.images), store_slug: slug,
    }
    if (!productsByStore.has(slug)) productsByStore.set(slug, [])
    productsByStore.get(slug)!.push(item)
  }

  // Show sellers that have at least one product first (most browse-worthy),
  // then the rest. Both keep the rating order from the query.
  const withProducts = allStores.filter(s => (productsByStore.get(s.store_slug)?.length ?? 0) > 0)
  const withoutProducts = allStores.filter(s => (productsByStore.get(s.store_slug)?.length ?? 0) === 0)
  const orderedStores = [...withProducts, ...withoutProducts]

  return (
    <section id="marketplace" className="px-6 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold">Discover stores on ReelMart</h2>
          <p className="mt-3 text-secondary">Real sellers across India — explore their stores and products.</p>
        </div>

        <div className="space-y-6">
          {orderedStores.map(s => {
            const meta = CATEGORY_META[s.category] ?? CATEGORY_META.other
            const storeProducts = productsByStore.get(s.store_slug) ?? []
            const insta = instaUsername(s.instagram_handle)
            return (
              <div key={s.id} className="rounded-card border border-border p-5 sm:p-7 bg-white shadow-card">
                {/* Seller header: name + Instagram handle */}
                <div className="flex items-center gap-3 mb-5">
                  <Link
                    href={`/store/${s.store_slug}`}
                    className="w-12 h-12 rounded-full overflow-hidden bg-surface flex items-center justify-center shrink-0 border border-border"
                  >
                    {s.logo_url
                      ? <img src={s.logo_url} alt="" className="w-full h-full object-cover" />
                      : <span className="font-bold text-lg text-secondary">{s.store_name?.[0]?.toUpperCase()}</span>}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/store/${s.store_slug}`} className="font-bold text-lg text-text truncate hover:text-primary">
                        {s.store_name}
                      </Link>
                      {s.is_verified && (
                        <span title="Verified seller" className="text-primary shrink-0" aria-label="Verified">
                          <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 inline">
                            <path d="M12 2l2.4 1.8 3 .1 1 2.8 2.3 1.9-.9 2.9.9 2.9-2.3 1.9-1 2.8-3 .1L12 22l-2.4-1.8-3-.1-1-2.8L3.3 15.4l.9-2.9-.9-2.9 2.3-1.9 1-2.8 3-.1L12 2z" />
                            <path d="M10.6 14.6l-2.2-2.2 1.1-1.1 1.1 1.1 3.3-3.3 1.1 1.1-4.4 4.4z" fill="#fff" />
                          </svg>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-sm">
                      {insta ? (
                        <a
                          href={`https://instagram.com/${insta}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-secondary hover:text-primary"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4">
                            <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
                            <circle cx="12" cy="12" r="4" />
                            <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                          </svg>
                          @{insta}
                        </a>
                      ) : (
                        <span className="text-muted">{meta.icon} {meta.label}{s.city ? ` · ${s.city}` : ''}</span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={`/store/${s.store_slug}`}
                    className="shrink-0 hidden sm:inline-flex h-9 px-4 items-center rounded-btn border border-border text-sm font-medium text-text hover:bg-surface transition"
                  >
                    Visit store →
                  </Link>
                </div>

                {/* Seller's products */}
                {storeProducts.length > 0 ? (
                  <ProductCarousel products={storeProducts} />
                ) : (
                  <p className="text-sm text-muted">New products coming soon.</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
