'use client'

// Auto-scrolling horizontal strip of seller (store) cards. Same marquee
// mechanic as ProductCarousel: row duplicated so translateX(-50%) loops
// seamlessly, pauses on hover, respects reduced-motion. Each card shows the
// store name + Instagram handle and links to the storefront, where the
// seller's products are shown.
import Link from 'next/link'

export interface CarouselSeller {
  store_slug: string
  store_name: string
  store_instagram: string | null // bare username, no @
  logo_url: string | null
  city: string | null
  product_count: number
}

export function SellerCarousel({ sellers, accent }: { sellers: CarouselSeller[]; accent: string }) {
  if (sellers.length === 0) return null
  // Duplicate for a seamless loop; slow the scroll as the row grows.
  const row = [...sellers, ...sellers]
  const duration = Math.max(24, sellers.length * 6)

  return (
    <div className="relative overflow-hidden">
      <style>{`
        @keyframes rm-seller-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .rm-seller-marquee { animation: rm-seller-marquee linear infinite; }
        .rm-seller-marquee:hover { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .rm-seller-marquee { animation: none; } }
      `}</style>
      <div className="rm-seller-marquee flex gap-4 w-max" style={{ animationDuration: `${duration}s` }}>
        {row.map((s, i) => (
          <SellerCard key={`${s.store_slug}-${i}`} seller={s} accent={accent} fixedWidth />
        ))}
      </div>
    </div>
  )
}

export function SellerCard({ seller: s, accent, fixedWidth = false }: { seller: CarouselSeller; accent: string; fixedWidth?: boolean }) {
  return (
    <Link
      href={`/store/${s.store_slug}`}
      className={`${fixedWidth ? 'shrink-0 w-52' : 'w-full'} rounded-2xl overflow-hidden bg-white border-2 hover:-translate-y-1 transition-transform shadow-card flex flex-col`}
      style={{ borderColor: accent }}
    >
      <div className="p-4 flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-lg font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {s.logo_url
            ? <img src={s.logo_url} alt={s.store_name} className="w-full h-full object-cover" />
            : <span>{s.store_name.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-text truncate">{s.store_name}</div>
          {s.city && <div className="text-[11px] text-muted truncate">{s.city}</div>}
        </div>
      </div>

      <div className="px-4 pb-4 mt-auto border-t border-border pt-3 flex items-center justify-between gap-2">
        {s.store_instagram ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-secondary truncate">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3 h-3 shrink-0">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            <span className="truncate">@{s.store_instagram}</span>
          </span>
        ) : <span />}
        <span className="text-[11px] font-medium shrink-0" style={{ color: accent }}>
          {s.product_count} {s.product_count === 1 ? 'item' : 'items'}
        </span>
      </div>
    </Link>
  )
}
