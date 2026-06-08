'use client'

// Interactive marketplace: search box (products + shops), category pills, a
// "Shops to explore" seller widget, and ONE product widget PER product category
// (e.g. Men's Wear, Bangles, Home Decor). Each widget auto-scrolls and is also
// manually scrollable (<Scroller>). All client-side over the data the server
// <Marketplace> loads.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, X } from 'lucide-react'
import { CATEGORIES } from '@/lib/categories'
import { ProductCarousel, type CarouselProduct } from './ProductCarousel'
import { Scroller } from './Scroller'

export type MProduct = CarouselProduct & { category: string }

export interface MSeller {
  store_slug: string
  store_name: string
  logo_url: string | null
  category: string
  store_instagram: string | null
  product_count: number
  city: string | null
}

// Soft bg + accent pairs cycled per category widget.
const PALETTE = [
  { bg: '#FDEAF3', accent: '#D6336C' },
  { bg: '#FFF9E6', accent: '#C99A00' },
  { bg: '#E9F1FF', accent: '#1E88E5' },
  { bg: '#E9F8F0', accent: '#1A8F5A' },
  { bg: '#F4EAFE', accent: '#7C3AED' },
  { bg: '#FFF4EC', accent: '#FF6B2B' },
]

function iconFor(name: string): string {
  const n = name.toLowerCase()
  if (/jewel|neck|bangle|ring|earring|chain|pendant|bracelet/.test(n)) return '💍'
  if (/cloth|wear|shirt|tee|t-shirt|kurti|kurta|saree|dress|chudidar|trouser|jean|fashion|ethnic/.test(n)) return '👗'
  if (/home|decor|lamp|furnit|kitchen/.test(n)) return '🏡'
  if (/beauty|cosmet|makeup|skin|hair/.test(n)) return '💄'
  if (/food|bever|snack|sweet|bak/.test(n)) return '🍱'
  if (/electro|gadget|phone|mobile|laptop/.test(n)) return '📱'
  return '🛍️'
}

