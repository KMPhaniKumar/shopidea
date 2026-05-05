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
        <h1 className="text-xl font-bold text-[#1A1A1A]">
          Customers <span className="text-[#AAAAAA] font-normal text-base">({customers.length})</span>
        </h1>
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
              <tr key={c.buyer_id} className="border-b border-[#EEEEEE] hover:bg-[#F9F9F9]">
                <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-[#666666] font-mono">{maskPhone(c.phone)}</td>
                <td className="px-4 py-3 text-sm">{c.totalOrders}</td>
                <td className="px-4 py-3 text-sm font-medium">₹{Math.round(c.totalSpent).toLocaleString('en-IN')}</td>
                <td className="px-4 py-3 text-sm text-[#666666]">{format(new Date(c.lastOrder), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-3">
                  <a href={`https://wa.me/${c.phone?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                    className="p-1.5 hover:bg-[#EEEEEE] rounded inline-block">
                    <MessageCircle size={14} className="text-[#25D366]" />
                  </a>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-[#AAAAAA]">No customers yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
