'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

async function storeAction(storeId: string, action: 'approve' | 'reject' | 'activate' | 'deactivate') {
  const res = await fetch(`/api/admin/stores/${storeId}?action=${action}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  return res.json()
}

export default function SellerActions({
  storeId,
  isActive,
  approvalStatus,
}: {
  storeId: string
  isActive: boolean
  approvalStatus: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  async function handle(action: 'approve' | 'reject' | 'activate' | 'deactivate') {
    if (action === 'deactivate' && !confirm('Deactivate this store?')) return
    if (action === 'reject' && !confirm('Reject this store application?')) return
    setLoading(action)
    const json = await storeAction(storeId, action)
    if (!json.success) alert(`Failed: ${json.error}`)
    router.refresh()
    setLoading(null)
  }

  const busy = (a: string) => loading === a

  // Pending approval
  if (approvalStatus === 'pending') {
    return (
      <div className="flex gap-1.5">
        <button onClick={() => handle('approve')} disabled={!!loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors">
          {busy('approve') ? '...' : 'Approve'}
        </button>
        <button onClick={() => handle('reject')} disabled={!!loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors">
          {busy('reject') ? '...' : 'Reject'}
        </button>
      </div>
    )
  }

  // Rejected
  if (approvalStatus === 'rejected') {
    return (
      <div className="flex gap-1.5">
        <button onClick={() => handle('approve')} disabled={!!loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors">
          {busy('approve') ? '...' : 'Approve'}
        </button>
      </div>
    )
  }

  // Approved — show activate/deactivate toggle
  return (
    <div className="flex gap-1.5">
      {isActive ? (
        <button onClick={() => handle('deactivate')} disabled={!!loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors">
          {busy('deactivate') ? '...' : 'Deactivate'}
        </button>
      ) : (
        <button onClick={() => handle('activate')} disabled={!!loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors">
          {busy('activate') ? '...' : 'Activate'}
        </button>
      )}
    </div>
  )
}
