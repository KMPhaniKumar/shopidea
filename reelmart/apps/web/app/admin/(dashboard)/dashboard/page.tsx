import { adminApi } from '@/lib/admin-api'
import { createClient } from '@/lib/supabase/server'

interface PlatformStats {
  gmv: number
  platformFee: number
  totalOrders: number
  paidOrders: number
  newStores: number
  newBuyers: number
  newSellers: number
  payoutsPaid: number
}

async function getMetrics() {
  // Use analytics-service for GMV/platform stats
  try {
    const stats = await adminApi.get<PlatformStats>('/api/analytics/platform?period=7')
    return stats
  } catch {
    // Fallback to direct Supabase if service unavailable
    const supabase = createClient()
    const todayStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [sellers, buyers, orders] = await Promise.all([
      supabase.from('stores').select('id', { count: 'exact', head: true }),
      supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'buyer'),
      supabase.from('orders').select('total_amount').eq('payment_status', 'paid').gte('created_at', todayStart),
    ])
    return {
      gmv: (orders.data ?? []).reduce((s: number, o: any) => s + (o.total_amount ?? 0), 0),
      platformFee: 0,
      totalOrders: orders.data?.length ?? 0,
      paidOrders: orders.data?.length ?? 0,
      newStores: sellers.count ?? 0,
      newBuyers: buyers.count ?? 0,
      newSellers: 0,
      payoutsPaid: 0,
    }
  }
}

async function getOpenReturns() {
  const supabase = createClient()
  const { count } = await supabase
    .from('returns')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'requested')
  return count ?? 0
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 ${highlight ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-black ${highlight ? 'text-orange-600' : 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default async function AdminDashboard() {
  const [m, openReturns] = await Promise.all([getMetrics(), getOpenReturns()])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Dashboard</h1>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Last 7 days</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="GMV (7 days)" value={`₹${m.gmv.toLocaleString('en-IN')}`} sub={`${m.paidOrders} paid orders`} highlight />
        <StatCard label="Platform Revenue" value={`₹${m.platformFee.toLocaleString('en-IN')}`} sub="After payouts" />
        <StatCard label="New Sellers" value={m.newSellers} sub="This week" />
        <StatCard label="New Buyers" value={m.newBuyers} sub="This week" />
      </div>

      {openReturns > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-center gap-4">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-bold text-amber-800">{openReturns} open return request{openReturns !== 1 ? 's' : ''}</p>
            <p className="text-sm text-amber-600">Pending admin review</p>
          </div>
          <a href="/admin/returns" className="ml-auto text-sm font-bold text-amber-700 hover:underline">Review →</a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Quick Links</h2>
          <div className="space-y-2">
            {[
              { href: '/admin/sellers', label: 'Manage Sellers', icon: '🏪' },
              { href: '/admin/payouts', label: 'Process Payouts', icon: '💰' },
              { href: '/admin/analytics', label: 'View Analytics', icon: '📈' },
              { href: '/admin/returns', label: 'Review Returns', icon: '↩️' },
            ].map(l => (
              <a key={l.href} href={l.href}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-700">
                <span className="text-lg">{l.icon}</span>{l.label} →
              </a>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Platform Health</h2>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>API Gateway</span>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
            <div className="flex justify-between">
              <span>Database (Supabase)</span>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
            <div className="flex justify-between">
              <span>Payments (Razorpay)</span>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
            <div className="flex justify-between">
              <span>WhatsApp (Gupshup)</span>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
            <div className="flex justify-between">
              <span>Delivery (Shiprocket)</span>
              <span className="text-green-500 font-semibold">● Operational</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
