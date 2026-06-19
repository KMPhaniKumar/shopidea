'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ShoppingBag, Plus, Minus, Download, Star, MapPin } from 'lucide-react'
import { CartItem, loadCart, saveCart, cartTotal, cartCount } from '@/lib/cart'
import DeliveryPincodeChecker from '@/components/DeliveryPincodeChecker'
import PincodeGateModal from '@/components/PincodeGateModal'
import { useDeliveryCheckStore } from '@/store/deliveryCheckStore'

interface Store {
  id: string
  store_name: string
  description: string | null
  logo_url: string | null
  city: string
  area: string | null
  pincode: string | null
  whatsapp_number: string | null
  is_verified: boolean
  is_open: boolean
  category: string
  rating_avg: number
  total_reviews: number
  gst_verified?: boolean
  state?: string | null
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
  weight_grams: number | null
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

  // Pincode gate: product pending add-to-cart while the modal is open
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null)
  const [showPincodeModal, setShowPincodeModal] = useState(false)

  const getCheck = useDeliveryCheckStore(s => s.getCheck)
  const checks = useDeliveryCheckStore(s => s.checks)

  // Hydrate cart from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setCart(loadCart(storeSlug))
    setHydrated(true)
  }, [storeSlug])

  // Persist on every change
  useEffect(() => {
    if (hydrated) saveCart(storeSlug, cart)
  }, [cart, storeSlug, hydrated])

  // When the pincode modal is open, watch for a serviceable result to proceed
  useEffect(() => {
    if (!showPincodeModal || !pendingProduct) return
    const check = getCheck(store.id)
    if (check && check.serviceable) {
      // Buyer confirmed a serviceable pincode — add the pending product
      doAddToCart(pendingProduct)
      setPendingProduct(null)
      setShowPincodeModal(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, showPincodeModal, pendingProduct])

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

  /** Actually mutate the cart (no gate). */
  function doAddToCart(p: Product) {
    setCart(prev => {
      const existing = prev.find(i => i.productId === p.id)
      if (existing) return prev.map(i => i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, {
        productId: p.id,
        name: p.name,
        image: p.images?.[0] ?? '',
        price: p.price,
        ...(p.compare_price != null && p.compare_price > p.price
          ? { compare_price: p.compare_price }
          : {}),
        qty: 1,
        weight_grams: p.weight_grams ?? undefined,
      }]
    })
  }

  /**
   * Gated add-to-cart:
   *  - If there is no pickup pincode on the store, add directly (no delivery
   *    info available to check against).
   *  - If a serviceable check already exists for this store, add directly.
   *  - If the existing check is NOT serviceable (interstate block / courier),
   *    open the modal so the buyer can try a different pincode.
   *  - If no check at all, open the pincode gate modal first.
   */
  function addToCart(p: Product) {
    if (!store.pincode) {
      doAddToCart(p)
      return
    }
    const check = getCheck(store.id)
    if (check && check.serviceable) {
      // Already verified — add immediately
      doAddToCart(p)
      return
    }
    // Need pincode verification (or re-verify after a failed check)
    setPendingProduct(p)
    setShowPincodeModal(true)
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

  function closePincodeModal() {
    setPendingProduct(null)
    setShowPincodeModal(false)
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      {/* Pincode gate modal */}
      {showPincodeModal && store.pincode && (
        <PincodeGateModal
          storeId={store.id}
          pickupPincode={store.pincode}
          gstVerified={store.gst_verified}
          storeState={store.state}
          onClose={closePincodeModal}
          onServiceable={() => {
            if (pendingProduct) {
              doAddToCart(pendingProduct)
              setPendingProduct(null)
            }
            setShowPincodeModal(false)
          }}
        />
      )}

      {/* App install banner */}
      <div className="bg-[#FF6B2B] text-white px-4 py-2.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">📱 <span className="hidden sm:inline">Track orders, get rewards on the ReelMart app</span><span className="sm:hidden">Get the ReelMart app</span></span>
        <a href="/download" className="font-semibold underline hover:no-underline flex items-center gap-1">
          <Download size={14} /> Download
        </a>
      </div>

      {/* Store header — cover banner with overlapping logo */}
      <div className="bg-white border-b border-gray-200">
        <div className="h-24 sm:h-32 bg-gradient-to-br from-[#FF6B2B] via-[#ff8347] to-[#ffb98a]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-12 sm:-mt-14 pb-5">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.store_name} className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl object-cover ring-4 ring-white shadow-md bg-white" />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-orange-50 flex items-center justify-center text-4xl font-black text-orange-400 ring-4 ring-white shadow-md">
                {store.store_name[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0 sm:pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#1A1A1A] truncate">{store.store_name}</h1>
                {store.is_verified && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6B2B] bg-orange-50 px-2 py-0.5 rounded-full">✓ Verified</span>
                )}
                {!store.is_open && (
                  <span className="text-[11px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-semibold">🔴 Closed</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
                <span className="capitalize">{store.category}</span>
                <span className="flex items-center gap-1"><MapPin size={13} /> {store.area ?? store.city}</span>
                {store.rating_avg > 0 && (
                  <span className="flex items-center gap-1 text-gray-700 font-semibold">
                    <Star size={13} className="fill-amber-400 text-amber-400" /> {store.rating_avg.toFixed(1)}
                    <span className="text-gray-400 font-normal">({store.total_reviews})</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          {store.description && (
            <p className="-mt-1 pb-5 text-sm text-gray-600 leading-relaxed max-w-3xl">{store.description}</p>
          )}

          {/* Delivery pincode checker — compact placement in store header */}
          {store.pincode && (
            <div className="pb-5 max-w-sm">
              <DeliveryPincodeChecker
                pickupPincode={store.pincode}
                storeId={store.id}
                gstVerified={store.gst_verified}
                storeState={store.state}
              />
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <div className="relative max-w-xl">
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-32">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">
          Products ({filtered.length})
        </h2>
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <ShoppingBag size={36} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{search.trim() ? 'No matches' : 'No products yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map(p => {
              const qty = qtyOf(p.id)
              const outOfStock = p.stock_type === 'counted' && (p.stock_count ?? 0) <= 0
              const lowStock = p.stock_type === 'counted' && (p.stock_count ?? 0) > 0 && (p.stock_count ?? 99) <= 5
              const discountPct = p.compare_price && p.compare_price > p.price
                ? Math.round((1 - p.price / p.compare_price) * 100)
                : 0
              return (
                <div key={p.id} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col shadow-sm hover:shadow-md transition">
                  <Link href={`/store/${storeSlug}/product/${p.id}`} className="block aspect-square bg-gray-50 relative overflow-hidden">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>
                    )}
                    {discountPct > 0 && (
                      <span className="absolute top-2 left-2 bg-[#00B98E] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">{discountPct}% OFF</span>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-full">Out of Stock</span>
                      </div>
                    )}
                  </Link>
                  <div className="p-3 flex flex-col flex-1">
                    <Link href={`/store/${storeSlug}/product/${p.id}`} className="block">
                      <p className="text-sm font-semibold text-[#1A1A1A] line-clamp-2 mb-1 leading-tight min-h-[2.5rem] group-hover:text-[#FF6B2B] transition">{p.name}</p>
                    </Link>
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-base font-black text-[#1A1A1A]">₹{p.price}</span>
                      {p.compare_price && p.compare_price > p.price && (
                        <span className="text-xs text-gray-400 line-through">₹{p.compare_price}</span>
                      )}
                    </div>
                    {lowStock && <p className="text-[11px] text-orange-600 font-semibold mb-2">⚡ Only {p.stock_count} left</p>}
                    <div className="mt-auto pt-1">
                      {outOfStock ? (
                        <div className="text-xs text-gray-400 text-center py-2 bg-gray-50 rounded-lg">Out of stock</div>
                      ) : qty === 0 ? (
                        <button
                          onClick={() => addToCart(p)}
                          className="w-full bg-[#FF6B2B] text-white text-sm font-bold py-2 rounded-lg hover:bg-[#e55a1f] active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                        >
                          <Plus size={15} /> Add
                        </button>
                      ) : (
                        <div className="flex items-center justify-between bg-orange-50 rounded-lg p-1">
                          <button onClick={() => decrement(p.id)} className="w-8 h-8 rounded-md bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-[#1A1A1A]">{qty}</span>
                          <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-md bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                            <Plus size={14} />
                          </button>
                        </div>
                      )}
                    </div>
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
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">{count} item{count !== 1 ? 's' : ''} in cart</p>
              <p className="text-lg font-black text-[#1A1A1A]">₹{subtotal}</p>
            </div>
            <button
              onClick={goToCheckout}
              className="flex-1 sm:flex-none sm:px-10 bg-[#FF6B2B] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#e55a1f] transition flex items-center justify-center gap-2"
            >
              <ShoppingBag size={16} /> Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
