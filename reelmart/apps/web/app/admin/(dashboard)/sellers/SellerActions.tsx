'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

async function adminPut(path: string, body?: unknown) {
  const { data: { session } } = await createClient().auth.getSession()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export default function SellerActions({
  storeId,
  status,
}: {
  storeId: string
  status: 'pending' | 'active' | 'suspended'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleApprove() {
    setLoading(true)
    const json = await adminPut(`/api/admin/stores/${storeId}/approve`)
    if (!json.success) alert(`Failed: ${json.error}`)
    router.refresh()
    setLoading(false)
  }

  async function handleSuspend() {
    const reason = prompt('Reason for suspension (optional):')
    if (reason === null) return
    setLoading(true)
    const json = await adminPut(`/api/admin/stores/${storeId}/suspend`, { reason })
    if (!json.success) alert(`Failed: ${json.error}`)
    router.refresh()
    setLoading(false)
  }

  async function handleUnsuspend() {
    setLoading(true)
    const json = await adminPut(`/api/admin/stores/${storeId}/approve`)
    if (!json.success) alert(`Failed: ${json.error}`)
    router.refresh()
    setLoading(false)
  }

  return (
    <div className="flex gap-2">
      {status === 'pending' && (
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
      )}
      {status === 'active' && (
        <button
          onClick={handleSuspend}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          Suspend
        </button>
      )}
      {status === 'suspended' && (
        <button
          onClick={handleUnsuspend}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
        >
          Reinstate
        </button>
      )}
    </div>
  )
}
