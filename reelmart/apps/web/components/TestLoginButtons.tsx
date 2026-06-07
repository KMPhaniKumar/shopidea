'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

// OTP-less test login buttons. Render NOTHING unless NEXT_PUBLIC_ALLOW_TEST_LOGIN
// === 'true' (set on dev only). Calls the gated admin-service /test-login endpoint
// (which itself only works when ALLOW_TEST_LOGIN is on), drops the returned
// Supabase session into the browser client, then navigates / signals success.
const ENABLED = process.env.NEXT_PUBLIC_ALLOW_TEST_LOGIN === 'true'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

type Role = 'buyer' | 'seller' | 'admin'

export default function TestLoginButtons({
  roles,
  redirectTo,
  onDone,
}: {
  roles: Role[]
  // For server-gated areas (seller/admin) pass a hard-nav destination so the
  // just-set auth cookies are carried on the next request.
  redirectTo?: Partial<Record<Role, string>>
  onDone?: (role: Role, userId: string) => void
}) {
  const [busy, setBusy] = useState<Role | null>(null)
  if (!ENABLED) return null

  async function login(role: Role) {
    setBusy(role)
    try {
      const res = await fetch(`${API_URL}/api/admin/auth/test-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.success) throw new Error(json?.error ?? 'Test login failed')

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({
        access_token: json.data.session.access_token,
        refresh_token: json.data.session.refresh_token,
      })
      if (error) throw error

      toast.success(`Logged in as test ${role}`)
      const dest = redirectTo?.[role]
      if (dest) window.location.assign(dest)
      else onDone?.(role, json.data.userId)
    } catch (e: any) {
      toast.error(e?.message ?? 'Test login failed')
      setBusy(null)
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-dashed border-amber-300">
      <p className="text-[10px] uppercase tracking-wide text-amber-600 font-bold mb-2">🛠 Test login — dev only</p>
      <div className="flex flex-wrap gap-2">
        {roles.map(r => (
          <button
            key={r}
            type="button"
            disabled={busy !== null}
            onClick={() => login(r)}
            className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold hover:bg-amber-200 disabled:opacity-50 capitalize"
          >
            {busy === r ? '…' : `Skip → ${r}`}
          </button>
        ))}
      </div>
    </div>
  )
}
