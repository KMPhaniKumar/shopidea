'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, Clock, Upload, PenLine, Mail, ShieldCheck, MapPin, Phone } from 'lucide-react'
import toast from 'react-hot-toast'

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
  /** Called after features_unlocked becomes true (forces a gate re-check) */
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
    <div className="flex items-start gap-3 py-3 border-b border-[#F0F0F0] last:border-0">
      {done ? (
        <CheckCircle size={20} className="text-[#25D366] mt-0.5 shrink-0" />
      ) : (
        <Clock size={20} className="text-[#FF6B2B] mt-0.5 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1A1A1A]">{label}</span>
          {done ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-[#25D366]">
              Verified
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#FF6B2B]">
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

export function OnboardingStatus({ onUnlocked }: OnboardingStatusProps) {
  const supabase = createClient()

  const [v, setV] = useState<SellerVerification | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState<string>('')
  const [email, setEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [sigGenerating, setSigGenerating] = useState(false)
  const [sigUploading, setSigUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [verRow, userRow] = await Promise.all([
        supabase.from('seller_verification').select('*').eq('seller_id', user.id).maybeSingle(),
        supabase.from('users').select('full_name, email').eq('id', user.id).maybeSingle(),
      ])
      if (cancelled) return
      if (verRow.data) setV(verRow.data as SellerVerification)
      if (userRow.data?.full_name) setFullName(userRow.data.full_name)
      if (userRow.data?.email) setEmail(userRow.data.email)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (v?.features_unlocked) onUnlocked?.()
  }, [v?.features_unlocked])

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
      setV(prev => prev ? { ...prev, signature_present: true } : prev)
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

  const steps = [
    { key: 'phone', label: 'Mobile number', icon: Phone, done: v.phone_verified },
    { key: 'email', label: 'Email address', icon: Mail, done: v.email_verified },
    { key: 'pan', label: 'PAN number', icon: ShieldCheck, done: v.pan_verified },
    { key: 'pickup', label: 'Pickup address', icon: MapPin, done: v.pickup_verified },
    { key: 'signature', label: 'Digital signature', icon: PenLine, done: v.signature_present },
  ]

  const gatingSteps = [
    { label: 'Mobile number', done: v.phone_verified },
    { label: 'PAN number', done: v.pan_verified },
    { label: 'Pickup address', done: v.pickup_verified },
  ]

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="bg-white rounded-card border border-border p-5 shadow-card">
        <h2 className="text-base font-bold text-[#1A1A1A] mb-1">Complete your verification</h2>
        <p className="text-sm text-secondary mb-4">
          Complete Mobile, PAN, and Pickup address to unlock your full seller dashboard.
        </p>

        {/* Gating progress bar */}
        <div className="flex gap-2 mb-4">
          {gatingSteps.map(s => (
            <div
              key={s.label}
              className={`h-1.5 flex-1 rounded-full transition-colors ${s.done ? 'bg-[#25D366]' : 'bg-[#EEEEEE]'}`}
              title={s.label}
            />
          ))}
        </div>

        <div className="divide-y divide-[#F0F0F0]">
          {/* Mobile */}
          <StatusRow label="Mobile number" done={v.phone_verified} />

          {/* Email */}
          <StatusRow label="Email address" done={v.email_verified}>
            {!v.email_verified && (
              <div className="flex gap-2 mt-1">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 border border-border rounded-btn px-3 py-2 text-sm outline-none focus:border-primary transition-colors text-[#1A1A1A]"
                />
                <button
                  onClick={saveEmail}
                  disabled={emailSaving || !email.includes('@')}
                  className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-btn disabled:opacity-40 hover:bg-[#e55a1f] transition-colors"
                >
                  {emailSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}
            {!v.email_verified && email && (
              <p className="text-xs text-muted mt-1.5">
                Email verification will be available in the next update.
              </p>
            )}
          </StatusRow>

          {/* PAN */}
          <StatusRow label="PAN number" done={v.pan_verified}>
            {!v.pan_verified && (
              <p className="text-xs text-secondary mt-1">
                Our team reviews your PAN during KYC. You'll be notified once verified.
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
          <StatusRow label="Digital signature" done={v.signature_present}>
            {!v.signature_present && (
              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  onClick={handleAutoGenerate}
                  disabled={sigGenerating || sigUploading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-primary text-xs font-semibold rounded-btn border border-primary/30 hover:bg-orange-100 transition-colors disabled:opacity-40"
                >
                  <PenLine size={13} />
                  {sigGenerating ? 'Generating...' : 'Auto-generate'}
                </button>
                <label className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#F9F9F9] text-secondary text-xs font-semibold rounded-btn border border-border hover:border-primary transition-colors cursor-pointer ${sigUploading ? 'opacity-40 pointer-events-none' : ''}`}>
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
            )}
            {!v.signature_present && (
              <p className="text-xs text-muted mt-1.5">
                Non-blocking — you can complete this anytime.
              </p>
            )}
          </StatusRow>
        </div>
      </div>

      {/* Locked features notice */}
      {!v.features_unlocked && (
        <div className="bg-orange-50 border border-[#FF6B2B]/20 rounded-card px-5 py-4">
          <p className="text-sm font-semibold text-[#FF6B2B] mb-1">Dashboard locked</p>
          <p className="text-xs text-secondary leading-relaxed">
            Products, orders, payouts and other features will unlock once your Mobile,
            PAN, and Pickup address are verified.
          </p>
        </div>
      )}
    </div>
  )
}
