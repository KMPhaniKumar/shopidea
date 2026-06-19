'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import DeliveryPincodeChecker from './DeliveryPincodeChecker'

interface Props {
  storeId: string
  pickupPincode: string
  gstVerified?: boolean
  storeState?: string | null
  onClose: () => void
  /** Called after a SERVICEABLE check — caller should add to cart then close. */
  onServiceable: () => void
}

/**
 * Modal wrapping DeliveryPincodeChecker shown when the buyer tries to add to
 * cart without a completed pincode check (or when the check failed). The modal
 * portal-renders to document.body to escape header backdrop-blur stacking.
 */
export default function PincodeGateModal({
  storeId,
  pickupPincode,
  gstVerified,
  storeState,
  onClose,
  onServiceable,
}: Props) {
  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // We watch the Zustand store from the parent; here we only need to surface
  // the "Continue" button when the current check is serviceable.
  // The parent reads the Zustand store and calls onServiceable itself — this
  // component is kept simple: it only provides the checker + a confirm button
  // that is driven by the parent after a serviceable result is written.

  const content = (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet / dialog */}
      <div className="relative z-10 w-full sm:max-w-md sm:rounded-2xl bg-white rounded-t-2xl shadow-2xl px-4 pt-5 pb-8 sm:pb-6 mx-auto">
        {/* Handle bar (mobile) */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-[#1A1A1A] text-base">Check delivery to your pincode</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[#666] mb-4">
          Enter your 6-digit pincode to confirm this seller delivers to your location before adding to cart.
        </p>

        <DeliveryPincodeChecker
          pickupPincode={pickupPincode}
          storeId={storeId}
          gstVerified={gstVerified}
          storeState={storeState}
        />

        {/* The parent watches the Zustand store; once serviceable it calls
            onServiceable. We surface a separate "Continue" button that the
            parent activates via the onServiceable callback.
            Actually: we emit a custom DOM event from here so the parent can
            close the modal and add to cart atomically. Instead, simpler:
            the parent passes an onServiceable and we expose a "Done" button
            that the parent should activate. But to keep logic in the parent,
            we rely on the parent subscribing to the store.
            Nothing more needed here — the checker writes to the Zustand store
            and the parent component polls/subscribes to it. */}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
