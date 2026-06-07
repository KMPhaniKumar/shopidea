'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  sendOtp as msg91Send,
  verifyOtp as msg91Verify,
  exchangeForSupabaseSession,
  preloadOtpWidget,
  CAPTCHA_CONTAINER_ID,
} from '@/lib/msg91-otp'
import TestLoginButtons from './TestLoginButtons'

// Reusable buyer phone → OTP login, shown as a centered modal. Drives the same
// MSG91 widget flow used by checkout / orders (lib/msg91-otp). preloadOtpWidget
// is called when the phone step opens so the captcha renders alongside the input
// (otherwise the first "Send OTP" click fails with "invalid captcha").
export default function BuyerLoginModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  onSuccess?: (userId: string) => void
}) {
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  // Reset to a clean phone step each time the modal is opened.
  useEffect(() => {
    if (open) {
      setStep('phone')
      setOtp('')
      setLoading(false)
    }
  }, [open])

  // Init the MSG91 widget (and its captcha) when the phone step is visible.
  useEffect(() => {
    if (open && step === 'phone') preloadOtpWidget().catch(() => {})
  }, [open, step])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSendOtp() {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit number')
      return
    }
    setLoading(true)
    try {
      await msg91Send(`+91${phone}`)
      toast.success('OTP sent!')
      setStep('otp')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not send OTP')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      toast.error('Enter the 6-digit code')
      return
    }
    setLoading(true)
    try {
      const { accessToken } = await msg91Verify(otp)
      const { userId } = await exchangeForSupabaseSession(accessToken, 'buyer')
      toast.success('Logged in!')
      onSuccess?.(userId)
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-card shadow-hover p-6 relative"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted hover:text-text"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-text mb-1">Login</h2>
        <p className="text-sm text-secondary mb-6">
          {step === 'phone'
            ? 'Verify your phone number to continue.'
            : `Enter the code sent to +91 ${phone}`}
        </p>

        {step === 'phone' && (
          <>
            <label className="block text-xs font-semibold text-secondary mb-1">Phone Number</label>
            <div className="flex rounded-btn overflow-hidden border border-border focus-within:border-primary">
              <span className="px-4 bg-surface flex items-center text-sm text-secondary border-r border-border">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="flex-1 px-4 py-3 text-sm outline-none"
                autoFocus
              />
            </div>
            <div id={CAPTCHA_CONTAINER_ID} className="mt-3 empty:hidden" />
            <button
              onClick={handleSendOtp}
              disabled={phone.length !== 10 || loading}
              className="mt-4 w-full bg-primary text-white py-3 rounded-btn font-bold text-sm disabled:opacity-40 hover:opacity-90 transition"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Send OTP →'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <label className="block text-xs font-semibold text-secondary mb-1">OTP</label>
            <input
              type="tel"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • • • •"
              className="w-full px-4 py-3 text-xl font-bold text-center tracking-[0.5em] border border-border rounded-btn outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setStep('phone')}
                className="flex-1 py-3 rounded-btn border border-border text-sm font-semibold text-secondary hover:bg-surface"
              >
                ← Change number
              </button>
              <button
                onClick={handleVerifyOtp}
                disabled={otp.length !== 6 || loading}
                className="flex-1 bg-primary text-white py-3 rounded-btn font-bold text-sm disabled:opacity-40 hover:opacity-90 transition"
              >
                {loading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Verify →'}
              </button>
            </div>
          </>
        )}

        <TestLoginButtons
          roles={['buyer']}
          onDone={(_role, userId) => { onSuccess?.(userId); onClose() }}
        />
      </div>
    </div>
  )
}
