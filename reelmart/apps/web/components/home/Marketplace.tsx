// Public marketplace: every active store grouped by category, each category
// showing its sellers and an auto-scrolling strip of their products.
// Server component — reads via the anon SSR client (RLS allows public reads of
// active stores + available products).
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ProductCarousel, type CarouselProduct } from './ProductCarousel'

// Category id (as stored on stores.category) → display + section colour.
const CATEGORIES: { id: string; label: string; icon: string; bg: string; accent: string }[] = [
  { id: 'food',        label: 'Food & Beverages',   icon: '🍱', bg: '#FFF4EC', accent: '#FF6B2B' },
  { id: 'clothing',    label: 'Clothing & Fashion', icon: '👗', bg: '#FDEAF3', accent: '#D6336C' },
  { id: 'jewellery',   label: 'Jewellery',          icon: '💍', bg: '#FFF9E6', accent: '#C99A00' },
  { id: 'electronics', label: 'Electronics',        icon: '📱', bg: '#E9F1FF', accent: '#1E88E5' },
  { id: 'home',        label: 'Home & Decor',       icon: '🏡', bg: '#E9F8F0', accent: '#1A8F5A' },
  { id: 'beauty',      label: 'Beauty & Wellness',  icon: '💄', bg: '#F4EAFE', accent: '#7C3AED' },
  { id: 'other',       label: 'More stores',        icon: '🛍️', bg: '#F4F4F5', accent: '#555555' },
]

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null
}

export async function Marketplace() {
  const supabase = createClient()

  const [{ data: stores }, { data: products }] = await Promise.all([
    supabase
      .from('stores')
      .select('id, store_name, store_slug, category, logo_url, city, description, rating_avg, is_verified')
      .eq('is_active', true)
      .order('rating_avg', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, price, images, description, stores!inner(store_slug, category, is_active)')
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

  // Map products to the carousel shape, grouped by their store's category.
  const productsByCat = new Map<string, CarouselProduct[]>()
  for (const p of allProducts as any[]) {
    const cat = p.stores?.category ?? 'other'
    const item: CarouselProduct = {
      id: p.id, name: p.name, price: p.price, description: p.description,
      image: firstImage(p.images), store_slug: p.stores?.store_slug,
    }
    if (!productsByCat.has(cat)) productsByCat.set(cat, [])
    productsByCat.get(cat)!.push(item)
  }

  const storesByCat = new Map<string, typeof allStores>()
  for (const s of allStores) {
    const cat = CATEGORIES.some(c => c.id === s.category) ? s.category : 'other'
    if (!storesByCat.has(cat)) storesByCat.set(cat, [])
    storesByCat.get(cat)!.push(s)
  }

  const sections = CATEGORIES.filter(c => (storesByCat.get(c.id)?.length ?? 0) > 0)

  return (
    <section id="marketplace" className="px-6 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold">Discover stores on ReelMart</h2>
          <p className="mt-3 text-secondary">Browse real sellers across India — by category.</p>
        </div>

        <div className="space-y-6">
          {sections.map(cat => {
            const catStores = storesByCat.get(cat.id) ?? []
            const catProducts = productsByCat.get(cat.id) ?? []
            return (
              <div key={cat.id} className="rounded-card p-5 sm:p-7" style={{ backgroundColor: cat.bg }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{cat.icon}</span>
                  <h3 className="text-xl font-bold" style={{ color: cat.accent }}>{cat.label}</h3>
                  <span className="text-sm text-secondary">· {catStores.length} {catStores.length === 1 ? 'store' : 'stores'}</span>
                </div>

                {/* Seller chips */}
                <div className="flex gap-3 overflow-x-auto pb-2 mb-4">
                  {catStores.map(s => (
                    <Link key={s.id} href={`/store/${s.store_slug}`}
                      className="shrink-0 flex items-center gap-2.5 bg-white rounded-full pl-1.5 pr-4 py-1.5 border border-border hover:shadow-card transition-shadow">
                      <span className="w-9 h-9 rounded-full overflow-hidden bg-surface flex items-center justify-center shrink-0">
                        {s.logo_url
                          ? <img src={s.logo_url} alt="" className="w-full h-full object-cover" />
                          : <span className="font-bold text-secondary">{s.store_name?.[0]?.toUpperCase()}</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-text truncate max-w-[10rem]">{s.store_name}</span>
                        <span className="block text-[11px] text-muted truncate max-w-[10rem]">{s.description || s.city}</span>
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Auto-scrolling products */}
                <ProductCarousel products={catProducts} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
