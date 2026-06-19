'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { AlertCircle, Eye, EyeOff, CheckCircle, Clock } from 'lucide-react'
import { sendOtp as msg91Send, verifyOtp as msg91Verify, exchangeForSupabaseSession, preloadOtpWidget, CAPTCHA_CONTAINER_ID } from '@/lib/msg91-otp'
import { isValidPan, isValidGst } from '@/lib/kyc'

// Step represents the registration / edit wizard state.
// In edit mode (returning rejected seller) we skip phone/otp and go straight
// to 'profile', then show 'pending' on success.
type Step = 'phone' | 'otp' | 'profile' | 'pending'

export default function SellerRegister() {
  const router = useRouter()
  const supabase = createClient()

  // Detect an active session with a rejected store at mount time, and enter
  // edit mode automatically (also triggered by the RejectedScreen's CTA link).
  const [editMode, setEditMode] = useState(false)
  const [rejectedNotes, setRejectedNotes] = useState<string | null>(null)
  // existingStoreId is kept for future use (e.g. address sub-step).
  const [, setExistingStoreId] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)
  const [countdown, setCountdown] = useState(0)

  // Phone / OTP
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')

  // Profile fields
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [panNumber, setPanNumber] = useState('')
  const [gstNumber, setGstNumber] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // On mount: check for an existing authenticated session with a rejected store.
  // If one is found, skip OTP and enter edit mode directly.
  useEffect(() => {
    async function detectSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setInitLoading(false); return }

        const { data: store } = await supabase
          .from('stores')
          .select('id, store_name, approval_status, approval_notes')
          .eq('seller_id', user.id)
          .maybeSingle()

        if (!store) { setInitLoading(false); return }

        if (store.approval_status === 'approved') {
          // Already approved — redirect to dashboard.
          router.replace('/seller/dashboard')
          return
        }

        if (store.approval_status === 'pending') {
          // Not yet reviewed — show pending screen.
          setStep('pending')
          setInitLoading(false)
          return
        }

        if (store.approval_status === 'rejected') {
          // Either arrived via ?mode=edit CTA or direct navigation while logged in.
          await enterEditMode(user.id, store.id, (store as any).approval_notes ?? null)
          setInitLoading(false)
          return
        }
      } catch {
        // If anything fails, fall through to the normal registration flow.
      }
      setInitLoading(false)
    }

    detectSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pre-init the MSG91 widget while the phone box is shown.
  useEffect(() => {
    if (step !== 'phone') return
    preloadOtpWidget().catch(() => {})
  }, [step])

  // -------------------------------------------------------------------
  // Edit mode helpers
  // -------------------------------------------------------------------

  async function enterEditMode(userId: string, storeId: string, notes: string | null) {
    setEditMode(true)
    setRejectedNotes(notes)
    setExistingStoreId(storeId)

    // Prefill the profile form from the existing store + KYC data.
    // Use /api/seller/my-store (service-role read) to get KYC columns.
    try {
      // Fetch display name from the store row (already readable via RLS).
      const { data: storeRow } = await supabase
        .from('stores')
        .select('store_name')
        .eq('id', storeId)
        .single()
      if (storeRow?.store_name) setDisplayName(storeRow.store_name)

      // Fetch KYC + pickup fields via the server route.
      const res = await fetch('/api/seller/my-store')
      if (res.ok) {
        const json = await res.json()
        if (json.success && json.data) {
          const d = json.data
          if (d.pan_number) setPanNumber(d.pan_number)
          if (d.gst_number) setGstNumber(d.gst_number)
        }
      }

      // Fetch the user's full name from the users table.
      const { data: userRow } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      if (userRow?.full_name) setFullName(userRow.full_name)
    } catch {
      // Prefill failure is non-fatal — the form just starts empty.
    }

    setStep('profile')
  }

  // -------------------------------------------------------------------
  // OTP helpers
  // -------------------------------------------------------------------

  function startCountdown() {
    setCountdown(60)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  async function sendOTP() {
    if (phone.length !== 10) return
    setLoading(true)
    try {
      await msg91Send(`+91${phone}`)
      setStep('otp')
      startCountdown()
      toast.success('OTP sent to +91 ' + phone)
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not send OTP')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOTP() {
    if (otp.length !== 6) return
    setLoading(true)
    try {
      const { accessToken } = await msg91Verify(otp)
      const { userId } = await exchangeForSupabaseSession(accessToken, 'seller')

      // Check if this seller already has a store (returning user).
      const { data: existingStore } = await supabase
        .from('stores')
        .select('id, approval_status, approval_notes')
        .eq('seller_id', userId)
        .maybeSingle()

      if (existingStore) {
        if (existingStore.approval_status === 'approved') {
          toast.success('Welcome back!')
          router.push('/seller/dashboard')
          return
        }
        if (existingStore.approval_status === 'rejected') {
          await enterEditMode(userId, existingStore.id, (existingStore as any).approval_notes ?? null)
          return
        }
        // pending or other — show the pending screen
        setStep('pending')
        return
      }

      setStep('profile')
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------
  // Profile validation
  // -------------------------------------------------------------------

  function profileReady() {
    const baseValid =
      fullName.trim().length >= 2 &&
      displayName.trim().length >= 2 &&
      isValidPan(panNumber) &&
      (gstNumber.trim() === '' || isValidGst(gstNumber))

    if (editMode) {
      // In edit mode, password is optional (seller already registered).
      return baseValid
    }
    return baseValid && password.length >= 8
  }

  // -------------------------------------------------------------------
  // Submit: new registration
  // -------------------------------------------------------------------

  async function submitProfile() {
    if (!profileReady()) return
    if (!isValidPan(panNumber)) { toast.error('Enter a valid PAN (e.g. ABCDE1234F)'); return }
    if (gstNumber.trim() && !isValidGst(gstNumber)) { toast.error('Enter a valid 15-character GSTIN, or leave blank'); return }

    if (editMode) {
      await resubmit()
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/seller/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          display_name: displayName.trim(),
          pan_number: panNumber.trim().toUpperCase(),
          gst_number: gstNumber.trim() ? gstNumber.trim().toUpperCase() : undefined,
          password,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Registration failed')
      toast.success('Account created! Setting up your dashboard...')
      router.push('/seller/dashboard')
    } catch (err: any) {
      toast.error(err?.message ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------
  // Submit: resubmit after rejection
  // -------------------------------------------------------------------

  async function resubmit() {
    setLoading(true)
    try {
      const payload: Record<string, string> = {
        store_name: displayName.trim(),
        pan_number: panNumber.trim().toUpperCase(),
      }
      if (gstNumber.trim()) payload.gst_number = gstNumber.trim().toUpperCase()

      const res = await fetch('/api/seller/resubmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Resubmission failed')

      toast.success('Resubmitted! Our team will review your application.')
      setStep('pending')
    } catch (err: any) {
      toast.error(err?.message ?? 'Resubmission failed')
    } finally {
      setLoading(false)
    }
  }

  // -------------------------------------------------------------------
  // Loading state during session detection
  // -------------------------------------------------------------------

  if (initLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12 relative overflow-hidden">
      <Toaster />
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-[#FF6B2B]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-[#00B98E]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <Image src="/logo.png" alt="ReelMart" width={300} height={110} className="object-contain mb-6" />

        {!editMode && (
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#1A1A1A] leading-snug mb-2">Start selling today.</h2>
            <p className="text-[#888888] text-sm leading-relaxed">Join sellers growing their business with ReelMart.</p>
          </div>
        )}

        {editMode && step === 'profile' && (
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-[#1A1A1A] leading-snug mb-2">Update your details</h2>
            <p className="text-[#888888] text-sm leading-relaxed">Make the requested changes and resubmit for approval.</p>
          </div>
        )}

        {/* Pending screen */}
        {step === 'pending' && (
          <div className="w-full bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-10 text-center">
            <div className="flex justify-center mb-4">
              <Clock size={48} className="text-[#FF6B2B]" />
            </div>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">
              {editMode ? 'Resubmitted for review!' : 'Application Submitted!'}
            </h2>
            <p className="text-[#888888] text-sm leading-relaxed mb-6">
              {editMode
                ? 'Your updated details are under review. Our team will approve your store within 24–48 hours. You will be notified once approved.'
                : 'Your store registration is under review. Our team will verify your details and approve your store within 24–48 hours. You\'ll be notified once approved.'}
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
              <div className="flex items-center gap-2 text-sm text-[#AAAAAA]">
                <Clock size={16} className="shrink-0" />
                <span>Store activation</span>
              </div>
            </div>
            <p className="text-xs text-[#AAAAAA]">Questions? Contact support at support@reelmart.in</p>
          </div>
        )}

        {step !== 'pending' && (
          <div className="w-full bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-8">
            {!editMode && (
              <div className="flex gap-1 mb-6">
                <div className="h-1 w-10 rounded-full bg-[#FF6B2B]" />
                <div className="h-1 w-4 rounded-full bg-[#00B98E]" />
              </div>
            )}

            {/* Rejection notes banner (edit mode only) */}
            {editMode && rejectedNotes && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-[#FF6B2B] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-[#FF6B2B] uppercase tracking-wide mb-1">
                      Changes requested
                    </p>
                    <p className="text-sm text-[#1A1A1A] leading-relaxed whitespace-pre-wrap">
                      {rejectedNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Phone */}
            {step === 'phone' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Create your account</h1>
                  <p className="text-[#888888] text-sm">Enter your phone number to get started</p>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Phone Number</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                      <span className="inline-flex items-center px-4 bg-[#F9F9F9] text-[#666666] text-sm font-medium border-r border-[#E5E5E5]">+91</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        className="flex-1 px-4 py-3.5 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                        autoFocus
                      />
                    </div>
                  </div>
                  {process.env.NODE_ENV === 'development' && (
                    <button type="button" onClick={() => setPhone('9999999999')}
                      className="w-full bg-[#FEF3C7] border-l-4 border-[#F59E0B] rounded-lg px-3 py-2 text-xs font-semibold text-[#92400E] text-left hover:bg-[#FDE68A] transition-colors">
                      DEV — Click to use 9999999999 (OTP: 123456)
                    </button>
                  )}
                  <div id={CAPTCHA_CONTAINER_ID} className="empty:hidden" />
                  <button onClick={sendOTP} disabled={phone.length !== 10 || loading}
                    className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm">
                    {loading ? 'Sending...' : 'Send OTP →'}
                  </button>
                  <p className="text-center text-xs text-[#AAAAAA] pt-2">
                    Already have an account?{' '}
                    <a href="/seller/login" className="text-[#FF6B2B] font-medium hover:underline">Sign in</a>
                  </p>
                </div>
              </div>
            )}

            {/* OTP */}
            {step === 'otp' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Verify your number</h1>
                  <p className="text-[#888888] text-sm">OTP sent to +91 {phone}</p>
                  {process.env.NODE_ENV === 'development' && (
                    <button type="button" onClick={() => setOtp('123456')}
                      className="w-full bg-[#FEF3C7] border-l-4 border-[#F59E0B] rounded-lg px-3 py-2 text-xs font-semibold text-[#92400E] text-left hover:bg-[#FDE68A] transition-colors mt-3">
                      DEV — Click to fill OTP 123456
                    </button>
                  )}
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Enter OTP</label>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="• • • • • •"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-center tracking-[0.5em] text-xl font-bold outline-none focus:border-[#FF6B2B] transition-colors"
                      autoFocus
                    />
                  </div>
                  <button onClick={verifyOTP} disabled={otp.length !== 6 || loading}
                    className="w-full bg-[#00B98E] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#009e79] transition-colors shadow-sm">
                    {loading ? 'Verifying...' : 'Verify & Continue →'}
                  </button>
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep('phone')} className="text-sm text-[#888888] hover:text-[#1A1A1A]">← Change number</button>
                    <button onClick={sendOTP} disabled={countdown > 0} className="text-sm text-[#FF6B2B] font-medium disabled:opacity-40">
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Profile */}
            {step === 'profile' && (
              <div>
                {!editMode && (
                  <div className="mb-6">
                    <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Your details</h1>
                    <p className="text-[#888888] text-sm">Set up your seller profile in one step</p>
                  </div>
                )}
                <div className="space-y-4">

                  {/* Full name */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">
                      Full name (as per PAN) <span className="text-[#E23744]">*</span>
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A]"
                      autoFocus={!editMode}
                    />
                    <p className="text-xs text-[#AAAAAA] mt-1">Must match your PAN card exactly</p>
                  </div>

                  {/* Display name */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">
                      Display / Store name <span className="text-[#E23744]">*</span>
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Rahul's Fashion"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A]"
                    />
                    <p className="text-xs text-[#AAAAAA] mt-1">This is what buyers will see</p>
                  </div>

                  {/* PAN number */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">
                      PAN number <span className="text-[#E23744]">*</span>
                    </label>
                    <input
                      type="text"
                      value={panNumber}
                      onChange={e => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                      placeholder="ABCDE1234F"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A] tracking-wider font-mono"
                    />
                    {panNumber.length === 10 && !isValidPan(panNumber) && (
                      <p className="text-xs text-[#E23744] mt-1">Invalid PAN format (e.g. ABCDE1234F)</p>
                    )}
                    {panNumber.length === 10 && isValidPan(panNumber) && (
                      <p className="text-xs text-[#25D366] mt-1">Valid PAN format</p>
                    )}
                  </div>

                  {/* GST number (optional) */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">
                      GST number <span className="text-[#AAAAAA] font-normal text-xs">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={gstNumber}
                      onChange={e => setGstNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                      placeholder="22ABCDE1234F1Z5"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A] tracking-wider font-mono"
                    />
                    {gstNumber.length === 15 && !isValidGst(gstNumber) && (
                      <p className="text-xs text-[#E23744] mt-1">Invalid GSTIN format</p>
                    )}
                    {gstNumber.length === 0 && (
                      <p className="text-xs text-[#AAAAAA] mt-1.5 leading-relaxed">
                        Without GST you can sell only within your state. You can add GST anytime from settings to unlock pan-India selling.
                      </p>
                    )}
                  </div>

                  {/* Password — only shown for new registrations, not edit/resubmit */}
                  {!editMode && (
                    <div>
                      <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">
                        Password <span className="text-[#E23744]">*</span>
                      </label>
                      <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="flex-1 px-4 py-3 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(p => !p)}
                          className="px-3 text-[#AAAAAA] hover:text-[#555555] bg-white border-l border-[#E5E5E5]"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      {password.length > 0 && password.length < 8 && (
                        <p className="text-xs text-[#E23744] mt-1">Must be at least 8 characters</p>
                      )}
                      <p className="text-xs text-[#AAAAAA] mt-1">Used for future password login</p>
                    </div>
                  )}

                  <button
                    onClick={submitProfile}
                    disabled={!profileReady() || loading}
                    className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm mt-2"
                  >
                    {loading
                      ? (editMode ? 'Resubmitting...' : 'Setting up account...')
                      : (editMode ? 'Resubmit for approval →' : 'Register & Continue →')}
                  </button>

                  {editMode && (
                    <p className="text-center text-xs text-[#AAAAAA] pt-1">
                      <a href="/seller/login" className="text-[#FF6B2B] font-medium hover:underline">
                        Back to login
                      </a>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-xs text-[#CCCCCC] text-center">© 2025 ReelMart · Real Products. Real Sellers.</p>
      </div>
    </div>
  )
}
