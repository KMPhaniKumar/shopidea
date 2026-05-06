'use client'

import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { createClient } from '@/lib/supabase/client'

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

interface TopStore {
  storeId: string
  name: string
  gmv: number
  orderCount: number
}

const PERIODS = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
]

const PIE_COLORS = ['#FF6B2B', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16']

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <p className="text-sm text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-3xl font-black ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState('30')
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [topStores, setTopStores] = useState<TopStore[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    const supabase = createClient()
    const since = new Date()
    since.setDate(since.getDate() - parseInt(period))
    const sinceISO = since.toISOString()

    async function load() {
      // Orders in period
      const { data: orders, error: ordErr } = await supabase
        .from('orders')
        .select('total_amount, payment_status, store_id')
        .gte('created_at', sinceISO)

      if (ordErr) throw new Error(ordErr.message)

      const totalOrders = orders?.length ?? 0
      const paidOrders = orders?.filter(o => o.payment_status === 'paid') ?? []
      const gmv = paidOrders.reduce((s, o) => s + Number(o.total_amount), 0)
      const platformFee = gmv * 0.05

      // Top stores
      const storeMap: Record<string, { gmv: number; orderCount: number }> = {}
      for (const o of paidOrders) {
        if (!storeMap[o.store_id]) storeMap[o.store_id] = { gmv: 0, orderCount: 0 }
        storeMap[o.store_id].gmv += Number(o.total_amount)
        storeMap[o.store_id].orderCount += 1
      }

      const topStoreIds = Object.entries(storeMap)
        .sort((a, b) => b[1].gmv - a[1].gmv)
        .slice(0, 10)
        .map(([id]) => id)

      let topStoresList: TopStore[] = []
      if (topStoreIds.length > 0) {
        const { data: stores } = await supabase
          .from('stores')
          .select('id, store_name')
          .in('id', topStoreIds)

        topStoresList = topStoreIds.map(id => ({
          storeId: id,
          name: stores?.find(s => s.id === id)?.store_name ?? id.slice(0, 8),
          gmv: storeMap[id].gmv,
          orderCount: storeMap[id].orderCount,
        }))
      }

      // New stores in period
      const { count: newStores } = await supabase
        .from('stores')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceISO)

      // New buyers & sellers in period
      const { count: newBuyers } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'buyer')
        .gte('created_at', sinceISO)

      const { count: newSellers } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'seller')
        .gte('created_at', sinceISO)

      // Payouts paid in period
      const { data: payoutsData } = await supabase
        .from('payouts')
        .select('amount')
        .eq('status', 'done')
        .gte('created_at', sinceISO)

      const payoutsPaid = payoutsData?.reduce((s, p) => s + Number(p.amount), 0) ?? 0

      setStats({
        gmv,
        platformFee,
        totalOrders,
        paidOrders: paidOrders.length,
        newStores: newStores ?? 0,
        newBuyers: newBuyers ?? 0,
        newSellers: newSellers ?? 0,
        payoutsPaid,
      })
      setTopStores(topStoresList)
    }

    load()
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [period])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Platform Analytics</h1>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === p.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-sm text-red-600">
          Failed to load analytics: {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 animate-pulse">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl" />)}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label={`GMV (${period}d)`}
              value={`₹${stats.gmv.toLocaleString('en-IN')}`}
              sub={`${stats.paidOrders} paid orders`}
              color="text-orange-600"
            />
            <StatCard
              label="Platform Revenue"
              value={`₹${stats.platformFee.toLocaleString('en-IN')}`}
              sub="5% commission"
            />
            <StatCard
              label="New Buyers"
              value={String(stats.newBuyers)}
              sub={`+${stats.newSellers} sellers`}
            />
            <StatCard
              label="New Stores"
              value={String(stats.newStores)}
              sub={`${stats.totalOrders} total orders`}
            />
          </div>

          {topStores.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <h2 className="text-base font-bold text-gray-900 mb-6">Top Stores by GMV</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topStores} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: number) => [`₹${v.toLocaleString('en-IN')}`, 'GMV']} />
                  <Bar dataKey="gmv" radius={[0, 6, 6, 0]}>
                    {topStores.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Revenue Breakdown</h2>
              <div className="space-y-3">
                {[
                  { label: 'Gross GMV', value: stats.gmv, color: 'bg-orange-500' },
                  { label: 'Platform Fee (5%)', value: stats.platformFee, color: 'bg-blue-500' },
                  { label: 'Paid Out to Sellers', value: stats.payoutsPaid, color: 'bg-green-500' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-semibold text-gray-900">₹{item.value.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${item.color} rounded-full`}
                        style={{ width: stats.gmv > 0 ? `${Math.min((item.value / stats.gmv) * 100, 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {topStores.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <h2 className="text-base font-bold text-gray-900 mb-4">GMV Share by Store</h2>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={topStores.slice(0, 6)} dataKey="gmv" innerRadius={35} outerRadius={65} paddingAngle={2}>
                        {topStores.slice(0, 6).map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {topStores.slice(0, 6).map((s, i) => (
                      <div key={s.storeId} className="flex items-center gap-2 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i] }} />
                        <span className="text-gray-700 truncate flex-1">{s.name}</span>
                        <span className="font-semibold text-gray-500">{s.orderCount}×</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4">Growth Summary ({period}d)</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
              {[
                { label: 'Orders', value: stats.totalOrders },
                { label: 'Paid Orders', value: stats.paidOrders },
                { label: 'New Sellers', value: stats.newSellers },
                { label: 'New Buyers', value: stats.newBuyers },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-4">
                  <p className="text-2xl font-black text-gray-900">{item.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
