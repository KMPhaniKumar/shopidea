import { adminApi } from '@/lib/admin-api'
import ProcessPayoutsButton from './ProcessPayoutsButton'

interface PendingStore {
  storeId: string
  storeName: string
  amount: number
  orderCount: number
}

interface Payout {
  id: string
  store_id: string
  amount: number
  order_count: number
  status: string
  period_start: string
  period_end: string
  created_at: string
  stores?: { store_name: string }
}

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  pending:    'bg-amber-100 text-amber-700',
  processing: 'bg-blue-100 text-blue-700',
  done:       'bg-green-100 text-green-700',
  failed:     'bg-red-100 text-red-700',
}

async function getPayoutData() {
  // Get pending payout candidates + recent payouts via payout-service
  // Fallback to old Supabase logic if unavailable
  try {
    const [summary, recentPayouts] = await Promise.all([
      adminApi.get<{ pendingStores: PendingStore[]; totalPending: number }>('/api/payouts/admin/summary'),
      adminApi.get<Payout[]>('/api/payouts/admin/history?limit=20'),
    ])
    return { pending: summary.pendingStores ?? [], totalPending: summary.totalPending ?? 0, recentPayouts: recentPayouts ?? [] }
  } catch {
    // If admin summary endpoint doesn't exist yet, return empty
    return { pending: [], totalPending: 0, recentPayouts: [] }
  }
}

export default async function PayoutsPage() {
  const { pending, totalPending, recentPayouts } = await getPayoutData()

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">Payouts</h1>

      {/* Pending summary */}
      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-orange-600 font-semibold mb-1">Pending Payout</p>
            <p className="text-3xl font-black text-orange-700">₹{totalPending.toLocaleString('en-IN')}</p>
            <p className="text-sm text-orange-500 mt-1">
              {pending.length} seller{pending.length !== 1 ? 's' : ''} · {pending.reduce((s, p) => s + p.orderCount, 0)} orders
            </p>
          </div>
          <ProcessPayoutsButton hasPending={pending.length > 0} totalAmount={totalPending} storeCount={pending.length} />
        </div>
      </div>

      {pending.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <h2 className="px-6 py-4 text-sm font-bold text-gray-700 border-b border-gray-100">Pending by Store</h2>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Store</th>
                <th className="text-left px-4 py-3 font-semibold">Orders</th>
                <th className="text-left px-4 py-3 font-semibold">Net Amount (after 5%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pending.map(p => (
                <tr key={p.storeId}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{p.storeName}</td>
                  <td className="px-4 py-3 text-gray-600">{p.orderCount}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">₹{p.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent payouts */}
      <h2 className="text-base font-bold text-gray-900 mb-3">Recent Payouts</h2>
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Amount</th>
              <th className="text-left px-4 py-3 font-semibold">Orders</th>
              <th className="text-left px-4 py-3 font-semibold">Period</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recentPayouts.map((p: Payout) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-gray-700">{p.stores?.store_name ?? p.store_id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">₹{p.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-3 text-gray-600">{p.order_count}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {p.period_start ? new Date(p.period_start).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${PAYOUT_STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(p.created_at).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {recentPayouts.length === 0 && (
          <p className="text-center py-12 text-gray-400">No payouts processed yet</p>
        )}
      </div>
    </div>
  )
}
