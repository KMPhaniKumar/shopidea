import { adminApi } from '@/lib/admin-api'
import SellerActions from './SellerActions'

interface Store {
  id: string
  store_name: string
  store_slug: string
  seller_id: string
  status: 'pending' | 'active' | 'suspended'
  category: string
  created_at: string
  users?: { full_name: string; phone: string }
}

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-100 text-green-700',
  pending:   'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
}

export default async function SellersPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string }
}) {
  const { status, search, page = '1' } = searchParams
  const params = new URLSearchParams({ page })
  if (status) params.set('status', status)
  if (search) params.set('search', search)

  let stores: Store[] = []
  let total = 0

  try {
    const res = await adminApi.get<{ data: Store[]; total: number }>(`/api/admin/stores?${params}`)
    stores = (res as any).data ?? (res as any) ?? []
    total = (res as any).total ?? stores.length
  } catch {
    // Service unavailable
  }

  const STATUSES = ['active', 'pending', 'suspended']

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Sellers</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      {/* Search + filter */}
      <form className="flex gap-3 mb-4">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search store name or slug..."
          className="flex-1 border border-gray-200 rounded-xl px-4 h-10 text-sm focus:outline-none focus:border-orange-400"
        />
        <button type="submit" className="px-4 h-10 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600">
          Search
        </button>
      </form>

      {/* Status tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <a href="/admin/sellers"
          className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            !status ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          All
        </a>
        {STATUSES.map(s => (
          <a key={s} href={`/admin/sellers?status=${s}`}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize ${
              status === s ? 'bg-orange-500 text-white border-orange-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {s}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Owner</th>
              <th className="text-left px-4 py-3 font-semibold">Category</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stores.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{s.store_name}</div>
                  <div className="text-gray-400 text-xs">/{s.store_slug}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-700">{s.users?.full_name ?? '—'}</div>
                  <div className="text-gray-400 text-xs">{s.users?.phone ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-gray-500 capitalize">{s.category ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    STATUS_STYLES[s.status] ?? 'bg-gray-100 text-gray-600'
                  }`}>
                    {s.status === 'active' ? '✓ ' : s.status === 'pending' ? '⏳ ' : '⛔ '}{s.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {new Date(s.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <SellerActions storeId={s.id} status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {stores.length === 0 && (
          <p className="text-center py-12 text-gray-400">No sellers found</p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-2 mt-4 justify-end">
        {parseInt(page) > 1 && (
          <a href={`/admin/sellers?page=${parseInt(page) - 1}${status ? `&status=${status}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            ← Prev
          </a>
        )}
        {stores.length === 20 && (
          <a href={`/admin/sellers?page=${parseInt(page) + 1}${status ? `&status=${status}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Next →
          </a>
        )}
      </div>
    </div>
  )
}
