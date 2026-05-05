'use client'

import { useState } from 'react'

interface Store {
  id: string
  store_name: string
  description: string | null
  logo_url: string | null
  city: string
  area: string | null
  whatsapp_number: string | null
  is_verified: boolean
  is_open: boolean
  category: string
}

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  compare_price: number | null
  images: string[]
  variants: any[] | null
  is_available: boolean
  stock_type: string
  stock_count: number | null
}

interface Review {
  id: string
  rating: number
  comment: string
  created_at: string
  users: { name: string }
}

interface CartEntry {
  product: Product
  qty: number
  variant?: { name: string; option: string; price: number } | null
}

interface Props {
  store: Store
  products: Product[]
  reviews: Review[]
  avgRating: number
  storeSlug: string
}

function StarRow({ rating }: { rating: number }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={i <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}>★</span>
      ))}
    </span>
  )
}

export default function StorefrontClient({ store, products, reviews, avgRating, storeSlug }: Props) {
  const [cart, setCart] = useState<Record<string, CartEntry>>({})
  const [searchQuery, setSearchQuery] = useState('')

  const cartItems = Object.values(cart)
  const subtotal = cartItems.reduce((s, e) => s + (e.variant?.price ?? e.product.price) * e.qty, 0)
  const cartCount = cartItems.reduce((s, e) => s + e.qty, 0)

  const filteredProducts = products.filter(p =>
    !searchQuery.trim() || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function addToCart(product: Product) {
    setCart(prev => {
      const existing = prev[product.id]
      return { ...prev, [product.id]: { product, qty: (existing?.qty ?? 0) + 1, variant: existing?.variant } }
    })
  }

  function removeFromCart(productId: string) {
    setCart(prev => {
      const existing = prev[productId]
      if (!existing || existing.qty <= 1) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: { ...existing, qty: existing.qty - 1 } }
    })
  }

  function handleWhatsApp() {
    if (!store.whatsapp_number) return
    const phone = store.whatsapp_number.replace(/\D/g, '')
    const cartSummary = cartItems.map(e => `• ${e.product.name} x${e.qty} = ₹${(e.variant?.price ?? e.product.price) * e.qty}`).join('\n')
    const msg = `Hi! I'd like to order from ${store.store_name}:\n\n${cartSummary}\n\nTotal: ₹${subtotal}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`)
  }

  function handleAppBanner() {
    window.open('https://reelmart.in/download')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* App install banner */}
      <div className="bg-orange-500 text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <span>📱 Get ₹100 off on the ReelMart app</span>
        <button onClick={handleAppBanner} className="font-bold underline text-white">Download →</button>
      </div>

      {/* Store header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {store.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={store.logo_url} alt={store.store_name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center text-3xl">🏪</div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-gray-900">{store.store_name}</h1>
                {store.is_verified && <span className="text-orange-500 font-bold text-sm">✓</span>}
              </div>
              <p className="text-sm text-gray-500">{store.area ?? store.city}</p>
              {avgRating > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <StarRow rating={avgRating} />
                  <span className="text-xs text-gray-500">{avgRating.toFixed(1)} ({reviews.length} reviews)</span>
                </div>
              )}
            </div>
            {!store.is_open && (
              <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full">Closed</span>
            )}
          </div>
          {store.description && <p className="text-sm text-gray-600 mt-3">{store.description}</p>}

          {store.whatsapp_number && (
            <a
              href={`https://wa.me/${store.whatsapp_number.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 mt-3 bg-green-500 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-green-600 transition-colors"
            >
              <span>💬</span> Chat on WhatsApp
            </a>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search products..."
          className="w-full border border-gray-200 rounded-xl px-4 h-11 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-400"
        />

        {/* Products grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {filteredProducts.map(product => {
            const inCart = cart[product.id]?.qty ?? 0
            const discountPct = product.compare_price
              ? Math.round((1 - product.price / product.compare_price) * 100)
              : 0
            return (
              <div key={product.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="relative">
                  {product.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.images[0]} alt={product.name} className="w-full h-40 object-cover" />
                  ) : (
                    <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-4xl">📦</div>
                  )}
                  {discountPct > 0 && (
                    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      {discountPct}% OFF
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-gray-900 leading-tight mb-1" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {product.name}
                  </p>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-base font-black text-gray-900">₹{product.price}</span>
                    {product.compare_price && (
                      <span className="text-xs text-gray-400 line-through">₹{product.compare_price}</span>
                    )}
                  </div>
                  {inCart > 0 ? (
                    <div className="flex items-center justify-between bg-orange-50 rounded-xl p-1">
                      <button onClick={() => removeFromCart(product.id)} className="w-8 h-8 flex items-center justify-center text-orange-500 font-bold text-lg">−</button>
                      <span className="font-bold text-gray-900">{inCart}</span>
                      <button onClick={() => addToCart(product)} className="w-8 h-8 flex items-center justify-center text-orange-500 font-bold text-lg">+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(product)}
                      disabled={!store.is_open}
                      className="w-full bg-orange-500 text-white text-sm font-bold py-2 rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-40"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p className="font-semibold">No products found</p>
          </div>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <div className="mb-20">
            <h2 className="text-base font-bold text-gray-900 mb-3">Reviews ({reviews.length})</h2>
            <div className="space-y-3">
              {reviews.map((r: any) => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                      {(r.users?.name ?? 'A')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{r.users?.name ?? 'Anonymous'}</p>
                      <StarRow rating={r.rating} />
                    </div>
                  </div>
                  {r.comment && <p className="text-sm text-gray-600">{r.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cart footer */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-xl">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-lg font-black text-gray-900">₹{subtotal}</p>
              <p className="text-xs text-gray-500">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={handleWhatsApp}
              className="flex-1 bg-green-500 text-white font-bold py-3 rounded-xl hover:bg-green-600 transition-colors"
            >
              Order via WhatsApp →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
