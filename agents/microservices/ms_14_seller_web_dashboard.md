# MS-14: Seller Web Dashboard
> Browser-based management interface for sellers. Next.js 14 App Router, Tailwind CSS, Supabase Auth (phone OTP), Recharts, TanStack Table.

**URL base:** `reelmart.in/seller/`  
**Location in repo:** `reelmart/apps/web/`

---

## Brand Tokens

```css
/* globals.css */
:root {
  --color-primary:   #FF6B2B;
  --color-black:     #1A1A1A;
  --color-white:     #FFFFFF;
  --color-surface:   #F9F9F9;
  --color-border:    #EEEEEE;
  --color-text:      #1A1A1A;
  --color-secondary: #666666;
  --color-muted:     #AAAAAA;
  --color-success:   #25D366;
  --color-error:     #E23744;
  --radius-card:     12px;
  --radius-btn:      8px;
  --shadow:          0 1px 3px rgba(0,0,0,0.08);
  --shadow-hover:    0 4px 12px rgba(0,0,0,0.12);
}
```

Add Outfit font in `app/layout.tsx`:
```typescript
import { Outfit } from 'next/font/google'
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '700'] })
```

---

## Step 1: Install Packages

```bash
cd reelmart/apps/web
npm install recharts @tanstack/react-table react-hook-form zod @hookform/resolvers \
  react-dropzone xlsx qrcode react-hot-toast lucide-react date-fns \
  @supabase/ssr zustand lodash
npm install -D @types/qrcode @types/lodash @types/xlsx
```

---

## Step 2: Supabase SSR Client

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export const createServerSupabase = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookies().getAll(), setAll: () => {} } }
  )
```

---

## Step 3: Middleware — Protect /seller Routes

```typescript
// middleware.ts  (repo root of apps/web)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/seller') || pathname.startsWith('/seller/login')) {
    return NextResponse.next()
  }

  const response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          ),
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/seller/login', request.url))
  }

  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!user || !['seller', 'both'].includes(user.role)) {
    return NextResponse.redirect(new URL('/seller/login', request.url))
  }

  return response
}

export const config = { matcher: ['/seller/:path*'] }
```

---

## Step 4: Seller Layout (Sidebar + TopBar)

```typescript
// app/seller/layout.tsx
import { Sidebar } from '@/components/seller/Sidebar'
import { TopBar } from '@/components/seller/TopBar'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#F9F9F9]">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
```

```typescript
// components/seller/Sidebar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2,
  Users, Wallet, Megaphone, Settings,
} from 'lucide-react'

