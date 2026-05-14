'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { format } from 'date-fns'
import { Copy, ExternalLink, Share2 } from 'lucide-react'
import QRCode from 'qrcode'
import { SITE_URL, SITE_HOST } from '@/lib/site-url'

const couponSchema = z.object({
  code: z.string().min(3, 'Min 3 chars').max(20, 'Max 20 chars'),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.coerce.number().positive('Must be > 0'),
  min_order_amount: z.coerce.number().min(0).default(0),
  max_uses: z.coerce.number().int().positive().optional().or(z.literal('')),
  expires_at: z.string().optional(),
})
type CouponForm = z.infer<typeof couponSchema>

export default function MarketingPage() {
  const supabase = createClient()
  const [store, setStore] = useState<any>(null)
  const [coupons, setCoupons] = useState<any[]>([])
  const [broadcasts, setBroadcasts] = useState<any[]>([])
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [recipientCount, setRecipientCount] = useState(0)
  const [sending, setSending] = useState(false)
  const [creatingCoupon, setCreatingCoupon] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: { discount_type: 'percentage', min_order_amount: 0 },
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const storeQuery = user
      ? supabase.from('stores').select('*').eq('seller_id', user.id).single()
      : supabase.from('stores').select('*').limit(1).single()
    const { data: storeData } = await storeQuery
    if (!storeData) return
    setStore(storeData)

    const [coupRes, countRes] = await Promise.all([
      supabase.from('coupons').select('*').eq('store_id', storeData.id).order('created_at', { ascending: false }),
      supabase.from('orders').select('buyer_id', { count: 'exact', head: true }).eq('store_id', storeData.id).eq('payment_status', 'paid'),
    ])

    setCoupons(coupRes.data ?? [])
    setRecipientCount(countRes.count ?? 0)

    const bcastRes = await supabase.from('broadcasts').select('*').eq('store_id', storeData.id).order('created_at', { ascending: false }).limit(10)
    setBroadcasts(bcastRes.data ?? [])
  }

  async function createCoupon(data: CouponForm) {
    if (!store) return
    setCreatingCoupon(true)
    const { error } = await supabase.from('coupons').insert({
      store_id: store.id,
      code: data.code.toUpperCase().trim(),
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount ?? 0,
      max_uses: data.max_uses || null,
      expires_at: data.expires_at || null,
      is_active: true,
      uses: 0,
    })
    if (error) { toast.error(`Failed: ${error.message}`); setCreatingCoupon(false); return }
    toast.success('Coupon created!')
    reset()
    setCreatingCoupon(false)
    load()
  }

  async function toggleCoupon(id: string, current: boolean) {
    await supabase.from('coupons').update({ is_active: !current }).eq('id', id)
    load()
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Delete this coupon?')) return
    await supabase.from('coupons').delete().eq('id', id)
    toast.success('Coupon deleted')
    load()
  }

  async function sendBroadcast() {
    if (!broadcastMsg.trim() || !store) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/whatsapp/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ storeId: store.id, message: broadcastMsg }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Sent to ${data.data?.sent ?? 0} customers`)
        setBroadcastMsg('')
        load()
      } else {
        toast.error(data.error ?? 'Broadcast failed')
      }
    } catch {
      toast.error('Backend not reachable. Make sure backend is running.')
    }
    setSending(false)
  }

  function copyLink() {
    if (!store) return
    navigator.clipboard.writeText(`${SITE_URL}/store/${store.store_slug}`)
    toast.success('Link copied!')
  }

  async function downloadQR() {
    if (!store) return
    const url = `${SITE_URL}/store/${store.store_slug}`
    const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2 })
    const a = document.createElement('a')
    a.download = `reelmart-${store.store_slug}-qr.png`
    a.href = dataUrl
    a.click()
  }

  return (
    <div className="space-y-6 pb-10">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Marketing</h1>

      {/* Share Store URL */}
      {store && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Share2 size={18} className="text-[#FF6B2B]" />
            <h2 className="font-semibold text-[#1A1A1A]">Share Your Store</h2>
          </div>
          <div className="flex items-center gap-2 bg-[#F9F9F9] rounded-lg p-3">
            <code className="text-sm text-[#FF6B2B] flex-1 truncate">{SITE_HOST}/store/{store.store_slug}</code>
            <button onClick={copyLink} className="p-1.5 hover:bg-[#EEEEEE] rounded shrink-0" title="Copy link">
              <Copy size={14} className="text-[#666666]" />
            </button>
            <a href={`${SITE_URL}/store/${store.store_slug}`} target="_blank" rel="noreferrer"
              className="p-1.5 hover:bg-[#EEEEEE] rounded shrink-0" title="Open store">
              <ExternalLink size={14} className="text-[#666666]" />
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadQR} className="flex items-center gap-2 px-3 py-2 border border-[#EEEEEE] rounded-lg text-sm hover:bg-[#F9F9F9]">
              📷 Download QR Code
            </button>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Shop at my store on ReelMart 🛍️\n${SITE_URL}/store/${store.store_slug}`)}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-[#25D366] text-[#25D366] rounded-lg text-sm hover:bg-[#25D366]/5"
            >
              💬 Share on WhatsApp
            </a>
            <a
              href={`https://www.instagram.com/?url=${encodeURIComponent(`${SITE_URL}/store/${store.store_slug}`)}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 border border-purple-400 text-purple-600 rounded-lg text-sm hover:bg-purple-50"
            >
              📸 Share on Instagram
            </a>
          </div>
        </div>
      )}

      {/* Coupons */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">Discount Coupons</h2>
        <form onSubmit={handleSubmit(createCoupon)} className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <input
                {...register('code')}
                placeholder="CODE (e.g. SAVE50)"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase"
                style={{ textTransform: 'uppercase' }}
              />
              {errors.code && <p className="text-xs text-[#E23744] mt-0.5">{errors.code.message}</p>}
            </div>
            <select {...register('discount_type')} className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] bg-white">
              <option value="percentage">Percentage %</option>
              <option value="fixed">Fixed ₹ off</option>
            </select>
            <div>
              <input
                {...register('discount_value')}
                type="number"
                placeholder="Value (e.g. 10% or ₹50)"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]"
              />
              {errors.discount_value && <p className="text-xs text-[#E23744] mt-0.5">{errors.discount_value.message}</p>}
            </div>
            <input {...register('min_order_amount')} type="number" placeholder="Min order ₹ (0 = any)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <input {...register('max_uses')} type="number" placeholder="Max uses (blank = unlimited)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <input {...register('expires_at')} type="date" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          </div>
          <button type="submit" disabled={creatingCoupon || !store} className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {creatingCoupon ? 'Creating...' : '+ Create Coupon'}
          </button>
        </form>

        {coupons.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EEEEEE]">
                  {['Code', 'Discount', 'Min Order', 'Uses', 'Expires', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[#666666] py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id} className="border-b border-[#EEEEEE]">
                    <td className="py-2 pr-3 text-sm font-mono font-bold text-[#FF6B2B]">{c.code}</td>
                    <td className="py-2 pr-3 text-sm">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`} off</td>
                    <td className="py-2 pr-3 text-sm">{c.min_order_amount > 0 ? `₹${c.min_order_amount}` : '—'}</td>
                    <td className="py-2 pr-3 text-sm">{c.uses ?? 0}/{c.max_uses ?? '∞'}</td>
                    <td className="py-2 pr-3 text-sm text-[#666666]">{c.expires_at ? format(new Date(c.expires_at), 'dd/MM/yy') : '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.is_active ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-[#EEEEEE] text-[#AAAAAA]'}`}>
                        {c.is_active ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td className="py-2 flex gap-2">
                      <button onClick={() => toggleCoupon(c.id, c.is_active)} className="text-xs text-[#666666] hover:text-[#1A1A1A] whitespace-nowrap">
                        {c.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteCoupon(c.id)} className="text-xs text-[#E23744]">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#AAAAAA] text-center py-4">No coupons yet. Create your first discount!</p>
        )}
      </div>

      {/* WhatsApp Broadcast */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">WhatsApp Broadcast</h2>
        <p className="text-sm text-[#666666]">Send a message to all <strong>{recipientCount}</strong> past customers</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={5}
              placeholder="Hi! 👋 We have exciting new products for you..."
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none"
            />
            <button
              onClick={sendBroadcast}
              disabled={!broadcastMsg.trim() || sending || recipientCount === 0}
              className="w-full bg-[#25D366] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {sending ? 'Sending...' : `Send to ${recipientCount} customers`}
            </button>
            {recipientCount === 0 && (
              <p className="text-xs text-[#AAAAAA] text-center">You'll be able to broadcast once you have customers</p>
            )}
          </div>
          <div className="bg-[#E5DDD5] rounded-xl p-4">
            <p className="text-xs text-[#666666] mb-2 text-center">Preview</p>
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-xs ml-auto">
              <p className="text-xs font-bold text-[#FF6B2B] mb-1">{store?.store_name ?? 'Your Store'} 🛍️</p>
              <p className="text-sm whitespace-pre-wrap">{broadcastMsg || 'Your message will appear here...'}</p>
              <p className="text-[10px] text-[#AAAAAA] mt-1 text-right">Now</p>
            </div>
          </div>
        </div>

        {broadcasts.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-2">Broadcast History</h3>
            {broadcasts.map((b: any) => (
              <div key={b.id} className="flex justify-between py-2 border-b border-[#EEEEEE] text-sm">
                <span className="text-[#1A1A1A] truncate max-w-xs">{b.message}</span>
                <span className="text-[#666666] shrink-0 ml-4">{b.recipient_count} sent · {format(new Date(b.created_at), 'dd/MM/yy')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
