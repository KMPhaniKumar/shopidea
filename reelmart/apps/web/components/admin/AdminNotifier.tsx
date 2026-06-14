'use client'

// Live approval notifier for the admin dashboard.
//
// Polls /api/admin/pending-approvals and pops a card for each NEW pending item
// — a new seller registration or a new address-change request — with quick
// approve (✓) / reject (✗) actions that hit the same endpoints the dedicated
// admin pages use. Mounted once in the admin layout, so its "already shown"
// set survives client-side navigation (only a full reload re-surfaces items).

import { useEffect, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { Check, X, Store, MapPin } from 'lucide-react'

const POLL_MS = 25_000

type SellerItem = { id: string; store_name: string; phone: string | null }
type AddrItem = { id: string; storeId: string; store_name: string }

export function AdminNotifier() {
  const router = useRouter()
  const shown = useRef<Set<string>>(new Set())

  useEffect(() => {
    let active = true

    async function resolve(
      action: 'approve' | 'reject',
      url: string,
      body: Record<string, unknown>,
      toastId: string,
    ) {
      try {
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!json.success) {
          toast.error(json.error ?? 'Action failed')
          return
        }
        toast.dismiss(toastId)
        toast.success(action === 'approve' ? 'Approved' : 'Rejected')
        router.refresh()
      } catch {
        toast.error('Network error — please try again')
      }
    }

    function card(opts: {
      toastId: string
      icon: React.ReactNode
      title: string
      detail: string
      onApprove: () => void
      onReject: () => void
    }) {
      return (
        <div className="bg-white rounded-xl shadow-lg border border-[#EEEEEE] w-80 p-3.5 flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              {opts.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A1A1A]">{opts.title}</p>
              <p className="text-xs text-[#666666] truncate">{opts.detail}</p>
            </div>
            <button
              onClick={() => toast.dismiss(opts.toastId)}
              aria-label="Dismiss"
              className="p-1 -m-1 text-[#AAAAAA] hover:text-[#666666] shrink-0"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={opts.onApprove}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
            >
              <Check size={14} /> Approve
            </button>
            <button
              onClick={opts.onReject}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              <X size={14} /> Reject
            </button>
          </div>
        </div>
      )
    }

    function popSeller(s: SellerItem) {
      const id = `seller:${s.id}`
      toast.custom(
        () =>
          card({
            toastId: id,
            icon: <Store size={16} />,
            title: 'New seller registration',
            detail: s.phone ? `${s.store_name} · ${s.phone}` : s.store_name,
            onApprove: () => resolve('approve', `/api/admin/stores/${s.id}?action=approve`, {}, id),
            onReject: () => resolve('reject', `/api/admin/stores/${s.id}?action=reject`, {}, id),
          }),
        { id, duration: Infinity },
      )
    }

    function popAddr(c: AddrItem) {
      const id = `addr:${c.id}`
      toast.custom(
        () =>
          card({
            toastId: id,
            icon: <MapPin size={16} />,
            title: 'New address change request',
            detail: c.store_name,
            onApprove: () =>
              resolve('approve', `/api/admin/stores/${c.storeId}/address-change?action=approve`, {}, id),
            onReject: () => {
              // Address-change rejection requires a reason (the seller is shown it).
              const reason = window.prompt('Reason for rejecting this address change:')
              if (reason == null || !reason.trim()) return
              resolve(
                'reject',
                `/api/admin/stores/${c.storeId}/address-change?action=reject`,
                { reason: reason.trim() },
                id,
              )
            },
          }),
        { id, duration: Infinity },
      )
    }

    async function poll() {
      try {
        const res = await fetch('/api/admin/pending-approvals', { cache: 'no-store' })
        if (!res.ok || !active) return
        const json = await res.json()
        if (!json.success || !active) return
        const sellers: SellerItem[] = json.data.sellers ?? []
        const changes: AddrItem[] = json.data.addressChanges ?? []
        for (const s of sellers) {
          if (shown.current.has(`seller:${s.id}`)) continue
          shown.current.add(`seller:${s.id}`)
          popSeller(s)
        }
        for (const c of changes) {
          if (shown.current.has(`addr:${c.id}`)) continue
          shown.current.add(`addr:${c.id}`)
          popAddr(c)
        }
      } catch {
        // transient — next tick retries
      }
    }

    poll()
    const iv = setInterval(poll, POLL_MS)
    return () => {
      active = false
      clearInterval(iv)
    }
  }, [router])

  return <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
}
