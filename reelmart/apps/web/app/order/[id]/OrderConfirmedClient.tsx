'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle2, Smartphone, Apple, Package, Loader2, AlertCircle } from 'lucide-react'

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  payment_method: string
  total_amount: number
  items: { name: string; qty: number; price: number }[]
  delivery_address: { name: string; phone: string; line1: string; area: string; city: string; pincode: string }
  created_at: string
  stores: { store_name: string; logo_url: string | null } | null
}

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.reelmart.buyer'
const APP_STORE  = 'https://apps.apple.com/in/app/reelmart/id000000000'

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
        .select('id, order_number, status, payment_status, payment_method, total_amount, items, delivery_address, created_at, stores(store_name, logo_url)')
        .eq('id', orderId)
        .maybeSingle()
      if (cancelled) return
      if (error) { setError(error.message); setLoading(false); return }
      if (!data) { setError('Order not found. If you just placed it, give it a moment and refresh.'); setLoading(false); return }
      setOrder(data as any)
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
            ✨ Login with same number — your order and addresses are already there.
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

        {/* Order summary */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
            {order.stores?.logo_url ? (
              <img src={order.stores.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center"><Package className="text-orange-400" size={18} /></div>
            )}
            <div>
              <p className="text-xs text-gray-500">Order from</p>
              <p className="font-bold text-[#1A1A1A]">{order.stores?.store_name ?? 'Store'}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {order.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="flex-1 truncate pr-3">{it.name} × {it.qty}</span>
                <span className="font-semibold">₹{it.price * it.qty}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between pt-3 border-t border-gray-100">
            <span className="font-bold text-[#1A1A1A]">Total</span>
            <span className="font-black text-[#1A1A1A]">₹{order.total_amount}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Payment</span>
            <span className="capitalize">{order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online'} · {order.payment_status}</span>
          </div>
        </section>

        {/* Delivery address */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Delivering to</h3>
          <p className="text-sm font-semibold text-[#1A1A1A]">{order.delivery_address.name}</p>
          <p className="text-sm text-gray-600 mt-0.5">{order.delivery_address.phone}</p>
          <p className="text-sm text-gray-600 leading-relaxed mt-1">
            {[order.delivery_address.line1, order.delivery_address.area, order.delivery_address.city, order.delivery_address.pincode].filter(Boolean).join(', ')}
          </p>
        </section>

        <p className="text-center text-xs text-gray-400 pt-4">
          Save this page to refer back. Need help? WhatsApp us at +91 88888 88888
        </p>
      </div>
    </div>
  )
}
