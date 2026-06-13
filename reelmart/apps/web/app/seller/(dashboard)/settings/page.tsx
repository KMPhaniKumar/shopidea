'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink, Upload, Clock, XCircle } from 'lucide-react'
import debounce from 'lodash/debounce'
import { SITE_URL, SITE_HOST } from '@/lib/site-url'
import { uploadKycFile, isValidPan, isValidGst } from '@/lib/kyc'
import { AddressSearch } from '@/components/AddressSearch'

// Safe (non-KYC) columns accessible to the authenticated role after migration
// 024. KYC columns (pan_number, gst_number, pan_doc_path, selfie_path,
// kyc_submitted_at, aadhaar_url) are REVOKED from the authenticated role and
// must be fetched via GET /api/seller/my-store (service_role, server-side).
const SAFE_STORE_COLUMNS = [
  'id',
  'seller_id',
  'store_name',
  'store_slug',
  'description',
  'category',
  'logo_url',
  'city',
  'area',
  'pincode',
  'whatsapp_number',
  'instagram_handle',
  'is_active',
  'is_open',
  'open_time',
  'close_time',
  'open_days',
  'rating_avg',
  'total_reviews',
  'total_orders',
  'is_verified',
  'referral_installs',
  'address',
  'state',
  'approval_status',
  'pickup_id',
  'pickup_warehouse_name',
  'pickup_status',
  'pickup_error',
  'pickup_registered_at',
  'created_at',
  'updated_at',
].join(',')

const BUSINESS_TYPES = [
  'Food & Beverages',
  'Fashion',
  'Jewellery',
  'Electronics',
  'Home & Kitchen',
  'Beauty & Wellness',
  'Handicrafts',
  'Books & Stationery',
  'Grocery',
  'Fitness',
  'Other',
]

// Shape returned from store_address_changes
interface AddressChangeRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  proposed: {
    address: string
    area: string
    city: string
    state: string
    pincode: string
  }
  reject_reason: string | null
  requested_at: string
}

// KYC fields fetched from /api/seller/my-store (service_role, server-side).
interface KycData {
  pan_number: string | null
  gst_number: string | null
  pan_doc_path: string | null
  selfie_path: string | null
  kyc_submitted_at: string | null
  pan_doc_url: string | null
  selfie_url: string | null
}

