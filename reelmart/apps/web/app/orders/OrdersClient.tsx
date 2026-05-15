'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { Loader2, Package, ShoppingBag, Smartphone, Apple } from 'lucide-react'

interface Order {
  id: string
  order_number: string
  status: string
  payment_status: string
  payment_method: string
  total_amount: number
  items: { name: string; qty: number; price: number }[]
  created_at: string
  stores: { store_name: string; logo_url: string | null; store_slug: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-yellow-50 text-yellow-700',
  accepted:  'bg-blue-50 text-blue-700',
  packed:    'bg-purple-50 text-purple-700',
  shipped:   'bg-indigo-50 text-indigo-700',
  delivered: 'bg-green-50 text-green-700',
  cancelled: 'bg-gray-100 text-gray-600',
  rejected:  'bg-red-50 text-red-700',
  return_requested: 'bg-orange-50 text-orange-700',
  returned:  'bg-gray-100 text-gray-600',
}

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.reelmart.buyer'
const APP_STORE  = 'https://apps.apple.com/in/app/reelmart/id000000000'

type AuthStep = 'loading' | 'phone' | 'otp' | 'ready'

export default function OrdersClient() {
  const supabase = createClient()
  const [authStep, setAuthStep] = useState<AuthStep>('loading')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setAuthStep('ready')
        loadOrders()
      } else {
        setAuthStep('phone')
      }
    })
  }, [])

  async function loadOrders() {
    setLoadingOrders(true)
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_number, status, payment_status, payment_method, total_amount, items, created_at, stores(store_name, logo_url, store_slug)')
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setOrders((data as any) ?? [])
    setLoadingOrders(false)
  }

  async function sendOtp() {
    if (!/^[6-9]\d{9}$/.test(phone)) { toast.error('Enter a valid 10-digit number'); return }
    setOtpLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` })
    setOtpLoading(false)
    if (error) { toast.error(error.message); return }
    toast.success('OTP sent!')
    setAuthStep('otp')
  }

  async function verifyOtp() {
    if (otp.length !== 6) { toast.error('Enter the 6-digit code'); return }
    setOtpLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({
      phone: `+91${phone}`, token: otp, type: 'sms',
    })
    setOtpLoading(false)
    if (error || !data?.user) { toast.error(error?.message ?? 'Invalid OTP'); return }
    await supabase.from('users').upsert({
      id: data.user.id, phone: `+91${phone}`, role: 'buyer',
    }, { onConflict: 'id', ignoreDuplicates: true })
    setAuthStep('ready')
    toast.success('Logged in!')
    loadOrders()
  }

  if (authStep === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9F9]">
        <Loader2 size={28} className="animate-spin text-[#FF6B2B]" />
      </div>
    )
  }

  if (authStep === 'phone' || authStep === 'otp') {
    return (
      <div className="min-h-screen bg-[#F9F9F9]">
        <Toaster position="top-center" />
        <div className="max-w-md mx-auto px-4 py-12">
          <Link href="/" className="text-sm text-[#FF6B2B] font-semibold mb-6 inline-block">← Home</Link>
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <h1 className="text-2xl font-black text-[#1A1A1A] mb-1">My Orders</h1>
            <p className="text-sm text-gray-500 mb-6">Verify your phone to view your orders.</p>

            {authStep === 'phone' && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number</label>
                <div className="flex rounded-xl overflow-hidden border border-gray-200 focus-within:border-[#FF6B2B]">
                  <span className="px-4 bg-gray-50 flex items-center text-sm text-gray-600 border-r border-gray-200">+91</span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="flex-1 px-4 py-3 text-sm outline-none"
                    autoFocus
                  />
                </div>
                <button
                  onClick={sendOtp}
                  disabled={phone.length !== 10 || otpLoading}
                  className="mt-4 w-full bg-[#FF6B2B] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#e55a1f]"
                >
                  {otpLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Send OTP →'}
                </button>
              </>
            )}

            {authStep === 'otp' && (
              <>
                <label className="block text-xs font-semibold text-gray-600 mb-1">OTP</label>
                <p className="text-xs text-gray-500 mb-2">Sent to +91 {phone}</p>
                <input
                  type="tel"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  className="w-full px-4 py-3 text-xl font-bold text-center tracking-[0.5em] border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B]"
                  autoFocus
                />
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setAuthStep('phone')} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                    ← Change number
                  </button>
                  <button
                    onClick={verifyOtp}
                    disabled={otp.length !== 6 || otpLoading}
                    className="flex-1 bg-[#00B98E] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#009e79]"
                  >
                    {otpLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Verify →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      <Toaster position="top-center" />
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold text-[#1A1A1A]">My Orders</h1>
          <Link href="/" className="text-xs text-[#FF6B2B] font-semibold">Home</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-12">
        {loadingOrders && (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[#FF6B2B]" />
          </div>
        )}

        {!loadingOrders && orders.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <ShoppingBag size={40} className="text-gray-300 mx-auto mb-3" />
            <h2 className="font-bold text-[#1A1A1A] mb-1">No orders yet</h2>
            <p className="text-sm text-gray-500 mb-4">Place your first order from any ReelMart store.</p>
            <Link href="/" className="inline-block bg-[#FF6B2B] text-white px-5 py-2.5 rounded-full font-bold text-sm hover:bg-[#e55a1f]">
              Browse stores
            </Link>
          </div>
        )}

        {!loadingOrders && orders.map(order => (
          <Link
            key={order.id}
            href={`/order/${order.id}`}
            className="block bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 transition"
          >
            <div className="flex items-start gap-3">
              {order.stores?.logo_url ? (
                <img src={order.stores.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center shrink-0">
                  <Package className="text-orange-400" size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#1A1A1A] truncate">{order.stores?.store_name ?? 'Store'}</p>
                  <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {order.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{order.order_number}</p>
                <p className="text-xs text-gray-600 mt-1 truncate">
                  {order.items.map(i => `${i.name} × ${i.qty}`).join(', ')}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                  <p className="font-black text-[#1A1A1A]">₹{order.total_amount}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}

        {!loadingOrders && orders.length > 0 && (
          <div className="bg-[#1A1A1A] text-white rounded-3xl p-6 mt-2">
            <div className="flex items-start gap-3 mb-3">
              <Smartphone size={24} className="text-[#FF6B2B] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-black text-base mb-1">Track orders in the ReelMart app</h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Live status updates, delivery tracking, rewards and more.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <a href={PLAY_STORE} target="_blank" rel="noreferrer"
                className="bg-white text-[#1A1A1A] py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100">
                <Smartphone size={14} /> Android
              </a>
              <a href={APP_STORE} target="_blank" rel="noreferrer"
                className="bg-white text-[#1A1A1A] py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-gray-100">
                <Apple size={14} /> iOS
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}
