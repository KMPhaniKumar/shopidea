'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MapPin, Plus, Star, Trash2, X, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import {
  listAddresses, saveAddress, setDefaultAddress, deleteAddress,
  type SavedAddress, type AddressDraft,
} from '@/lib/saved-addresses'
import { AddressSearch } from '@/components/AddressSearch'

type AuthStep = 'loading' | 'unauthenticated' | 'ready'

const LABELS: AddressDraft['label'][] = ['Home', 'Work', 'Other']

const EMPTY_DRAFT: AddressDraft = {
  label: 'Home',
  name: '',
  phone: '',
  alt_phone: '',
  line1: '',
  line2: '',
  area: '',
  city: '',
  state: '',
  pincode: '',
}

function AddressCard({
  address,
  onSetDefault,
  onDelete,
}: {
  address: SavedAddress
  onSetDefault: () => void
  onDelete: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    if (!confirming) { setConfirming(true); return }
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className={`bg-white rounded-card border-[1.5px] p-4 shadow-card ${address.is_default ? 'border-primary' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="bg-surface text-secondary text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
          {address.label || 'Home'}
        </span>
        {address.is_default && (
          <span className="bg-orange-50 text-primary text-[11px] font-bold px-2.5 py-1 rounded-full">
            Default
          </span>
        )}
      </div>

      {address.name ? (
        <p className="text-sm font-bold text-text mb-0.5">
          {address.name}{address.phone ? ` · ${address.phone.replace('+91', '+91 ')}` : ''}
        </p>
      ) : null}
      {address.line1 ? <p className="text-sm text-secondary leading-relaxed">{address.line1}</p> : null}
      <p className="text-sm text-secondary leading-relaxed">
        {[address.area, address.city].filter(Boolean).join(', ')}
      </p>
      {(address.state || address.pincode) ? (
        <p className="text-sm text-secondary leading-relaxed">
          {[address.state, address.pincode].filter(Boolean).join(' – ')}
        </p>
      ) : null}

      <div className="flex items-center gap-2 mt-3">
        {!address.is_default && (
          <button
            onClick={onSetDefault}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary px-3 py-1.5 rounded-full hover:bg-orange-50 transition"
          >
            <Star size={11} /> Set Default
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition border ${
            confirming
              ? 'bg-red-50 text-error border-red-200 hover:bg-red-100'
              : 'text-error border-red-200 hover:bg-red-50'
          }`}
        >
          {deleting
            ? <Loader2 size={11} className="animate-spin" />
            : <Trash2 size={11} />
          }
          {confirming ? 'Confirm delete?' : 'Delete'}
        </button>
        {confirming && !deleting && (
          <button
            onClick={() => setConfirming(false)}
            className="flex items-center gap-1 text-xs text-secondary px-2 py-1.5 rounded-full hover:bg-surface transition"
          >
            <X size={11} /> Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AddressForm({
  userId,
  onSaved,
  onCancel,
}: {
  userId: string
  onSaved: (addr: SavedAddress) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [draft, setDraft] = useState<AddressDraft>({ ...EMPTY_DRAFT })
  const [saving, setSaving] = useState(false)

  function set(field: keyof AddressDraft, value: string) {
    setDraft(d => ({ ...d, [field]: value }))
  }

  function handlePlacePick(details: { area: string; city: string; state: string; pincode: string }) {
    setDraft(d => ({
      ...d,
      area: details.area || d.area,
      city: details.city || d.city,
      state: details.state || d.state,
      pincode: details.pincode || d.pincode,
    }))
  }

  async function handleSave() {
    if (!draft.name.trim()) { toast.error('Enter contact name'); return }
    if (!/^[6-9]\d{9}$/.test(draft.phone.replace(/\D/g, '').slice(-10))) {
      toast.error('Enter a valid 10-digit phone number'); return
    }
    if (!draft.line1.trim()) { toast.error('Enter address line 1'); return }
    if (!draft.city.trim()) { toast.error('Enter city'); return }
    if (!draft.state.trim()) { toast.error('Enter state'); return }
    if (!/^\d{6}$/.test(draft.pincode.trim())) { toast.error('Enter a valid 6-digit pincode'); return }

    setSaving(true)
    try {
      const saved = await saveAddress(supabase, userId, draft)
      toast.success('Address saved')
      onSaved(saved)
    } catch {
      toast.error('Could not save address')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-card border border-border p-5 space-y-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-text text-sm">New Address</h3>
        <button onClick={onCancel} className="text-muted hover:text-secondary transition">
          <X size={16} />
        </button>
      </div>

      {/* Label */}
      <div>
        <label className="block text-xs font-semibold text-secondary mb-1.5">Address Type</label>
        <div className="flex gap-2">
          {LABELS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => set('label', l)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                draft.label === l
                  ? 'bg-primary text-white border-primary'
                  : 'bg-surface text-secondary border-border hover:border-primary'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Name + phone */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">Contact Name *</label>
          <input
            type="text"
            value={draft.name}
            onChange={e => set('name', e.target.value)}
            placeholder="Full name"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">Phone *</label>
          <div className="flex rounded-btn overflow-hidden border border-border focus-within:border-primary transition">
            <span className="px-3 flex items-center text-sm text-secondary border-r border-border bg-surface">+91</span>
            <input
              type="tel"
              value={draft.phone.replace(/\D/g, '').slice(-10)}
              onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              className="flex-1 px-3 py-2.5 text-sm outline-none text-text placeholder:text-muted"
            />
          </div>
        </div>
      </div>

      {/* Google Places search */}
      <div>
        <label className="block text-xs font-semibold text-secondary mb-1.5">Search Location</label>
        <AddressSearch onPick={handlePlacePick} placeholder="Search locality, city..." />
      </div>

      {/* Line 1 + Line 2 */}
      <div>
        <label className="block text-xs font-semibold text-secondary mb-1.5">Address Line 1 *</label>
        <input
          type="text"
          value={draft.line1}
          onChange={e => set('line1', e.target.value)}
          placeholder="House / Flat no., Street"
          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-secondary mb-1.5">Address Line 2</label>
        <input
          type="text"
          value={draft.line2 ?? ''}
          onChange={e => set('line2', e.target.value)}
          placeholder="Apartment, building (optional)"
          className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
        />
      </div>

      {/* Area + Pincode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">Area / Locality</label>
          <input
            type="text"
            value={draft.area ?? ''}
            onChange={e => set('area', e.target.value)}
            placeholder="e.g. Koramangala"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">Pincode *</label>
          <input
            type="tel"
            value={draft.pincode}
            onChange={e => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="560001"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
          />
        </div>
      </div>

      {/* City + State */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">City *</label>
          <input
            type="text"
            value={draft.city}
            onChange={e => set('city', e.target.value)}
            placeholder="e.g. Bengaluru"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-secondary mb-1.5">State *</label>
          <input
            type="text"
            value={draft.state}
            onChange={e => set('state', e.target.value)}
            placeholder="e.g. Karnataka"
            className="w-full px-3.5 py-2.5 text-sm border border-border rounded-btn outline-none focus:border-primary transition text-text placeholder:text-muted"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-primary text-white py-3 rounded-btn font-bold text-sm disabled:opacity-40 hover:opacity-90 transition flex items-center justify-center gap-2"
      >
        {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
        {saving ? 'Saving...' : 'Save Address'}
      </button>
    </div>
  )
}

export default function AddressesClient() {
  const supabase = createClient()
  const [authStep, setAuthStep] = useState<AuthStep>('loading')
  const [userId, setUserId] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<SavedAddress[]>([])
  const [loadingAddresses, setLoadingAddresses] = useState(false)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setAuthStep('unauthenticated'); return }
      const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single()
      if (profile?.role !== 'buyer') { setAuthStep('unauthenticated'); return }
      setUserId(user.id)
      setAuthStep('ready')
      loadAddrs(user.id)
    })
  }, [])

  async function loadAddrs(uid: string) {
    setLoadingAddresses(true)
    const addrs = await listAddresses(supabase, uid)
    setAddresses(addrs)
    setLoadingAddresses(false)
  }

  async function handleSetDefault(addressId: string) {
    if (!userId) return
    try {
      await setDefaultAddress(supabase, userId, addressId)
      setAddresses(prev =>
        prev.map(a => ({ ...a, is_default: a.id === addressId }))
      )
      toast.success('Default address updated')
    } catch {
      toast.error('Could not update default')
    }
  }

  async function handleDelete(addressId: string) {
    if (!userId) return
    await deleteAddress(supabase, userId, addressId)
    const updated = addresses.filter(a => a.id !== addressId)
    // If the deleted one was default, mark the next one as default in local state
    const hadDefault = addresses.find(a => a.id === addressId)?.is_default
    if (hadDefault && updated.length > 0) {
      await setDefaultAddress(supabase, userId, updated[0].id)
      updated[0] = { ...updated[0], is_default: true }
    }
    setAddresses(updated)
    toast.success('Address removed')
  }

  function handleSaved(addr: SavedAddress) {
    setShowForm(false)
    // Refresh list to pick up is_default changes from deduplication/first-address logic
    if (userId) loadAddrs(userId)
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
        <MapPin size={40} className="text-muted mb-4" />
        <h1 className="text-xl font-bold text-text mb-2">Sign in to manage addresses</h1>
        <p className="text-sm text-secondary mb-6 text-center">Log in with your phone number to view and add addresses.</p>
        <Link href="/" className="bg-primary text-white px-6 py-3 rounded-btn font-bold text-sm hover:opacity-90 transition">
          Go to Home
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      <Toaster position="top-center" />

      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/profile" className="text-sm text-primary font-semibold">← Profile</Link>
          <h1 className="font-bold text-text">Saved Addresses</h1>
          <button
            onClick={() => setShowForm(s => !s)}
            className="text-sm text-primary font-semibold flex items-center gap-1"
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? 'Cancel' : 'Add'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {showForm && userId && (
          <AddressForm
            userId={userId}
            onSaved={handleSaved}
            onCancel={() => setShowForm(false)}
          />
        )}

        {loadingAddresses ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : addresses.length === 0 && !showForm ? (
          <div className="bg-white rounded-card border border-border p-10 text-center">
            <MapPin size={40} className="text-muted mx-auto mb-3" />
            <h2 className="font-bold text-text mb-1">No saved addresses</h2>
            <p className="text-sm text-secondary mb-5">Add an address to speed up checkout.</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-btn font-bold text-sm hover:opacity-90 transition"
            >
              <Plus size={15} /> Add Address
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map(addr => (
              <AddressCard
                key={addr.id}
                address={addr}
                onSetDefault={() => handleSetDefault(addr.id)}
                onDelete={() => handleDelete(addr.id)}
              />
            ))}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="w-full flex items-center justify-center gap-2 border-[1.5px] border-dashed border-border rounded-card py-4 text-sm font-semibold text-secondary hover:border-primary hover:text-primary transition"
              >
                <Plus size={15} /> Add Another Address
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
