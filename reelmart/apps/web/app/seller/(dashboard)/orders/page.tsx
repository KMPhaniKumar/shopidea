'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [orders, setOrders] = useState<any[]>([])
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [loadingOrders, setLoadingOrders] = useState(true)

  // Resolve store once on mount
  useEffect(() => {
    async function resolveStore() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          const { data: store } = await supabase.from('stores').select('id').limit(1).maybeSingle()
          if (store) { setStoreId(store.id); return }
        }
        router.push('/seller/login'); return
      }
      const { data: store, error: storeErr } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
      if (storeErr || !store) { setStoreError('No store found for your account. Please complete store setup.'); setLoadingOrders(false); return }
      setStoreId(store.id)
    }
    resolveStore()
  }, [])

  // Load orders whenever storeId or tab changes
  useEffect(() => {
    if (!storeId) return
    loadOrders(storeId)
  }, [storeId, tab])

  // Realtime subscription (separate from query)
  useEffect(() => {
    if (!storeId) return
    const ch = supabase.channel(`orders-page-${storeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, (p: any) => {
        toast.custom(() => (
          <div className="bg-white rounded-xl shadow-lg p-4 border-l-4 border-[#FF6B2B]">
            <p className="font-semibold text-sm">🛍️ New Order {p.new.order_number}</p>
            <p className="text-xs text-[#666666]">₹{p.new.total_amount}</p>
          </div>
        ), { duration: 6000 })
        loadOrders(storeId)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [storeId])

  async function loadOrders(sid: string) {
    setLoadingOrders(true)
    let q = supabase.from('orders').select('*').eq('store_id', sid).order('created_at', { ascending: false }).limit(100)
    if (tab !== 'all') q = q.eq('status', tab)
    const { data, error } = await q
    if (error) { setStoreError(`Failed to load orders: ${error.message}`); setLoadingOrders(false); return }
    setOrders(data ?? [])
    setLoadingOrders(false)
  }

  async function updateStatus(orderId: string, status: string) {
    const updates: any = { status }
    if (status === 'delivered') updates.delivered_at = new Date().toISOString()
    const { error } = await supabase.from('orders').update(updates).eq('id', orderId)
    if (error) { toast.error(`Failed to update: ${error.message}`); return }
    toast.success(`Order ${status}`)
    if (storeId) loadOrders(storeId)
    if (selected?.id === orderId) setSelected((prev: any) => ({ ...prev, status }))
  }

  function fullAddressLines(addr: any): string[] {
    if (!addr) return []
    return [
      addr.line1,
      addr.line2,
      addr.area,
      [addr.city, addr.state, addr.pincode].filter(Boolean).join(' - '),
    ].filter(Boolean) as string[]
  }

  function printInvoice(order: any) {
    const addr = order.delivery_address ?? {}
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><title>Invoice ${order.order_number}</title>
    <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{padding:6px;border-bottom:1px solid #eee;text-align:left}</style>
    </head><body>
    <h1 style="color:#FF6B2B;margin:0 0 8px">ReelMart</h1>
    <p style="margin:4px 0"><strong>Order:</strong> ${order.order_number}</p>
    <p style="margin:4px 0"><strong>Date:</strong> ${format(new Date(order.created_at), 'dd/MM/yyyy hh:mm a')}</p>
    <hr/>
    <p style="margin:4px 0"><strong>Customer:</strong> ${addr.name ?? ''} ${addr.phone ? '· ' + addr.phone : ''}</p>
    <p style="margin:4px 0"><strong>Address:</strong></p>
    <p style="margin:4px 0;white-space:pre-line">${fullAddressLines(addr).join('\n')}</p>
    <hr/>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead><tbody>
    ${(order.items ?? []).map((i: any) => `<tr><td>${i.name}${i.variant ? ' · ' + i.variant : ''}</td><td>${i.qty}</td><td>₹${i.price * i.qty}</td></tr>`).join('')}
    </tbody></table>
    <p style="text-align:right;margin-top:12px"><strong>Total: ₹${order.total_amount}</strong></p>
    <p style="text-align:right;color:#666;font-size:13px;margin-top:4px">Payment: ${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online'} · ${order.payment_status}</p>
    </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  function printShippingLabel(order: any) {
    const addr = order.delivery_address ?? {}
    const items = order.items ?? []
    const itemsSummary = items.map((i: any) => `${i.qty} × ${i.name}${i.variant ? ' (' + i.variant + ')' : ''}`).join(', ')
    const w = window.open('', '_blank')!
    w.document.write(`<html><head><title>Shipping Label ${order.order_number}</title>
    <style>
      @page { size: A6; margin: 8mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 16px; }
      .label { border: 2px solid #1A1A1A; border-radius: 8px; padding: 16px; }
      .row { display: flex; justify-content: space-between; align-items: center; }
      .meta { font-size: 11px; color: #666; }
      .from { font-size: 11px; color: #666; margin-top: 12px; padding-top: 8px; border-top: 1px dashed #ccc; }
      h2 { margin: 0 0 4px; font-size: 13px; color: #FF6B2B; letter-spacing: 1px; text-transform: uppercase; }
      h3 { margin: 0; font-size: 22px; line-height: 1.3; }
      .addr { font-size: 16px; line-height: 1.5; margin-top: 6px; white-space: pre-line; }
      .phone { font-size: 18px; font-weight: bold; margin-top: 8px; }
      .barcode { text-align: center; font-family: monospace; font-size: 14px; letter-spacing: 2px; margin-top: 10px; padding: 6px; background: #F3F4F6; border-radius: 4px; }
      .items { font-size: 11px; color: #444; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #ccc; }
      .pay { font-weight: bold; font-size: 13px; padding: 4px 10px; border-radius: 6px; display: inline-block; margin-top: 8px; }
      .pay-cod { background: #FEF3C7; color: #92400E; border: 1px solid #F59E0B; }
      .pay-paid { background: #DCFCE7; color: #166534; border: 1px solid #16A34A; }
      @media print { body { padding: 0; } .no-print { display: none; } }
    </style>
    </head><body>
    <div class="label">
      <div class="row">
        <h2>Deliver To</h2>
        <span class="meta">${order.order_number}</span>
      </div>
      <h3>${addr.name ?? '—'}</h3>
      <div class="addr">${fullAddressLines(addr).join('\n')}</div>
      <div class="phone">📞 ${addr.phone ?? '—'}</div>
      <div class="barcode">${order.order_number}</div>
      <span class="pay ${order.payment_status === 'paid' ? 'pay-paid' : 'pay-cod'}">
        ${order.payment_status === 'paid' ? '✓ PREPAID' : `COD: ₹${order.total_amount}`}
      </span>
      <div class="items"><strong>Items:</strong> ${itemsSummary}</div>
      <div class="from">From: ReelMart · ${format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}</div>
    </div>
    <div class="no-print" style="margin-top:16px;text-align:center;color:#888;font-size:12px">
      Use Cmd/Ctrl + P → choose A6 paper → Print
    </div>
    </body></html>`)
    w.document.close()
    w.focus()
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

  if (storeError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8 bg-white rounded-xl border border-[#EEEEEE] max-w-md">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="font-semibold text-[#1A1A1A] mb-2">Unable to load orders</p>
          <p className="text-sm text-[#666666]">{storeError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-full">
      <Toaster />
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[#1A1A1A]">Orders</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => storeId && loadOrders(storeId)} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
              ↻ Refresh
            </button>
            <button onClick={exportExcel} className="px-3 py-2 border border-[#EEEEEE] text-sm rounded-lg flex items-center gap-2 hover:bg-[#F9F9F9]">
              <Download size={15} /> Export
            </button>
          </div>
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
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); printShippingLabel(order) }} className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Print shipping label">
                          <span className="text-base leading-none">📦</span>
                        </button>
                        <button onClick={e => { e.stopPropagation(); printInvoice(order) }} className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Print invoice">
                          <Printer size={14} className="text-[#666666]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loadingOrders ? (
              <p className="text-center py-12 text-[#AAAAAA] text-sm">Loading orders...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center py-12 text-[#AAAAAA] text-sm">No orders found</p>
            ) : null}
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
              <p className="text-sm text-[#666666]">{selected.delivery_address?.phone}</p>
              {fullAddressLines(selected.delivery_address).map((line, i) => (
                <p key={i} className="text-sm text-[#666666] leading-relaxed">{line}</p>
              ))}
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
              <button onClick={() => printShippingLabel(selected)} className="w-full bg-[#1A1A1A] text-white py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-black">
                📦 Print Shipping Label
              </button>
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
