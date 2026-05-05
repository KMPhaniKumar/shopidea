'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink } from 'lucide-react'
import debounce from 'lodash/debounce'

export default function SettingsPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const { register, handleSubmit, watch, setValue, reset } = useForm()
  const slugValue = watch('store_slug')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('stores').select('*').eq('seller_id', user.id).single()
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
    }).eq('id', store.id)
    if (error) toast.error(error.message)
    else { toast.success('Settings saved'); load() }
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
    <div className="max-w-2xl space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Settings</h1>

      {store && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Your Store Link</h2>
          <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-lg p-3">
            <code className="text-sm text-[#FF6B2B] flex-1">reelmart.in/s/{store.store_slug}</code>
            <button onClick={copyLink} className="p-1.5 hover:bg-[#EEEEEE] rounded">
              <Copy size={14} className="text-[#666666]" />
            </button>
            <a href={`https://reelmart.in/s/${store.store_slug}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[#EEEEEE] rounded">
              <ExternalLink size={14} className="text-[#666666]" />
            </a>
          </div>
          <button onClick={downloadQR} className="flex items-center gap-2 px-3 py-2 border border-[#EEEEEE] rounded-lg text-sm hover:bg-[#F9F9F9]">
            <Download size={14} /> Download QR Code
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">Store Settings</h2>
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">City</label>
            <input {...register('city')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">WhatsApp Number</label>
            <input {...register('whatsapp_number')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="+91XXXXXXXXXX" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Instagram Handle</label>
            <input {...register('instagram_handle')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="@yourhandle" />
          </div>
        </div>
        <button type="submit" disabled={saving || slugAvailable === false} className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
