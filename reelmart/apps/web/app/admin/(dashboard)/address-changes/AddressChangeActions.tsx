'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddressChangeActions({
  storeId,
  requestId,
}: {
  storeId: string
  requestId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  async function handleApprove() {
    if (!confirm('Approve this address change and update the live store address?')) return
    setLoading('approve')
    const res = await fetch(`/api/admin/stores/${storeId}/address-change?action=approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const json = await res.json()
    setLoading(null)
    if (!json.success) {
      alert(`Approval failed: ${json.error}`)
      return
    }
    router.refresh()
  }

  async function handleRejectSubmit() {
    const reason = rejectReason.trim()
    if (!reason) {
      alert('Please enter a rejection reason')
      return
    }
    setLoading('reject')
    setShowRejectModal(false)
    const res = await fetch(`/api/admin/stores/${storeId}/address-change?action=reject`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const json = await res.json()
    setLoading(null)
    if (!json.success) {
      alert(`Rejection failed: ${json.error}`)
      return
    }
    setRejectReason('')
    router.refresh()
  }

  const busy = loading !== null

  return (
    <>
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleApprove}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
        >
          {loading === 'approve' ? 'Approving...' : 'Approve'}
        </button>
        <button
          onClick={() => setShowRejectModal(true)}
          disabled={busy}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
        >
          {loading === 'reject' ? 'Rejecting...' : 'Reject'}
        </button>
      </div>

      {/* Reject reason modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Reject address change</h3>
            <p className="text-sm text-gray-500">
              The seller will be notified with this reason and can resubmit a corrected address.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Pincode is not serviceable by our courier partner"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason('') }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
