'use client'

// Auto-scrolling horizontal strip of product cards. The row is duplicated so
// the CSS marquee loops seamlessly (translateX(-50%) = exactly one copy).
// Pauses on hover. Card borders cycle through a colourful palette.
import Link from 'next/link'

export interface CarouselProduct {
  id: string
  name: string
  price: number
  description: string | null
  image: string | null
  store_slug: string
}

const CARD_COLORS = ['#FF6B2B', '#D6336C', '#7C3AED', '#1E88E5', '#1A8F5A', '#E8A100']

export function ProductCarousel({ products }: { products: CarouselProduct[] }) {
  if (products.length === 0) return null
  // Duplicate for a seamless loop; slow the scroll as the row grows.
  const row = [...products, ...products]
  const duration = Math.max(24, products.length * 5)

  return (
    <div className="relative overflow-hidden">
      <style>{`
        @keyframes rm-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .rm-marquee { animation: rm-marquee linear infinite; }
        .rm-marquee:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .rm-marquee { animation: none; } }
      `}</style>
      <div className="rm-marquee flex gap-4 w-max" style={{ animationDuration: `${duration}s` }}>
        {row.map((p, i) => {
          const color = CARD_COLORS[i % CARD_COLORS.length]
          return (
            <Link
              key={`${p.id}-${i}`}
              href={`/store/${p.store_slug}/product/${p.id}`}
              className="shrink-0 w-44 rounded-2xl overflow-hidden bg-white border-2 hover:-translate-y-1 transition-transform shadow-card"
              style={{ borderColor: color }}
            >
              <div className="aspect-square bg-surface flex items-center justify-center overflow-hidden">
                {p.image
                  ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  : <span className="text-4xl">🛍️</span>}
              </div>
              <div className="p-3">
                <div className="font-semibold text-sm text-text truncate">{p.name}</div>
                {p.description && <div className="text-xs text-secondary mt-0.5 line-clamp-2">{p.description}</div>}
                <div className="font-bold mt-1.5" style={{ color }}>₹{Number(p.price).toLocaleString('en-IN')}</div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
