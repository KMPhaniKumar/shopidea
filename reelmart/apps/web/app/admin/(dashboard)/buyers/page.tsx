import { adminApi } from '@/lib/admin-api'

interface Buyer {
  id: string
  full_name: string | null
  phone: string
  email: string | null
  role: string
  created_at: string
  is_active: boolean
}

export default async function BuyersPage({
  searchParams,
}: {
  searchParams: { search?: string; page?: string }
}) {
  const { search, page = '1' } = searchParams
  const params = new URLSearchParams({ role: 'buyer', page })
  if (search) params.set('search', search)

  let buyers: Buyer[] = []
  let total = 0

  try {
    const res = await adminApi.get<{ data: Buyer[]; total: number }>(`/api/admin/users?${params}`)
    buyers = (res as any).data ?? (res as any) ?? []
    total = (res as any).total ?? buyers.length
  } catch {
    // Service unavailable
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Buyers</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      <form className="flex gap-3 mb-4">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by name or phone..."
          className="flex-1 border border-gray-200 rounded-xl px-4 h-10 text-sm focus:outline-none focus:border-orange-400"
        />
        <button type="submit" className="px-4 h-10 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600">
          Search
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Phone</th>
              <th className="text-left px-4 py-3 font-semibold">Email</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {buyers.map(b => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-900">{b.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{b.phone}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{b.email ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    b.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {b.is_active !== false ? 'Active' : 'Banned'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(b.created_at).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {buyers.length === 0 && (
          <p className="text-center py-12 text-gray-400">No buyers found</p>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-2 mt-4 justify-end">
        {parseInt(page) > 1 && (
          <a href={`/admin/buyers?page=${parseInt(page) - 1}${search ? `&search=${search}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            ← Prev
          </a>
        )}
        {buyers.length === 20 && (
          <a href={`/admin/buyers?page=${parseInt(page) + 1}${search ? `&search=${search}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Next →
          </a>
        )}
      </div>
    </div>
  )
}
