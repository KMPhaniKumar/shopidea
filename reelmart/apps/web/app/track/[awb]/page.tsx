import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { Package, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const TIMELINE_STEPS = ['confirmed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const
type Step = typeof TIMELINE_STEPS[number]

const STEP_LABEL: Record<Step, string> = {
  confirmed: 'Order Confirmed',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
}

interface Props { params: { awb: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: `Tracking ${params.awb} · ReelMart`,
    description: 'Live tracking for your ReelMart order.',
  }
}

interface OrderForTracking {
  order_number: string
  total_amount: number
  items: { name: string; qty: number; price: number; image?: string }[]
  delivery_address: { name: string; city: string; pincode: string }
  stores: { store_name: string; logo_url: string | null } | null
}

interface TrackingPayload {
  current: Step
  history: { step: Step; label: string; at: string }[]
}

async function fetchTracking(awb: string): Promise<TrackingPayload | { error: string }> {
  const base = process.env.API_URL ?? ''
  if (!base) return { error: 'Tracking service not configured' }
  try {
    const res = await fetch(`${base}/api/delivery/track/${encodeURIComponent(awb)}`, {
      next: { revalidate: 300 }, // 5-minute cache per the spec
    })
    if (!res.ok) return { error: `Courier returned ${res.status}` }
    const json = await res.json() as any
    if (!json?.success) return { error: json?.error ?? 'Tracking unavailable' }
    return json.data as TrackingPayload
  } catch (err: any) {
    return { error: err?.message ?? 'Tracking unavailable' }
  }
}

async function fetchOrder(awb: string): Promise<OrderForTracking | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('orders')
    .select('order_number, total_amount, items, delivery_address, stores(store_name, logo_url)')
    .eq('awb_code', awb)
    .maybeSingle()
  return (data as any) ?? null
}

export default async function TrackPage({ params }: Props) {
  const [order, tracking] = await Promise.all([
    fetchOrder(params.awb),
    fetchTracking(params.awb),
  ])

  if (!order) {
    return (
      <main className="min-h-screen bg-[#F9F9F9] flex flex-col items-center justify-center px-6 text-center">
        <AlertCircle size={44} className="text-orange-500 mb-3" />
        <h1 className="text-xl font-black text-[#1A1A1A] mb-1">Tracking number not found</h1>
        <p className="text-sm text-gray-500 max-w-sm">
          We couldn't find an order matching this AWB. Double-check the number, or open your order from your account.
        </p>
        <Link href="/orders" className="mt-5 bg-[#FF6B2B] text-white px-5 py-2.5 rounded-full font-bold text-sm">
          Go to my orders
        </Link>
      </main>
    )
  }

  const trackingFailed = 'error' in tracking
  const currentStep: Step = trackingFailed ? 'confirmed' : tracking.current
  const currentIdx = TIMELINE_STEPS.indexOf(currentStep)
  const historyByStep = trackingFailed
    ? new Map<Step, string>()
    : new Map(tracking.history.map(h => [h.step, h.at]))

  return (
    <main className="min-h-screen bg-[#F9F9F9]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="font-bold text-[#1A1A1A]">Tracking</h1>
          <Link href="/orders" className="text-xs text-[#FF6B2B] font-semibold">My orders →</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3 pb-12">
        {/* Order summary card */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100 mb-3">
            {order.stores?.logo_url ? (
              <img src={order.stores.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <Package className="text-orange-400" size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{order.stores?.store_name ?? 'Store'}</p>
              <p className="font-bold text-[#1A1A1A] truncate">{order.order_number}</p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <p className="text-xs text-gray-500">Total</p>
              <p className="font-black text-[#1A1A1A]">₹{order.total_amount}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {order.items.slice(0, 3).map((it, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                {it.image ? <img src={it.image} alt="" className="w-10 h-10 rounded-lg object-cover" /> : null}
                <span className="flex-1 truncate text-gray-700">{it.name} × {it.qty}</span>
              </div>
            ))}
            {order.items.length > 3 && (
              <p className="text-xs text-gray-500">+{order.items.length - 3} more</p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            Delivering to {order.delivery_address?.name}, {order.delivery_address?.city} – {order.delivery_address?.pincode}
          </div>
        </section>

        {/* Timeline */}
        <section className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-[#1A1A1A] mb-4">Order Status</h2>
          {trackingFailed && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg p-2 mb-4">
              Live tracking is temporarily unavailable. Showing last known status.
            </p>
          )}
          <ol className="relative">
            {TIMELINE_STEPS.map((step, i) => {
              const reached = i <= currentIdx
              const isCurrent = i === currentIdx
              const at = historyByStep.get(step)
              return (
                <li key={step} className="flex gap-3 pb-5 last:pb-0 relative">
                  {/* Vertical connector */}
                  {i < TIMELINE_STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${reached && i + 1 <= currentIdx ? 'bg-[#00B98E]' : 'bg-gray-200'}`}
                    />
                  )}
                  <span
                    className={`mt-0.5 w-6 h-6 rounded-full shrink-0 flex items-center justify-center border-2 ${
                      reached
                        ? 'bg-[#00B98E] border-[#00B98E] text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                    } ${isCurrent ? 'ring-4 ring-[#00B98E]/20' : ''}`}
                  >
                    {reached ? '✓' : ''}
                  </span>
                  <div className="flex-1 -mt-0.5">
                    <p className={`text-sm font-semibold ${reached ? 'text-[#1A1A1A]' : 'text-gray-400'}`}>
                      {STEP_LABEL[step]}
                    </p>
                    {at && <p className="text-xs text-gray-500 mt-0.5">{formatDate(at)}</p>}
                    {isCurrent && !at && <p className="text-xs text-[#00B98E] font-semibold mt-0.5">Current</p>}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        {/* Helper card */}
        <section className="bg-[#1A1A1A] text-white rounded-2xl p-5 text-sm">
          <p className="font-bold mb-1">Need help?</p>
          <p className="text-gray-300 leading-relaxed">
            For order issues, WhatsApp the seller directly. Live push updates
            and full delivery history are available in the ReelMart app.
          </p>
        </section>

        <p className="text-center text-[10px] text-gray-400 pt-2">
          Tracking refreshes every 5 minutes.
        </p>
      </div>
    </main>
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  } catch { return '' }
}
