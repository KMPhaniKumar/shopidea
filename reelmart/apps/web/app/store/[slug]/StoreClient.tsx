'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ShoppingBag, Plus, Minus, Download } from 'lucide-react'
import { CartItem, loadCart, saveCart, cartTotal, cartCount } from '@/lib/cart'

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
  rating_avg: number
  total_reviews: number
}

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  compare_price: number | null
  images: string[]
  is_available: boolean
  stock_type: string
  stock_count: number | null
}

interface Props {
  store: Store
  products: Product[]
  storeSlug: string
}

export default function StoreClient({ store, products, storeSlug }: Props) {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [hydrated, setHydrated] = useState(false)

  // Hydrate cart from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setCart(loadCart(storeSlug))
    setHydrated(true)
  }, [storeSlug])

  // Persist on every change
  useEffect(() => {
    if (hydrated) saveCart(storeSlug, cart)
  }, [cart, storeSlug, hydrated])

  const filtered = useMemo(() => {
    if (!search.trim()) return products
    const q = search.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q)
    )
  }, [products, search])

  const subtotal = cartTotal(cart)
  const count = cartCount(cart)

  function addToCart(p: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id)
      if (existing) return prev.map(i => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        productId: p.id,
        name: p.name,
        image: p.images?.[0] ?? '',
        price: p.price,
        qty: 1,
      }]
    })
  }

  function decrement(productId: string) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === productId)
      if (!existing) return prev
      if (existing.qty <= 1) return prev.filter(i => i.productId !== productId)
      return prev.map(i => i.productId === productId ? { ...i, qty: i.qty - 1 } : i)
    })
  }

  function qtyOf(productId: string): number {
    return cart.find(i => i.productId === productId)?.qty ?? 0
  }

  function goToCheckout() {
    router.push(`/store/${storeSlug}/checkout`)
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      {/* App install banner */}
      <div className="bg-[#FF6B2B] text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">📱 <span>Track orders, get rewards on the ReelMart app</span></span>
        <a href="/download" className="font-semibold underline hover:no-underline flex items-center gap-1">
          <Download size={14} /> Download
        </a>
      </div>

      {/* Store header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-4">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.store_name} className="w-16 h-16 rounded-2xl object-cover border border-gray-100" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center text-2xl font-black text-orange-400">
                {store.store_name[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-black text-[#1A1A1A] truncate">{store.store_name}</h1>
                {store.is_verified && <span className="text-[#FF6B2B] text-sm">✓</span>}
              </div>
              <p className="text-xs text-gray-500 capitalize">{store.category} · {store.area ?? store.city}</p>
              {store.rating_avg > 0 && (
                <p className="text-xs text-gray-600 mt-0.5">⭐ {store.rating_avg.toFixed(1)} · {store.total_reviews} reviews</p>
              )}
              {!store.is_open && (
                <span className="inline-block mt-1 text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">🔴 Closed</span>
              )}
            </div>
          </div>
          {store.description && (
            <p className="mt-3 text-sm text-gray-600 leading-relaxed">{store.description}</p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-[#F3F4F6] rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-[#FF6B2B]/20 transition"
            />
          </div>
        </div>
      </div>

      {/* Products */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-32">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
          Products ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingBag size={36} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{search.trim() ? 'No matches' : 'No products yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(p => {
              const qty = qtyOf(p.id)
              const outOfStock = p.stock_type === 'limited' && (p.stock_count ?? 0) <= 0
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <Link href={`/store/${storeSlug}/product/${p.id}`} className="block aspect-square bg-gray-50 relative hover:opacity-95 transition">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl">📦</div>
                    )}
                  </Link>
                  <div className="p-2.5">
                    <Link href={`/store/${storeSlug}/product/${p.id}`} className="block">
                      <p className="text-sm font-semibold text-[#1A1A1A] line-clamp-2 mb-1 leading-tight hover:text-[#FF6B2B]">{p.name}</p>
                    </Link>
                    <div className="flex items-baseline gap-1.5 mb-2">
                      <span className="text-base font-black text-[#1A1A1A]">₹{p.price}</span>
                      {p.compare_price && p.compare_price > p.price && (
                        <span className="text-xs text-gray-400 line-through">₹{p.compare_price}</span>
                      )}
                    </div>
                    {outOfStock ? (
                      <div className="text-xs text-gray-400 text-center py-1.5">Out of stock</div>
                    ) : qty === 0 ? (
                      <button
                        onClick={() => addToCart(p)}
                        className="w-full bg-[#FF6B2B] text-white text-sm font-bold py-1.5 rounded-lg hover:bg-[#e55a1f] transition"
                      >
                        Add
                      </button>
                    ) : (
                      <div className="flex items-center justify-between">
                        <button onClick={() => decrement(p.id)} className="w-8 h-8 rounded-full bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                          <Minus size={14} />
                        </button>
                        <span className="text-sm font-bold text-[#1A1A1A]">{qty}</span>
                        <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-full bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                          <Plus size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sticky cart footer */}
      {count > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">{count} item{count !== 1 ? 's' : ''}</p>
              <p className="text-lg font-black text-[#1A1A1A]">₹{subtotal}</p>
            </div>
            <button
              onClick={goToCheckout}
              className="flex-1 bg-[#FF6B2B] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#e55a1f] transition flex items-center justify-center gap-2"
            >
              <ShoppingBag size={16} /> Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
