'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GstVerifyButton({ storeId }: { storeId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function verify() {
    if (!confirm('Mark GST as verified for this seller? This cannot be undone from the UI.')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/verify-gst`, { method: 'POST' })
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

  return (
    <button
      onClick={verify}
      disabled={loading}
      className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
    >
      {loading ? '...' : 'Verify GST'}
    </button>
  )
}