const items = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/seller/dashboard' },
  { icon: Package,         label: 'Products',   href: '/seller/products'  },
  { icon: ShoppingBag,     label: 'Orders',     href: '/seller/orders'    },
  { icon: BarChart2,       label: 'Analytics',  href: '/seller/analytics' },
  { icon: Users,           label: 'Customers',  href: '/seller/customers' },
  { icon: Wallet,          label: 'Payouts',    href: '/seller/payouts'   },
  { icon: Megaphone,       label: 'Marketing',  href: '/seller/marketing' },
  { icon: Settings,        label: 'Settings',   href: '/seller/settings'  },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 bg-[#1A1A1A] flex flex-col shrink-0">
      <div className="p-6">
        <span className="text-2xl font-bold">
          <span className="text-[#FF6B2B]">Reel</span>
          <span className="text-white">Mart</span>
        </span>
      </div>
      <nav className="flex-1 px-3 pb-6 space-y-1">
        {items.map(({ icon: Icon, label, href }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#FF6B2B] text-white'
                  : 'text-[#AAAAAA] hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

```typescript
// components/seller/TopBar.tsx
'use client'
import { Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSellerStore } from '@/store/sellerStore'

export function TopBar() {
  const { store, pendingOrderCount } = useSellerStore()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/seller/login')
  }

  return (
    <header className="h-14 bg-white border-b border-[#EEEEEE] px-6 flex items-center justify-between shrink-0">
      <span className="font-semibold text-[#1A1A1A]">{store?.store_name ?? 'My Store'}</span>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-lg hover:bg-[#F9F9F9]">
          <Bell size={20} className="text-[#666666]" />
          {pendingOrderCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#FF6B2B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingOrderCount}
            </span>
          )}
        </button>
        <button onClick={signOut} className="p-2 rounded-lg hover:bg-[#F9F9F9]">
          <LogOut size={18} className="text-[#666666]" />
        </button>
      </div>
    </header>
  )
}
```

```typescript
// store/sellerStore.ts
import { create } from 'zustand'

interface SellerStore {
  store: any | null
  pendingOrderCount: number
  setStore: (s: any) => void
  setPendingOrderCount: (n: number) => void
}

export const useSellerStore = create<SellerStore>((set) => ({
  store: null,
  pendingOrderCount: 0,
  setStore: (store) => set({ store }),
  setPendingOrderCount: (pendingOrderCount) => set({ pendingOrderCount }),
}))
```

---

## Step 5: Login Page

```typescript
// app/seller/login/page.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

export default function SellerLogin() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const supabase = createClient()
  const router = useRouter()

  function startCountdown() {
    setCountdown(60)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  async function sendOTP() {
    setLoading(true)
    const formatted = phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '')}`
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    if (error) { toast.error(error.message); setLoading(false); return }
    setStep('otp')
    startCountdown()
    toast.success('OTP sent!')
    setLoading(false)
  }

  async function verifyOTP() {
    setLoading(true)
    const formatted = phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '')}`
    const { error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' })
    if (error) { toast.error('Invalid OTP'); setLoading(false); return }
    router.push('/seller/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center p-4">
      <Toaster />
      <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-1">
            <span className="text-[#FF6B2B]">Reel</span>Mart
          </h1>
          <p className="text-[#666666] text-sm">Seller Dashboard</p>
        </div>

        {step === 'phone' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Phone Number</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-[#EEEEEE] bg-[#F9F9F9] text-[#666666] text-sm">+91</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="flex-1 border border-[#EEEEEE] rounded-r-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B2B]"
                />
              </div>
            </div>
            <button
              onClick={sendOTP}
              disabled={phone.length !== 10 || loading}
              className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#e55a1f] transition-colors"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B2B] text-center tracking-widest text-lg"
                autoFocus
              />
            </div>
            <button
              onClick={verifyOTP}
              disabled={otp.length !== 6 || loading}
              className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#e55a1f] transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button
              onClick={sendOTP}
              disabled={countdown > 0}
              className="w-full text-[#666666] text-sm py-2 disabled:opacity-40"
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Step 6: Dashboard Page

```typescript
// app/seller/dashboard/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Package, Star } from 'lucide-react'
import { format, subDays } from 'date-fns'
import toast, { Toaster } from 'react-hot-toast'
import { useSellerStore } from '@/store/sellerStore'

export default function DashboardPage() {
  const supabase = createClient()
  const { setStore, setPendingOrderCount } = useSellerStore()
  const [stats, setStats] = useState<any>(null)
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [topProducts, setTopProducts] = useState<any[]>([])
  const [lowStock, setLowStock] = useState<any[]>([])

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: store } = await supabase
      .from('stores').select('*').eq('seller_id', user.id).single()
    if (!store) return
    setStore(store)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = subDays(now, 7).toISOString()
    const monthStart = subDays(now, 30).toISOString()

    const [todayRes, weekRes, monthRes, pendingRes, productsRes] = await Promise.all([
      supabase.from('orders').select('total_amount').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', todayStart),
      supabase.from('orders').select('total_amount').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', weekStart),
      supabase.from('orders').select('total_amount, created_at').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', monthStart),
      supabase.from('orders').select('id, order_number, total_amount, delivery_address, created_at').eq('store_id', store.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('products').select('id, name, stock_quantity, is_available').eq('store_id', store.id).lte('stock_quantity', 3).gt('stock_quantity', -1),
    ])

    const todayRevenue = (todayRes.data ?? []).reduce((s, o) => s + o.total_amount, 0)
    const weekRevenue = (weekRes.data ?? []).reduce((s, o) => s + o.total_amount, 0)
    const monthRevenue = (monthRes.data ?? []).reduce((s, o) => s + o.total_amount, 0)

    setStats({ todayRevenue, weekRevenue, monthRevenue })
    setPendingOrders(pendingRes.data ?? [])
    setPendingOrderCount((pendingRes.data ?? []).length)
    setLowStock(productsRes.data ?? [])

    // Build 7-day revenue chart
    const chartData = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(now, 6 - i)
      const dayLabel = format(d, 'EEE')
      const dayStr = format(d, 'yyyy-MM-dd')
      const revenue = (monthRes.data ?? [])
        .filter(o => o.created_at.startsWith(dayStr))
        .reduce((s, o) => s + o.total_amount, 0)
      return { day: dayLabel, revenue }
    })
    setRevenueData(chartData)

    // Top products from orders items
    const { data: recentOrders } = await supabase
      .from('orders').select('items').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', monthStart)
    const productMap = new Map<string, { name: string; qty: number }>()
    for (const order of recentOrders ?? []) {
      for (const item of (order.items ?? []) as any[]) {
        const e = productMap.get(item.productId) ?? { name: item.name, qty: 0 }
        e.qty += item.qty
        productMap.set(item.productId, e)
      }
    }
    setTopProducts([...productMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 5))
  }

  // Realtime new order subscription
  useEffect(() => {
    const { store } = useSellerStore.getState()
    if (!store) return
    const ch = supabase.channel('dashboard-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` }, (p) => {
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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Today's Revenue", value: `₹${stats.todayRevenue.toLocaleString('en-IN')}`, icon: IndianRupee },
            { label: 'This Week', value: `₹${stats.weekRevenue.toLocaleString('en-IN')}`, icon: TrendingUp },
            { label: 'This Month', value: `₹${stats.monthRevenue.toLocaleString('en-IN')}`, icon: BarChart2 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white rounded-xl p-5 shadow-sm">
              <p className="text-sm text-[#666666] mb-1">{label}</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pending orders */}
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

      {/* Revenue chart */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold text-[#1A1A1A] mb-4">Revenue — Last 7 Days</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={revenueData}>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} tickFormatter={v => `₹${v}`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
            <Bar dataKey="revenue" fill="#FF6B2B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top products */}
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

        {/* Low stock */}
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
```

---

## Step 7: Products Page

```typescript
// app/seller/products/page.tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Search, Download, Edit2, Trash2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender, type ColumnDef,
} from '@tanstack/react-table'

export default function ProductsPage() {
  const supabase = createClient()
  const [products, setProducts] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [storeId, setStoreId] = useState<string>('')

  useEffect(() => { loadProducts() }, [])

  async function loadProducts() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    setStoreId(store.id)
    const { data } = await supabase.from('products').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
    setProducts(data ?? [])
  }

  async function toggleAvailability(id: string, current: boolean) {
    await supabase.from('products').update({ is_available: !current }).eq('id', id)
    toast.success(!current ? 'Product visible' : 'Product hidden')
    loadProducts()
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product?')) return
    await supabase.from('products').delete().eq('id', id)
    toast.success('Product deleted')
    loadProducts()
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.length} products?`)) return
    await supabase.from('products').delete().in('id', selected)
    setSelected([])
    toast.success('Products deleted')
    loadProducts()
  }

  function exportExcel() {
    const data = products.map(p => ({
      'Name': p.name,
      'Price (₹)': p.price,
      'Compare Price (₹)': p.compare_price ?? '',
      'Stock': p.stock_quantity === -1 ? 'Unlimited' : p.stock_quantity,
      'Category': p.category ?? '',
      'Available': p.is_available ? 'Yes' : 'No',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Products')
    XLSX.writeFile(wb, `reelmart-products-${Date.now()}.xlsx`)
  }

  const columns: ColumnDef<any>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <input type="checkbox" checked={table.getIsAllRowsSelected()} onChange={table.getToggleAllRowsSelectedHandler()} />
      ),
      cell: ({ row }) => (
        <input type="checkbox" checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />
      ),
    },
    {
      accessorKey: 'images',
      header: 'Photo',
      cell: ({ getValue }) => {
        const imgs = getValue() as string[]
        return imgs?.[0] ? (
          <img src={imgs[0]} className="w-10 h-10 object-cover rounded-lg" />
        ) : (
          <div className="w-10 h-10 bg-[#F9F9F9] rounded-lg flex items-center justify-center text-[#AAAAAA] text-xs">No img</div>
        )
      },
    },
    { accessorKey: 'name', header: 'Product Name' },
    { accessorKey: 'category', header: 'Category', cell: ({ getValue }) => getValue() ?? '—' },
    { accessorKey: 'price', header: 'Price', cell: ({ getValue }) => `₹${getValue()}` },
    {
      accessorKey: 'stock_quantity',
      header: 'Stock',
      cell: ({ getValue }) => {
        const v = getValue() as number
        if (v === -1) return <span className="text-[#25D366] text-xs font-medium">Unlimited</span>
        if (v <= 3) return <span className="text-[#E23744] text-xs font-medium">{v} left</span>
        return <span className="text-sm">{v}</span>
      },
    },
    {
      accessorKey: 'is_available',
      header: 'Status',
      cell: ({ getValue }) => getValue()
        ? <span className="bg-[#25D366]/10 text-[#25D366] text-xs font-medium px-2 py-0.5 rounded-full">Visible</span>
        : <span className="bg-[#EEEEEE] text-[#AAAAAA] text-xs font-medium px-2 py-0.5 rounded-full">Hidden</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button onClick={() => toggleAvailability(row.original.id, row.original.is_available)} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            {row.original.is_available ? <EyeOff size={15} className="text-[#666666]" /> : <Eye size={15} className="text-[#666666]" />}
          </button>
          <Link href={`/seller/products/${row.original.id}`} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            <Edit2 size={15} className="text-[#666666]" />
          </Link>
          <button onClick={() => deleteProduct(row.original.id)} className="p-1.5 hover:bg-[#F9F9F9] rounded">
            <Trash2 size={15} className="text-[#E23744]" />
          </button>
        </div>
      ),
    },
  ]

  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: (updater) => {
      const newSel = typeof updater === 'function' ? updater({}) : updater
      setSelected(Object.keys(newSel).filter(k => newSel[k]).map(i => products[Number(i)]?.id))
    },
    getRowId: (row) => row.id,
  })

  return (
    <div className="space-y-4">
      <Toaster />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Products</h1>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={bulkDelete} className="px-3 py-2 bg-[#E23744] text-white text-sm rounded-lg font-medium">
              Delete {selected.length}
            </button>
          )}
          <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
            <Download size={15} /> Export
          </button>
          <Link href="/seller/products/new" className="px-4 py-2 bg-[#FF6B2B] text-white text-sm rounded-lg flex items-center gap-2 font-medium hover:bg-[#e55a1f]">
            <Plus size={15} /> Add Product
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-[#EEEEEE]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-[#EEEEEE] rounded-lg outline-none focus:border-[#FF6B2B]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-[#EEEEEE]">
                  {hg.headers.map(h => (
                    <th key={h.id} className="text-left text-xs font-medium text-[#666666] px-4 py-3">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-[#EEEEEE] hover:bg-[#F9F9F9]">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-[#1A1A1A]">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {products.length === 0 && (
            <div className="text-center py-16 text-[#AAAAAA]">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p>No products yet. Add your first product!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## Step 8: Add/Edit Product Form

```typescript
// app/seller/products/new/page.tsx  (and [id]/page.tsx — same form, pre-filled)
'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { X, GripVertical } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be > 0'),
  compare_price: z.coerce.number().optional(),
  category: z.string().optional(),
  track_stock: z.boolean().default(false),
  stock_quantity: z.coerce.number().int().min(0).optional(),
  low_stock_threshold: z.coerce.number().int().min(0).default(3),
  is_available: z.boolean().default(true),
})
type FormData = z.infer<typeof schema>

export default function ProductFormPage({ params }: { params?: { id?: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [storeId, setStoreId] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { track_stock: false, is_available: true, low_stock_threshold: 3 },
  })
  const trackStock = watch('track_stock')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
      if (!store) return
      setStoreId(store.id)
      if (params?.id) {
        const { data: product } = await supabase.from('products').select('*').eq('id', params.id).single()
        if (product) {
          reset({
            name: product.name,
            description: product.description ?? '',
            price: product.price,
            compare_price: product.compare_price,
            category: product.category ?? '',
            track_stock: (product.stock_quantity ?? -1) !== -1,
            stock_quantity: product.stock_quantity !== -1 ? product.stock_quantity : undefined,
            low_stock_threshold: product.low_stock_threshold ?? 3,
            is_available: product.is_available,
          })
          setImages(product.images ?? [])
        }
      }
    }
    init()
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 5,
    maxSize: 2 * 1024 * 1024,
    disabled: images.length >= 5 || uploading,
    onDrop: async (files) => {
      setUploading(true)
      const urls = await Promise.all(
        files.slice(0, 5 - images.length).map(async (file) => {
          const path = `stores/${storeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
          const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
          if (error) { toast.error('Upload failed'); return null }
          const { data } = supabase.storage.from('product-images').getPublicUrl(path)
          return data.publicUrl
        })
      )
      setImages(prev => [...prev, ...(urls.filter(Boolean) as string[])])
      setUploading(false)
    },
  })

  async function onSubmit(data: FormData) {
    setSaving(true)
    const payload = {
      store_id: storeId,
      name: data.name,
      description: data.description,
      price: data.price,
      compare_price: data.compare_price,
      category: data.category,
      stock_quantity: data.track_stock ? (data.stock_quantity ?? 0) : -1,
      low_stock_threshold: data.low_stock_threshold,
      is_available: data.is_available,
      images,
    }
    if (params?.id) {
      await supabase.from('products').update(payload).eq('id', params.id)
      toast.success('Product updated')
    } else {
      await supabase.from('products').insert(payload)
      toast.success('Product added')
    }
    setSaving(false)
    router.push('/seller/products')
  }

  return (
    <div className="max-w-2xl">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A] mb-6">{params?.id ? 'Edit' : 'Add'} Product</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Photo upload */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Product Photos</h2>
          <div className="flex gap-2 flex-wrap">
            {images.map((url, i) => (
              <div key={url} className="relative">
                <img src={url} className="w-20 h-20 object-cover rounded-lg border border-[#EEEEEE]" />
                <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#E23744] text-white rounded-full flex items-center justify-center">
                  <X size={10} />
                </button>
              </div>
            ))}
            {images.length < 5 && (
              <div {...getRootProps()}
                className={`w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors text-center ${
                  isDragActive ? 'border-[#FF6B2B] bg-[#FF6B2B]/5' : 'border-[#EEEEEE] hover:border-[#FF6B2B]'
                }`}>
                <input {...getInputProps()} />
                <span className="text-xl text-[#AAAAAA]">+</span>
                <span className="text-[10px] text-[#AAAAAA] mt-0.5">{uploading ? 'Uploading' : 'Add photo'}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-[#AAAAAA]">Max 5 photos, 2MB each. First photo is the cover.</p>
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Product Details</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input {...register('name')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="e.g. Chocolate Truffle Cake" />
            {errors.name && <p className="text-xs text-[#E23744] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea {...register('description')} rows={3} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" placeholder="Describe your product..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price (₹) *</label>
              <input {...register('price')} type="number" step="0.01" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="499" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Compare Price (₹)</label>
              <input {...register('compare_price')} type="number" step="0.01" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="599 (optional)" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="e.g. Cakes, Jewellery, Clothing..." />
          </div>
        </div>

        {/* Inventory */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Inventory</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" {...register('track_stock')} className="w-4 h-4 accent-[#FF6B2B]" />
            <span className="text-sm font-medium">Track stock quantity</span>
          </label>
          {trackStock && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Stock quantity</label>
                <input {...register('stock_quantity')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Low stock alert at</label>
                <input {...register('low_stock_threshold')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="3" />
              </div>
            </div>
          )}
        </div>

        {/* Publish */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-semibold text-[#1A1A1A]">Make product visible</span>
            <input type="checkbox" {...register('is_available')} className="w-4 h-4 accent-[#FF6B2B]" />
          </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="flex-1 border border-[#EEEEEE] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F9F9F9]">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : params?.id ? 'Save Changes' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

---

## Step 9: Orders Page (Realtime + Slide-in Detail)

```typescript
// app/seller/orders/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, Printer } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import toast, { Toaster } from 'react-hot-toast'

const STATUS_TABS = ['all', 'pending', 'accepted', 'packed', 'shipped', 'delivered', 'cancelled', 'rejected']
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-[#FFD700]/20 text-[#B8860B]',
  accepted: 'bg-blue-50 text-blue-600',
  packed: 'bg-purple-50 text-purple-600',
  shipped: 'bg-indigo-50 text-indigo-600',
  delivered: 'bg-[#25D366]/10 text-[#25D366]',
  cancelled: 'bg-[#EEEEEE] text-[#AAAAAA]',
  rejected: 'bg-[#E23744]/10 text-[#E23744]',
}
const STATUS_FLOW = ['pending', 'accepted', 'packed', 'shipped', 'delivered']

export default function OrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<any[]>([])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [storeId, setStoreId] = useState('')

  useEffect(() => { loadOrders() }, [tab])

  async function loadOrders() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    setStoreId(store.id)

    let q = supabase.from('orders').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(100)
    if (tab !== 'all') q = q.eq('status', tab)
    const { data } = await q
    setOrders(data ?? [])

    // Subscribe to new orders
    const ch = supabase.channel('orders-page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` }, (p) => {
        toast.custom(() => (
          <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-[#FF6B2B]">
            <p className="font-semibold text-sm">🛍️ New Order {p.new.order_number}</p>
            <p className="text-xs text-[#666666]">₹{p.new.total_amount}</p>
          </div>
        ), { duration: 6000 })
        loadOrders()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }

  async function updateStatus(orderId: string, status: string, extra?: any) {
    const updates: any = { status, ...extra }
    if (status === 'delivered') updates.delivered_at = new Date().toISOString()
    await supabase.from('orders').update(updates).eq('id', orderId)
    toast.success(`Order ${status}`)
    loadOrders()
    if (selected?.id === orderId) setSelected({ ...selected, status, ...extra })
  }

  function printInvoice(order: any) {
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><title>Invoice ${order.order_number}</title>
    <style>body{font-family:sans-serif;padding:24px}table{width:100%}td,th{padding:6px;border-bottom:1px solid #eee}</style>
    </head><body>
    <h1 style="color:#FF6B2B">ReelMart</h1>
    <p><strong>Order:</strong> ${order.order_number}</p>
    <p><strong>Date:</strong> ${format(new Date(order.created_at), 'dd/MM/yyyy')}</p>
    <p><strong>Customer:</strong> ${order.delivery_address?.name}</p>
    <p><strong>Address:</strong> ${order.delivery_address?.address}, ${order.delivery_address?.city} - ${order.delivery_address?.pincode}</p>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>
    ${(order.items ?? []).map((i: any) => `<tr><td>${i.name}</td><td>${i.qty}</td><td>₹${i.price * i.qty}</td></tr>`).join('')}
    </tbody></table>
    <p><strong>Total: ₹${order.total_amount}</strong></p>
    </body></html>`)
    w.print()
  }

  function exportExcel() {
    const data = orders.map(o => ({
      'Order #': o.order_number,
      'Customer': o.delivery_address?.name,
      'Amount (₹)': o.total_amount,
      'Status': o.status,
      'Payment': o.payment_status,
      'Date': format(new Date(o.created_at), 'dd/MM/yyyy'),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Orders')
    XLSX.writeFile(wb, `reelmart-orders-${Date.now()}.xlsx`)
  }

  const filtered = orders.filter(o =>
    o.order_number?.toLowerCase().includes(search.toLowerCase()) ||
    o.delivery_address?.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex gap-4 h-full">
      <Toaster />
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1A1A1A]">Orders</h1>
          <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
            <Download size={15} /> Export
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap capitalize transition-colors ${
                tab === t ? 'bg-[#FF6B2B] text-white' : 'bg-white text-[#666666] hover:bg-[#F9F9F9]'
              }`}>
              {t}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b border-[#EEEEEE]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="w-full pl-9 pr-4 py-2 text-sm border border-[#EEEEEE] rounded-lg outline-none focus:border-[#FF6B2B]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EEEEEE]">
                  {['Order #', 'Customer', 'Amount', 'Status', 'Date', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[#666666] px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} className="border-b border-[#EEEEEE] hover:bg-[#F9F9F9] cursor-pointer" onClick={() => setSelected(order)}>
                    <td className="px-4 py-3 text-sm font-medium text-[#FF6B2B]">{order.order_number}</td>
                    <td className="px-4 py-3 text-sm">{order.delivery_address?.name}</td>
                    <td className="px-4 py-3 text-sm font-medium">₹{order.total_amount}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[order.status] ?? ''}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-[#666666]">{format(new Date(order.created_at), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); printInvoice(order) }} className="p-1.5 hover:bg-[#EEEEEE] rounded">
                        <Printer size={14} className="text-[#666666]" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slide-in order detail */}
      {selected && (
        <div className="w-96 bg-white rounded-xl shadow-sm p-5 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[#1A1A1A]">{selected.order_number}</h2>
            <button onClick={() => setSelected(null)} className="text-[#AAAAAA] hover:text-[#1A1A1A]">✕</button>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[#AAAAAA] mb-1">Customer</p>
              <p className="text-sm font-medium">{selected.delivery_address?.name}</p>
              <p className="text-sm text-[#666666]">{selected.delivery_address?.address}, {selected.delivery_address?.city}</p>
              <p className="text-sm text-[#666666]">{selected.delivery_address?.pincode}</p>
            </div>
            <div>
              <p className="text-xs text-[#AAAAAA] mb-1">Items</p>
              {(selected.items ?? []).map((item: any, i: number) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span>{item.name} × {item.qty}</span>
                  <span>₹{item.price * item.qty}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold border-t border-[#EEEEEE] pt-2 mt-2">
                <span>Total</span>
                <span>₹{selected.total_amount}</span>
              </div>
            </div>
            {/* Status actions */}
            <div className="space-y-2">
              {selected.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => updateStatus(selected.id, 'accepted')} className="flex-1 bg-[#25D366] text-white py-2 rounded-lg text-sm font-medium">Accept</button>
                  <button onClick={() => updateStatus(selected.id, 'rejected')} className="flex-1 bg-[#E23744] text-white py-2 rounded-lg text-sm font-medium">Reject</button>
                </div>
              )}
              {['accepted', 'packed', 'shipped'].includes(selected.status) && (() => {
                const idx = STATUS_FLOW.indexOf(selected.status)
                const next = STATUS_FLOW[idx + 1]
                return next ? (
                  <button onClick={() => updateStatus(selected.id, next)} className="w-full bg-[#FF6B2B] text-white py-2 rounded-lg text-sm font-medium capitalize">
                    Mark as {next}
                  </button>
                ) : null
              })()}
              <button onClick={() => printInvoice(selected)} className="w-full border border-[#EEEEEE] py-2 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-[#F9F9F9]">
                <Printer size={14} /> Print Invoice
              </button>
              <a href={`https://wa.me/${selected.delivery_address?.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                className="w-full border border-[#25D366] text-[#25D366] py-2 rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-[#25D366]/5 block text-center">
                💬 Contact on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Step 10: Analytics Page

```typescript
// app/seller/analytics/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
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

    const { data: orders } = await supabase.from('orders').select('total_amount, delivery_fee, items, buyer_id, created_at').eq('store_id', store.id).eq('payment_status', 'paid').gte('created_at', since)

    const all = orders ?? []
    const revenue = all.reduce((s, o) => s + o.total_amount, 0)
    const avgOrder = all.length > 0 ? revenue / all.length : 0

    // Daily revenue chart
    const chart = Array.from({ length: Math.min(period, 30) }, (_, i) => {
      const d = subDays(new Date(), Math.min(period, 30) - 1 - i)
      const key = format(d, 'yyyy-MM-dd')
      const label = format(d, period <= 7 ? 'EEE' : 'dd MMM')
      const rev = all.filter(o => o.created_at.startsWith(key)).reduce((s, o) => s + o.total_amount, 0)
      return { day: label, revenue: rev }
    })
    setRevenueChart(chart)

    // Top products
    const pMap = new Map<string, { name: string; revenue: number }>()
    for (const o of all) {
      for (const item of (o.items ?? []) as any[]) {
        const e = pMap.get(item.productId) ?? { name: item.name, revenue: 0 }
        e.revenue += item.price * item.qty
        pMap.set(item.productId, e)
      }
    }
    setTopProducts([...pMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5))

    // Day of week revenue
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const dow: Record<string, number> = {}
    days.forEach(d => dow[d] = 0)
    all.forEach(o => { dow[days[new Date(o.created_at).getDay()]] += o.total_amount })
    setDayOfWeek(Object.entries(dow).map(([day, revenue]) => ({ day, revenue: Math.round(revenue) })))

    // Customer split
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
            <YAxis tick={{ fontSize: 11, fill: '#AAAAAA' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
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
              <XAxis type="number" tick={{ fontSize: 11, fill: '#AAAAAA' }} tickFormatter={v => `₹${v}`} />
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
              <Pie data={customerSplit} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
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
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#AAAAAA' }} tickFormatter={v => `₹${v}`} />
            <Tooltip formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Revenue']} />
            <Bar dataKey="revenue" fill="#FF6B2B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

---

## Step 11: Marketing Page (Coupons + Broadcast)

```typescript
// app/seller/marketing/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { format } from 'date-fns'

export default function MarketingPage() {
  const supabase = createClient()
  const [storeId, setStoreId] = useState('')
  const [coupons, setCoupons] = useState<any[]>([])
  const [broadcasts, setBroadcasts] = useState<any[]>([])
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [recipientCount, setRecipientCount] = useState(0)
  const [sending, setSending] = useState(false)

  const couponSchema = z.object({
    code: z.string().min(3).max(20),
    discount_type: z.enum(['percentage', 'fixed']),
    discount_value: z.coerce.number().positive(),
    min_order_amount: z.coerce.number().min(0).default(0),
    max_uses: z.coerce.number().int().positive().optional(),
    expires_at: z.string().optional(),
  })
  type CouponForm = z.infer<typeof couponSchema>
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: { discount_type: 'percentage', min_order_amount: 0 },
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    setStoreId(store.id)

    const [coupRes, bcastRes, countRes] = await Promise.all([
      supabase.from('coupons').select('*').eq('store_id', store.id).order('created_at', { ascending: false }),
      supabase.from('broadcasts').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('orders').select('buyer_id', { count: 'exact', head: true }).eq('store_id', store.id).eq('payment_status', 'paid'),
    ])
    setCoupons(coupRes.data ?? [])
    setBroadcasts(bcastRes.data ?? [])
    setRecipientCount(countRes.count ?? 0)
  }

  async function createCoupon(data: CouponForm) {
    const { error } = await supabase.from('coupons').insert({
      store_id: storeId,
      code: data.code.toUpperCase(),
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount,
      max_uses: data.max_uses,
      expires_at: data.expires_at,
      is_active: true,
      uses: 0,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Coupon created')
    reset()
    load()
  }

  async function toggleCoupon(id: string, current: boolean) {
    await supabase.from('coupons').update({ is_active: !current }).eq('id', id)
    load()
  }

  async function sendBroadcast() {
    if (!broadcastMsg.trim()) return
    setSending(true)
    // Call whatsapp-service broadcast endpoint
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/whatsapp/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ storeId, message: broadcastMsg }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Sent to ${data.data.sent} customers`)
      setBroadcastMsg('')
      load()
    } else {
      toast.error(data.error)
    }
    setSending(false)
  }

  return (
    <div className="space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Marketing</h1>

      {/* Coupons */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">Coupons</h2>
        <form onSubmit={handleSubmit(createCoupon)} className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <input {...register('code')} placeholder="CODE (e.g. SAVE50)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase" />
            {errors.code && <p className="text-xs text-[#E23744]">{errors.code.message}</p>}
          </div>
          <select {...register('discount_type')} className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]">
            <option value="percentage">Percentage %</option>
            <option value="fixed">Fixed ₹</option>
          </select>
          <div>
            <input {...register('discount_value')} type="number" placeholder="Value (10 or 50)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <input {...register('min_order_amount')} type="number" placeholder="Min order ₹ (0 = any)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <input {...register('max_uses')} type="number" placeholder="Max uses (optional)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <input {...register('expires_at')} type="date" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <button type="submit" className="lg:col-span-3 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold">Create Coupon</button>
        </form>

        {coupons.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EEEEEE]">
                {['Code', 'Discount', 'Min Order', 'Uses', 'Expires', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-[#666666] py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} className="border-b border-[#EEEEEE]">
                  <td className="py-2 text-sm font-mono font-bold text-[#FF6B2B]">{c.code}</td>
                  <td className="py-2 text-sm">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`}</td>
                  <td className="py-2 text-sm">{c.min_order_amount > 0 ? `₹${c.min_order_amount}` : '—'}</td>
                  <td className="py-2 text-sm">{c.uses}/{c.max_uses ?? '∞'}</td>
                  <td className="py-2 text-sm text-[#666666]">{c.expires_at ? format(new Date(c.expires_at), 'dd/MM/yy') : '—'}</td>
                  <td className="py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.is_active ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-[#EEEEEE] text-[#AAAAAA]'}`}>
                      {c.is_active ? 'Active' : 'Off'}
                    </span>
                  </td>
                  <td className="py-2">
                    <button onClick={() => toggleCoupon(c.id, c.is_active)} className="text-xs text-[#666666] hover:text-[#1A1A1A]">
                      {c.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Broadcast */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">WhatsApp Broadcast</h2>
        <p className="text-sm text-[#666666]">Send a message to all {recipientCount} past customers</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={5}
              placeholder="Type your message here..."
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none"
            />
            <button onClick={sendBroadcast} disabled={!broadcastMsg.trim() || sending} className="w-full bg-[#25D366] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {sending ? 'Sending...' : `Send to ${recipientCount} customers`}
            </button>
          </div>
          {/* WhatsApp preview */}
          <div className="bg-[#E5DDD5] rounded-xl p-4">
            <p className="text-xs text-[#666666] mb-2 text-center">Preview</p>
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-xs ml-auto">
              <p className="text-xs font-bold text-[#FF6B2B] mb-1">Your Store 🛍️</p>
              <p className="text-sm whitespace-pre-wrap">{broadcastMsg || 'Your message will appear here...'}</p>
              <p className="text-[10px] text-[#AAAAAA] mt-1 text-right">Now</p>
            </div>
          </div>
        </div>

        {broadcasts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Broadcast History</h3>
            {broadcasts.map(b => (
              <div key={b.id} className="flex justify-between py-2 border-b border-[#EEEEEE] text-sm">
                <span className="text-[#1A1A1A] truncate max-w-xs">{b.message}</span>
                <span className="text-[#666666] shrink-0 ml-4">{b.recipient_count} sent · {format(new Date(b.created_at), 'dd/MM/yy')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

## Step 12: Settings Page

```typescript
// app/seller/settings/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink } from 'lucide-react'
import { debounce } from 'lodash'

export default function SettingsPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, watch, setValue, reset } = useForm()
  const slugValue = watch('store_slug')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('stores').select('*').eq('seller_id', user.id).single()
    if (!data) return
    setStore(data)
    reset(data)
  }

  const checkSlug = debounce(async (slug: string) => {
    if (!slug || !store || slug === store.store_slug) { setSlugAvailable(null); return }
    const { data } = await supabase.from('stores').select('id').eq('store_slug', slug).neq('id', store.id).single()
    setSlugAvailable(!data)
  }, 500)

  useEffect(() => { if (slugValue) checkSlug(slugValue) }, [slugValue])

  async function onSubmit(data: any) {
    setSaving(true)
    const { error } = await supabase.from('stores').update({
      store_name: data.store_name,
      store_slug: data.store_slug,
      description: data.description,
      category: data.category,
      whatsapp_number: data.whatsapp_number,
      instagram_handle: data.instagram_handle,
      city: data.city,
    }).eq('id', store.id)
    if (error) toast.error(error.message)
    else { toast.success('Settings saved'); load() }
    setSaving(false)
  }

  function copyLink() {
    const url = `https://reelmart.in/s/${store?.store_slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  async function downloadQR() {
    const url = `https://reelmart.in/s/${store?.store_slug}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const a = document.createElement('a')
    a.download = `reelmart-${store?.store_slug}-qr.png`
    a.href = dataUrl
    a.click()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Settings</h1>

      {/* Store link */}
      {store && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Your Store Link</h2>
          <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-lg p-3">
            <code className="text-sm text-[#FF6B2B] flex-1">reelmart.in/s/{store.store_slug}</code>
            <button onClick={copyLink} className="p-1.5 hover:bg-[#EEEEEE] rounded">
              <Copy size={14} className="text-[#666666]" />
            </button>
            <a href={`https://reelmart.in/s/${store.store_slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[#EEEEEE] rounded">
              <ExternalLink size={14} className="text-[#666666]" />
            </a>
          </div>
          <button onClick={downloadQR} className="flex items-center gap-2 px-3 py-2 border border-[#EEEEEE] rounded-lg text-sm hover:bg-[#F9F9F9]">
            <Download size={14} /> Download QR Code
          </button>
        </div>
      )}

      {/* Store settings form */}
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">Store Settings</h2>
        <div>
          <label className="block text-sm font-medium mb-1">Store Name</label>
          <input {...register('store_name')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Store URL</label>
          <div className="flex items-center border border-[#EEEEEE] rounded-lg overflow-hidden focus-within:border-[#FF6B2B]">
            <span className="px-3 text-sm text-[#AAAAAA] bg-[#F9F9F9] border-r border-[#EEEEEE] py-2">reelmart.in/s/</span>
            <input {...register('store_slug')} className="flex-1 px-3 py-2 text-sm outline-none" />
          </div>
          {slugAvailable === true && <p className="text-xs text-[#25D366] mt-1">✓ Available</p>}
          {slugAvailable === false && <p className="text-xs text-[#E23744] mt-1">✗ Already taken</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea {...register('description')} rows={3} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input {...register('city')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp Number</label>
            <input {...register('whatsapp_number')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="+91XXXXXXXXXX" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Instagram Handle</label>
            <input {...register('instagram_handle')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="@yourhandle" />
          </div>
        </div>
        <button type="submit" disabled={saving || slugAvailable === false} className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
```

---

## Step 13: Customers Page

```typescript
// app/seller/customers/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Search, Download, MessageCircle } from 'lucide-react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'

function maskPhone(phone: string) {
  return phone?.replace(/(\+91)(\d{5})(\d{5})/, '$1XXXXX$3') ?? '—'
}

export default function CustomersPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return

    const { data: orders } = await supabase
      .from('orders')
      .select('buyer_id, total_amount, created_at, users!buyer_id(full_name, phone)')
      .eq('store_id', store.id)
      .eq('payment_status', 'paid')

    const map = new Map<string, any>()
    for (const o of orders ?? []) {
      const e = map.get(o.buyer_id) ?? {
        buyer_id: o.buyer_id,
        name: (o as any).users?.full_name ?? 'Unknown',
        phone: (o as any).users?.phone,
        totalOrders: 0,
        totalSpent: 0,
        lastOrder: o.created_at,
        firstOrder: o.created_at,
      }
      e.totalOrders++
      e.totalSpent += o.total_amount
      if (o.created_at > e.lastOrder) e.lastOrder = o.created_at
      if (o.created_at < e.firstOrder) e.firstOrder = o.created_at
      map.set(o.buyer_id, e)
    }
    setCustomers([...map.values()].sort((a, b) => b.totalSpent - a.totalSpent))
  }

  function exportExcel() {
    const data = customers.map(c => ({
      'Name': c.name,
      'Total Orders': c.totalOrders,
      'Total Spent (₹)': Math.round(c.totalSpent),
      'First Order': format(new Date(c.firstOrder), 'dd/MM/yyyy'),
      'Last Order': format(new Date(c.lastOrder), 'dd/MM/yyyy'),
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, `reelmart-customers-${Date.now()}.xlsx`)
  }

  const filtered = customers.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Customers <span className="text-[#AAAAAA] font-normal text-base">({customers.length})</span></h1>
        <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
          <Download size={15} /> Export
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-4 border-b border-[#EEEEEE]">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#AAAAAA]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..." className="w-full pl-9 pr-4 py-2 text-sm border border-[#EEEEEE] rounded-lg outline-none focus:border-[#FF6B2B]" />
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#EEEEEE]">
              {['Name', 'Phone', 'Orders', 'Total Spent', 'Last Order', ''].map(h => (
                <th key={h} className="text-left text-xs font-medium text-[#666666] px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.buyer_id} className="border-b border-[#EEEEEE] hover:bg-[#F9F9F9] cursor-pointer" onClick={() => setSelected(c)}>
                <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-[#666666] font-mono">{maskPhone(c.phone)}</td>
                <td className="px-4 py-3 text-sm">{c.totalOrders}</td>
                <td className="px-4 py-3 text-sm font-medium">₹{Math.round(c.totalSpent).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-sm text-[#666666]">{format(new Date(c.lastOrder), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3">
                  <a href={`https://wa.me/${c.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                    className="p-1.5 hover:bg-[#EEEEEE] rounded inline-block">
                    <MessageCircle size={14} className="text-[#25D366]" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

---

## Step 14: Payouts Page

```typescript
// app/seller/payouts/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import toast, { Toaster } from 'react-hot-toast'

export default function PayoutsPage() {
  const supabase = createClient()
  const [summary, setSummary] = useState<any>(null)
  const [payouts, setPayouts] = useState<any[]>([])
  const [bankAccount, setBankAccount] = useState<any>(null)
  const [editingBank, setEditingBank] = useState(false)
  const [bankName, setBankName] = useState('')
  const { register, handleSubmit, watch, setValue, reset } = useForm()
  const ifscValue = watch('ifsc_code')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return

    const [ordersRes, payoutsRes, bankRes] = await Promise.all([
      supabase.from('orders').select('total_amount, delivery_fee, payment_status').eq('store_id', store.id).eq('payment_status', 'paid'),
      supabase.from('payouts').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('bank_accounts').select('*').eq('seller_id', user.id).maybeSingle(),
    ])

    const orders = ordersRes.data ?? []
    const totalEarned = orders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.95, 0)
    const totalPaid = (payoutsRes.data ?? []).filter(p => p.status === 'done').reduce((s, p) => s + p.amount, 0)
    setSummary({ totalEarned: Math.round(totalEarned), totalPaid: Math.round(totalPaid), pending: Math.round(totalEarned - totalPaid) })
    setPayouts(payoutsRes.data ?? [])
    setBankAccount(bankRes.data)
    if (bankRes.data) { reset(bankRes.data) }
  }

  useEffect(() => {
    if (ifscValue?.length === 11) {
      fetch(`https://ifsc.razorpay.com/${ifscValue}`)
        .then(r => r.json())
        .then(d => { if (d.BANK) { setBankName(d.BANK); setValue('bank_name', d.BANK) } })
        .catch(() => {})
    }
  }, [ifscValue])

  async function saveBankAccount(data: any) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('bank_accounts').upsert({ ...data, seller_id: user.id }, { onConflict: 'seller_id' })
    if (error) { toast.error(error.message); return }
    toast.success('Bank account saved')
    setEditingBank(false)
    load()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Payouts</h1>

      {summary && (
        <div className="bg-[#FF6B2B] rounded-xl p-5 text-white">
          <p className="text-sm opacity-80">Pending Balance</p>
          <p className="text-4xl font-bold mt-1">₹{summary.pending.toLocaleString('en-IN')}</p>
          <p className="text-sm opacity-80 mt-2">Paid out every Monday</p>
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-70">Total Earned</p>
              <p className="font-bold">₹{summary.totalEarned.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">Total Paid Out</p>
              <p className="font-bold">₹{summary.totalPaid.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Bank account */}
      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#1A1A1A]">Bank Account</h2>
          <button onClick={() => setEditingBank(!editingBank)} className="text-sm text-[#FF6B2B] font-medium">
            {editingBank ? 'Cancel' : bankAccount ? 'Edit' : 'Add'}
          </button>
        </div>
        {!editingBank && bankAccount && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{bankAccount.bank_name}</p>
            <p className="text-[#666666]">{bankAccount.account_holder}</p>
            <p className="font-mono text-[#666666]">XXXXXXXXXXXX{bankAccount.account_number?.slice(-4)}</p>
            <p className="text-[#AAAAAA]">IFSC: {bankAccount.ifsc_code}</p>
          </div>
        )}
        {(editingBank || !bankAccount) && (
          <form onSubmit={handleSubmit(saveBankAccount)} className="space-y-3">
            <input {...register('account_holder')} placeholder="Account Holder Name" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <input {...register('account_number')} placeholder="Account Number" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <div className="flex gap-2">
              <input {...register('ifsc_code')} placeholder="IFSC Code" maxLength={11} className="flex-1 border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase" />
              {bankName && <span className="self-center text-sm text-[#25D366] font-medium">{bankName}</span>}
            </div>
            <input {...register('bank_name')} type="hidden" />
            <button type="submit" className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold">Save Bank Account</button>
          </form>
        )}
      </div>

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] p-5 border-b border-[#EEEEEE]">Payout History</h2>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EEEEEE]">
                {['Date', 'Amount', 'Orders', 'Status'].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-[#666666] px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payouts.map(p => (
                <tr key={p.id} className="border-b border-[#EEEEEE]">
                  <td className="px-4 py-3 text-sm">{format(new Date(p.created_at), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3 text-sm font-medium">₹{Math.round(p.amount).toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-sm">{p.order_count}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === 'done' ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-[#FFD700]/20 text-[#B8860B]'}`}>
                      {p.status === 'done' ? '✅ Paid' : '⏳ Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

---

## Step 15: .env.example

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_API_URL=https://api.reelmart.in
```

---

## Folder Structure Summary

```
apps/web/app/seller/
├── login/page.tsx
├── layout.tsx
├── dashboard/page.tsx
├── products/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
├── orders/page.tsx
├── analytics/page.tsx
├── customers/page.tsx
├── payouts/page.tsx
├── marketing/page.tsx
└── settings/page.tsx

apps/web/components/seller/
├── Sidebar.tsx
└── TopBar.tsx

apps/web/store/
└── sellerStore.ts

middleware.ts
```

---

## Done When

- [ ] `/seller/login` phone OTP works, redirects to dashboard
- [ ] Middleware blocks non-sellers from `/seller/*`
- [ ] Dashboard shows today/week/month revenue, pending orders with accept/reject, 7-day bar chart
- [ ] Realtime toast appears when new order arrives
- [ ] Products table with search, toggle availability, delete, export Excel
- [ ] Add/edit product form with drag-drop photo upload to Supabase Storage
- [ ] Orders page — tabs by status, search, slide-in detail panel, accept/reject/next status, print invoice
- [ ] Analytics page — period selector, line chart, top products bar chart, customer pie chart, day-of-week chart, export
- [ ] Customers page — aggregated from orders, phone masked, WhatsApp link
- [ ] Payouts page — pending balance, IFSC auto-lookup, payout history
- [ ] Marketing page — create/toggle coupons, WhatsApp broadcast with preview
- [ ] Settings — store slug with availability check, save settings, QR code download
