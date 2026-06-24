'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { CheckCircle2, Smartphone, Apple, Package, Loader2, AlertCircle, Home, User, Phone } from 'lucide-react'
import OrderTimeline from '@/components/order/OrderTimeline'
import { computePriceBreakup, fmtRupee } from '@/lib/orderPricing'

interface OrderItem {
  name: string
  qty: number
  price: number
  variant?: string
  compare_price?: number | null
}

interface DeliveryAddress {
  name: string
  phone: string
  alt_phone?: string | null
  line1: string
  line2?: string | null
  area?: string | null
  city: string
  state: string
  pincode: string
}

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  payment_method: string
  payment_method_detail?: string | null
  subtotal: number
  delivery_fee: number
  discount_amount?: number | null
  coins_discount?: number | null
  total_amount: number
  items: OrderItem[]
  delivery_address: DeliveryAddress
  created_at: string
  awb_code: string | null
  stores: { store_name: string; logo_url: string | null } | null
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  pending:   { text: 'Awaiting seller confirmation', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  accepted:  { text: 'Seller accepted — preparing your order', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  packed:    { text: 'Packed — ready to ship', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  shipped:   { text: 'Shipped — on the way', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  delivered: { text: 'Delivered', cls: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { text: 'Cancelled', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  rejected:  { text: 'Rejected by seller', cls: 'bg-red-50 text-red-700 border-red-200' },
}

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.reelmart.buyer'
const APP_STORE  = 'https://apps.apple.com/in/app/reelmart/id000000000'

const PAYMENT_METHOD_PILL: Record<string, string> = {
  'Cash on Delivery': 'COD',
  'UPI': 'UPI',
  'Card': 'Card',
  'NetBanking': 'Net',
  'Wallet': 'Wallet',
  'EMI': 'EMI',
  'Online': 'Online',
}

export default function OrderConfirmedClient({ orderId }: { orderId: string }) {
  const supabase = createClient()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, payment_status, payment_method, payment_method_detail, subtotal, delivery_fee, discount_amount, coins_discount, total_amount, items, delivery_address, created_at, awb_code, stores(store_name, logo_url)',
        )
        .eq('id', orderId)
        .maybeSingle()
      if (cancelled) return
      if (error) { setError(error.message); setLoading(false); return }
      if (!data) { setError('Order not found. If you just placed it, give it a moment and refresh.'); setLoading(false); return }
      setOrder(data as unknown as Order)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [orderId])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-[#FF6B2B]" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center px-6 text-center">
        <AlertCircle size={40} className="text-orange-500 mb-3" />
        <h1 className="text-lg font-bold text-[#1A1A1A] mb-1">Couldn't load this order</h1>
        <p className="text-sm text-gray-500 max-w-sm">{error}</p>
        <button onClick={() => location.reload()} className="mt-4 bg-[#FF6B2B] text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#e55a1f]">
          Refresh
        </button>
      </div>
    )
  }

  const dt = new Date(order.created_at).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

  const breakup = computePriceBreakup({
    items: order.items,
    subtotal: order.subtotal,
    delivery_fee: order.delivery_fee,
    discount_amount: order.discount_amount,
    coins_discount: order.coins_discount,
    total_amount: order.total_amount,
    payment_method: order.payment_method,
    payment_method_detail: order.payment_method_detail,
  })

  const addr = order.delivery_address
  const addressLine = [addr.line1, addr.line2, addr.area].filter(Boolean).join(', ')
  const cityLine = `${addr.city}, ${addr.state}–${addr.pincode}`

  const pillLabel = PAYMENT_METHOD_PILL[breakup.paidBy] ?? breakup.paidBy

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">

        {/* Hero */}
        <div className="bg-gradient-to-br from-[#00B98E] to-[#00a07a] text-white rounded-3xl p-6 text-center shadow-lg">
          <CheckCircle2 size={56} className="mx-auto mb-3" />
          <h1 className="text-2xl font-black mb-1">Order Placed!</h1>
          <p className="text-sm opacity-95">{order.order_number}</p>
          <p className="text-xs opacity-80 mt-1">{dt}</p>
        </div>

        {/* Primary CTA */}
        <Link
          href="/orders"
          className="w-full bg-[#FF6B2B] text-white py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#e55a1f]"
        >
          <Package size={16} /> View My Orders
        </Link>

        {/* Order timeline */}
        <OrderTimeline orderId={order.id} />

        {/* AWB tracking link */}
        {order.awb_code && (
          <Link
            href={`/track/${order.awb_code}`}
            data-testid="track-shipment-link"
            className="w-full bg-white text-[#FF6B2B] border border-[#FF6B2B] py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-orange-50"
          >
            <Package size={16} /> Courier tracking →
          </Link>
        )}

        {/* Track on app CTA */}
        <div className="bg-[#1A1A1A] text-white rounded-3xl p-6 shadow-lg">
          <div className="flex items-start gap-3 mb-4">
            <Smartphone size={28} className="text-[#FF6B2B] shrink-0 mt-1" />
            <div>
              <h2 className="font-black text-lg mb-1">Track your order in the ReelMart app</h2>
              <p className="text-sm text-gray-300 leading-relaxed">
                Get real-time delivery updates, save favourite stores, earn rewards & more.
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-4">
            Login with the same number — your order and addresses are already there.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a href={PLAY_STORE} target="_blank" rel="noreferrer"
              className="bg-white text-[#1A1A1A] py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-100">
              <Smartphone size={16} /> Android
            </a>
            <a href={APP_STORE} target="_blank" rel="noreferrer"
              className="bg-white text-[#1A1A1A] py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-gray-100">
              <Apple size={16} /> iOS
            </a>
          </div>
        </div>

        {/* Order summary — items list */}
        <section className="bg-white rounded-2xl border border-[#EEEEEE] p-5 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
            {order.stores?.logo_url ? (
              <img src={order.stores.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Package className="text-orange-400" size={18} />
              </div>
            )}
            <div>
              <p className="text-xs text-[#AAA]">Order from</p>
              <p className="font-bold text-[#1A1A1A]">{order.stores?.store_name ?? 'Store'}</p>
            </div>
          </div>

          <div className="space-y-2">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm gap-2">
                <span className="flex-1 truncate text-[#1A1A1A]">
                  {it.name}{it.variant ? ` · ${it.variant}` : ''} &times; {it.qty}
                </span>
                <span className="font-semibold text-[#1A1A1A] shrink-0">₹{fmtRupee(it.price * it.qty)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Price details card */}
        <section className="bg-white rounded-2xl border border-[#EEEEEE] p-5">
          <h3 className="text-xs font-bold text-[#666] uppercase tracking-wide mb-4">Price details</h3>

          <div className="space-y-3 text-sm">
            {/* Listing price — only when MRP exists */}
            {breakup.hasMrp && (
              <div className="flex justify-between items-center">
                <span className="text-[#666]">Listing price</span>
                <span className="line-through text-[#AAA]">₹{fmtRupee(breakup.listingTotal)}</span>
              </div>
            )}

            {/* Special price / item total */}
            <div className="flex justify-between items-center">
              <span className="text-[#666]">{breakup.hasMrp ? 'Special price' : 'Item total'}</span>
              <span className={breakup.hasMrp ? 'text-[#00B98E] font-semibold' : 'text-[#1A1A1A]'}>
                ₹{fmtRupee(breakup.specialTotal)}
              </span>
            </div>

            {/* Delivery fee */}
            <div className="flex justify-between items-center">
              <span className="text-[#666]">Total fees</span>
              {breakup.fees === 0 ? (
                <span className="text-[#00B98E] font-bold">FREE</span>
              ) : (
                <span className="text-[#1A1A1A]">₹{fmtRupee(breakup.fees)}</span>
              )}
            </div>

            {/* Other discount — only when positive */}
            {breakup.otherDiscount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[#666]">Other discount</span>
                <span className="text-[#00B98E] font-semibold">−₹{fmtRupee(breakup.otherDiscount)}</span>
              </div>
            )}

            {/* Dashed divider */}
            <div className="border-t border-dashed border-[#EEEEEE] pt-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[#1A1A1A]">Total amount</span>
                <span className="font-black text-[#1A1A1A] text-base">₹{fmtRupee(breakup.total)}</span>
              </div>
            </div>

            {/* Paid by with pill */}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[#666]">Paid by</span>
              <span className="flex items-center gap-2">
                <span className="text-[#1A1A1A] font-medium">{breakup.paidBy}</span>
                <span className="bg-orange-50 text-[#FF6B2B] border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {pillLabel}
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* Delivery details card */}
        <section className="bg-white rounded-2xl border border-[#EEEEEE] p-5">
          <h3 className="text-xs font-bold text-[#666] uppercase tracking-wide mb-4">Delivery details</h3>

          {/* Address row */}
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
              <Home size={15} className="text-[#FF6B2B]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#1A1A1A] mb-0.5">Home</p>
              <p className="text-sm text-[#666] leading-relaxed break-words">
                {addressLine}
                {addressLine ? ', ' : ''}{cityLine}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="my-3 border-t border-[#EEEEEE]" />

          {/* Contact row */}
          <div className="flex gap-3 items-start">
            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0 mt-0.5">
              <User size={15} className="text-[#FF6B2B]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1A1A1A]">{addr.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm text-[#666]">
                <Phone size={12} className="shrink-0" />
                <span>{addr.phone}</span>
                {addr.alt_phone && (
                  <>
                    <span className="text-[#EEEEEE]">·</span>
                    <span>{addr.alt_phone}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-[#AAA] pt-2">
          Save this page to refer back. Need help? WhatsApp us at +91 88888 88888
        </p>
      </div>
    </div>
  )
}
