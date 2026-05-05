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

  useEffect(() => { loadOrders() }, [tab])

  async function loadOrders() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return

    let q = supabase.from('orders').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(100)
    if (tab !== 'all') q = q.eq('status', tab)
    const { data } = await q
    setOrders(data ?? [])

    const ch = supabase.channel('orders-page')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` }, (p: any) => {
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

  async function updateStatus(orderId: string, status: string) {
    const updates: any = { status }
    if (status === 'delivered') updates.delivered_at = new Date().toISOString()
    await supabase.from('orders').update(updates).eq('id', orderId)
    toast.success(`Order ${status}`)
    loadOrders()
    if (selected?.id === orderId) setSelected((prev: any) => ({ ...prev, status }))
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
            {filtered.length === 0 && (
              <p className="text-center py-12 text-[#AAAAAA] text-sm">No orders found</p>
            )}
          </div>
        </div>
      </div>

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
