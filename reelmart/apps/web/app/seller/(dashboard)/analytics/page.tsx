'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { Download } from 'lucide-react'

const PERIODS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
]

export default function AnalyticsPage() {
  const supabase = createClient()
  const [period, setPeriod] = useState(30)
  const [stats, setStats] = useState<any>(null)
  const [revenueChart, setRevenueChart] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [dayOfWeek, setDayOfWeek] = useState<any[]>([])
  const [customerSplit, setCustomerSplit] = useState<any[]>([])

  useEffect(() => { load() }, [period])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    const since = subDays(new Date(), period).toISOString()

    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, delivery_fee, items, buyer_id, created_at')
      .eq('store_id', store.id)
      .eq('payment_status', 'paid')
      .gte('created_at', since)

    const all = orders ?? []
    const revenue = all.reduce((s, o) => s + o.total_amount, 0)
    const avgOrder = all.length > 0 ? revenue / all.length : 0

    const chart = Array.from({ length: Math.min(period, 30) }, (_, i) => {
      const d = subDays(new Date(), Math.min(period, 30) - 1 - i)
      const key = format(d, 'yyyy-MM-dd')
      const label = format(d, period <= 7 ? 'EEE' : 'dd MMM')
      const rev = all.filter(o => o.created_at.startsWith(key)).reduce((s, o) => s + o.total_amount, 0)
      return { day: label, revenue: rev }
    })
    setRevenueChart(chart)

    const pMap = new Map<string, { name: string; revenue: number }>()
    for (const o of all) {
      for (const item of (o.items ?? []) as any[]) {
        const e = pMap.get(item.productId) ?? { name: item.name, revenue: 0 }
        e.revenue += item.price * item.qty
        pMap.set(item.productId, e)
      }
    }
    setTopProducts([...pMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5))

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dow: Record<string, number> = {}
    days.forEach(d => dow[d] = 0)
    all.forEach(o => { dow[days[new Date(o.created_at).getDay()]] += o.total_amount })
    setDayOfWeek(Object.entries(dow).map(([day, revenue]) => ({ day, revenue: Math.round(revenue) })))

    const counts: Record<string, number> = {}
    all.forEach(o => { counts[o.buyer_id] = (counts[o.buyer_id] ?? 0) + 1 })
    const total = Object.keys(counts).length
    const repeat = Object.values(counts).filter(c => c > 1).length
    setCustomerSplit([
      { name: 'New', value: total - repeat, color: '#FF6B2B' },
      { name: 'Repeat', value: repeat, color: '#25D366' },
    ])

    setStats({ revenue: Math.round(revenue), orders: all.length, avgOrder: Math.round(avgOrder), customers: total })
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(revenueChart), 'Revenue')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topProducts), 'Top Products')
    XLSX.writeFile(wb, `reelmart-analytics-${Date.now()}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Analytics</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm">
            {PERIODS.map(p => (
              <button key={p.days} onClick={() => setPeriod(p.days)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${period === p.days ? 'bg-[#FF6B2B] text-white' : 'text-[#666666] hover:text-[#1A1A1A]'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 bg-white hover:bg-[#F9F9F9]">
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Revenue', value: `₹${stats.revenue.toLocaleString('en-IN')}` },
            { label: 'Orders', value: stats.orders },
            { label: 'Avg Order', value: `₹${stats.avgOrder}` },
            { label: 'Customers', value: stats.customers },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-xs text-[#666666] mb-1">{s.label}</p>
              <p className="text-xl font-bold text-[#1A1A1A]">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#1A1A1A] mb-4">Revenue Trend</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={revenueChart}>
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#AAAAAA' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#AAAAAA' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₹${v}`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
            <Line type="monotone" dataKey="revenue" stroke="#FF6B2B" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] mb-4">Top Products by Revenue</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProducts} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: '#AAAAAA' }} tickFormatter={(v: number) => `₹${v}`} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#666666' }} />
              <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
              <Bar dataKey="revenue" fill="#FF6B2B" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] mb-4">Customer Type</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={customerSplit} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {customerSplit.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#1A1A1A] mb-4">Best Days</h2>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dayOfWeek}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} tickFormatter={(v: number) => `₹${v}`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
            <Bar dataKey="revenue" fill="#FF6B2B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
