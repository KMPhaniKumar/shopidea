'use client'

/**
 * GstBanner — shown at the top of every seller dashboard page when the
 * seller's store does not have admin-verified GST.
 *
 * - No GST on file  → actionable prompt to add GST, links to /seller/settings
 * - GST provided but not yet verified → informational "under review" notice
 * - GST verified    → renders nothing
 *
 * When the banner is showing (no verified GST), also queries interstate_demand
 * for this seller's store.  If buyers from other states attempted to order,
 * we show a short demand-signal line to motivate the seller to add GST.
 *
 * Collapsible within a session (sessionStorage flag); re-appears on a fresh load.
 * Reads from SellerVerificationContext (populated by SellerGate with no extra fetch).
 * Also reads the store's state from sellerStore (Zustand) for the "sell within
 * {state}" copy — the SellerGate query was widened to include `state`.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, AlertTriangle, Info } from 'lucide-react'
import { useSellerVerification } from '@/components/seller/SellerGate'
import { useSellerStore } from '@/store/sellerStore'
import { createClient } from '@/lib/supabase/client'

const DISMISS_KEY = 'gst_banner_dismissed'

interface DemandRow {
  buyer_state: string
  attempts: number
}

export function GstBanner() {
  const { verification, verificationLoading } = useSellerVerification()
  const store = useSellerStore((s) => s.store)
  const [dismissed, setDismissed] = useState(false)
  const [demand, setDemand] = useState<DemandRow[]>([])

  // Restore session-level dismissal on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
    }
  }, [])

  // Fetch interstate demand rows for this store — only when the banner is
  // visible (no verified GST) and we have the store id from Zustand.
  useEffect(() => {
    if (!store?.id) return
    if (verificationLoading || !verification) return
    if (verification.gst_verified) return // banner will not render anyway

    const supabase = createClient()
    supabase
      .from('interstate_demand')
      .select('buyer_state, attempts')
      .eq('store_id', store.id)
      .order('attempts', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) setDemand(data as DemandRow[])
      })
  }, [store?.id, verification, verificationLoading])

  // Nothing to show while loading or when GST is already verified
  if (verificationLoading || !verification) return null
  if (verification.gst_verified) return null
  if (dismissed) return null

  const stateName: string = store?.state ?? 'your state'
  const hasGst = verification.gst_provided

  function dismiss() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(DISMISS_KEY, '1')
    }
    setDismissed(true)
  }

  // Build the demand signal line when there are rows.
  const totalAttempts = demand.reduce((sum, r) => sum + r.attempts, 0)
  const stateList = demand.map((r) => r.buyer_state).join(', ')
  const demandLine =
    demand.length > 0
      ? `Buyers from ${stateList} wanted to order (${totalAttempts} attempt${totalAttempts !== 1 ? 's' : ''}) — add GST to serve them.`
      : null

  if (!hasGst) {
    // No GST on file — actionable orange/amber banner
    return (
      <div
        role="alert"
        className="mx-3 mt-3 md:mx-0 md:mt-0 md:mb-4 flex items-start gap-3 rounded-card border border-primary/30 bg-orange-50 px-4 py-3 shadow-sm"
      >
        <AlertTriangle size={18} className="text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 text-sm space-y-0.5">
          <span className="text-text">
            You can currently sell only within{' '}
            <strong className="font-semibold">{stateName}</strong>.{' '}
            Add your GST to sell across India.
          </span>
          {demandLine && (
            <p className="text-xs text-secondary leading-snug">
              {demandLine}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/seller/settings#gst"
            className="text-xs font-semibold text-primary hover:underline underline-offset-2 whitespace-nowrap"
          >
            Add GST &rarr;
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-muted hover:text-secondary transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    )
  }

  // GST provided but under admin review — informational blue/amber notice
  return (
    <div
      role="status"
      className="mx-3 mt-3 md:mx-0 md:mt-0 md:mb-4 flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
    >
      <Info size={18} className="text-amber-600 mt-0.5 shrink-0" />
      <p className="flex-1 min-w-0 text-sm text-amber-800">
        Your GST is under review — pan-India selling unlocks once it is approved.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-amber-400 hover:text-amber-600 transition-colors shrink-0"
      >
        <X size={15} />
      </button>
    </div>
  )
}
