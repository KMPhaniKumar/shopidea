import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  accepted:  'bg-blue-100 text-blue-700',
  packed:    'bg-purple-100 text-purple-700',
  shipped:   'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  refunded:  'bg-orange-100 text-orange-700',
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string; search?: string }
}) {
  const supabase = createClient()
  const status = searchParams.status
  const search = searchParams.search?.trim()
  const page = parseInt(searchParams.page ?? '1', 10)
  const pageSize = 50
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('orders')
    .select(`
      id, order_number, status, payment_status, total_amount, created_at,
      stores!store_id(store_name),
      users!buyer_id(name, phone)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('order_number', `%${search}%`)

  const { data: orders } = await query

  // Build /admin/orders URLs that keep the active status + search filters.
  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams()
    const merged: Record<string, string | number | undefined> = { status, search, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== '') params.set(k, String(v))
    }
    const qs = params.toString()
    return qs ? `/admin/orders?${qs}` : '/admin/orders'
  }

  const STATUSES = ['pending', 'accepted', 'packed', 'shipped', 'delivered', 'rejected']

  return (
    <div>
      <h1 className="text-2xl font-black text-gray-900 mb-6">Orders</h1>

      {/* Search by order number */}
      <form className="flex gap-3 mb-4">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="search"
          defaultValue={search}
          placeholder="Search order number (e.g. ORD-10042)…"
          className="flex-1 border border-gray-200 rounded-xl px-4 h-10 text-sm focus:outline-none focus:border-orange-400"
        />
        <button type="submit" className="px-4 h-10 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600">
          Search
        </button>
        {search && (
          <a
            href={buildHref({ search: undefined, page: undefined })}
            className="px-4 h-10 flex items-center border border-gray-200 text-sm font-semibold text-gray-600 rounded-xl hover:bg-gray-50"
          >
            Clear
          </a>
        )}
      </form>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <a
          href={buildHref({ status: undefined, page: undefined })}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            !status ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          All
        </a>
        {STATUSES.map(s => (
          <a
            key={s}
            href={buildHref({ status: s, page: undefined })}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
              status === s ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s}
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
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Payment</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(orders ?? []).map((o: any) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold">
                  <Link href={`/admin/orders/${o.id}`} className="text-gray-900 hover:text-orange-600 hover:underline">{o.order_number}</Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{o.stores?.store_name ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-700">{o.users?.name ?? '—'}</div>
                  <div className="text-gray-400 text-xs">{o.users?.phone}</div>
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900">₹{o.total_amount}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    o.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {o.payment_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(o.created_at).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!orders || orders.length === 0) && (
          <p className="text-center py-12 text-gray-400">No orders found</p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-2 mt-4 justify-end">
        {page > 1 && (
          <a href={buildHref({ page: page - 1 })}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            ← Prev
          </a>
        )}
        {orders && orders.length === pageSize && (
          <a href={buildHref({ page: page + 1 })}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Next →
          </a>
        )}
      </div>
    </div>
  )
}
