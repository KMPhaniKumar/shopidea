'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// SuspendButton handles both suspend and unsuspend actions.
// When suspending, it prompts the admin for a required reason via window.prompt
// before calling the API. Both actions call router.refresh() on success.

export default function SuspendButton({
  storeId,
  suspended,
  suspendedReason,
}: {
  storeId: string
  suspended: boolean
  suspendedReason?: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSuspend() {
    const reason = window.prompt(
      'Enter a reason for suspending this store (required — the seller will see this):'
    )
    if (reason === null) return // cancelled
    if (!reason.trim()) {
      alert('A suspension reason is required.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/suspend?action=suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const json = await res.json()
      if (!json.success) {
        alert(`Failed: ${json.error}`)
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleUnsuspend() {
    if (!confirm('Re-enable this store? It will become active again and the seller will regain access.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/suspend?action=unsuspend`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        alert(`Failed: ${json.error}`)
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  if (suspended) {
    return (
      <div className="flex items-center gap-3">
        {suspendedReason && (
          <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg max-w-xs truncate" title={suspendedReason}>
            Reason: {suspendedReason}
          </span>
        )}
        <button
          onClick={handleUnsuspend}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
        >
          {loading ? '...' : 'Enable Store'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleSuspend}
      disabled={loading}
      className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
    >
      {loading ? '...' : 'Suspend Store'}
    </button>
  )
}
