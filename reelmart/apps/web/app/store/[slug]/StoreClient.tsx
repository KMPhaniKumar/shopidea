'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, ShoppingBag, Plus, Minus, Star, MapPin, X } from 'lucide-react'
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
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
      doAddToCart(pendingProduct)
      setPendingProduct(null)
      setShowPincodeModal(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, showPincodeModal, pendingProduct])

  // Focus search input when mobile search overlay opens
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [searchOpen])

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
   *  - If there is no pickup pincode on the store, add directly.
   *  - If a serviceable check already exists for this store, add directly.
   *  - Otherwise open the pincode gate modal first.
   */
  function addToCart(p: Product) {
    if (!store.pincode) {
      doAddToCart(p)
      return
    }
    const check = getCheck(store.id)
    if (check && check.serviceable) {
      doAddToCart(p)
      return
    }
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

  const initials = store.store_name[0]?.toUpperCase() ?? '?'

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

      {/* ── Store nav bar (sticky) ──────────────────────────────────────────
          This is the seller's top bar — logo + name on the left, search +
          cart on the right. It stays pinned on scroll so buyers can always
          search or go to cart without scrolling back up. */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#EEEEEE] shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-3">

          {/* Brand mark */}
          <Link href={`/store/${storeSlug}`} className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.store_name}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover border border-[#EEEEEE] shadow-sm flex-shrink-0"
              />
            ) : (
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-base font-black text-[#FF6B2B] flex-shrink-0">
                {initials}
              </div>
            )}
            <div className="min-w-0 hidden sm:block">
              <p className="text-[15px] font-bold text-[#1A1A1A] truncate leading-tight">{store.store_name}</p>
              {!store.is_open && (
                <p className="text-[11px] text-red-500 font-semibold leading-tight">Closed</p>
              )}
            </div>
          </Link>

          {/* Search — expands on desktop, icon-only on mobile */}
          <div className="flex-1 flex items-center justify-end gap-2 sm:justify-between">
            {/* Desktop inline search */}
            <div className="hidden sm:flex flex-1 max-w-md relative ml-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA] pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search in ${store.store_name}...`}
                className="w-full pl-9 pr-3 py-2 text-sm bg-[#F9F9F9] border border-[#EEEEEE] rounded-btn outline-none focus:border-[#FF6B2B] focus:bg-white transition placeholder:text-[#AAAAAA]"
                aria-label="Search products"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#AAAAAA] hover:text-[#666] transition"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2">
              {/* Mobile search toggle */}
              <button
                onClick={() => setSearchOpen(o => !o)}
                className="sm:hidden w-9 h-9 flex items-center justify-center rounded-btn text-[#666] hover:bg-[#F9F9F9] transition"
                aria-label="Search products"
              >
                <Search size={18} />
              </button>

              {/* Cart button */}
              {count > 0 && (
                <button
                  onClick={goToCheckout}
                  className="relative flex items-center gap-1.5 bg-[#FF6B2B] text-white text-sm font-bold px-3 py-2 rounded-btn hover:bg-[#e55a1f] active:scale-[0.98] transition"
                  aria-label={`${count} items in cart`}
                >
                  <ShoppingBag size={15} />
                  <span className="hidden xs:inline">Cart</span>
                  <span className="bg-white text-[#FF6B2B] text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center leading-none">
                    {count}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile search dropdown — slides down below the nav */}
        {searchOpen && (
          <div className="sm:hidden border-t border-[#EEEEEE] px-4 py-2.5 bg-white">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA] pointer-events-none" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search in ${store.store_name}...`}
                className="w-full pl-9 pr-9 py-2.5 text-sm bg-[#F9F9F9] border border-[#EEEEEE] rounded-btn outline-none focus:border-[#FF6B2B] focus:bg-white transition placeholder:text-[#AAAAAA]"
                aria-label="Search products"
              />
              {search ? (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#AAAAAA] hover:text-[#666]"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              ) : (
                <button
                  onClick={() => setSearchOpen(false)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#AAAAAA] hover:text-[#666]"
                  aria-label="Close search"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Store identity section ──────────────────────────────────────────
          Clean white card — seller's brand leads. No orange cover gradient.
          Logo is large and the first thing the buyer reads, with store name,
          badges, description and delivery checker below it. */}
      <div className="bg-white border-b border-[#EEEEEE]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Large logo */}
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.store_name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-[#EEEEEE] shadow-card flex-shrink-0"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-3xl sm:text-4xl font-black text-[#FF6B2B] shadow-card flex-shrink-0">
                {initials}
              </div>
            )}

            {/* Store info */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black text-[#1A1A1A]">{store.store_name}</h1>
                {store.is_verified && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6B2B] bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                    &#10003; Verified
                  </span>
                )}
                {!store.is_open && (
                  <span className="text-[11px] bg-red-50 border border-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                    Closed
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1.5 text-sm text-[#666] flex-wrap">
                <span className="capitalize">{store.category}</span>
                <span className="text-[#EEEEEE]">|</span>
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-[#FF6B2B]" />
                  {store.area ?? store.city}
                </span>
                {store.rating_avg > 0 && (
                  <>
                    <span className="text-[#EEEEEE]">|</span>
                    <span className="flex items-center gap-1 text-[#1A1A1A] font-semibold">
                      <Star size={13} className="fill-amber-400 text-amber-400" />
                      {store.rating_avg.toFixed(1)}
                      <span className="text-[#AAAAAA] font-normal">({store.total_reviews})</span>
                    </span>
                  </>
                )}
              </div>

              {store.description && (
                <p className="mt-2 text-sm text-[#666] leading-relaxed max-w-xl">{store.description}</p>
              )}
            </div>
          </div>

          {/* Delivery pincode checker — full-width below the logo row on mobile */}
          {store.pincode && (
            <div className="mt-5 max-w-sm">
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

      {/* ── Product grid ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 pb-32">
        {/* Section header: shows active search query or product count */}
        <div className="flex items-center justify-between mb-4">
          {search.trim() ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#1A1A1A]">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
              </span>
              <button
                onClick={() => setSearch('')}
                className="text-xs text-[#FF6B2B] font-semibold hover:underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <h2 className="text-sm font-bold text-[#666] uppercase tracking-wide">
              Products ({filtered.length})
            </h2>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-[#AAAAAA]">
            <ShoppingBag size={36} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-semibold">
              {search.trim() ? `No products match "${search}"` : 'No products yet'}
            </p>
            {search.trim() && (
              <button
                onClick={() => setSearch('')}
                className="mt-3 text-sm text-[#FF6B2B] font-semibold hover:underline"
              >
                Show all products
              </button>
            )}
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
                <div key={p.id} data-testid="product-card" className="group bg-white rounded-card border border-[#EEEEEE] overflow-hidden flex flex-col shadow-card hover:shadow-hover transition">
                  <Link href={`/store/${storeSlug}/product/${p.id}`} className="block aspect-square bg-[#F9F9F9] relative overflow-hidden">
                    {p.images?.[0] ? (
                      <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">&#128230;</div>
                    )}
                    {discountPct > 0 && (
                      <span className="absolute top-2 left-2 bg-[#25D366] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                        {discountPct}% OFF
                      </span>
                    )}
                    {outOfStock && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="bg-[#1A1A1A] text-white text-xs font-bold px-3 py-1.5 rounded-full">Out of Stock</span>
                      </div>
                    )}
                  </Link>
                  <div className="p-3 flex flex-col flex-1">
                    <Link href={`/store/${storeSlug}/product/${p.id}`} className="block">
                      <p className="text-sm font-semibold text-[#1A1A1A] line-clamp-2 mb-1 leading-tight min-h-[2.5rem] group-hover:text-[#FF6B2B] transition">{p.name}</p>
                    </Link>
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-base font-black text-[#1A1A1A]">&#8377;{p.price}</span>
                      {p.compare_price && p.compare_price > p.price && (
                        <span className="text-xs text-[#AAAAAA] line-through">&#8377;{p.compare_price}</span>
                      )}
                    </div>
                    {lowStock && (
                      <p className="text-[11px] text-[#FF6B2B] font-semibold mb-2">Only {p.stock_count} left</p>
                    )}
                    <div className="mt-auto pt-1">
                      {outOfStock ? (
                        <div className="text-xs text-[#AAAAAA] text-center py-2 bg-[#F9F9F9] rounded-btn">Out of stock</div>
                      ) : qty === 0 ? (
                        <button
                          onClick={() => addToCart(p)}
                          data-testid="add-to-cart"
                          aria-label={`Add ${p.name} to cart`}
                          className="w-full bg-[#FF6B2B] text-white text-sm font-bold py-2 rounded-btn hover:bg-[#e55a1f] active:scale-[0.98] transition flex items-center justify-center gap-1.5"
                        >
                          <Plus size={15} /> Add
                        </button>
                      ) : (
                        <div className="flex items-center justify-between bg-orange-50 rounded-btn p-1" data-testid="qty-control">
                          <button onClick={() => decrement(p.id)} aria-label="Decrease quantity" data-testid="qty-minus" className="w-8 h-8 rounded-md bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-[#1A1A1A]" data-testid="qty-value">{qty}</span>
                          <button onClick={() => addToCart(p)} aria-label="Increase quantity" data-testid="qty-plus" className="w-8 h-8 rounded-md bg-[#FF6B2B] text-white flex items-center justify-center hover:bg-[#e55a1f]">
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

      {/* ── Sticky cart footer ───────────────────────────────────────────── */}
      {count > 0 && (
        <div data-testid="cart-footer" className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#EEEEEE] shadow-2xl z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[#666]">{count} item{count !== 1 ? 's' : ''} in cart</p>
              <p data-testid="cart-total" className="text-lg font-black text-[#1A1A1A]">&#8377;{subtotal}</p>
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

      {/* ── Footer: slim ReelMart attribution + app CTA ─────────────────────
          Kept but demoted — one quiet line so it doesn't dominate the store. */}
      <footer className="border-t border-[#EEEEEE] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#AAAAAA]">
          <span>
            Powered by{' '}
            <Link href="/" className="text-[#FF6B2B] font-semibold hover:underline">
              ReelMart
            </Link>
          </span>
          <a
            href="/download"
            className="inline-flex items-center gap-1.5 text-[#666] hover:text-[#FF6B2B] transition font-semibold"
          >
            Track orders &amp; get updates on the ReelMart app &#8594;
          </a>
        </div>
      </footer>
    </div>
  )
}
