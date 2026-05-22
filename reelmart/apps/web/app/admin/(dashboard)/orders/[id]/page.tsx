import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700', accepted: 'bg-blue-100 text-blue-700',
  packed: 'bg-purple-100 text-purple-700', shipped: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600', refunded: 'bg-orange-100 text-orange-700',
}

// Pull live courier status from delivery-service (NimbusPost) when an AWB exists.
async function fetchTracking(awb: string): Promise<{ current: string; history: { step: string; label: string; at: string }[] } | null> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/track/${encodeURIComponent(awb)}`, { cache: 'no-store' })
    const json = await res.json()
    return json?.success ? json.data : null
  } catch { return null }
}

function fmt(n: number | null) { return `₹${Number(n ?? 0).toLocaleString('en-IN')}` }

export default async function AdminOrderDetail({ params }: { params: { id: string } }) {
  const { data: order } = await supabaseAdmin()
    .from('orders')
    .select('*, stores!store_id(store_name, store_slug), users!buyer_id(name, phone)')
    .eq('id', params.id)
    .single()

  if (!order) notFound()

  const addr = (order.delivery_address ?? {}) as any
  const items = (order.items ?? []) as any[]
  const tracking = order.awb_code ? await fetchTracking(order.awb_code) : null

  return (
    <div className="max-w-3xl">
      <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-800">← Back to orders</Link>

      <div className="flex items-center justify-between mt-3 mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">{order.order_number}</h1>
          <div className="text-gray-400 text-sm">{new Date(order.created_at).toLocaleString('en-IN')}</div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {order.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3">Store</h2>
          <div className="text-sm text-gray-900">{order.stores?.store_name ?? '—'}</div>
          {order.stores?.store_slug && <div className="text-xs text-gray-400">/{order.stores.store_slug}</div>}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3">Buyer</h2>
          <div className="text-sm text-gray-900">{order.users?.name ?? '—'}</div>
          <div className="text-xs text-gray-400">{order.users?.phone ?? ''}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-4">Items</h2>
        <div className="divide-y divide-gray-100">
          {items.map((it, i) => (
            <div key={i} className="flex justify-between py-2 text-sm">
              <span className="text-gray-700">{it.name} <span className="text-gray-400">× {it.qty}</span></span>
              <span className="text-gray-900 font-medium">{fmt(Number(it.price) * Number(it.qty))}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Delivery</span><span>{fmt(order.delivery_fee)}</span></div>
          {Number(order.discount_amount) > 0 && <div className="flex justify-between text-gray-500"><span>Discount</span><span>−{fmt(order.discount_amount)}</span></div>}
          <div className="flex justify-between font-bold text-gray-900 pt-1"><span>Total</span><span>{fmt(order.total_amount)}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3">Delivery address</h2>
          <div className="text-sm text-gray-700 leading-relaxed">
            <div className="font-medium text-gray-900">{addr.name}</div>
            <div>{[addr.line1, addr.line2, addr.area].filter(Boolean).join(', ')}</div>
            <div>{[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}</div>
            <div className="text-gray-400 mt-1">{addr.phone}</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="font-bold text-gray-900 mb-3">Payment</h2>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Method</span><span className="text-gray-900 uppercase">{order.payment_method}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${order.payment_status === 'paid' ? 'bg-green-100 text-green-700' : order.payment_status === 'refunded' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{order.payment_status}</span>
            </div>
            {order.razorpay_payment_id && <div className="flex justify-between"><span className="text-gray-500">Razorpay ID</span><span className="text-gray-700 font-mono text-xs">{order.razorpay_payment_id}</span></div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">Tracking</h2>
          {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-sm text-orange-500 hover:underline">Open tracking page ↗</a>}
        </div>
        {order.awb_code ? (
          <>
            <div className="text-xs text-gray-400 mb-3">AWB <span className="font-mono text-gray-600">{order.awb_code}</span></div>
            {tracking?.history?.length ? (
              <ol className="space-y-3">
                {tracking.history.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${tracking.current === h.step ? 'bg-orange-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{h.label}</div>
                      <div className="text-xs text-gray-400">{new Date(h.at).toLocaleString('en-IN')}</div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-gray-400">Courier status unavailable right now.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400">No shipment booked yet — AWB appears once the seller ships the order.</p>
        )}
      </div>
    </div>
  )
}
