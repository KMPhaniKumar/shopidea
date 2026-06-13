'use client'

// Gates the seller dashboard on store approval_status:
//   - No store → /seller/register
//   - suspended → SuspendedScreen (hard block)
//   - rejected  → ApprovalScreen / rejected (hard block)
//   - pending OR approved (not suspended) → render {children} (soft gate)
//
// Verification state (features_unlocked + per-check flags) is published via
// SellerVerificationContext so the dashboard home, products page, and sidebar
// can read it without a second Supabase round-trip.
//
// The old full-screen "onboarding" panel is gone; that UI now lives inside
// the dashboard (DashboardPage + OnboardingStatus card).
//
// Lives client-side because the Next.js middleware is currently disabled
// (Edge/SSR bundling issue); see middleware.ts.

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Clock, XCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Context — verification state shared with dashboard children
// ---------------------------------------------------------------------------

export interface SellerVerification {
  /** seller_id matches auth.uid() */
  seller_id?: string
  /** OTP verified at signup */
  phone_verified: boolean
  /** PAN number was supplied during KYC (not admin-verified) */
  pan_provided: boolean
  /** Seller submitted a GST number */
  gst_provided: boolean
  /** Admin manually verified the GST number */
  gst_verified: boolean
  /** NimbusPost confirmed the pickup address */
  pickup_verified: boolean
  /** Legacy — kept for backward-compat in case old view rows arrive */
  email_verified?: boolean
  /** Signature image is stored in the bucket */
  signature_present: boolean
  /** Mirrors stores.approval_status */
  approval_status?: string
  /** Mirrors stores.suspended */
  suspended?: boolean
  /** Product-add gate: admin approved = true */
  features_unlocked: boolean
}

const DEFAULT_VERIFICATION: SellerVerification = {
  phone_verified: false,
  pan_provided: false,
  gst_provided: false,
  gst_verified: false,
  pickup_verified: false,
  email_verified: false,
  signature_present: false,
  features_unlocked: false,
}

interface SellerVerificationCtx {
  verification: SellerVerification | null
  /** true while the initial Supabase fetch is in flight */
  verificationLoading: boolean
  /** Call after an in-dashboard action changes verification state */
  refreshVerification: () => void
}

const SellerVerificationContext = createContext<SellerVerificationCtx>({
  verification: null,
  verificationLoading: true,
  refreshVerification: () => {},
})

export function useSellerVerification() {
  return useContext(SellerVerificationContext)
}

// ---------------------------------------------------------------------------
// Gate types
// ---------------------------------------------------------------------------

type GateStatus = 'loading' | 'pass' | 'rejected' | 'suspended'

// ---------------------------------------------------------------------------
// SellerGate
// ---------------------------------------------------------------------------

export function SellerGate({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<GateStatus>('loading')
  const [suspendedReason, setSuspendedReason] = useState<string | null>(null)
  const [verification, setVerification] = useState<SellerVerification | null>(null)
  const [verificationLoading, setVerificationLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  async function check() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Preserve the dev "skip login" affordance (no session in dev).
      if (process.env.NODE_ENV === 'development') {
        setStatus('pass')
        setVerificationLoading(false)
        return
      }
      router.replace('/seller/login')
      return
    }

    setUserId(user.id)

    const { data: store } = await supabase
      .from('stores')
      .select('approval_status, suspended, suspended_reason')
      .eq('seller_id', user.id)
      .maybeSingle()

    // No store yet — send to registration.
    if (!store) { router.replace('/seller/register'); return }

    // Hard blocks
    if (store.approval_status === 'rejected') { setStatus('rejected'); return }
    if ((store as any).suspended) {
      setSuspendedReason((store as any).suspended_reason ?? null)
      setStatus('suspended')
      return
    }

    // Everything else (pending OR approved, not suspended) → pass through
    setStatus('pass')

    // Fetch verification state (may not exist yet if migration 025 isn't deployed)
    const { data: verRow } = await supabase
      .from('seller_verification')
      .select('*')
      .eq('seller_id', user.id)
      .maybeSingle()

    if (verRow) {
      setVerification(verRow as SellerVerification)
    } else {
      // View not deployed yet — treat as unverified but don't hard-block
      setVerification({ ...DEFAULT_VERIFICATION })
    }
    setVerificationLoading(false)
  }

  async function refreshVerification() {
    if (!userId) return
    const { data: verRow } = await supabase
      .from('seller_verification')
      .select('*')
      .eq('seller_id', userId)
      .maybeSingle()
    if (verRow) setVerification(verRow as SellerVerification)
  }

  useEffect(() => {
    check()
  }, [])

  // ── Loading spinner ──────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Hard blocks ──────────────────────────────────────────────────────────
  if (status === 'suspended') {
    return <SuspendedScreen reason={suspendedReason} />
  }

  if (status === 'rejected') {
    return <RejectedScreen />
  }

  // ── Soft pass — render dashboard with verification context ────────────────
  return (
    <SellerVerificationContext.Provider
      value={{ verification, verificationLoading, refreshVerification }}
    >
      {children}
    </SellerVerificationContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hard-block screens
// ---------------------------------------------------------------------------

function SuspendedScreen({ reason }: { reason: string | null }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="ReelMart" width={220} height={80} className="object-contain" />
        </div>
        <div className="bg-white border border-error rounded-2xl shadow-lg px-8 py-10 text-center">
          <div className="flex justify-center mb-4">
            <XCircle size={48} className="text-error" />
          </div>
          <h2 className="text-xl font-bold text-text mb-2">Your store has been suspended</h2>
          {reason ? (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-5 text-left">
              <div className="text-xs text-red-400 uppercase font-semibold mb-1">Reason</div>
              <p className="text-sm text-red-700 leading-relaxed">{reason}</p>
            </div>
          ) : (
            <p className="text-secondary text-sm leading-relaxed mb-5">
              Your store has been suspended by the platform team.
            </p>
          )}
          <p className="text-sm text-secondary leading-relaxed mb-4">
            You cannot access your dashboard or receive new orders while your store is suspended.
            Please contact support to resolve this.
          </p>
          <p className="text-xs text-muted">Contact support at support@reelmart.in</p>
          <a href="/seller/login" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">
            Back to login
          </a>
        </div>
      </div>
    </div>
  )
}

function RejectedScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="ReelMart" width={220} height={80} className="object-contain" />
        </div>
        <div className="bg-white border border-border rounded-2xl shadow-lg px-8 py-10 text-center">
          <div className="flex justify-center mb-4">
            <XCircle size={48} className="text-error" />
          </div>
          <h2 className="text-xl font-bold text-text mb-2">Application not approved</h2>
          <p className="text-secondary text-sm leading-relaxed mb-6">
            Unfortunately your store application was not approved. If you think this is a mistake,
            please reach out and we will take another look.
          </p>
          <div className="flex items-center justify-center gap-1.5 mb-4">
            <Clock size={14} className="text-muted" />
            <span className="text-xs text-muted">You will be notified of any status updates.</span>
          </div>
          <p className="text-xs text-muted">Questions? Contact support at support@reelmart.in</p>
          <a href="/seller/login" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">
            Back to login
          </a>
        </div>
      </div>
    </div>
  )
}
