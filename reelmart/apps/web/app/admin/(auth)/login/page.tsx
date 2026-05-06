'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const IS_DEV = process.env.NODE_ENV === 'development'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const { data: user } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', data.user.id)
      .single()

    if (!user?.is_admin) {
      await supabase.auth.signOut()
      setError('You do not have admin access.')
      setLoading(false)
      return
    }

    router.push('/admin')
  }

  function devLogin() {
    router.push('/admin/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12 relative overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-[#FF6B2B]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-[#00B98E]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

        {/* Logo */}
        <Image src="/logo.png" alt="ReelMart" width={300} height={110} className="object-contain mb-6" />

        {/* Tagline */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#1A1A1A] leading-snug mb-2">
            Command centre. <span className="text-[#FF6B2B]">Full control.</span>
          </h2>
          <p className="text-[#888888] text-sm leading-relaxed">
            Manage sellers, orders, payouts and platform settings from one place.
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
            <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Admin Sign In 🔐</h1>
            <p className="text-[#888888] text-sm">Access restricted to authorized admins only</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@reelmart.in"
                required
                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#FF6B2B] transition-colors placeholder:text-[#BBBBBB]"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#00B98E] transition-colors placeholder:text-[#BBBBBB]"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm"
            >
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>

            {IS_DEV && (
              <button
                type="button"
                onClick={devLogin}
                disabled={loading}
                className="w-full border border-dashed border-[#FF6B2B] text-[#FF6B2B] py-3 rounded-xl font-semibold text-sm hover:bg-orange-50 transition-colors disabled:opacity-40"
              >
                Dev Login (skip auth)
              </button>
            )}
          </form>
        </div>

        <p className="mt-8 text-xs text-[#CCCCCC] text-center">
          © 2025 ReelMart · Real Products. Real Sellers.
        </p>
      </div>

    </div>
  )
}
