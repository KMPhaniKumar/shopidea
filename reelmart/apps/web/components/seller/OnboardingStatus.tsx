'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Clock, Upload, PenLine, Mail, ShieldCheck, MapPin, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSellerVerification } from '@/components/seller/SellerGate'

// Shape returned by the seller_verification view (migration 025)
interface SellerVerification {
  phone_verified: boolean
  email_verified: boolean
  pan_verified: boolean
  pickup_verified: boolean
  signature_present: boolean
  features_unlocked: boolean
}

interface OnboardingStatusProps {
  /**
   * When provided, the component fetches its own data (standalone / gate mode).
   * When omitted it reads from SellerVerificationContext (in-dashboard mode).
   */
  standalone?: boolean
  /** Called after features_unlocked becomes true — only used in standalone mode */
  onUnlocked?: () => void
}

function StatusRow({
  label,
  done,
  children,
}: {
  label: string
  done: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      {done ? (
        <CheckCircle size={20} className="text-success mt-0.5 shrink-0" />
      ) : (
        <Clock size={20} className="text-primary mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">{label}</span>
          {done ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-success">
              Verified
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-primary">
              Pending
            </span>
          )}
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
    // Underline
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
  const [email, setEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [sigGenerating, setSigGenerating] = useState(false)
  const [sigUploading, setSigUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [localSigDone, setLocalSigDone] = useState(v.signature_present)

  // All 5 checks for the percentage bar
  const allSteps = [
    { label: 'Mobile', done: v.phone_verified },
    { label: 'Email', done: v.email_verified },
    { label: 'PAN', done: v.pan_verified },
    { label: 'Pickup address', done: v.pickup_verified },
    { label: 'Digital signature', done: localSigDone },
  ]
  const completedCount = allSteps.filter(s => s.done).length
  const pct = Math.round((completedCount / allSteps.length) * 100)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle()
      if (data?.full_name) setFullName(data.full_name)
      if (data?.email) setEmail(data.email)
    }
    loadUser()
  }, [])

  async function saveEmail() {
    if (!email.includes('@')) { toast.error('Enter a valid email address'); return }
    setEmailSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Session expired'); setEmailSaving(false); return }
    const { error } = await supabase.from('users').update({ email: email.trim() }).eq('id', user.id)
    if (error) { toast.error(error.message) } else { toast.success('Email saved') }
    setEmailSaving(false)
  }

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
    } catch (err: any) {
      toast.error(err?.message ?? 'Upload failed')
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
    } catch (err: any) {
      toast.error(err?.message ?? 'Generation failed')
    } finally {
      setSigGenerating(false)
    }
  }

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      {/* Percentage header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-sm font-bold text-text">Store verification</h2>
          <span className="text-sm font-bold text-primary">{pct}%</span>
        </div>
        {/* Overall progress bar */}
        <div className="h-2 w-full bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-secondary mt-2">
          {completedCount} of {allSteps.length} steps complete.
          {!v.features_unlocked && ' Complete Mobile, PAN, and Pickup address to unlock selling.'}
        </p>

        {/* Per-step segment dots */}
        <div className="flex gap-1.5 mt-3">
          {allSteps.map(s => (
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
        {/* Mobile */}
        <StatusRow label="Mobile number" done={v.phone_verified} />

        {/* Email */}
        <StatusRow label="Email address" done={v.email_verified}>
          {!v.email_verified && (
            <>
              <div className="flex gap-2 mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 border border-border rounded-btn px-3 py-2 text-sm outline-none focus:border-primary transition-colors text-text"
                />
                <button
                  onClick={saveEmail}
                  disabled={emailSaving || !email.includes('@')}
                  className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-btn disabled:opacity-40 hover:bg-[#e55a1f] transition-colors"
                >
                  {emailSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {email && (
                <p className="text-xs text-muted mt-1.5">
                  Email verification will be available in the next update.
                </p>
              )}
            </>
          )}
        </StatusRow>

        {/* PAN */}
        <StatusRow label="PAN number" done={v.pan_verified}>
          {!v.pan_verified && (
            <p className="text-xs text-secondary mt-1">
              Our team reviews your PAN during KYC. You will be notified once verified.
            </p>
          )}
        </StatusRow>

        {/* Pickup */}
        <StatusRow label="Pickup address" done={v.pickup_verified}>
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

        {/* Signature */}
        <StatusRow label="Digital signature" done={localSigDone}>
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
                <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-surface text-secondary text-xs font-semibold rounded-btn border border-border hover:border-primary transition-colors cursor-pointer ${sigUploading ? 'opacity-40 pointer-events-none' : ''}`}>
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
        <div className="mx-5 mb-5 mt-4 bg-orange-50 border border-primary/20 rounded-card px-4 py-3">
          <p className="text-xs font-semibold text-primary mb-0.5">Selling features locked</p>
          <p className="text-xs text-secondary leading-relaxed">
            Adding products will unlock once Mobile, PAN, and Pickup address are verified
            and admin approval is complete.
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

  // Standalone mode: fetch own data (used in dev/testing or gate-level use)
  const [standaloneV, setStandaloneV] = useState<SellerVerification | null>(null)
  const [standaloneLoading, setStandaloneLoading] = useState(true)

  useEffect(() => {
    if (!standalone) return
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setStandaloneLoading(false); return }
      const { data } = await supabase
        .from('seller_verification')
        .select('*')
        .eq('seller_id', user.id)
        .maybeSingle()
      setStandaloneV(data as SellerVerification | null)
      setStandaloneLoading(false)
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

  if (!v) {
    return (
      <div className="bg-white rounded-card border border-border p-6 shadow-card text-center text-secondary text-sm">
        Verification data unavailable. Please try refreshing.
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
