import { createClient } from '@/lib/supabase/server'
import ReturnActions from './ReturnActions'

export default async function ReturnsPage() {
  const supabase = createClient()
  const { data: returns } = await supabase
    .from('returns')
    .select(`
      id, reason, description, photos, status, refund_amount, requested_at,
      orders!order_id(id, order_number, total_amount, razorpay_payment_id),
      users!buyer_id(name, phone)
    `)
    .order('requested_at', { ascending: false })
    .limit(100)

  const STATUS_COLORS: Record<string, string> = {
    requested:        'bg-amber-100 text-amber-700',
    approved:         'bg-green-100 text-green-700',
    rejected:         'bg-red-100 text-red-700',
    pickup_scheduled: 'bg-blue-100 text-blue-700',
    picked_up:        'bg-purple-100 text-purple-700',
    refund_initiated: 'bg-cyan-100 text-cyan-700',
    refunded:         'bg-emerald-100 text-emerald-700',
  }

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">Returns & Refunds</h1>
      <div className="space-y-4">
        {(returns ?? []).map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <div className="font-bold text-gray-900">
                  Order {r.orders?.order_number} — ₹{r.orders?.total_amount}
                </div>
                <div className="text-sm text-gray-500">{r.users?.name} · {r.users?.phone}</div>
                <div className="text-sm text-gray-500 mt-1">{new Date(r.requested_at).toLocaleDateString('en-IN')}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                {r.status.replace('_', ' ')}
              </span>
            </div>

            <div className="mb-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Reason: {r.reason}</p>
              {r.description && <p className="text-sm text-gray-500">{r.description}</p>}
            </div>

            {r.photos?.length > 0 && (
              <div className="flex gap-2 mb-3">
                {r.photos.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Return photo" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  </a>
                ))}
              </div>
            )}

            {r.status === 'requested' && (
              <ReturnActions
                returnId={r.id}
                orderId={r.orders?.id}
                orderAmount={r.orders?.total_amount}
              />
            )}

            {r.status === 'refunded' && r.refund_amount && (
              <p className="text-sm text-emerald-600 font-semibold">✓ Refunded ₹{r.refund_amount}</p>
            )}
          </div>
        ))}
        {(!returns || returns.length === 0) && (
          <div className="text-center py-20 text-gray-400">No return requests</div>
        )}
      </div>
    </div>
  )
}
