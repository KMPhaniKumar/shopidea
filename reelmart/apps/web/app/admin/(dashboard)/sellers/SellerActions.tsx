'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

async function storeAction(
  storeId: string,
  action: 'approve' | 'reject' | 'activate' | 'deactivate',
  notes?: string,
) {
  const res = await fetch(`/api/admin/stores/${storeId}?action=${action}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notes !== undefined ? { notes } : {}),
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

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')

  // Toast state
  const [toast, setToast] = useState<string | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  async function handle(action: 'approve' | 'activate' | 'deactivate') {
    if (action === 'deactivate' && !confirm('Deactivate this store?')) return
    setLoading(action)
    const json = await storeAction(storeId, action)
    setLoading(null)
    if (!json.success) {
      alert(`Failed: ${json.error}`)
      return
    }
    router.refresh()
  }

  async function handleRejectSubmit() {
    const notes = rejectNotes.trim()
    if (!notes) return
    setLoading('reject')
    setShowRejectModal(false)
    const json = await storeAction(storeId, 'reject', notes)
    setLoading(null)
    if (!json.success) {
      alert(`Rejection failed: ${json.error}`)
      return
    }
    setRejectNotes('')
    showToast("Seller rejected — they'll see your comments and can resubmit.")
    router.refresh()
  }

  const busy = (a: string) => loading === a

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-gray-900">Reject seller application</h3>
            <p className="text-sm text-gray-500">
              The seller will see these comments and can resubmit once they fix the issues.
            </p>
            <textarea
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
              rows={4}
              placeholder="Reason / what the seller must fix (e.g. KYC document is blurry, GST number is missing)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectNotes('') }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectNotes.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {approvalStatus === 'pending' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => handle('approve')}
            disabled={!!loading}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
          >
            {busy('approve') ? '...' : 'Approve'}
          </button>
          <button
            onClick={() => setShowRejectModal(true)}
            disabled={!!loading}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {busy('reject') ? '...' : 'Reject'}
          </button>
        </div>
      )}

      {approvalStatus === 'rejected' && (
        <div className="flex gap-1.5">
          <button
            onClick={() => handle('approve')}
            disabled={!!loading}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
          >
            {busy('approve') ? '...' : 'Approve'}
          </button>
        </div>
      )}

      {approvalStatus !== 'pending' && approvalStatus !== 'rejected' && (
        <div className="flex gap-1.5">
          {isActive ? (
            <button
              onClick={() => handle('deactivate')}
              disabled={!!loading}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {busy('deactivate') ? '...' : 'Deactivate'}
            </button>
          ) : (
            <button
              onClick={() => handle('activate')}
              disabled={!!loading}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
            >
              {busy('activate') ? '...' : 'Activate'}
            </button>
          )}
        </div>
      )}
    </>
  )
}
