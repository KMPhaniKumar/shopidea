'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Toaster } from 'react-hot-toast'
import { User, LogOut, Package, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import BuyerLoginModal from './BuyerLoginModal'

// Home-header auth control. Shows a "Login" button when signed out, and an
// account menu (My Orders / Log out) when a BUYER session exists. Seller/admin
// sessions are not treated as buyers here — the marketplace home is buyer-facing.
export default function BuyerAuthNav() {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [phone, setPhone] = useState<string | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<'login' | 'signup' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  async function refresh() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setPhone(null); setName(null); setReady(true); return
    }
    const { data: profile } = await supabase
      .from('users').select('role, name, phone').eq('id', user.id).single()
    if (profile?.role === 'buyer') {
      setPhone((profile.phone ?? user.phone ?? '').replace(/^\+?91/, ''))
      setName(profile.name ?? null)
    } else {
      setPhone(null); setName(null)
    }
    setReady(true)
  }

  useEffect(() => { refresh() }, [])

  // Close the account menu on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function logout() {
    await supabase.auth.signOut()
    setMenuOpen(false)
    setPhone(null)
    setName(null)
  }

  const loggedIn = !!phone

  return (
    <>
      <Toaster position="top-center" />

      {!ready ? (
        <div className="h-10 w-[88px] rounded-btn bg-surface animate-pulse" />
      ) : loggedIn ? (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="inline-flex h-10 px-3 items-center gap-2 rounded-btn border border-border text-primary text-sm font-medium hover:bg-surface transition"
          >
            <User size={16} />
            <span className="hidden sm:inline max-w-[120px] truncate">{name || `+91 ${phone}`}</span>
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-border rounded-card shadow-hover py-1 z-50">
              <Link
                href="/orders"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-text hover:bg-surface"
              >
                <Package size={15} /> My Orders
              </Link>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-error hover:bg-surface"
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setModalMode('login')}
            className="h-10 px-3 text-sm font-medium text-primary hover:opacity-80"
          >
            Log in
          </button>
          <button
            onClick={() => setModalMode('signup')}
            className="inline-flex h-10 px-4 items-center rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
          >
            Sign up
          </button>
        </div>
      )}

      <BuyerLoginModal
        open={modalMode !== null}
        mode={modalMode ?? 'login'}
        onClose={() => setModalMode(null)}
        onSuccess={() => { setModalMode(null); refresh() }}
      />
    </>
  )
}
