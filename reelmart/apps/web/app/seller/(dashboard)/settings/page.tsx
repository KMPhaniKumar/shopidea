'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink, Upload } from 'lucide-react'
import debounce from 'lodash/debounce'

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

export default function SettingsPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const { register, handleSubmit, watch, reset } = useForm()
  const slugValue = watch('store_slug')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const storeQuery = user
      ? supabase.from('stores').select('*').eq('seller_id', user.id).single()
      : supabase.from('stores').select('*').limit(1).single()
    const { data } = await storeQuery
    if (!data) return
    setStore(data)
    reset(data)
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

  async function onSubmit(data: any) {
    setSaving(true)
    const { error } = await supabase.from('stores').update({
      store_name: data.store_name,
      store_slug: data.store_slug,
      description: data.description,
      category: data.category,
      whatsapp_number: data.whatsapp_number,
      instagram_handle: data.instagram_handle,
      city: data.city,
      address: data.address,
      area: data.area,
      pincode: data.pincode,
      state: data.state,
    }).eq('id', store.id)
    if (error) toast.error(error.message)
    else { toast.success('Settings saved!'); load() }
    setSaving(false)
  }

  function copyLink() {
    const url = `https://reelmart.in/s/${store?.store_slug}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
  }

  async function downloadQR() {
    const url = `https://reelmart.in/s/${store?.store_slug}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const a = document.createElement('a')
    a.download = `reelmart-${store?.store_slug}-qr.png`
    a.href = dataUrl
    a.click()
  }

  return (
    <div className="max-w-2xl space-y-6 pb-10">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Settings</h1>

      {/* Store Link */}
      {store && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Your Store Link</h2>
          <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-lg p-3">
            <code className="text-sm text-[#FF6B2B] flex-1">reelmart.in/s/{store.store_slug}</code>
            <button onClick={copyLink} className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Copy link">
              <Copy size={14} className="text-[#666666]" />
            </button>
            <a href={`https://reelmart.in/s/${store.store_slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[#EEEEEE] rounded" title="Open store">
              <ExternalLink size={14} className="text-[#666666]" />
            </a>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadQR} className="flex items-center gap-2 px-3 py-2 border border-[#EEEEEE] rounded-lg text-sm hover:bg-[#F9F9F9]">
              <Download size={14} /> Download QR Code
            </button>
            <a
              href={`https://api.whatsapp.com/send?text=Shop%20at%20my%20store%20on%20ReelMart%20%F0%9F%9B%8D%EF%B8%8F%0Ahttps%3A%2F%2Freelmart.in%2Fs%2F${store.store_slug}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#25D366] text-[#25D366] rounded-lg text-sm hover:bg-[#25D366]/5"
            >
              💬 Share on WhatsApp
            </a>
          </div>
        </div>
      )}

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
              <span className="px-3 text-sm text-[#AAAAAA] bg-[#F9F9F9] border-r border-[#EEEEEE] py-2">reelmart.in/s/</span>
              <input {...register('store_slug')} className="flex-1 px-3 py-2 text-sm outline-none" />
            </div>
            {slugAvailable === true && <p className="text-xs text-[#25D366] mt-1">✓ Available</p>}
            {slugAvailable === false && <p className="text-xs text-[#E23744] mt-1">✗ Already taken</p>}
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

        {/* Address & Location */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-[#1A1A1A]">Store Address</h2>
            <p className="text-xs text-[#AAAAAA] mt-0.5">Used to calculate delivery time and distance for buyers</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Full Address</label>
            <textarea {...register('address')} rows={2} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" placeholder="Shop #12, Main Market, Near..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Area / Locality</label>
              <input {...register('area')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Koramangala" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">City</label>
              <input {...register('city')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Bengaluru" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <input {...register('state')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="Karnataka" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pincode</label>
              <input {...register('pincode')} maxLength={6} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="560034" />
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving || slugAvailable === false} className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