export function MarketplaceClient({ products, sellers }: { products: MProduct[]; sellers: MSeller[] }) {
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string>('all')

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  // Distinct product categories, most-stocked first.
  const catList = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
  }, [products])

  const matchedProducts = useMemo(() => {
    if (!searching) return []
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.store_name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q),
    )
  }, [products, q, searching])

  const matchedSellers = useMemo(() => {
    if (!searching) return []
    return sellers.filter(s =>
      s.store_name.toLowerCase().includes(q) ||
      (s.store_instagram ?? '').toLowerCase().includes(q),
    )
  }, [sellers, q, searching])

  const sections = activeCat === 'all' ? catList : catList.filter(c => c.name === activeCat)

  return (
    <section id="marketplace" className="px-4 sm:px-6 py-10 sm:py-14">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-3xl sm:text-4xl font-bold">Discover on ReelMart</h2>
          <p className="mt-2 text-secondary">Search products and shops from real Instagram sellers across India.</p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for shirts, jewellery, a shop name…"
            className="w-full pl-11 pr-10 py-3.5 text-sm rounded-full border border-border bg-white shadow-card outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          {searching && (
            <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text">
              <X size={18} />
            </button>
          )}
        </div>

        {/* Category pills (hidden while searching) */}
        {!searching && catList.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <Pill active={activeCat === 'all'} onClick={() => setActiveCat('all')}>All</Pill>
            {catList.map(c => (
              <Pill key={c.name} active={activeCat === c.name} onClick={() => setActiveCat(c.name)}>
                <span className="mr-1">{iconFor(c.name)}</span>{c.name}
              </Pill>
            ))}
          </div>
        )}

        {searching ? (
          <SearchResults q={query.trim()} products={matchedProducts} sellers={matchedSellers} />
        ) : (
          <>
            <SellersWidget sellers={sellers} />

            <div className="space-y-6 mt-10">
              {sections.map((c, i) => {
                const cp = products.filter(p => p.category === c.name)
                if (cp.length === 0) return null
                const sty = PALETTE[i % PALETTE.length]
                return (
                  <div key={c.name} className="rounded-card p-5 sm:p-7" style={{ backgroundColor: sty.bg }}>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-2xl">{iconFor(c.name)}</span>
                      <h3 className="text-xl font-bold" style={{ color: sty.accent }}>{c.name}</h3>
                      <span className="text-sm text-secondary">· {cp.length} {cp.length === 1 ? 'product' : 'products'}</span>
                    </div>
                    <ProductCarousel products={cp} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
        active ? 'bg-primary text-white border-primary' : 'bg-white text-secondary border-border hover:border-primary/50 hover:text-primary'
      }`}
    >
      {children}
    </button>
  )
}

function SellersWidget({ sellers }: { sellers: MSeller[] }) {
  if (sellers.length === 0) return null
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">Shops to explore</h3>
        <Link href="/stores" className="text-sm font-semibold text-primary hover:opacity-80">View all →</Link>
      </div>
      <Scroller items={sellers} render={s => <div className="w-64"><SellerCard s={s} /></div>} />
    </div>
  )
}

function SellerCard({ s }: { s: MSeller }) {
  const cat = CATEGORIES.find(c => c.id === s.category)
  return (
    <Link
      href={`/store/${s.store_slug}`}
      className="bg-white rounded-card border border-border p-4 flex items-center gap-3 hover:shadow-hover hover:-translate-y-0.5 transition"
    >
      {s.logo_url ? (
        <img src={s.logo_url} alt={s.store_name} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border" />
      ) : (
        <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-lg font-black"
          style={{ backgroundColor: cat?.bg ?? '#F4F4F5', color: cat?.accent ?? '#555' }}>
          {s.store_name[0]?.toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-bold text-sm text-text truncate">{s.store_name}</p>
        <p className="text-xs text-secondary truncate">{cat?.label ?? s.category}{s.city ? ` · ${s.city}` : ''}</p>
        <p className="text-[11px] text-muted">{s.product_count} {s.product_count === 1 ? 'product' : 'products'}</p>
      </div>
    </Link>
  )
}

function ProductGridCard({ p }: { p: MProduct }) {
  return (
    <div className="bg-white rounded-2xl border border-border overflow-hidden flex flex-col hover:shadow-hover transition">
      <Link href={`/store/${p.store_slug}/product/${p.id}`} className="block aspect-square bg-surface overflow-hidden">
        {p.image
          ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-3xl">🛍️</div>}
      </Link>
      <div className="p-3 flex flex-col flex-1">
        <Link href={`/store/${p.store_slug}/product/${p.id}`} className="font-semibold text-sm text-text line-clamp-2 leading-tight hover:text-primary">{p.name}</Link>
        <div className="font-bold mt-1 text-primary">₹{Number(p.price).toLocaleString('en-IN')}</div>
        <Link href={`/store/${p.store_slug}`} className="text-xs text-secondary truncate hover:text-primary mt-1">{p.store_name}</Link>
      </div>
    </div>
  )
}

function SearchResults({ q, products, sellers }: { q: string; products: MProduct[]; sellers: MSeller[] }) {
  if (products.length === 0 && sellers.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-3">🔍</div>
        <p className="text-secondary">No matches for “{q}”. Try a product or shop name.</p>
      </div>
    )
  }
  return (
    <div className="space-y-10">
      {sellers.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Shops ({sellers.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sellers.map(s => <SellerCard key={s.store_slug} s={s} />)}
          </div>
        </div>
      )}
      {products.length > 0 && (
        <div>
          <h3 className="text-lg font-bold mb-4">Products ({products.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {products.map(p => <ProductGridCard key={p.id} p={p} />)}
          </div>
        </div>
      )}
    </div>
  )
}
