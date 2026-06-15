'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink, Upload, Clock, XCircle, Pencil } from 'lucide-react'
import debounce from 'lodash/debounce'
import { SITE_URL, SITE_HOST } from '@/lib/site-url'
import { isValidPan, isValidGst } from '@/lib/kyc'
import { BUSINESS_TYPES } from '@/lib/businessCategories'

// Safe (non-KYC) columns accessible to the authenticated role after migration
// 024. KYC columns (pan_number, gst_number, kyc_submitted_at, aadhaar_url) are
// REVOKED from the authenticated role and must be fetched via
// GET /api/seller/my-store (service_role, server-side).
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
  kyc_submitted_at: string | null
}

export default function SettingsPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [kycData, setKycData] = useState<KycData | null>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [addressRequest, setAddressRequest] = useState<AddressChangeRequest | null>(null)
  // Address card view state: when a pickup address already exists we show it
  // read-only with an "Edit address" button; editing an approved store's
  // address requires admin approval, so we confirm via a modal first.
  const [addressEditing, setAddressEditing] = useState(false)
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const { register, handleSubmit, watch, reset } = useForm()
  const { register: registerAddr, handleSubmit: handleSubmitAddr, reset: resetAddr, setValue: setAddrValue, formState: { errors: errorsAddr } } = useForm()
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
    // line1 (Flat / House / Building) is the primary address line; line2
    // (Landmark) is optional. They are composed into the backend `address`
    // field on submit. On edit we put the saved address into line1 so the
    // seller can see and edit it.
    resetAddr({
      line1: data.address ?? '',
      line2: '',
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
        // Pickup-contact fields live on the address form and also come from the
        // service-role route (locked from the authenticated role by migration 024).
        setAddrValue('contact_name', kycJson.data.pickup_contact_name ?? '')
        setAddrValue('phone', kycJson.data.pickup_phone ?? '')
        setAddrValue('email', kycJson.data.pickup_email ?? '')
        setAddrValue('gst_number', kycJson.data.gst_number ?? '')
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
    }).eq('id', store.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Settings saved!')
    load()
    setSaving(false)
  }

  // Submits an address-change request for approved stores. For stores that
  // are not yet approved, address edits happen as part of normal onboarding.
  async function onSubmitAddress(data: any) {
    if (!store) return

    // Compose line1 (flat / house / building — the primary address line) and
    // line2 (landmark, optional) into the backend `address` field.
    const line1 = (data.line1 ?? '').trim()
    const line2 = (data.line2 ?? '').trim()
    const composedAddress = [line1, line2].filter(Boolean).join(', ')

    setSavingAddress(true)
    const res = await fetch('/api/seller/address-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: store.id,
        proposed: {
          address: composedAddress,
          area: data.area ?? '',
          city: data.city ?? '',
          state: data.state ?? '',
          pincode: data.pincode ?? '',
          contact_name: (data.contact_name ?? '').trim(),
          phone: (data.phone ?? '').trim(),
          email: (data.email ?? '').trim(),
          gst_number: (data.gst_number ?? '').trim().toUpperCase(),
        },
      }),
    })
    const json = await res.json()
    setSavingAddress(false)
    if (!json.success) {
      toast.error(json.error ?? 'Failed to submit address change')
      return
    }
    toast.success(
      store.approval_status === 'approved'
        ? 'Address change submitted — pending admin approval'
        : 'Pickup address saved'
    )
    setAddressEditing(false)
    load()
  }

  // "Edit address" on an existing address. For an approved store the change
  // must go through admin approval, so confirm via the modal first; otherwise
  // (onboarding store, no approval needed yet) open the form directly.
  function handleEditAddress() {
    if (isApproved) {
      setShowApprovalModal(true)
    } else {
      setAddressEditing(true)
    }
  }

  // Cancel an in-progress edit: hide the form and restore its fields to the
  // currently-saved values.
  function cancelEditAddress() {
    setAddressEditing(false)
    resetAddr({
      line1: store?.address ?? '',
      line2: '',
      area: store?.area ?? '',
      city: store?.city ?? '',
      state: store?.state ?? '',
      pincode: store?.pincode ?? '',
      contact_name: (kycData as any)?.pickup_contact_name ?? '',
      phone: (kycData as any)?.pickup_phone ?? '',
      email: (kycData as any)?.pickup_email ?? '',
      gst_number: kycData?.gst_number ?? '',
    })
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
  // A pickup address is already on record once the store has a non-empty
  // address. When true we show it read-only (with Edit) instead of the form.
  const hasAddress = Boolean(store?.address && String(store.address).trim())
  const showAddressForm = !hasAddress || addressEditing

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

        {/* Saved address — shown read-only once a pickup address exists. */}
        {hasAddress && !addressEditing && (
          <div className="rounded-lg border border-[#EEEEEE] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm">
                {(kycData as any)?.pickup_contact_name && (
                  <p className="font-semibold text-[#1A1A1A]">
                    {(kycData as any).pickup_contact_name}
                    {(kycData as any)?.pickup_phone && (
                      <span className="font-normal text-[#666666]"> · {(kycData as any).pickup_phone}</span>
                    )}
                  </p>
                )}
                <p className="text-[#1A1A1A] mt-1">{store.address}</p>
                <p className="text-[#666666]">
                  {[store.area, store.city, store.state].filter(Boolean).join(', ')}
                  {store.pincode ? ` — ${store.pincode}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={handleEditAddress}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 border border-[#EEEEEE] rounded-lg text-sm font-semibold text-[#666666] hover:bg-[#F9F9F9]"
              >
                <Pencil size={13} /> Edit address
              </button>
            </div>
          </div>
        )}

        {showAddressForm && (
        <form onSubmit={handleSubmitAddr(onSubmitAddress)} className="space-y-4">
          {/* Contact info — required by the courier (NimbusPost) for pickup.
              The pickup address is sent to the courier with each order. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Contact name <span className="text-[#E23744]">*</span></label>
              <input {...registerAddr('contact_name')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Person courier asks for at pickup" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact number <span className="text-[#E23744]">*</span></label>
              <input {...registerAddr('phone')} maxLength={10} inputMode="numeric" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="10-digit mobile" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email <span className="text-[#AAAAAA] font-normal">(optional)</span></label>
              <input {...registerAddr('email')} type="email" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="pickup@store.com" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GST <span className="text-[#AAAAAA] font-normal">(optional)</span></label>
              <input {...registerAddr('gst_number')} maxLength={15} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase" placeholder="15-digit GSTIN" />
            </div>
          </div>

          <div className="border-t border-[#F0F0F0] pt-3" />

          {/* Manual address entry. (Map search is added back once the Google
              Maps key is configured.) */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Flat / House / Building &amp; Street <span className="text-[#E23744]">*</span>
            </label>
            <input
              {...registerAddr('line1', { required: 'Address is required' })}
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]"
              placeholder="B-403, Aparna Cyber Commune, Main Road"
            />
            {errorsAddr.line1 && <p className="text-xs text-[#E23744] mt-0.5">{String(errorsAddr.line1.message)}</p>}
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

          <div className="flex gap-2">
            {hasAddress && addressEditing && (
              <button
                type="button"
                onClick={cancelEditAddress}
                disabled={savingAddress}
                className="px-4 py-2.5 border border-[#EEEEEE] rounded-lg text-sm font-semibold text-[#666666] hover:bg-[#F9F9F9] disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={savingAddress}
              className="flex-1 border border-[#FF6B2B] text-[#FF6B2B] py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-[#FF6B2B]/5 transition-colors"
            >
              {savingAddress
                ? 'Saving...'
                : !hasAddress
                ? 'Add address'
                : isApproved
                ? (addressRequest?.status === 'pending' ? 'Update pending request' : 'Submit address change for approval')
                : 'Save pickup address'}
            </button>
          </div>
        </form>
        )}
      </div>

      {/* Edit-requires-approval confirmation (approved stores). */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl p-5 max-w-sm w-full space-y-4 shadow-lg">
            <div className="flex items-start gap-3">
              <Clock size={20} className="text-orange-500 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-[#1A1A1A]">Address change needs admin approval</h3>
                <p className="text-sm text-[#666666] mt-1">
                  Updating your store pickup address requires admin approval before it takes effect.
                  Your store keeps shipping from the current address until the new one is approved.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 text-sm font-semibold text-[#666666] rounded-lg hover:bg-[#F9F9F9]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setShowApprovalModal(false); setAddressEditing(true) }}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6B2B] rounded-lg hover:bg-[#FF6B2B]/90"
              >
                Continue to edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
