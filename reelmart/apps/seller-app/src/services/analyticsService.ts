import { supabase } from '../lib/supabase'

export interface RevenueSummary {
  today: number
  thisWeek: number
  thisMonth: number
  todayOrders: number
  weekOrders: number
  monthOrders: number
}

export interface DailyRevenue {
  date: string
  revenue: number
  label: string // short label e.g. "Mon", "25 Apr"
}

export interface TopProduct {
  id: string
  name: string
  price: number
  images: string[]
  total_sold: number
}

export interface CustomerInsights {
  total: number
  repeat: number
  new: number
}

export async function getRevenueSummary(storeId: string): Promise<RevenueSummary> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const weekAgoStr = new Date(Date.now() - 7 * 864e5).toISOString().split('T')[0]
  const monthAgoStr = new Date(Date.now() - 30 * 864e5).toISOString()

  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at, status')
    .eq('store_id', storeId)
    .in('status', ['accepted', 'packed', 'shipped', 'delivered'])
    .gte('created_at', monthAgoStr)

  const orders = data ?? []
  const todayOrders = orders.filter(o => o.created_at.startsWith(todayStr))
  const weekOrders = orders.filter(o => o.created_at.split('T')[0] >= weekAgoStr)

  return {
    today: todayOrders.reduce((s, o) => s + o.total_amount, 0),
    thisWeek: weekOrders.reduce((s, o) => s + o.total_amount, 0),
    thisMonth: orders.reduce((s, o) => s + o.total_amount, 0),
    todayOrders: todayOrders.length,
    weekOrders: weekOrders.length,
    monthOrders: orders.length,
  }
}

export async function getDailyRevenue(storeId: string): Promise<DailyRevenue[]> {
  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at')
    .eq('store_id', storeId)
    .in('status', ['accepted', 'packed', 'shipped', 'delivered'])
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const grouped: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5)
    grouped[d.toISOString().split('T')[0]] = 0
  }
  data?.forEach(o => {
    const date = o.created_at.split('T')[0]
    if (grouped[date] !== undefined) grouped[date] += o.total_amount
  })

  return Object.entries(grouped).map(([date, revenue]) => ({
    date,
    revenue,
    label: DAY_LABELS[new Date(date).getDay()],
  }))
}

export async function getTopProducts(storeId: string): Promise<TopProduct[]> {
  const { data } = await supabase
    .from('products')
    .select('id, name, price, images, total_sold')
    .eq('store_id', storeId)
    .order('total_sold', { ascending: false })
    .limit(5)
  return (data as TopProduct[]) ?? []
}

export async function getCustomerInsights(storeId: string): Promise<CustomerInsights> {
  const { data } = await supabase
    .from('orders')
    .select('buyer_id')
    .eq('store_id', storeId)
    .in('status', ['delivered'])

  const counts: Record<string, number> = {}
  data?.forEach(o => { counts[o.buyer_id] = (counts[o.buyer_id] ?? 0) + 1 })
  const total = Object.keys(counts).length
  const repeat = Object.values(counts).filter(c => c > 1).length
  return { total, repeat, new: total - repeat }
}
