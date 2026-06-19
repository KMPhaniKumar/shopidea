'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, MapPin, CheckCircle2, XCircle } from 'lucide-react'
import { formatDeliveryDate } from '@/lib/delivery-date'
import { stateForPincode, statesMatch } from '@/lib/pincode-state'
import { useDeliveryCheckStore } from '@/store/deliveryCheckStore'

const PINCODE_LS_KEY = 'rm_delivery_pincode'

interface DeliveryResult {
  deliverable: boolean
  fee: number
  estimatedDays: number
}

interface Props {
  /** The store's origin / pickup pincode. Widget is hidden when absent. */
  pickupPincode: string
  /** Product price or cart subtotal used for COD surcharge calculation. */
  orderAmount?: number
  /**
   * When provided, the interstate-GST rule is enforced:
   * if the store is NOT gst_verified AND the buyer is in a different state,
   * the check is blocked regardless of courier serviceability.
   */
  storeId?: string
  gstVerified?: boolean
  storeState?: string | null
}

export default function DeliveryPincodeChecker({
  pickupPincode,
  orderAmount,
  storeId,
  gstVerified,
  storeState,
}: Props) {
  const [pincode, setPincode] = useState('')
  const [result, setResult] = useState<DeliveryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** When true, this specific check is blocked by the interstate-GST rule. */
  const [interstateBlocked, setInterstateBlocked] = useState(false)
  const [resolvedBuyerState, setResolvedBuyerState] = useState<string | null>(null)

  // Track which pickup+delivery combo the result belongs to so stale results
  // from a previous pincode are not shown after a new one is entered.
  const resultKeyRef = useRef<string | null>(null)

  const setCheck = useDeliveryCheckStore(s => s.setCheck)
  const clearCheck = useDeliveryCheckStore(s => s.clearCheck)

  // On mount: prefill from localStorage and auto-check if we already have a pincode.
  useEffect(() => {
    if (!pickupPincode) return
    try {
      const saved = localStorage.getItem(PINCODE_LS_KEY)
      if (saved && /^\d{6}$/.test(saved)) {
        setPincode(saved)
        // Trigger check with the saved value directly — state won't be visible yet
        // so we call the helper with the value explicitly.
        checkPincode(saved, pickupPincode, orderAmount)
      }
    } catch {
      // localStorage not available (SSR guard / private mode)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPincode])

  async function checkPincode(
    deliveryPincode: string,
    pickup: string,
    amount: number | undefined,
  ) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) return

    setLoading(true)
    setError(null)
    setResult(null)
    setInterstateBlocked(false)
    setResolvedBuyerState(null)
    const key = `${pickup}-${deliveryPincode}`
    resultKeyRef.current = key

    // ── Interstate GST check (client-side, fast) ─────────────────────────
    if (gstVerified !== true) {
      const buyerState = stateForPincode(deliveryPincode)
      if (buyerState && storeState && !statesMatch(buyerState, storeState)) {
        // Buyer is in a different state and the store has no verified GST.
        if (resultKeyRef.current !== key) { setLoading(false); return }
        setResolvedBuyerState(buyerState)
        setInterstateBlocked(true)
        setLoading(false)
        if (storeId) {
          setCheck(storeId, {
            pincode: deliveryPincode,
            buyerState,
            serviceable: false,
            interstateBlocked: true,
          })
        }
        return
      }
    }

    try {
      const res = await fetch(`${apiUrl}/api/delivery/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupPincode: pickup,
          deliveryPincode,
          weight: 0.5,
          paymentType: 'prepaid',
          orderAmount: amount ?? 0,
        }),
      })

      // If a newer check was started while this was in-flight, discard.
      if (resultKeyRef.current !== key) return

      if (!res.ok) {
        setError('Could not check delivery. Please try again.')
        return
      }

      const json = await res.json().catch(() => null)
      if (!json?.success || !json?.data) {
        setError('Could not check delivery. Please try again.')
        return
      }

      const deliverable = !!json.data.deliverable
      const buyerState = stateForPincode(deliveryPincode)
      setResolvedBuyerState(buyerState)
      setResult({
        deliverable,
        fee: json.data.fee ?? 0,
        estimatedDays: json.data.estimatedDays ?? 3,
      })

      if (storeId) {
        setCheck(storeId, {
          pincode: deliveryPincode,
          buyerState,
          serviceable: deliverable,
          interstateBlocked: false,
        })
      }
    } catch {
      if (resultKeyRef.current === key) {
        setError('Network error. Please try again.')
      }
    } finally {
      if (resultKeyRef.current === key) {
        setLoading(false)
      }
    }
  }

  function handleCheck() {
    if (!/^\d{6}$/.test(pincode)) return
    try {
      localStorage.setItem(PINCODE_LS_KEY, pincode)
    } catch {}
    checkPincode(pincode, pickupPincode, orderAmount)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleCheck()
  }

  function handlePincodeChange(val: string) {
    setPincode(val)
    // Clear stale result when the user types a new pincode
    if (result || error || interstateBlocked) {
      setResult(null)
      setError(null)
      setInterstateBlocked(false)
      if (storeId) clearCheck(storeId)
    }
  }

  const isValid = /^\d{6}$/.test(pincode)

  return (
    <div className="bg-white rounded-card border border-[#EEEEEE] px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <MapPin size={15} className="text-[#FF6B2B] shrink-0" />
        <span className="text-xs font-bold text-[#666] uppercase tracking-wide">Check Delivery</span>
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <div className="flex-1 flex border border-[#EEEEEE] rounded-btn overflow-hidden focus-within:border-[#FF6B2B] transition">
          <input
            type="tel"
            inputMode="numeric"
            value={pincode}
            onChange={e => handlePincodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={handleKeyDown}
            placeholder="Enter 6-digit pincode"
            maxLength={6}
            className="flex-1 px-3 py-2.5 text-sm outline-none bg-transparent text-[#1A1A1A] placeholder:text-[#AAAAAA]"
            aria-label="Delivery pincode"
          />
        </div>
        <button
          onClick={handleCheck}
          disabled={!isValid || loading}
          className="px-4 py-2.5 bg-[#FF6B2B] text-white text-sm font-bold rounded-btn hover:bg-[#e55a1f] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 shrink-0"
          aria-label="Check delivery availability"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            'Check'
          )}
        </button>
      </div>

      {/* Interstate GST block */}
      {!loading && interstateBlocked && (
        <div className="mt-3 flex items-start gap-2 rounded-btn px-3 py-2.5 text-sm bg-amber-50 border border-amber-200">
          <XCircle size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <span className="text-amber-800 font-semibold">
            This seller delivers only within {storeState}.
            Not available for your location{resolvedBuyerState ? ` (${resolvedBuyerState})` : ''}.
          </span>
        </div>
      )}

      {/* Courier result */}
      {!loading && !interstateBlocked && result && (
        <div className={`mt-3 flex items-start gap-2 rounded-btn px-3 py-2.5 text-sm ${
          result.deliverable
            ? 'bg-green-50 border border-green-100'
            : 'bg-red-50 border border-red-100'
        }`}>
          {result.deliverable ? (
            <>
              <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-[#1A1A1A]">
                  Delivers to {pincode}
                </span>
                <span className="text-[#666]">
                  {' '}— Arriving by {formatDeliveryDate(result.estimatedDays)} · {result.estimatedDays}-day delivery
                </span>
                {result.fee > 0 && (
                  <span className="block text-xs text-[#666] mt-0.5">
                    Shipping fee: <span className="font-semibold text-[#1A1A1A]">₹{result.fee}</span>
                  </span>
                )}
                {result.fee === 0 && (
                  <span className="block text-xs text-green-700 font-semibold mt-0.5">
                    Free shipping
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <XCircle size={16} className="text-[#E23744] mt-0.5 shrink-0" />
              <span className="text-[#E23744] font-semibold">
                Sorry, we don&apos;t deliver to this pincode yet.
              </span>
            </>
          )}
        </div>
      )}

      {!loading && error && (
        <p className="mt-2 text-xs text-[#666]">{error}</p>
      )}
    </div>
  )
}
