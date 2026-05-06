'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, IndianRupee, ShoppingBag, Package } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast, { Toaster } from 'react-hot-toast'
import { useSellerStore } from '@/store/sellerStore'

export default function DashboardPage() {
  const supabase = createClient()
  const router = useRouter()
  const { setStore, setPendingOrderCount } = useSellerStore()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [lowStock, setLowStock] = useState<any[]>([])

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      let storeQuery = user
        ? supabase.from('stores').select('*').eq('seller_id', user.id).single()
        : process.env.NODE_ENV === 'development'
          ? supabase.from('stores').select('*').limit(1).single()
          : null

      if (!storeQuery) { router.push('/seller/login'); return }

      const { data: store, error: storeError } = await storeQuery
      
      if (storeError) {
        console.error('Store fetch error:', storeError)
        toast.error('No store found. Please create one first.')
        return
      }
      
      if (!store) {
        console.error('No store data returned')
        toast.error('No store found')
        return
      }
      
      setStore(store)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = subDays(now, 7).toISOString()
    const monthStart = subDays(now, 30).toISOString()

    const [todayRes, weekRes, monthRes, pendingRes, productsRes] = await Promise.all([
      supabase.from('orders').select('total_amount').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', todayStart),
      supabase.from('orders').select('total_amount').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', weekStart),
      supabase.from('orders').select('total_amount, created_at, items').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', monthStart),
      supabase.from('orders').select('id, order_number, total_amount, delivery_address, created_at').eq('store_id', store.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('products').select('id, name, stock_quantity, is_available').eq('store_id', store.id).lte('stock_quantity', 3).gt('stock_quantity', -1),
    ])

    const todayRevenue = (todayRes.data ?? []).reduce((s: number, o: any) => s + o.total_amount, 0)
    const weekRevenue = (weekRes.data ?? []).reduce((s: number, o: any) => s + o.total_amount, 0)
    const monthRevenue = (monthRes.data ?? []).reduce((s: number, o: any) => s + o.total_amount, 0)

    setStats({ todayRevenue, weekRevenue, monthRevenue })
    setPendingOrders(pendingRes.data ?? [])
    setPendingOrderCount((pendingRes.data ?? []).length)
    setLowStock(productsRes.data ?? [])

    const chartData = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i)
      const dayLabel = format(d, 'EEE')
      const dayStr = format(d, 'yyyy-MM-dd')
      const revenue = (monthRes.data ?? [])
        .filter((o: any) => o.created_at.startsWith(dayStr))
        .reduce((s: number, o: any) => s + o.total_amount, 0)
      return { day: dayLabel, revenue }
    })
    setRevenueData(chartData)

    const productMap = new Map<string, { name: string; qty: number }>()
    for (const order of monthRes.data ?? []) {
      for (const item of (order.items ?? []) as any[]) {
        const e = productMap.get(item.productId) ?? { name: item.name, qty: 0 }
        e.qty += item.qty
        productMap.set(item.productId, e)
      }
    }
    setTopProducts([...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5))
    } catch (err) {
      console.error('Dashboard load error:', err)
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const { store } = useSellerStore.getState()
    if (!store) return
    const ch = supabase.channel('dashboard-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` }, (p: any) => {
        toast.custom(() => (
          <div className="bg-white rounded-xl shadow-lg p-4 flex items-center gap-3 border-l-4 border-[#FF6B2B]">
            <ShoppingBag className="text-[#FF6B2B]" size={20} />
            <div>
              <p className="font-semibold text-sm">New Order!</p>
              <p className="text-xs text-[#666666]">{p.new.order_number} — ₹{p.new.total_amount}</p>
            </div>
          </div>
        ), { duration: 6000 })
        loadDashboard()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function acceptOrder(orderId: string) {
    await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId)
    toast.success('Order accepted')
    loadDashboard()
  }

  async function rejectOrder(orderId: string) {
    await supabase.from('orders').update({ status: 'rejected' }).eq('id', orderId)
    toast.error('Order rejected')
    loadDashboard()
  }

  return (
    <div className="space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Dashboard</h1>

      {loading && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-[#666666]">Loading dashboard...</p>
        </div>
      )}

      {!loading && !stats && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-[#FF6B2B] font-semibold">No store data found.</p>
          <p className="text-sm text-[#666666] mt-2">Create a store to get started.</p>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Today's Revenue", value: `₹${stats.todayRevenue.toLocaleString('en-IN')}`, icon: IndianRupee },
            { label: 'This Week', value: `₹${stats.weekRevenue.toLocaleString('en-IN')}`, icon: TrendingUp },
            { label: 'This Month', value: `₹${stats.monthRevenue.toLocaleString('en-IN')}`, icon: Package },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-[#666666] mb-1">{label}</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {pendingOrders.length > 0 && (
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] mb-4">⚠️ Needs Action ({pendingOrders.length} new orders)</h2>
          <div className="space-y-3">
            {pendingOrders.map(order => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-[#F9F9F9] rounded-lg">
                <div>
                  <p className="font-medium text-sm">{order.order_number}</p>
                  <p className="text-xs text-[#666666]">{order.delivery_address?.name} — ₹{order.total_amount}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acceptOrder(order.id)} className="px-3 py-1.5 bg-[#25D366] text-white text-xs rounded-lg font-medium">Accept</button>
                  <button onClick={() => rejectOrder(order.id)} className="px-3 py-1.5 bg-[#E23744] text-white text-xs rounded-lg font-medium">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#1A1A1A] mb-4">Revenue — Last 7 Days</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={revenueData}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} tickFormatter={(v: number) => `₹${v}`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
            <Bar dataKey="revenue" fill="#FF6B2B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] mb-4">Top Products (30 days)</h2>
          <div className="space-y-2">
            {topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-[#1A1A1A]">{i + 1}. {p.name}</span>
                <span className="text-sm font-medium text-[#FF6B2B]">{p.qty} sold</span>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-sm text-[#AAAAAA]">No sales yet</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] mb-4">⚠️ Low Stock</h2>
          <div className="space-y-2">
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm text-[#1A1A1A]">{p.name}</span>
                <span className="text-xs font-medium bg-[#FFD700]/20 text-[#B8860B] px-2 py-0.5 rounded-full">
                  {p.stock_quantity} left
                </span>
              </div>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-[#AAAAAA]">All products well stocked</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
