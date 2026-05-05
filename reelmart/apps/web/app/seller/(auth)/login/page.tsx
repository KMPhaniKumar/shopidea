'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

const IS_DEV = process.env.NODE_ENV === 'development'
const DEV_EMAIL = 'dev@reelmart.in'
const DEV_PASSWORD = 'devpassword123'

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

  async function verifyOTP(overridePhone?: string, overrideOtp?: string) {
    setLoading(true)
    try {
      const formatted = overridePhone ?? (phone.startsWith('+91') ? phone : `+91${phone.replace(/\D/g, '')}`)
      const token = overrideOtp ?? otp
      const { data, error } = await supabase.auth.verifyOtp({ phone: formatted, token, type: 'sms' })
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
    <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center p-4">
      <Toaster />
      <div className="bg-white rounded-2xl shadow-sm p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-1">
            <span className="text-[#FF6B2B]">Reel</span>Mart
          </h1>
          <p className="text-[#666666] text-sm">Seller Dashboard</p>
        </div>

        {step === 'phone' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Phone Number</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-[#EEEEEE] bg-[#F9F9F9] text-[#666666] text-sm">+91</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="flex-1 border border-[#EEEEEE] rounded-r-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B2B]"
                />
              </div>
            </div>
            <button
              onClick={sendOTP}
              disabled={phone.length !== 10 || loading}
              className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#e55a1f] transition-colors"
            >
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
            {IS_DEV && (
              <button
                onClick={devLogin}
                disabled={loading}
                className="w-full border border-dashed border-[#FF6B2B] text-[#FF6B2B] py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 hover:bg-orange-50 transition-colors"
              >
                Dev Login (skip OTP)
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">Enter OTP</label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit OTP"
                className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#FF6B2B] text-center tracking-widest text-lg"
                autoFocus
              />
            </div>
            <button
              onClick={() => verifyOTP()}
              disabled={otp.length !== 6 || loading}
              className="w-full bg-[#FF6B2B] text-white py-2.5 rounded-lg font-semibold disabled:opacity-50 hover:bg-[#e55a1f] transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button
              onClick={sendOTP}
              disabled={countdown > 0}
              className="w-full text-[#666666] text-sm py-2 disabled:opacity-40"
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
