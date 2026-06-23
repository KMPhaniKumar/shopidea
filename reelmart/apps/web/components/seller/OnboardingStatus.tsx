'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Clock, MinusCircle, Upload, PenLine } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSellerVerification } from '@/components/seller/SellerGate'
import type { SellerVerification } from '@/components/seller/SellerGate'

interface OnboardingStatusProps {
  /**
   * When provided, the component fetches its own data (standalone / gate mode).
   * When omitted it reads from SellerVerificationContext (in-dashboard mode).
   */
  standalone?: boolean
  /** Called after features_unlocked becomes true — only used in standalone mode */
  onUnlocked?: () => void
}

// ---------------------------------------------------------------------------
// Status row variants
// ---------------------------------------------------------------------------

type RowVariant = 'done' | 'pending' | 'na'

function StatusRow({
  label,
  variant,
  badge,
  children,
}: {
  label: string
  variant: RowVariant
  badge?: string
  children?: React.ReactNode
}) {
  const icon =
    variant === 'done' ? (
      <CheckCircle size={20} className="text-success mt-0.5 shrink-0" />
    ) : variant === 'na' ? (
      <MinusCircle size={20} className="text-muted mt-0.5 shrink-0" />
    ) : (
      <Clock size={20} className="text-primary mt-0.5 shrink-0" />
    )

  const badgeEl = badge ? (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        variant === 'done'
          ? 'bg-green-50 text-success'
          : variant === 'na'
          ? 'bg-gray-50 text-muted'
          : 'bg-orange-50 text-primary'
      }`}
    >
      {badge}
    </span>
  ) : null

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">{label}</span>
          {badgeEl}
        </div>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}

// Render full_name in a script-like font on a canvas, return a PNG Blob
function generateSignatureBlob(fullName: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = 600
    canvas.height = 200
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('Canvas not supported')); return }
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'italic 64px Georgia, serif'
    ctx.fillStyle = '#1A1A1A'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(fullName, 300, 100)
    ctx.beginPath()
    ctx.moveTo(40, 155)
    ctx.lineTo(560, 155)
    ctx.strokeStyle = '#1A1A1A'
    ctx.lineWidth = 1.5
    ctx.stroke()
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}

// ---------------------------------------------------------------------------
// Inner content — receives resolved verification data
// ---------------------------------------------------------------------------

function OnboardingContent({
  v,
  onSignatureUploaded,
}: {
  v: SellerVerification
  onSignatureUploaded: () => void
}) {
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [sigGenerating, setSigGenerating] = useState(false)
  const [sigUploading, setSigUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localSigDone, setLocalSigDone] = useState(v.signature_present)

  // ---------------------------------------------------------------------------
  // Primary checks (4) — drive the percentage bar
  // GST "Not provided" counts as satisfied/neutral (not penalised)
  // ---------------------------------------------------------------------------
  const gstSatisfied = !v.gst_provided || v.gst_verified // not provided OR verified = satisfied
  const primarySteps = [
    { label: 'Mobile', done: v.phone_verified },
    { label: 'PAN number', done: v.pan_provided },
    { label: 'GST number', done: gstSatisfied },
    { label: 'Pickup address', done: v.pickup_verified },
  ]
  const completedCount = primarySteps.filter(s => s.done).length
  const pct = Math.round((completedCount / primarySteps.length) * 100)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.full_name) setFullName(data.full_name)
    }
    loadUser()
  }, [])

  async function uploadSignatureBlob(blob: Blob) {
    setSigUploading(true)
    try {
      const form = new FormData()
      form.append('file', blob, 'signature.png')
      const res = await fetch('/api/seller/signature', { method: 'POST', body: form })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast.success('Signature saved')
      setLocalSigDone(true)
      onSignatureUploaded()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      toast.error(msg)
    } finally {
      setSigUploading(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return }
    await uploadSignatureBlob(file)
  }

  async function handleAutoGenerate() {
    if (!fullName) { toast.error('Full name is not set — complete registration first'); return }
    setSigGenerating(true)
    try {
      const blob = await generateSignatureBlob(fullName)
      await uploadSignatureBlob(blob)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed'
      toast.error(msg)
    } finally {
      setSigGenerating(false)
    }
  }

  // GST row variant + badge
  function gstVariant(): { variant: RowVariant; badge: string } {
    if (!v.gst_provided) return { variant: 'na', badge: 'Not provided' }
    if (v.gst_verified) return { variant: 'done', badge: 'Verified' }
    return { variant: 'pending', badge: 'Pending admin review' }
  }
  const { variant: gstV, badge: gstBadge } = gstVariant()

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      {/* Percentage header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold text-text">Store verification</h2>
          <span className="text-sm font-bold text-primary">{pct}%</span>
        </div>
        <div className="h-2 w-full bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-secondary mt-2">
          {completedCount} of {primarySteps.length} steps complete.
          {!v.features_unlocked && ' Approval unlocks selling features.'}
        </p>

        {/* Per-step segment dots */}
        <div className="flex gap-1.5 mt-3">
          {primarySteps.map(s => (
            <div
              key={s.label}
              title={s.label}
              className={`h-1.5 flex-1 rounded-full transition-colors ${s.done ? 'bg-success' : 'bg-border'}`}
            />
          ))}
        </div>
      </div>

      {/* Check rows */}
      <div className="px-5 divide-y divide-border">

        {/* Mobile — verified by OTP at signup */}
        <StatusRow
          label="Mobile number"
          variant={v.phone_verified ? 'done' : 'pending'}
          badge={v.phone_verified ? 'Verified' : 'Pending'}
        />

        {/* PAN — satisfied when provided (no admin verification needed) */}
        <StatusRow
          label="PAN number"
          variant={v.pan_provided ? 'done' : 'pending'}
          badge={v.pan_provided ? 'Provided' : 'Pending'}
        >
          {!v.pan_provided && (
            <p className="text-xs text-secondary mt-1">
              PAN is verified when you provide it during KYC. You will be marked verified once our
              team processes your registration.
            </p>
          )}
        </StatusRow>

        {/* GST — optional; if not provided → neutral; if provided → admin verifies */}
        <StatusRow
          label="GST number"
          variant={gstV}
          badge={gstBadge}
        >
          {v.gst_provided && !v.gst_verified && (
            <p className="text-xs text-secondary mt-1">
              Our team will verify your GSTIN shortly.
            </p>
          )}
          {!v.gst_provided && (
            <p className="text-xs text-muted mt-1">
              GST registration is optional for sellers below the threshold.
            </p>
          )}
        </StatusRow>

        {/* Pickup address — NimbusPost/admin verifies */}
        <StatusRow
          label="Pickup address"
          variant={v.pickup_verified ? 'done' : 'pending'}
          badge={v.pickup_verified ? 'Verified' : 'Pending'}
        >
          {!v.pickup_verified && (
            <p className="text-xs text-secondary mt-1">
              Register a pickup address in{' '}
              <a href="/seller/settings" className="text-primary hover:underline font-medium">
                Settings
              </a>{' '}
              and it will be verified by our courier partner.
            </p>
          )}
        </StatusRow>

        {/* Digital signature — secondary / optional (non-blocking) */}
        <StatusRow
          label="Digital signature"
          variant={localSigDone ? 'done' : 'pending'}
          badge={localSigDone ? 'Uploaded' : 'Optional'}
        >
          {!localSigDone && (
            <>
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  onClick={handleAutoGenerate}
                  disabled={sigGenerating || sigUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-primary text-xs font-semibold rounded-btn border border-primary/30 hover:bg-orange-100 transition-colors disabled:opacity-40"
                >
                  <PenLine size={13} />
                  {sigGenerating ? 'Generating...' : 'Auto-generate'}
                </button>
                <label
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-surface text-secondary text-xs font-semibold rounded-btn border border-border hover:border-primary transition-colors cursor-pointer ${sigUploading ? 'opacity-40 pointer-events-none' : ''}`}
                >
                  <Upload size={13} />
                  {sigUploading ? 'Uploading...' : 'Upload image'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
              <p className="text-xs text-muted mt-1.5">
                Non-blocking — you can complete this anytime.
              </p>
            </>
          )}
        </StatusRow>
      </div>

      {/* Locked-features notice at bottom when not unlocked */}
      {!v.features_unlocked && (
        <div data-testid="verification-locked-notice" className="mx-5 mb-5 mt-4 bg-orange-50 border border-primary/20 rounded-card px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-0.5">Selling features locked</p>
          <p className="text-xs text-secondary leading-relaxed">
            Adding products unlocks once your store is reviewed and admin approval is complete.
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// OnboardingStatus — context-aware wrapper
// ---------------------------------------------------------------------------

export function OnboardingStatus({ standalone = false, onUnlocked }: OnboardingStatusProps) {
  const ctx = useSellerVerification()
  const supabase = createClient()

  const [standaloneV, setStandaloneV] = useState<SellerVerification | null>(null)
  const [standaloneLoading, setStandaloneLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!standalone) return
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setStandaloneLoading(false); return }
        const { data, error } = await supabase
          .from('seller_verification')
          .select('*')
          .eq('seller_id', user.id)
          .maybeSingle()
        if (error) {
          // Fail quietly — view may not exist yet or RLS is being tuned
          console.warn('[OnboardingStatus] could not load verification:', error.message)
          setLoadError(true)
        } else {
          setStandaloneV(data as SellerVerification | null)
        }
      } catch (err) {
        console.warn('[OnboardingStatus] unexpected error:', err)
        setLoadError(true)
      } finally {
        setStandaloneLoading(false)
      }
    }
    load()
  }, [standalone])

  const v = standalone ? standaloneV : ctx.verification
  const loading = standalone ? standaloneLoading : ctx.verificationLoading

  useEffect(() => {
    if (standalone && v?.features_unlocked) onUnlocked?.()
  }, [standalone, v?.features_unlocked])

  if (loading) {
    return (
      <div className="bg-white rounded-card border border-border p-6 shadow-card text-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    )
  }

  if (loadError || !v) {
    return (
      <div className="bg-white rounded-card border border-border p-5 shadow-card">
        <p className="text-sm text-secondary text-center">
          Verification status unavailable.{' '}
          <button
            onClick={() => window.location.reload()}
            className="text-primary underline underline-offset-2 hover:text-[#e55a1f]"
          >
            Retry
          </button>
        </p>
      </div>
    )
  }

  return (
    <OnboardingContent
      v={v}
      onSignatureUploaded={standalone ? () => onUnlocked?.() : ctx.refreshVerification}
    />
  )
}
