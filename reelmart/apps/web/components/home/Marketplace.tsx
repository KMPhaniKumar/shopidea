// Public marketplace: products grouped into category widgets (Jewellery,
// Clothing, …). Each product card credits its seller — store name + Instagram.
// Server component — reads via the anon SSR client (RLS allows public reads of
// active stores + available products).
import { createClient } from '@/lib/supabase/server'
import { CATEGORIES, instaUsername } from '@/lib/categories'
import { ProductCarousel, type CarouselProduct } from './ProductCarousel'

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null
}

export async function Marketplace() {
  const supabase = createClient()

  const [{ data: stores }, { data: products }] = await Promise.all([
    supabase
      .from('stores')
      .select('store_slug, store_name, instagram_handle')
      .eq('is_active', true),
    supabase
      .from('products')
      .select('id, name, price, images, description, stores!inner(store_slug, store_name, category, instagram_handle, is_active)')
      .eq('is_available', true)
      .eq('stores.is_active', true)
      .order('created_at', { ascending: false })
      .limit(400),
  ])

  const allProducts = products ?? []

  if ((stores ?? []).length === 0) {
    return (
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Stores are on their way</h2>
        <p className="mt-2 text-secondary">New sellers are joining ReelMart every day. Check back soon!</p>
      </section>
    )
  }

  // Map products to the carousel shape (with seller credit), grouped by category.
  const productsByCat = new Map<string, CarouselProduct[]>()
  for (const p of allProducts as any[]) {
    const store = p.stores
    if (!store?.store_slug) continue
    const cat = CATEGORIES.some(c => c.id === store.category) ? store.category : 'other'
    const item: CarouselProduct = {
      id: p.id, name: p.name, price: p.price, description: p.description,
      image: firstImage(p.images),
      store_slug: store.store_slug,
      store_name: store.store_name,
      store_instagram: instaUsername(store.instagram_handle),
    }
    if (!productsByCat.has(cat)) productsByCat.set(cat, [])
    productsByCat.get(cat)!.push(item)
  }

  const sections = CATEGORIES.filter(c => (productsByCat.get(c.id)?.length ?? 0) > 0)

  if (sections.length === 0) {
    return (
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl font-bold">Products are on their way</h2>
        <p className="mt-2 text-secondary">Sellers are stocking their shelves. Check back soon!</p>
      </section>
    )
  }

  return (
    <section id="marketplace" className="px-6 py-12 sm:py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl font-bold">Discover products on ReelMart</h2>
          <p className="mt-3 text-secondary">Shop by category from real instagram sellers across India.</p>
        </div>

        <div className="space-y-6">
          {sections.map(cat => {
            const catProducts = productsByCat.get(cat.id) ?? []
            return (
              <div key={cat.id} className="rounded-card p-5 sm:p-7" style={{ backgroundColor: cat.bg }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{cat.icon}</span>
                  <h3 className="text-xl font-bold" style={{ color: cat.accent }}>{cat.label}</h3>
                  <span className="text-sm text-secondary">· {catProducts.length} {catProducts.length === 1 ? 'product' : 'products'}</span>
                </div>

                {/* Individual products, each credited to its seller */}
                <ProductCarousel products={catProducts} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
