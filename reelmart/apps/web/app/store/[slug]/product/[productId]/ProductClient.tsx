'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ShoppingBag, Plus, Minus, Share2, Store as StoreIcon, Download } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { CartItem, loadCart, saveCart, cartTotal, cartCount } from '@/lib/cart'

interface Store {
  id: string
  store_name: string
  store_slug: string
  logo_url: string | null
  city: string
  area: string | null
  is_verified: boolean
  is_open: boolean
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
  stores: Store
}

export default function ProductClient({ product, storeSlug }: { product: Product; storeSlug: string }) {
  const router = useRouter()
  const store = product.stores
  const [cart, setCart] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    setCart(loadCart(storeSlug))
    setHydrated(true)
  }, [storeSlug])

  useEffect(() => {
    if (hydrated) saveCart(storeSlug, cart)
  }, [cart, storeSlug, hydrated])

  const qty = cart.find(i => i.productId === product.id)?.qty ?? 0
  const subtotal = cartTotal(cart)
  const totalCount = cartCount(cart)
  const outOfStock = product.stock_type === 'counted' && (product.stock_count ?? 0) <= 0
  const discountPct = product.compare_price && product.compare_price > product.price
    ? Math.round((1 - product.price / product.compare_price) * 100)
    : 0

  function addToCart() {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (existing) return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        productId: product.id,
        name: product.name,
        image: product.images?.[0] ?? '',
        price: product.price,
        qty: 1,
      }]
    })
  }

  function decrement() {
    setCart(prev => {
      const existing = prev.find(i => i.productId === product.id)
      if (!existing) return prev
      if (existing.qty <= 1) return prev.filter(i => i.productId !== product.id)
      return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty - 1 } : i)
    })
  }

  async function shareProduct() {
    const url = window.location.href
    const title = `${product.name} · ₹${product.price}`
    if (navigator.share) {
      try { await navigator.share({ title, text: title, url }); return } catch {}
    }
    await navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard!')
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      <Toaster position="top-center" />

      {/* App banner */}
      <div className="bg-[#FF6B2B] text-white px-4 py-2 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">📱 Get rewards on the ReelMart app</span>
        <a href="/download" className="font-semibold underline flex items-center gap-1"><Download size={13} /> Get App</a>
      </div>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 hover:bg-gray-100 rounded">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-bold text-[#1A1A1A] flex-1 truncate">{store.store_name}</h1>
          <button onClick={shareProduct} className="p-2 hover:bg-gray-100 rounded text-gray-600" aria-label="Share">
            <Share2 size={18} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto pb-32">
        {/* Image gallery */}
        <div className="bg-white">
          <div className="aspect-square bg-gray-50 relative">
            {product.images?.length ? (
              <img src={product.images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-7xl">📦</div>
            )}
            {discountPct > 0 && (
              <span className="absolute top-3 left-3 bg-[#00B98E] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
                {discountPct}% OFF
              </span>
            )}
            {outOfStock && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <span className="bg-gray-900 text-white text-sm font-bold px-4 py-2 rounded-full">Out of Stock</span>
              </div>
            )}
          </div>

          {product.images?.length > 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-hide">
              {product.images.map((img, i) => (
                <button key={i} onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 rounded-lg overflow-hidden shrink-0 border-2 ${activeImage === i ? 'border-[#FF6B2B]' : 'border-transparent'}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Title + price */}
        <div className="bg-white mt-2 px-4 py-5">
          <h2 className="text-xl font-black text-[#1A1A1A] mb-2 leading-tight">{product.name}</h2>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-2xl font-black text-[#1A1A1A]">₹{product.price}</span>
            {product.compare_price && product.compare_price > product.price && (
              <>
                <span className="text-base text-gray-400 line-through">₹{product.compare_price}</span>
                <span className="text-sm font-bold text-[#00B98E]">{discountPct}% off</span>
              </>
            )}
          </div>
          {product.stock_type === 'counted' && (product.stock_count ?? 0) > 0 && (product.stock_count ?? 99) <= 5 && (
            <p className="text-sm text-orange-600 font-semibold">⚡ Only {product.stock_count} left</p>
          )}
        </div>

        {/* Description */}
        {product.description && (
          <div className="bg-white mt-2 px-4 py-5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">About this product</h3>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>
        )}

        {/* Store card */}
        <Link href={`/store/${store.store_slug}`} className="block bg-white mt-2 px-4 py-4 hover:bg-gray-50 transition">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.store_name} className="w-12 h-12 rounded-xl object-cover border border-gray-100" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-400">
                <StoreIcon size={20} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[#1A1A1A] flex items-center gap-1.5">
                {store.store_name}
                {store.is_verified && <span className="text-[#FF6B2B] text-sm">✓</span>}
              </p>
              <p className="text-xs text-gray-500">{store.area ?? store.city}{store.rating_avg > 0 ? ` · ⭐ ${store.rating_avg.toFixed(1)}` : ''}</p>
            </div>
            <span className="text-xs font-bold text-[#FF6B2B]">View store →</span>
          </div>
        </Link>

        {!store.is_open && (
          <div className="mx-4 mt-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            🔴 Store is currently closed. Orders will be processed when the seller reopens.
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {qty === 0 ? (
            <button
              onClick={addToCart}
              disabled={outOfStock}
              className="flex-1 bg-[#FF6B2B] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#e55a1f] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              <ShoppingBag size={16} /> Add to Cart · ₹{product.price}
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2 bg-gray-100 rounded-full px-1 py-1">
                <button onClick={decrement} className="w-9 h-9 rounded-full bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                  <Minus size={14} />
                </button>
                <span className="text-sm font-bold w-6 text-center">{qty}</span>
                <button onClick={addToCart} className="w-9 h-9 rounded-full bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                  <Plus size={14} />
                </button>
              </div>
              <button
                onClick={() => router.push(`/store/${storeSlug}/checkout`)}
                className="flex-1 bg-[#00B98E] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#009e79] flex items-center justify-center gap-2"
              >
                Checkout · ₹{subtotal} ({totalCount})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
