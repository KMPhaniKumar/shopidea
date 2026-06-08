'use client'

// Per-category product widget: an auto-scrolling + manually-scrollable strip of
// product cards (via <Scroller>). Each card credits its seller (store name +
// Instagram). Card borders cycle through a colourful palette.
import Link from 'next/link'
import { Scroller } from './Scroller'

export interface CarouselProduct {
  id: string
  name: string
  price: number
  description: string | null
  image: string | null
  store_slug: string
  store_name: string
  store_instagram: string | null // bare username, no @
}

const CARD_COLORS = ['#FF6B2B', '#D6336C', '#7C3AED', '#1E88E5', '#1A8F5A', '#E8A100']

export function ProductCarousel({ products }: { products: CarouselProduct[] }) {
  if (products.length === 0) return null
  return (
    <Scroller
      items={products}
      render={(p, i) => <ProductCard p={p} color={CARD_COLORS[i % CARD_COLORS.length]} />}
    />
  )
}

function ProductCard({ p, color }: { p: CarouselProduct; color: string }) {
  return (
    <div
      className="w-44 rounded-2xl overflow-hidden bg-white border-2 hover:-translate-y-1 transition-transform shadow-card"
      style={{ borderColor: color }}
    >
      <Link href={`/store/${p.store_slug}/product/${p.id}`} className="block">
        <div className="aspect-square bg-surface flex items-center justify-center overflow-hidden">
          {p.image
            ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
            : <span className="text-4xl">🛍️</span>}
        </div>
        <div className="px-3 pt-3">
          <div className="font-semibold text-sm text-text truncate">{p.name}</div>
          <div className="font-bold mt-1" style={{ color }}>₹{Number(p.price).toLocaleString('en-IN')}</div>
        </div>
      </Link>

      <div className="px-3 pb-3 pt-2 mt-1 border-t border-border">
        <Link href={`/store/${p.store_slug}`} className="block text-xs font-medium text-secondary truncate hover:text-primary">
          {p.store_name}
        </Link>
        {p.store_instagram && (
          <a
            href={`https://instagram.com/${p.store_instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-muted truncate hover:text-primary mt-0.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 shrink-0">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="truncate">@{p.store_instagram}</span>
          </a>
        )}
      </div>
    </div>
  )
}
