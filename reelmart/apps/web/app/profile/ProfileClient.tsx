'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, User, MapPin, Package, ChevronRight, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'

type AuthStep = 'loading' | 'unauthenticated' | 'ready'

interface Profile {
  id: string
  name: string | null
  phone: string | null
  role: string | null
}

export default function ProfileClient() {
  const supabase = createClient()
  const [authStep, setAuthStep] = useState<AuthStep>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setAuthStep('unauthenticated'); return }
      const { data } = await supabase
        .from('users').select('id, name, phone, role').eq('id', user.id).single()
      if (!data || data.role !== 'buyer') { setAuthStep('unauthenticated'); return }
      setProfile(data as Profile)
      setEditName(data.name ?? '')
      setAuthStep('ready')
    })
  }, [])

  async function saveName() {
    if (!profile) return
    const trimmed = editName.trim()
    if (!trimmed) { toast.error('Name cannot be empty'); return }
    setSaving(true)
    const { error } = await supabase
      .from('users').update({ name: trimmed }).eq('id', profile.id)
    if (error) {
      toast.error('Could not save name')
    } else {
      setProfile(p => p ? { ...p, name: trimmed } : p)
      toast.success('Name updated')
    }
    setSaving(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (authStep === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <Loader2 size={28} className="animate-spin text-primary" />
      </div>
    )
  }

  if (authStep === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-4">
        <User size={40} className="text-muted mb-4" />
        <h1 className="text-xl font-bold text-text mb-2">Sign in to view your profile</h1>
        <p className="text-sm text-secondary mb-6 text-center">Log in with your phone number to access your account.</p>
        <Link href="/" className="bg-primary text-white px-6 py-3 rounded-btn font-bold text-sm hover:opacity-90 transition">
          Go to Home
        </Link>
      </div>
    )
  }

  const displayPhone = (profile?.phone ?? '').replace(/^\+?91/, '')
  const initial = (profile?.name ?? 'B')[0].toUpperCase()
  const nameUnchanged = editName.trim() === (profile?.name ?? '')

  return (
    <div className="min-h-screen bg-surface">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-sm text-primary font-semibold">← Home</Link>
          <h1 className="font-bold text-text">My Profile</h1>
          <Link href="/orders" className="text-xs text-primary font-semibold">Orders</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {/* Avatar + phone strip */}
        <div className="bg-white rounded-card border border-border p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-white font-black text-2xl">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-text text-lg truncate">{profile?.name ?? 'Buyer'}</p>
            <p className="text-sm text-secondary mt-0.5">+91 {displayPhone}</p>
          </div>
        </div>

        {/* Edit name */}
        <div className="bg-white rounded-card border border-border p-5 space-y-4">
          <h2 className="font-bold text-text text-sm uppercase tracking-wide text-secondary">Personal Details</h2>

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1.5">Display Name</label>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
              className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary mb-1.5">Phone Number</label>
            <div className="flex rounded-btn overflow-hidden border border-border bg-surface">
              <span className="px-3.5 flex items-center text-sm text-secondary border-r border-border bg-surface select-none">+91</span>
              <input
                type="tel"
                value={displayPhone}
                readOnly
                className="flex-1 px-3.5 py-2.5 text-sm bg-surface text-secondary cursor-not-allowed outline-none"
              />
            </div>
            <p className="text-[11px] text-muted mt-1">Phone number is your login identity and cannot be changed.</p>
          </div>

          <button
            onClick={saveName}
            disabled={saving || nameUnchanged || !editName.trim()}
            className="w-full bg-primary text-white py-2.5 rounded-btn font-bold text-sm disabled:opacity-40 hover:opacity-90 transition"
          >
            {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save Changes'}
          </button>
        </div>

        {/* Quick links */}
        <div className="bg-white rounded-card border border-border overflow-hidden">
          <p className="text-xs font-bold text-secondary uppercase tracking-wide px-4 py-2.5 border-b border-border bg-surface">
            My Account
          </p>
          <Link
            href="/orders"
            className="flex items-center gap-3 px-4 py-3.5 border-b border-border hover:bg-surface transition"
          >
            <Package size={17} className="text-secondary shrink-0" />
            <span className="flex-1 text-sm font-medium text-text">My Orders</span>
            <ChevronRight size={15} className="text-muted" />
          </Link>
          <Link
            href="/addresses"
            className="flex items-center gap-3 px-4 py-3.5 border-b border-border hover:bg-surface transition"
          >
            <MapPin size={17} className="text-secondary shrink-0" />
            <span className="flex-1 text-sm font-medium text-text">Saved Addresses</span>
            <ChevronRight size={15} className="text-muted" />
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface transition"
          >
            <LogOut size={17} className="text-error shrink-0" />
            <span className="flex-1 text-left text-sm font-medium text-error">Log out</span>
          </button>
        </div>

      </main>
    </div>
  )
}
