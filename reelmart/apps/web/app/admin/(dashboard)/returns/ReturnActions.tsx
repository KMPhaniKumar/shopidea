'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ReturnActions({
  returnId,
  orderId,
  orderAmount,
}: {
  returnId: string
  orderId: string
  orderAmount: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [refundAmt, setRefundAmt] = useState(String(orderAmount))

  async function handleApprove() {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('returns').update({ status: 'approved' }).eq('id', returnId)
    router.refresh()
    setLoading(false)
  }

  async function handleReject() {
    if (!confirm('Reject this return request?')) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('returns').update({ status: 'rejected' }).eq('id', returnId)
    router.refresh()
    setLoading(false)
  }

  async function handleRefund() {
    const amt = parseFloat(refundAmt)
    if (!amt || amt <= 0 || amt > orderAmount) {
      alert(`Enter a valid refund amount (max ₹${orderAmount})`)
      return
    }
    if (!confirm(`Issue refund of ₹${amt}?`)) return

    setLoading(true)
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/payments/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ returnId, orderId, refundAmount: amt }),
    })
    const data = await res.json()
    setLoading(false)

    if (data.success) {
      router.refresh()
    } else {
      alert(`Refund failed: ${data.error}`)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-gray-100">
      <button
        onClick={handleApprove}
        disabled={loading}
        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={handleReject}
        disabled={loading}
        className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        Reject
      </button>
      <div className="flex items-center gap-2 ml-2">
        <span className="text-xs text-gray-500">Refund ₹</span>
        <input
          type="number"
          value={refundAmt}
          onChange={e => setRefundAmt(e.target.value)}
          className="w-24 border border-gray-200 rounded-lg px-2 h-7 text-xs"
          max={orderAmount}
          min={1}
        />
        <button
          onClick={handleRefund}
          disabled={loading}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50"
        >
          Issue Refund
        </button>
      </div>
    </div>
  )
}
