// Public marketplace home. Loads active stores + available products (server,
// anon SSR client under RLS), then hands them to <MarketplaceClient> which adds
// search (products + shops), category pills, a sellers widget, and the
// per-category product carousels. Each product card credits its seller.
import { createClient } from '@/lib/supabase/server'
import { instaUsername, bucketCategory } from '@/lib/categories'
import { MarketplaceClient, type MProduct, type MSeller } from './MarketplaceClient'

function firstImage(images: unknown): string | null {
  return Array.isArray(images) && images.length > 0 ? String(images[0]) : null
}

export async function Marketplace() {
  const supabase = createClient()

  const [{ data: stores }, { data: products }] = await Promise.all([
    supabase
      .from('stores')
      .select('store_slug, store_name, instagram_handle, logo_url, category, city')
      .eq('is_active', true),
    supabase
      .from('products')
      .select('id, name, price, images, description, category, stores!inner(store_slug, store_name, category, instagram_handle, is_active)')
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

  // Map products to the carousel/search shape (with seller credit + category).
  const productItems: MProduct[] = []
  const countBySlug = new Map<string, number>()
  for (const p of allProducts as any[]) {
    const store = p.stores
    if (!store?.store_slug) continue
    // Group by the PRODUCT's own category (e.g. "Men's Wear", "Bangles",
    // "Home Decor"); fall back to the store's category, then "Other".
    const raw = typeof p.category === 'string' ? p.category.trim() : ''
    const cat = raw || bucketCategory(store.category) || 'Other'
    productItems.push({
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description,
      image: firstImage(p.images),
      store_slug: store.store_slug,
      store_name: store.store_name,
      store_instagram: instaUsername(store.instagram_handle),
      category: cat,
    })
    countBySlug.set(store.store_slug, (countBySlug.get(store.store_slug) ?? 0) + 1)
  }

  // Sellers for the "Shops to explore" widget — most-stocked first.
  const sellers: MSeller[] = (allStores as any[])
    .map(s => ({
      store_slug: s.store_slug,
      store_name: s.store_name,
      logo_url: s.logo_url ?? null,
      category: bucketCategory(s.category),
      store_instagram: instaUsername(s.instagram_handle),
      product_count: countBySlug.get(s.store_slug) ?? 0,
      city: s.city ?? null,
    }))
    .sort((a, b) => b.product_count - a.product_count)

  return <MarketplaceClient products={productItems} sellers={sellers} />
}