export default function SettingsPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [kycData, setKycData] = useState<KycData | null>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [panFile, setPanFile] = useState<File | null>(null)
  const [selfieFile, setSelfieFile] = useState<File | null>(null)
  const [addressRequest, setAddressRequest] = useState<AddressChangeRequest | null>(null)
  const { register, handleSubmit, watch, reset } = useForm()
  const { register: registerAddr, handleSubmit: handleSubmitAddr, reset: resetAddr, setValue: setAddrValue } = useForm()
  const slugValue = watch('store_slug')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch the safe (non-KYC) store columns via the authenticated Supabase
    // client.  select('*') would error after migration 024 because the
    // authenticated role's table-level SELECT is revoked — only the explicit
    // column list below remains accessible.
    const { data } = await supabase
      .from('stores')
      .select(SAFE_STORE_COLUMNS)
      .eq('seller_id', user.id)
      .single()

    if (!data) return
    setStore(data)
    reset(data)

    // Load any open / recently-rejected address-change request for this store.
    const { data: addrReq } = await supabase
      .from('store_address_changes')
      .select('id, status, proposed, reject_reason, requested_at')
      .eq('store_id', data.id)
      .in('status', ['pending', 'rejected'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setAddressRequest(addrReq ?? null)

    // Pre-fill the address form with the current live store address.
    // line1 / line2 are local-only fields that get composed into `address`
    // before submitting (the backend schema only knows `address`).
    resetAddr({
      line1: '',
      line2: '',
      address: data.address ?? '',
      area: data.area ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      pincode: data.pincode ?? '',
    })

    // Fetch KYC fields + signed storage URLs via the server-side route, which
    // uses the service_role key and is not subject to the column-level REVOKE
    // on the authenticated role (migration 024).
    const kycRes = await fetch('/api/seller/my-store')
    if (kycRes.ok) {
      const kycJson = await kycRes.json()
      if (kycJson.success) {
        setKycData(kycJson.data)
        // Pre-fill the KYC form fields separately (they are not in `data`).
        reset((prev: any) => ({
          ...prev,
          pan_number: kycJson.data.pan_number ?? '',
          gst_number: kycJson.data.gst_number ?? '',
        }))
      }
    }
  }

  const checkSlug = debounce(async (slug: string) => {
    if (!slug || !store || slug === store.store_slug) { setSlugAvailable(null); return }
    const { data } = await supabase.from('stores').select('id').eq('store_slug', slug).neq('id', store.id).single()
    setSlugAvailable(!data)
  }, 500)

  useEffect(() => { if (slugValue) checkSlug(slugValue) }, [slugValue])

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !store) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return }
    setLogoUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${store.id}/logo.${ext}`
    const { error } = await supabase.storage.from('store-logos').upload(path, file, {
      upsert: true,
      contentType: file.type,
    })
    if (error) { toast.error(`Upload failed: ${error.message}`); setLogoUploading(false); return }
    const { data: urlData } = supabase.storage.from('store-logos').getPublicUrl(path)
    await supabase.from('stores').update({ logo_url: urlData.publicUrl }).eq('id', store.id)
    toast.success('Logo updated!')
    load()
    setLogoUploading(false)
  }

  // Saves non-address fields only (store_name, slug, description, category,
  // whatsapp_number, instagram_handle, KYC). Address fields are handled
  // separately via onSubmitAddress → /api/seller/address-change because the
  // authenticated role no longer has UPDATE permission on those columns.
  async function onSubmit(data: any) {
    const pan = (data.pan_number ?? '').trim().toUpperCase()
    const gst = (data.gst_number ?? '').trim().toUpperCase()
    if (pan && !isValidPan(pan)) { toast.error('Enter a valid PAN (e.g. ABCDE1234F)'); return }
    if (gst && !isValidGst(gst)) { toast.error('Enter a valid 15-character GSTIN, or leave it blank'); return }

    setSaving(true)

    // Upload any newly-picked KYC documents to the private bucket first.
    // pan_doc_path / selfie_path are not in the client-side `store` state after
    // migration 024 — they come from the server-side kycData fetch.
    let panPath = kycData?.pan_doc_path ?? null
    let selfiePath = kycData?.selfie_path ?? null
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        if (panFile) panPath = await uploadKycFile(user.id, 'pan', panFile)
        if (selfieFile) selfiePath = await uploadKycFile(user.id, 'selfie', selfieFile)
      }
    } catch (err: any) {
      toast.error(`Document upload failed: ${err.message}`); setSaving(false); return
    }

    // NOTE: address, area, city, state, pincode are intentionally excluded here.
    // Those columns are REVOKED from the authenticated role (migration 022) and
    // must go through /api/seller/address-change instead.
    const { error } = await supabase.from('stores').update({
      store_name: data.store_name,
      store_slug: data.store_slug,
      description: data.description,
      category: data.category,
      whatsapp_number: data.whatsapp_number,
      instagram_handle: data.instagram_handle,
      pan_number: pan || null,
      gst_number: gst || null,
      pan_doc_path: panPath,
      selfie_path: selfiePath,
    }).eq('id', store.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    setPanFile(null); setSelfieFile(null)
    toast.success('Settings saved!')
    load()
    setSaving(false)
  }

  // Submits an address-change request for approved stores. For stores that
  // are not yet approved, address edits happen as part of normal onboarding.
  async function onSubmitAddress(data: any) {
    if (!store) return

    // For non-approved stores (still in onboarding), the address is part of
    // the store row and saved directly — warn the seller and skip the request flow.
    if (store.approval_status !== 'approved') {
      toast.error('Your store is not yet approved. Address changes are saved as part of onboarding.')
      return
    }

    // Compose line1 (flat/building) and line2 (landmark) into the address field.
    // The backend `proposed` schema only knows `address` — we prepend the manual
    // details so couriers get the full pickup address.
    const line1 = (data.line1 ?? '').trim()
    const line2 = (data.line2 ?? '').trim()
    const base = (data.address ?? '').trim()
    const composedAddress = [line1, line2, base].filter(Boolean).join(', ')

    setSavingAddress(true)
    const res = await fetch('/api/seller/address-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: store.id,
        proposed: {
          address: composedAddress || base,
          area: data.area ?? '',
          city: data.city ?? '',
          state: data.state ?? '',
          pincode: data.pincode ?? '',
        },
      }),
    })
    const json = await res.json()
    setSavingAddress(false)
    if (!json.success) {
      toast.error(json.error ?? 'Failed to submit address change')
      return
    }
    toast.success('Address change submitted — pending admin approval')
    load()
  }

  function copyLink() {
    const url = `${SITE_URL}/store/${store?.store_slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  async function downloadQR() {
    const url = `${SITE_URL}/store/${store?.store_slug}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const a = document.createElement('a')
    a.download = `reelmart-${store?.store_slug}-qr.png`
    a.href = dataUrl
    a.click()
  }

  // Determine the address form label based on store approval status.
  const isApproved = store?.approval_status === 'approved'

  return (
    <div className="max-w-2xl space-y-6 pb-10">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Profile</h1>

      {/* Store Link */}
      {store && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Your Store Link</h2>
          <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-lg p-3">
            <code className="text-sm text-[#FF6B2B] flex-1">{SITE_HOST}/store/{store.store_slug}</code>
            <button onClick={copyLink} className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Copy link">
              <Copy size={14} className="text-[#666666]" />
            </button>
            <a href={`${SITE_URL}/store/${store.store_slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Open store">
              <ExternalLink size={14} className="text-[#666666]" />
            </a>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadQR} className="flex items-center gap-2 px-3 py-2 border border-[#EEEEEE] rounded-lg text-sm hover:bg-[#F9F9F9]">
              <Download size={14} /> Download QR Code
            </button>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Shop at my store on ReelMart\n${SITE_URL}/store/${store.store_slug}`)}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#25D366] text-[#25D366] rounded-lg text-sm hover:bg-[#25D366]/5"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Non-address settings form (name, slug, KYC, etc.)                   */}
      {/* ------------------------------------------------------------------ */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Store Logo */}
        {store && (
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <h2 className="font-semibold text-[#1A1A1A] mb-4">Store Logo</h2>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-xl border border-[#EEEEEE] overflow-hidden bg-[#F9F9F9] flex items-center justify-center shrink-0">
                {store.logo_url ? (
                  <img src={store.logo_url} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-[#AAAAAA]">{store.store_name?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <div>
                <label className={`flex items-center gap-2 px-4 py-2 border border-[#EEEEEE] rounded-lg text-sm cursor-pointer hover:bg-[#F9F9F9] transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Upload size={14} />
                  {logoUploading ? 'Uploading...' : store.logo_url ? 'Change Logo' : 'Upload Logo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} disabled={logoUploading} />
                </label>
                <p className="text-xs text-[#AAAAAA] mt-1.5">JPG, PNG or WebP · max 2MB</p>
              </div>
            </div>
          </div>
        )}

        {/* Store Info */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Store Information</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Store Name</label>
            <input {...register('store_name')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Store URL</label>
            <div className="flex items-center border border-[#EEEEEE] rounded-lg overflow-hidden focus-within:border-[#FF6B2B]">
              <span className="px-3 text-sm text-[#AAAAAA] bg-[#F9F9F9] border-r border-[#EEEEEE] py-2">{SITE_HOST}/store/</span>
              <input {...register('store_slug')} className="flex-1 px-3 py-2 text-sm outline-none" />
            </div>
            {slugAvailable === true && <p className="text-xs text-[#25D366] mt-1">Available</p>}
            {slugAvailable === false && <p className="text-xs text-[#E23744] mt-1">Already taken</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea {...register('description')} rows={3} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Business Type *</label>
            <select {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] bg-white">
              <option value="">Select your business type</option>
              {BUSINESS_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p className="text-xs text-[#AAAAAA] mt-1">This determines which product categories appear when you add products</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">WhatsApp Number</label>
              <input {...register('whatsapp_number')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="+91XXXXXXXXXX" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Instagram Handle</label>
              <input {...register('instagram_handle')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="@yourhandle" />
            </div>
          </div>
        </div>

        {/* KYC / Verification */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">Business Verification (KYC)</h2>
            <p className="text-xs text-[#AAAAAA] mt-0.5">Stored privately — only visible to our review team</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">PAN Number</label>
              <input {...register('pan_number')} maxLength={10} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase tracking-wider" placeholder="ABCDE1234F" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GST Number <span className="text-[#AAAAAA] font-normal">(optional)</span></label>
              <input {...register('gst_number')} maxLength={15} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase tracking-wider" placeholder="22ABCDE1234F1Z5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">PAN Card Photo</label>
              {kycData?.pan_doc_url && !panFile && (
                <a href={kycData.pan_doc_url} target="_blank" rel="noreferrer" className="text-xs text-[#FF6B2B] hover:underline block mb-1.5">View current PAN document</a>
              )}
              <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#EEEEEE] rounded-lg text-sm cursor-pointer hover:bg-[#F9F9F9]">
                <Upload size={14} />
                <span className="truncate text-[#555555]">{panFile ? panFile.name : (kycData?.pan_doc_url ? 'Replace PAN card' : 'Upload PAN card')}</span>
                <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 5*1024*1024) { toast.error('Max 5MB'); return } setPanFile(f) } }} />
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Shop Selfie</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg border border-[#EEEEEE] overflow-hidden bg-[#F9F9F9] flex items-center justify-center shrink-0">
                  {selfieFile ? (
                    <img src={URL.createObjectURL(selfieFile)} alt="Selfie" className="w-full h-full object-cover" />
                  ) : kycData?.selfie_url ? (
                    <img src={kycData.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                  ) : (
                    <Upload size={16} className="text-[#AAAAAA]" />
                  )}
                </div>
                <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-[#EEEEEE] rounded-lg text-sm cursor-pointer hover:bg-[#F9F9F9]">
                  <Upload size={14} />
                  <span className="text-[#555555]">{selfieFile || kycData?.selfie_url ? 'Replace' : 'Upload'}</span>
                  <input type="file" accept="image/jpeg,image/png" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { if (f.size > 5*1024*1024) { toast.error('Max 5MB'); return } setSelfieFile(f) } }} />
                </label>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving || slugAvailable === false} className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* ------------------------------------------------------------------ */}
      {/* Address section — separate form, separate save path                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-semibold text-[#1A1A1A]">Store Address</h2>
          <p className="text-xs text-[#AAAAAA] mt-0.5">
            Used as your courier pickup location and to calculate delivery time for buyers
            {isApproved && ' — address changes require admin approval before taking effect'}
          </p>
        </div>

        {/* Pickup status badges */}
        {store?.pickup_status === 'verified' && (
          <div className="rounded-lg bg-[#25D366]/10 px-3 py-2 text-xs text-[#1A7F4B]">Pickup address verified with our courier partner</div>
        )}
        {store?.pickup_status === 'pending' && (
          <div className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-[#92400E]">Your pickup address is being verified by our courier partner. Until then, orders ship from our central warehouse.</div>
        )}
        {store?.pickup_status === 'failed' && (
          <div className="rounded-lg bg-[#E23744]/10 px-3 py-2 text-xs text-[#E23744]">We could not register your pickup address{store?.pickup_error ? `: ${store.pickup_error}` : ''}. Please check the details below and submit again.</div>
        )}

        {/* Address-change request status banners (approved stores only) */}
        {isApproved && addressRequest?.status === 'pending' && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <Clock size={16} className="text-orange-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-orange-700">Address change pending admin approval</p>
              <p className="text-orange-600 mt-0.5 text-xs">
                Proposed: {addressRequest.proposed.address}, {addressRequest.proposed.area}, {addressRequest.proposed.city} — {addressRequest.proposed.pincode}
              </p>
              <p className="text-orange-500 text-xs mt-1">
                Your store continues to ship from the current verified address until this is approved.
              </p>
            </div>
          </div>
        )}
        {isApproved && addressRequest?.status === 'rejected' && (
          <div className="flex items-start gap-3 rounded-lg border border-[#E23744]/30 bg-[#E23744]/5 px-4 py-3">
            <XCircle size={16} className="text-[#E23744] mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-[#E23744]">Address change request was declined</p>
              {addressRequest.reject_reason && (
                <p className="text-[#E23744]/80 text-xs mt-0.5">Reason: {addressRequest.reject_reason}</p>
              )}
              <p className="text-[#666666] text-xs mt-1">You can update the address below and resubmit.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmitAddr(onSubmitAddress)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Find your shop on the map</label>
            <AddressSearch onPick={d => {
              if (d.area) setAddrValue('area', d.area)
              if (d.city) setAddrValue('city', d.city)
              if (d.state) setAddrValue('state', d.state)
              if (d.pincode) setAddrValue('pincode', d.pincode)
            }} />
          </div>

          {/* Manual address details — entered alongside the map search */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Flat / House / Building No. <span className="text-[#AAAAAA] font-normal">(optional)</span>
            </label>
            <input
              {...registerAddr('line1')}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]"
              placeholder="Shop 12, Ground Floor, ABC Complex"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Landmark / Additional details <span className="text-[#AAAAAA] font-normal">(optional)</span>
            </label>
            <input
              {...registerAddr('line2')}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]"
              placeholder="Near Main Market, Opp. Bus Stand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Full Address <span className="text-[#AAAAAA] font-normal">(auto-filled or type manually)</span>
            </label>
            <textarea {...registerAddr('address')} rows={2} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" placeholder="Shop #12, Main Market, Near..." />
            <p className="text-xs text-[#AAAAAA] mt-0.5">
              Your flat/building and landmark above will be prepended to this when submitted.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Area / Locality</label>
              <input {...registerAddr('area')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Koramangala" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input {...registerAddr('city')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Bengaluru" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <input {...registerAddr('state')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Karnataka" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pincode</label>
              <input {...registerAddr('pincode')} maxLength={6} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="560034" />
            </div>
          </div>

          {isApproved ? (
            <button
              type="submit"
              disabled={savingAddress}
              className="w-full border border-[#FF6B2B] text-[#FF6B2B] py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#FF6B2B]/5 transition-colors"
            >
              {savingAddress
                ? 'Submitting...'
                : addressRequest?.status === 'pending'
                ? 'Update pending request'
                : 'Submit address change for approval'}
            </button>
          ) : (
            <p className="text-xs text-[#AAAAAA]">
              Address will be saved as part of your store registration and reviewed during onboarding.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
