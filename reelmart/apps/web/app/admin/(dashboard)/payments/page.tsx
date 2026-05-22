import Link from 'next/link'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PAY_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  pending: 'bg-gray-100 text-gray-600',
  refunded: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
}

const TABS = ['', 'paid', 'pending', 'refunded', 'failed']

function fmt(n: number) { return `₹${Number(n ?? 0).toLocaleString('en-IN')}` }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string }
}) {
  const db = supabaseAdmin()
  const status = searchParams.status
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = 50
  const offset = (page - 1) * pageSize

  // Summary: amount collected (paid) + counts per state.
  const { data: paidRows } = await db.from('orders').select('total_amount').eq('payment_status', 'paid')
  const collected = (paidRows ?? []).reduce((s, r: any) => s + Number(r.total_amount ?? 0), 0)
  const [{ count: paidCount }, { count: pendingCount }, { count: refundedCount }] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'paid'),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'pending'),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'refunded'),
  ])

  let query = db
    .from('orders')
    .select('id, order_number, total_amount, payment_method, payment_status, razorpay_payment_id, created_at, stores!store_id(store_name), users!buyer_id(name, phone)')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)
  if (status) query = query.eq('payment_status', status)
  const { data: rows } = await query

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">Payments</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 uppercase font-semibold">Collected</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{fmt(collected)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 uppercase font-semibold">Paid orders</div>
          <div className="text-2xl font-black text-green-600 mt-1">{paidCount ?? 0}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 uppercase font-semibold">Pending</div>
          <div className="text-2xl font-black text-gray-500 mt-1">{pendingCount ?? 0}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 uppercase font-semibold">Refunded</div>
          <div className="text-2xl font-black text-orange-500 mt-1">{refundedCount ?? 0}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {TABS.map(t => (
          <a key={t} href={`/admin/payments${t ? `?status=${t}` : ''}`}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
              (status ?? '') === t ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {t || 'All'}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Order</th>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Buyer</th>
              <th className="text-left px-4 py-3 font-semibold">Amount</th>
              <th className="text-left px-4 py-3 font-semibold">Method</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Txn ID</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(rows ?? []).map((o: any) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/orders/${o.id}`} className="text-gray-900 hover:text-orange-600 hover:underline">{o.order_number}</Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{o.stores?.store_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-700">{o.users?.name ?? '—'}</div>
                  <div className="text-gray-400 text-xs">{o.users?.phone}</div>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900">{fmt(o.total_amount)}</td>
                <td className="px-4 py-3 text-gray-600 uppercase text-xs">{o.payment_method}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PAY_BADGE[o.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>{o.payment_status}</span>
                </td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{o.razorpay_payment_id ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(o.created_at).toLocaleDateString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!rows || rows.length === 0) && <p className="text-center py-12 text-gray-400">No payments found</p>}
      </div>

      <div className="flex gap-2 mt-4 justify-end">
        {page > 1 && (
          <a href={`/admin/payments?${status ? `status=${status}&` : ''}page=${page - 1}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">← Prev</a>
        )}
        {rows && rows.length === pageSize && (
          <a href={`/admin/payments?${status ? `status=${status}&` : ''}page=${page + 1}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Next →</a>
        )}
      </div>
    </div>
  )
}
