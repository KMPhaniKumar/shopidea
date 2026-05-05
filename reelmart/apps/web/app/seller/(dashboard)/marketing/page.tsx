'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { format } from 'date-fns'

const couponSchema = z.object({
  code: z.string().min(3).max(20),
  discount_type: z.enum(['percentage', 'fixed']),
  discount_value: z.coerce.number().positive(),
  min_order_amount: z.coerce.number().min(0).default(0),
  max_uses: z.coerce.number().int().positive().optional(),
  expires_at: z.string().optional(),
})
type CouponForm = z.infer<typeof couponSchema>

export default function MarketingPage() {
  const supabase = createClient()
  const [storeId, setStoreId] = useState('')
  const [coupons, setCoupons] = useState<any[]>([])
  const [broadcasts, setBroadcasts] = useState<any[]>([])
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [recipientCount, setRecipientCount] = useState(0)
  const [sending, setSending] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CouponForm>({
    resolver: zodResolver(couponSchema),
    defaultValues: { discount_type: 'percentage', min_order_amount: 0 },
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return
    setStoreId(store.id)

    const [coupRes, bcastRes, countRes] = await Promise.all([
      supabase.from('coupons').select('*').eq('store_id', store.id).order('created_at', { ascending: false }),
      supabase.from('broadcasts').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('orders').select('buyer_id', { count: 'exact', head: true }).eq('store_id', store.id).eq('payment_status', 'paid'),
    ])
    setCoupons(coupRes.data ?? [])
    setBroadcasts(bcastRes.data ?? [])
    setRecipientCount(countRes.count ?? 0)
  }

  async function createCoupon(data: CouponForm) {
    const { error } = await supabase.from('coupons').insert({
      store_id: storeId,
      code: data.code.toUpperCase(),
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      min_order_amount: data.min_order_amount,
      max_uses: data.max_uses,
      expires_at: data.expires_at,
      is_active: true,
      uses: 0,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Coupon created')
    reset()
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
    if (!broadcastMsg.trim()) return
    setSending(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/whatsapp/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ storeId, message: broadcastMsg }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(`Sent to ${data.data.sent} customers`)
      setBroadcastMsg('')
      load()
    } else {
      toast.error(data.error)
    }
    setSending(false)
  }

  return (
    <div className="space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Marketing</h1>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">Coupons</h2>
        <form onSubmit={handleSubmit(createCoupon)} className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <input {...register('code')} placeholder="CODE (e.g. SAVE50)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase" />
            {errors.code && <p className="text-xs text-[#E23744]">{errors.code.message}</p>}
          </div>
          <select {...register('discount_type')} className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]">
            <option value="percentage">Percentage %</option>
            <option value="fixed">Fixed ₹</option>
          </select>
          <div>
            <input {...register('discount_value')} type="number" placeholder="Value (10 or 50)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            {errors.discount_value && <p className="text-xs text-[#E23744]">{errors.discount_value.message}</p>}
          </div>
          <input {...register('min_order_amount')} type="number" placeholder="Min order ₹ (0 = any)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <input {...register('max_uses')} type="number" placeholder="Max uses (optional)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <input {...register('expires_at')} type="date" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
          <button type="submit" className="lg:col-span-3 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold">Create Coupon</button>
        </form>

        {coupons.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EEEEEE]">
                  {['Code', 'Discount', 'Min Order', 'Uses', 'Expires', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[#666666] py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id} className="border-b border-[#EEEEEE]">
                    <td className="py-2 text-sm font-mono font-bold text-[#FF6B2B]">{c.code}</td>
                    <td className="py-2 text-sm">{c.discount_type === 'percentage' ? `${c.discount_value}%` : `₹${c.discount_value}`}</td>
                    <td className="py-2 text-sm">{c.min_order_amount > 0 ? `₹${c.min_order_amount}` : '—'}</td>
                    <td className="py-2 text-sm">{c.uses}/{c.max_uses ?? '∞'}</td>
                    <td className="py-2 text-sm text-[#666666]">{c.expires_at ? format(new Date(c.expires_at), 'dd/MM/yy') : '—'}</td>
                    <td className="py-2">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.is_active ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-[#EEEEEE] text-[#AAAAAA]'}`}>
                        {c.is_active ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td className="py-2 flex gap-2">
                      <button onClick={() => toggleCoupon(c.id, c.is_active)} className="text-xs text-[#666666] hover:text-[#1A1A1A]">
                        {c.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => deleteCoupon(c.id)} className="text-xs text-[#E23744]">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-[#1A1A1A]">WhatsApp Broadcast</h2>
        <p className="text-sm text-[#666666]">Send a message to all {recipientCount} past customers</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={5}
              placeholder="Type your message here..."
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none"
            />
            <button onClick={sendBroadcast} disabled={!broadcastMsg.trim() || sending} className="w-full bg-[#25D366] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
              {sending ? 'Sending...' : `Send to ${recipientCount} customers`}
            </button>
          </div>
          <div className="bg-[#E5DDD5] rounded-xl p-4">
            <p className="text-xs text-[#666666] mb-2 text-center">Preview</p>
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-xs ml-auto">
              <p className="text-xs font-bold text-[#FF6B2B] mb-1">Your Store 🛍️</p>
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
