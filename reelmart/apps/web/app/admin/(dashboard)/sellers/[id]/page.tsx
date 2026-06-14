import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import SellerActions from '../SellerActions'
import GstVerifyButton from './GstVerifyButton'
import SuspendButton from './SuspendButton'

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

function VerifiedBadge({ verified, label }: { verified: boolean; label: string }) {
  if (verified) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        {label} Verified
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-700 bg-yellow-50 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
      {label} Pending
    </span>
  )
}

export default async function SellerDetailPage({ params }: { params: { id: string } }) {
  const { data: store } = await supabaseAdmin()
    .from('stores')
    .select('*, users:seller_id(name, full_name, phone)')
    .eq('id', params.id)
    .single()

  if (!store) notFound()

  const owner = (store as any).users as { name?: string; full_name?: string; phone?: string } | null
  const ownerName = owner?.full_name || owner?.name

  // Signature signed URL (from private bucket)
  const signatureUrl = await signed((store as any).signature_path ?? null)

  const panNumber: string | null = (store as any).pan_number ?? null
  const panProvided: boolean = !!panNumber
  const gstVerified: boolean = (store as any).gst_verified ?? false
  const gstNumber: string | null = (store as any).gst_number ?? null
  const pickupVerified: boolean = (store as any).pickup_verified ?? false
  const suspended: boolean = (store as any).suspended ?? false
  const suspendedReason: string | null = (store as any).suspended_reason ?? null
  const suspendedAt: string | null = (store as any).suspended_at ?? null

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
        <div className="flex items-center gap-2">
          {suspended && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
              Suspended
            </span>
          )}
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold capitalize ${APPROVAL_BADGE[store.approval_status] ?? 'bg-gray-100 text-gray-600'}`}>
            {store.approval_status}
          </span>
        </div>
      </div>

      {/* Suspension banner — shown when store is currently suspended */}
      {suspended && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-red-700 text-sm mb-1">Store is suspended</div>
              {suspendedReason && (
                <div className="text-sm text-red-600 mb-1">
                  <span className="font-medium">Reason:</span> {suspendedReason}
                </div>
              )}
              {suspendedAt && (
                <div className="text-xs text-red-400">
                  Suspended at: {new Date(suspendedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <h2 className="font-bold text-gray-900 mb-4">Business details</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Owner (full name)" value={ownerName} />
          <Field label="Phone" value={owner?.phone} />
          <Field label="Category" value={store.category} />
          <Field label="WhatsApp" value={store.whatsapp_number} />
          <Field label="Pickup address" value={[store.address, store.area].filter(Boolean).join(', ')} />
          <Field label="City / State / Pincode" value={[store.city, store.state, store.pincode].filter(Boolean).join(', ')} />
        </div>
      </div>

      {/* KYC documents */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900">KYC documents</h2>
          {/* PAN is self-certified — no admin verification button */}
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${panProvided ? 'text-green-700 bg-green-50' : 'text-yellow-700 bg-yellow-50'}`}>
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${panProvided ? 'bg-green-500' : 'bg-yellow-500'}`} />
            PAN {panProvided ? 'Provided' : 'Not provided'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <Field label="PAN number" value={panNumber} />
          <Field label="GST number" value={gstNumber} />
        </div>

        {/* Digital signature */}
        {signatureUrl && (
          <div className="mt-4">
            <div className="text-xs text-gray-400 uppercase font-semibold mb-1.5">Digital signature</div>
            <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50 p-4 flex items-center justify-center">
              <img src={signatureUrl} alt="Signature" className="max-h-24 object-contain" />
            </div>
          </div>
        )}
      </div>

      {/* GST verification */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900">GST verification</h2>
          <div className="flex items-center gap-3">
            {gstNumber ? (
              <VerifiedBadge verified={gstVerified} label="GST" />
            ) : (
              <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                Not provided
              </span>
            )}
            {gstNumber && !gstVerified && (
              <GstVerifyButton storeId={params.id} />
            )}
          </div>
        </div>
        {gstNumber ? (
          <div className="text-sm text-gray-900 font-mono">{gstNumber}</div>
        ) : (
          <div className="text-sm text-gray-400">No GST number provided by seller.</div>
        )}
      </div>

      {/* Pickup address — verified automatically via NimbusPost (read-only) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-bold text-gray-900">Pickup address</h2>
            <p className="text-xs text-gray-400 mt-0.5">Verified automatically by the courier partner (NimbusPost).</p>
          </div>
          <VerifiedBadge verified={pickupVerified} label="Pickup" />
        </div>
        <Field
          label="Address"
          value={[store.address, store.area, store.city, store.state, store.pincode].filter(Boolean).join(', ')}
        />
      </div>

      {/* Suspension controls */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900 mb-0.5">Store suspension</h2>
            <p className="text-xs text-gray-400">
              {suspended
                ? 'This store is currently suspended. Enabling it will restore seller access and make the storefront live.'
                : 'Suspending a store immediately deactivates the storefront and blocks seller dashboard access.'}
            </p>
          </div>
          <SuspendButton
            storeId={store.id}
            suspended={suspended}
            suspendedReason={suspendedReason}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between">
        <div className="text-sm text-gray-500">Review the documents above, then decide:</div>
        <SellerActions storeId={store.id} isActive={store.is_active} approvalStatus={store.approval_status} />
      </div>
    </div>
  )
}
