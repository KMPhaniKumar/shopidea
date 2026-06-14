'use client'

// Live approval notifier for the admin dashboard.
//
// Polls /api/admin/pending-approvals and pops a notification card for each NEW
// pending item — a new seller registration or a new address-change request.
// Cards are informational: clicking one opens the relevant review page; there
// are no inline approve/reject actions. Mounted once in the admin layout, so
// its "already shown" set survives client-side navigation (only a full reload
// re-surfaces items).

import { useEffect, useRef } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { X, Store, MapPin } from 'lucide-react'

const POLL_MS = 25_000

type SellerItem = { id: string; store_name: string; phone: string | null }
type AddrItem = { id: string; storeId: string; store_name: string }

export function AdminNotifier() {
  const router = useRouter()
  const shown = useRef<Set<string>>(new Set())

  useEffect(() => {
    let active = true

    function card(opts: {
      toastId: string
      icon: React.ReactNode
      title: string
      detail: string
      href: string
    }) {
      return (
        <div className="bg-white rounded-xl shadow-lg border border-[#EEEEEE] w-80 p-3.5 flex items-start gap-2.5">
          <button
            onClick={() => {
              router.push(opts.href)
              toast.dismiss(opts.toastId)
            }}
            className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              {opts.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#1A1A1A]">{opts.title}</span>
              <span className="block text-xs text-[#666666] truncate">{opts.detail}</span>
              <span className="block text-[11px] text-orange-600 mt-0.5">Tap to review →</span>
            </span>
          </button>
          <button
            onClick={() => toast.dismiss(opts.toastId)}
            aria-label="Dismiss"
            className="p-1 -m-1 text-[#AAAAAA] hover:text-[#666666] shrink-0"
          >
            <X size={15} />
          </button>
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
            href: '/admin/sellers',
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
            href: '/admin/address-changes',
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
