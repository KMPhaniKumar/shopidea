import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import SellerActions from './SellerActions'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Store {
  id: string
  store_name: string
  store_slug: string
  seller_id: string
  is_active: boolean
  is_verified: boolean
  approval_status: string
  category: string
  city: string
  logo_url: string | null
  created_at: string
  users?: { name: string; phone: string }
}

const STATUS_TABS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
]

const APPROVAL_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

export default async function SellersPage({
  searchParams,
}: {
  searchParams: { status?: string; search?: string; page?: string }
}) {
  const { status, search, page = '1' } = searchParams
  const from = (Math.max(1, parseInt(page)) - 1) * 20

  let query = supabaseAdmin()
    .from('stores')
    .select('id, store_name, store_slug, seller_id, is_active, is_verified, approval_status, category, city, logo_url, created_at, users:seller_id(name, phone)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + 19)

  if (status) query = query.eq('approval_status', status)
  if (search) query = query.ilike('store_name', `%${search}%`)

  const { data: stores, count, error: queryError } = await query
  if (queryError) {
    console.error('[admin/sellers] query failed:', queryError)
  }
  const total = count ?? 0
  const safeStores = (stores ?? []) as unknown as Store[]
  console.log('[admin/sellers] fetched', safeStores.length, 'of', total, 'stores')

  // Count pending for badge
  const { count: pendingCount } = await supabaseAdmin()
    .from('stores')
    .select('id', { count: 'exact', head: true })
    .eq('approval_status', 'pending')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black text-gray-900">Sellers</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      <form className="flex gap-3 mb-4">
        <input
          name="search"
          defaultValue={search}
          placeholder="Search store name..."
          className="flex-1 border border-gray-200 rounded-xl px-4 h-10 text-sm focus:outline-none focus:border-orange-400"
        />
        <button type="submit" className="px-4 h-10 bg-orange-500 text-white text-sm font-semibold rounded-xl hover:bg-orange-600">
          Search
        </button>
      </form>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map(tab => (
          <a key={tab.value} href={`/admin/sellers${tab.value ? `?status=${tab.value}` : ''}`}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              status === tab.value || (!status && tab.value === '')
                ? 'bg-orange-500 text-white border-orange-500'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {tab.label}
            {tab.value === 'pending' && (pendingCount ?? 0) > 0 && (
              <span className={`w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
                status === 'pending' ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </a>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Owner</th>
              <th className="text-left px-4 py-3 font-semibold">Category / City</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Joined</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {safeStores.map(s => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {s.logo_url ? (
                      <img src={s.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center text-orange-400 font-bold text-sm shrink-0">
                        {s.store_name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-gray-900">{s.store_name}</div>
                      <div className="text-gray-400 text-xs">/{s.store_slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-gray-700">{s.users?.name ?? '—'}</div>
                  <div className="text-gray-400 text-xs">{s.users?.phone ?? ''}</div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs capitalize">{s.category ?? '—'}<br />{s.city ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-fit capitalize ${APPROVAL_BADGE[s.approval_status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {s.approval_status}
                    </span>
                    {s.approval_status === 'approved' && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${
                        s.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {s.is_active ? '● Active' : '○ Inactive'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(s.created_at).toLocaleDateString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <SellerActions storeId={s.id} isActive={s.is_active} approvalStatus={s.approval_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {safeStores.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-2">No sellers found</p>
            {queryError && (
              <p className="text-red-500 text-xs font-mono">{queryError.message}</p>
            )}
            {!queryError && total === 0 && (
              <p className="text-gray-400 text-xs">
                No stores exist in the database yet. Sign up as a seller via <a href="/seller/register" className="text-orange-500 underline">/seller/register</a> first.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4 justify-end">
        {parseInt(page) > 1 && (
          <a href={`/admin/sellers?page=${parseInt(page) - 1}${status ? `&status=${status}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            ← Prev
          </a>
        )}
        {safeStores.length === 20 && (
          <a href={`/admin/sellers?page=${parseInt(page) + 1}${status ? `&status=${status}` : ''}`}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Next →
          </a>
        )}
      </div>
    </div>
  )
}
