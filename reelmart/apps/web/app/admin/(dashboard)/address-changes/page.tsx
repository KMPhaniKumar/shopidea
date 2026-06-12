import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import AddressChangeActions from './AddressChangeActions'

// Admin — Address Change Requests
// Lists all stores with a pending store_address_changes row, showing the
// current (live) address vs. proposed address as a diff, with Approve /
// Reject(reason) actions that call PUT /api/admin/stores/[id]/address-change.

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

interface AddressField {
  label: string
  current: string | null
  proposed: string | null
}

function AddressDiff({ fields }: { fields: AddressField[] }) {
  return (
    <div className="mt-3 space-y-1.5">
      {fields.map(f => {
        const changed = f.current !== f.proposed
        return (
          <div key={f.label} className="grid grid-cols-[90px_1fr_1fr] gap-2 text-xs">
            <span className="text-gray-400 font-medium pt-0.5">{f.label}</span>
            <span className={`px-2 py-1 rounded-lg ${changed ? 'bg-red-50 text-red-700 line-through' : 'bg-gray-50 text-gray-500'}`}>
              {f.current ?? '—'}
            </span>
            <span className={`px-2 py-1 rounded-lg ${changed ? 'bg-green-50 text-green-700 font-semibold' : 'bg-gray-50 text-gray-500'}`}>
              {f.proposed ?? '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default async function AddressChangesPage() {
  const admin = supabaseAdmin()

  // Fetch all pending requests, joined with the store's current address and name.
  const { data: requests, error } = await admin
    .from('store_address_changes')
    .select(`
      id,
      store_id,
      proposed,
      status,
      requested_at,
      stores!store_id (
        id,
        store_name,
        store_slug,
        address,
        area,
        city,
        state,
        pincode,
        logo_url,
        users:seller_id ( name, phone )
      )
    `)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-black text-gray-900 mb-4">Address Change Requests</h1>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Failed to load requests: {error.message}
        </div>
      </div>
    )
  }

  const safeRequests = (requests ?? []) as any[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Address Change Requests</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Approve to apply the new address to the live store and re-register the courier pickup.
            Reject to leave the store on its current address.
          </p>
        </div>
        {safeRequests.length > 0 && (
          <span className="px-3 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
            {safeRequests.length} pending
          </span>
        )}
      </div>

      {safeRequests.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          No pending address change requests
        </div>
      )}

      <div className="space-y-4">
        {safeRequests.map((req: any) => {
          const store = req.stores
          const proposed = req.proposed as {
            address: string
            area: string
            city: string
            state: string
            pincode: string
          }
          const seller = store?.users

          const diffFields: AddressField[] = [
            { label: 'Address', current: store?.address ?? null, proposed: proposed.address },
            { label: 'Area', current: store?.area ?? null, proposed: proposed.area },
            { label: 'City', current: store?.city ?? null, proposed: proposed.city },
            { label: 'State', current: store?.state ?? null, proposed: proposed.state },
            { label: 'Pincode', current: store?.pincode ?? null, proposed: proposed.pincode },
          ]

          return (
            <div key={req.id} className="bg-white rounded-2xl border border-gray-200 p-6">
              {/* Store header */}
              <div className="flex items-start gap-4">
                {store?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={store.logo_url}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover border border-gray-100 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-400 font-bold text-lg shrink-0">
                    {store?.store_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-gray-900 truncate">
                    {store?.store_name ?? 'Unknown store'}
                  </div>
                  <div className="text-xs text-gray-400">/{store?.store_slug}</div>
                  {seller && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {seller.name} · {seller.phone}
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400 shrink-0">
                  Requested {new Date(req.requested_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>

              {/* Address diff */}
              <div className="mt-4">
                <div className="grid grid-cols-[90px_1fr_1fr] gap-2 text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">
                  <span />
                  <span>Current (live)</span>
                  <span>Proposed</span>
                </div>
                <AddressDiff fields={diffFields} />
              </div>

              <AddressChangeActions storeId={store?.id ?? req.store_id} requestId={req.id} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
