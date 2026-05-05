'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export default function ProcessPayoutsButton({
  hasPending,
  totalAmount,
  storeCount,
}: {
  hasPending: boolean
  totalAmount: number
  storeCount: number
}) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<{ processed: number; totalAmount: number } | null>(null)

  async function handleProcess() {
    if (!confirm(`Process payouts for ${storeCount} seller${storeCount !== 1 ? 's' : ''} totaling ₹${totalAmount.toLocaleString('en-IN')}?`)) return

    setProcessing(true)
    setResult(null)

    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch(`${API_URL}/api/payouts/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
    })
    const json = await res.json()
    setProcessing(false)

    if (json.success) {
      setResult(json.data)
      router.refresh()
    } else {
      alert(`Payout processing failed: ${json.error}`)
    }
  }

  if (!hasPending) {
    return (
      <div className="text-sm text-gray-400 font-medium">No pending payouts</div>
    )
  }

  return (
    <div className="text-right">
      {result && (
        <p className="text-sm text-green-600 font-semibold mb-2">
          ✓ Processed {result.processed} payouts (₹{result.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
        </p>
      )}
      <button
        onClick={handleProcess}
        disabled={processing}
        className="bg-orange-500 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-orange-600 disabled:opacity-50 transition-colors"
      >
        {processing ? 'Processing...' : 'Process All Payouts'}
      </button>
    </div>
  )
}
