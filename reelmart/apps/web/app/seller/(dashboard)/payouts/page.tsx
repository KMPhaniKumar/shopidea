'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import toast, { Toaster } from 'react-hot-toast'

export default function PayoutsPage() {
  const supabase = createClient()
  const [summary, setSummary] = useState<any>(null)
  const [payouts, setPayouts] = useState<any[]>([])
  const [bankAccount, setBankAccount] = useState<any>(null)
  const [editingBank, setEditingBank] = useState(false)
  const [bankName, setBankName] = useState('')
  const { register, handleSubmit, watch, setValue, reset } = useForm()
  const ifscValue = watch('ifsc_code')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
    if (!store) return

    const [ordersRes, payoutsRes, bankRes] = await Promise.all([
      supabase.from('orders').select('total_amount, delivery_fee, payment_status').eq('store_id', store.id).eq('payment_status', 'paid'),
      supabase.from('payouts').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('bank_accounts').select('*').eq('seller_id', user.id).maybeSingle(),
    ])

    const orders = ordersRes.data ?? []
    const totalEarned = orders.reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.95, 0)
    const totalPaid = (payoutsRes.data ?? []).filter((p: any) => p.status === 'done').reduce((s, p: any) => s + p.amount, 0)
    setSummary({ totalEarned: Math.round(totalEarned), totalPaid: Math.round(totalPaid), pending: Math.round(totalEarned - totalPaid) })
    setPayouts(payoutsRes.data ?? [])
    setBankAccount(bankRes.data)
    if (bankRes.data) reset(bankRes.data)
  }

  useEffect(() => {
    if (ifscValue?.length === 11) {
      fetch(`https://ifsc.razorpay.com/${ifscValue}`)
        .then(r => r.json())
        .then((d: any) => { if (d.BANK) { setBankName(d.BANK); setValue('bank_name', d.BANK) } })
        .catch(() => {})
    }
  }, [ifscValue])

  async function saveBankAccount(data: any) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('bank_accounts').upsert({ ...data, seller_id: user.id }, { onConflict: 'seller_id' })
    if (error) { toast.error(error.message); return }
    toast.success('Bank account saved')
    setEditingBank(false)
    load()
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A]">Payouts</h1>

      {summary && (
        <div className="bg-[#FF6B2B] rounded-xl p-5 text-white">
          <p className="text-sm opacity-80">Pending Balance</p>
          <p className="text-4xl font-bold mt-1">₹{summary.pending.toLocaleString('en-IN')}</p>
          <p className="text-sm opacity-80 mt-2">Paid out every Monday</p>
          <div className="flex gap-6 mt-4 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs opacity-70">Total Earned</p>
              <p className="font-bold">₹{summary.totalEarned.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-xs opacity-70">Total Paid Out</p>
              <p className="font-bold">₹{summary.totalPaid.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-[#1A1A1A]">Bank Account</h2>
          <button onClick={() => setEditingBank(!editingBank)} className="text-sm text-[#FF6B2B] font-medium">
            {editingBank ? 'Cancel' : bankAccount ? 'Edit' : 'Add'}
          </button>
        </div>
        {!editingBank && bankAccount && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{bankAccount.bank_name}</p>
            <p className="text-[#666666]">{bankAccount.account_holder}</p>
            <p className="font-mono text-[#666666]">XXXXXXXXXXXX{bankAccount.account_number?.slice(-4)}</p>
            <p className="text-[#AAAAAA]">IFSC: {bankAccount.ifsc_code}</p>
          </div>
        )}
        {(editingBank || !bankAccount) && (
          <form onSubmit={handleSubmit(saveBankAccount)} className="space-y-3">
            <input {...register('account_holder')} placeholder="Account Holder Name" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <input {...register('account_number')} placeholder="Account Number" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            <div className="flex gap-2">
              <input {...register('ifsc_code')} placeholder="IFSC Code" maxLength={11} className="flex-1 border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] uppercase" />
              {bankName && <span className="self-center text-sm text-[#25D366] font-medium">{bankName}</span>}
            </div>
            <input {...register('bank_name')} type="hidden" />
            <button type="submit" className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold">Save Bank Account</button>
          </form>
        )}
      </div>

      {payouts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm">
          <h2 className="font-semibold text-[#1A1A1A] p-5 border-b border-[#EEEEEE]">Payout History</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-[#EEEEEE]">
                  {['Date', 'Amount', 'Orders', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[#666666] px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payouts.map((p: any) => (
                  <tr key={p.id} className="border-b border-[#EEEEEE]">
                    <td className="px-4 py-3 text-sm whitespace-nowrap">{format(new Date(p.created_at), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">₹{Math.round(p.amount).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-sm">{p.order_count}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${p.status === 'done' ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-[#FFD700]/20 text-[#B8860B]'}`}>
                        {p.status === 'done' ? '✅ Paid' : '⏳ Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
