'use client'
import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const IS_DEV = process.env.NODE_ENV === 'development'

export default function SellerLogin() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const supabase = createClient()
  const router = useRouter()

  function startCountdown() {
    setCountdown(60)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  async function sendOTP() {
    setLoading(true)
    const formatted = phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '')}`
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    if (error) { toast.error(error.message); setLoading(false); return }
    setStep('otp')
    startCountdown()
    toast.success('OTP sent!')
    setLoading(false)
  }

  async function verifyOTP() {
    setLoading(true)
    try {
      const formatted = phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '')}`
      const { data, error } = await supabase.auth.verifyOtp({ phone: formatted, token: otp, type: 'sms' })
      if (error) { toast.error(error.message || 'Invalid OTP'); setLoading(false); return }
      if (!data?.session) { toast.error('Session not created. Try again.'); setLoading(false); return }
      toast.success('Login successful!')
      setLoading(false)
      router.refresh()
      router.push('/seller/dashboard')
    } catch (err) {
      toast.error('Verification failed: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setLoading(false)
    }
  }

  function devLogin() {
    router.push('/seller/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12 relative overflow-hidden">
      <Toaster />
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-[#FF6B2B]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-[#00B98E]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

        {/* Logo */}
        <Image src="/logo.png" alt="ReelMart" width={300} height={110} className="object-contain mb-6" />

        {/* Tagline */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#1A1A1A] leading-snug mb-2">
            Sell more. <span className="text-[#FF6B2B]">Grow faster.</span>
          </h2>
          <p className="text-[#888888] text-sm leading-relaxed">
            India's smartest seller dashboard for WhatsApp & Instagram commerce.
          </p>
        </div>

        {/* Form card */}
        <div className="w-full bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-8">
          {/* accent bar */}
          <div className="flex gap-1 mb-6">
            <div className="h-1 w-10 rounded-full bg-[#FF6B2B]" />
            <div className="h-1 w-4 rounded-full bg-[#00B98E]" />
          </div>
          <div className="mb-6">
            <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Welcome back 👋</h1>
            <p className="text-[#888888] text-sm">Sign in to your seller account</p>
          </div>

          {step === 'phone' ? (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Phone Number</label>
                <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                  <span className="inline-flex items-center px-4 bg-[#F9F9F9] text-[#666666] text-sm font-medium border-r border-[#E5E5E5]">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="flex-1 px-4 py-3.5 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                  />
                </div>
              </div>

              <button
                onClick={sendOTP}
                disabled={phone.length !== 10 || loading}
                className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm"
              >
                {loading ? 'Sending OTP...' : 'Send OTP →'}
              </button>

              {IS_DEV && (
                <button
                  onClick={devLogin}
                  className="w-full border border-dashed border-[#FF6B2B] text-[#FF6B2B] py-3 rounded-xl font-semibold text-sm hover:bg-orange-50 transition-colors"
                >
                  Dev Login (skip OTP)
                </button>
              )}

              <p className="text-center text-xs text-[#AAAAAA] pt-2">
                New seller?{' '}
                <a href="/seller/register" className="text-[#FF6B2B] font-medium hover:underline">Register here</a>
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Enter OTP</label>
                <p className="text-xs text-[#888888] mb-3">Sent to +91 {phone}</p>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="• • • • • •"
                  className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-center tracking-[0.5em] text-xl font-bold outline-none focus:border-[#FF6B2B] transition-colors"
                  autoFocus
                />
              </div>

              <button
                onClick={verifyOTP}
                disabled={otp.length !== 6 || loading}
                className="w-full bg-[#00B98E] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#009e79] transition-colors shadow-sm"
              >
                {loading ? 'Verifying...' : 'Verify & Sign In →'}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep('phone')}
                  className="text-sm text-[#888888] hover:text-[#1A1A1A] transition-colors"
                >
                  ← Change number
                </button>
                <button
                  onClick={sendOTP}
                  disabled={countdown > 0}
                  className="text-sm text-[#FF6B2B] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-xs text-[#CCCCCC] text-center">
          © 2025 ReelMart · Real Products. Real Sellers.
        </p>
      </div>

    </div>
  )
}
