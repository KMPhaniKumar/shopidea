import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import SellerActions from '../SellerActions'

const supabaseAdmin = () => createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KYC_BUCKET = 'seller-documents'

const APPROVAL_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

// Service role bypasses storage RLS, so admins can preview private KYC docs.
async function signed(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabaseAdmin().storage.from(KYC_BUCKET).createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-gray-400 uppercase font-semibold mb-0.5">{label}</div>
      <div className="text-sm text-gray-900">{value || <span className="text-gray-300">—</span>}</div>
    </div>
  )
}

export default async function SellerDetailPage({ params }: { params: { id: string } }) {
  const { data: store } = await supabaseAdmin()
    .from('stores')
    .select('*, users:seller_id(name, phone)')
    .eq('id', params.id)
    .single()

  if (!store) notFound()

  const owner = (store as any).users as { name?: string; phone?: string } | null
  const [panUrl, selfieUrl] = await Promise.all([
    signed(store.pan_doc_path),
    signed(store.selfie_path),
  ])

  return (
    <div className="max-w-3xl">
      <Link href="/admin/sellers" className="text-sm text-gray-500 hover:text-gray-800">← Back to sellers</Link>

      <div className="flex items-center justify-between mt-3 mb-6">
        <div className="flex items-center gap-4">
          {store.logo_url ? (
            <img src={store.logo_url} alt="" className="w-14 h-14 rounded-xl object-cover border border-gray-100" />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center text-orange-400 font-bold text-xl">
              {store.store_name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black text-gray-900">{store.store_name}</h1>
            <div className="text-gray-400 text-sm">/{store.store_slug}</div>
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize ${APPROVAL_BADGE[store.approval_status] ?? 'bg-gray-100 text-gray-600'}`}>
          {store.approval_status}
        </span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-4">Business details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner" value={owner?.name} />
          <Field label="Phone" value={owner?.phone} />
          <Field label="Category" value={store.category} />
          <Field label="WhatsApp" value={store.whatsapp_number} />
          <Field label="Pickup address" value={[store.address, store.area].filter(Boolean).join(', ')} />
          <Field label="City / State / Pincode" value={[store.city, store.state, store.pincode].filter(Boolean).join(', ')} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-4">KYC documents</h2>
        <div className="grid grid-cols-2 gap-4 mb-5">
          <Field label="PAN number" value={store.pan_number} />
          <Field label="GST number" value={store.gst_number} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-400 uppercase font-semibold mb-1.5">PAN card</div>
            {panUrl ? (
              <a href={panUrl} target="_blank" rel="noreferrer" className="block border border-gray-100 rounded-xl overflow-hidden hover:border-orange-300">
                <img src={panUrl} alt="PAN card" className="w-full h-44 object-contain bg-gray-50" />
                <span className="block text-center text-xs text-orange-500 py-1.5">Open full size ↗</span>
              </a>
            ) : (
              <div className="h-44 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">Not uploaded</div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase font-semibold mb-1.5">Shop selfie</div>
            {selfieUrl ? (
              <a href={selfieUrl} target="_blank" rel="noreferrer" className="block border border-gray-100 rounded-xl overflow-hidden hover:border-orange-300">
                <img src={selfieUrl} alt="Shop selfie" className="w-full h-44 object-cover bg-gray-50" />
                <span className="block text-center text-xs text-orange-500 py-1.5">Open full size ↗</span>
              </a>
            ) : (
              <div className="h-44 rounded-xl bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-sm">Not uploaded</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">Review the documents above, then decide:</div>
        <SellerActions storeId={store.id} isActive={store.is_active} approvalStatus={store.approval_status} />
      </div>
    </div>
  )
}
