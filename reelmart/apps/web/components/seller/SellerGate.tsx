'use client'

// Gates the seller dashboard on two layers:
//   1. Store approval_status (admin must approve the store before the seller
//      reaches the dashboard at all).
//   2. seller_verification.features_unlocked (migration 025 view) — until
//      mobile + PAN + pickup are all verified, the seller only sees the
//      OnboardingStatus panel; products/orders/payouts/etc are hidden.
//
// Lives client-side because the Next.js middleware is currently disabled
// (Edge/SSR bundling issue); see middleware.ts.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, XCircle } from 'lucide-react'
import { OnboardingStatus } from '@/components/seller/OnboardingStatus'

type GateStatus = 'loading' | 'approved' | 'onboarding' | 'pending' | 'rejected'

export function SellerGate({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<GateStatus>('loading')

  async function check() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Preserve the dev "skip login" affordance (no session in dev).
      if (process.env.NODE_ENV === 'development') { setStatus('approved'); return }
      router.replace('/seller/login')
      return
    }

    const { data: store } = await supabase
      .from('stores')
      .select('approval_status')
      .eq('seller_id', user.id)
      .maybeSingle()

    // No store yet — application not filled. Send them to complete it.
    if (!store) { router.replace('/seller/register'); return }

    if (store.approval_status === 'rejected') { setStatus('rejected'); return }
    if (store.approval_status !== 'approved') { setStatus('pending'); return }

    // Store is approved — check onboarding verification
    const { data: verRow } = await supabase
      .from('seller_verification')
      .select('features_unlocked')
      .eq('seller_id', user.id)
      .maybeSingle()

    // If the view doesn't exist yet (schema not deployed) fall back to approved
    if (!verRow) { setStatus('approved'); return }

    if (verRow.features_unlocked) {
      setStatus('approved')
    } else {
      setStatus('onboarding')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function safeCheck() {
      await check()
    }
    safeCheck()
  }, [])

  if (status === 'approved') return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9F9F9]">
        <div className="w-8 h-8 border-2 border-[#FF6B2B] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'onboarding') {
    return (
      <div className="min-h-screen bg-[#F9F9F9] px-4 py-10">
        <div className="max-w-lg mx-auto">
          <div className="flex justify-center mb-6">
            <Image src="/logo.png" alt="ReelMart" width={180} height={66} className="object-contain" />
          </div>
          <h1 className="text-xl font-bold text-[#1A1A1A] mb-5 text-center">Seller Onboarding</h1>
          <OnboardingStatus onUnlocked={() => setStatus('approved')} />
        </div>
      </div>
    )
  }

  return <ApprovalScreen status={status as 'pending' | 'rejected'} />
}

function ApprovalScreen({ status }: { status: 'pending' | 'rejected' }) {
  const rejected = status === 'rejected'
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="ReelMart" width={220} height={80} className="object-contain" />
        </div>
        <div className="bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-10 text-center">
          <div className="flex justify-center mb-4">
            {rejected ? <XCircle size={48} className="text-[#E23744]" /> : <Clock size={48} className="text-[#FF6B2B]" />}
          </div>
          {rejected ? (
            <>
              <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Application not approved</h2>
              <p className="text-[#888888] text-sm leading-relaxed mb-6">
                Unfortunately your store application wasn't approved. If you think this is a mistake,
                please reach out and we'll take another look.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Application under review</h2>
              <p className="text-[#888888] text-sm leading-relaxed mb-6">
                Our team is verifying your details. You'll be able to access your dashboard and start
                selling as soon as your store is approved (usually within 24–48 hours).
              </p>
              <div className="bg-orange-50 rounded-xl p-4 text-left space-y-2 mb-6">
                <div className="flex items-center gap-2 text-sm text-[#555555]">
                  <CheckCircle size={16} className="text-[#FF6B2B] shrink-0" />
                  <span>Application received</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-[#AAAAAA]">
                  <Clock size={16} className="shrink-0" />
                  <span>Admin review in progress</span>
                </div>
              </div>
            </>
          )}
          <p className="text-xs text-[#AAAAAA]">Questions? Contact support at support@reelmart.in</p>
          <a href="/seller/login" className="inline-block mt-4 text-sm text-[#FF6B2B] font-medium hover:underline">← Back to login</a>
        </div>
      </div>
    </div>
  )
}
