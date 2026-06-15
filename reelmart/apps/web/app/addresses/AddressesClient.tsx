'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, MapPin, Plus, Star, Trash2, X, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import {
  listAddresses, saveAddress, updateAddress, setDefaultAddress, deleteAddress,
  type SavedAddress, type AddressDraft,
} from '@/lib/saved-addresses'
import { BuyerAddressForm } from '@/components/BuyerAddressForm'

type AuthStep = 'loading' | 'unauthenticated' | 'ready'

// Map a stored address to the form's initial draft (edit flow).
function toInitial(a: SavedAddress): Partial<AddressDraft> {
  return {
    label: (a.label as AddressDraft['label']) || 'Home',
    name: a.name,
    phone: (a.phone || '').replace(/^\+?91/, ''),
    line1: a.line1,
    line2: a.line2 ?? '',
    area: a.area ?? '',
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  }
}

function AddressCard({
  address,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  address: SavedAddress
  onSetDefault: () => void
  onEdit: () => void
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
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs font-semibold text-secondary border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
        >
          <Pencil size={11} /> Edit
        </button>
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

// Thin wrapper around the shared BuyerAddressForm. Handles add (saveAddress)
// and edit (updateAddress) via the optional addressId.
function AddressFormCard({
  userId,
  initial,
  addressId,
  onSaved,
  onCancel,
}: {
  userId: string
  initial?: Partial<AddressDraft>
  addressId?: string
  onSaved: (addr: SavedAddress) => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  async function handleSave(draft: AddressDraft) {
    setSaving(true)
    try {
      const saved = addressId
        ? await updateAddress(supabase, userId, addressId, draft)
        : await saveAddress(supabase, userId, draft)
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
        <h3 className="font-bold text-text text-sm">{addressId ? 'Edit Address' : 'New Address'}</h3>
        <button onClick={onCancel} className="text-muted hover:text-secondary transition">
          <X size={16} />
        </button>
      </div>
      <BuyerAddressForm initial={initial} saving={saving} onSave={handleSave} onCancel={onCancel} />
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
  const [editing, setEditing] = useState<SavedAddress | null>(null)

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
    const hadDefault = addresses.find(a => a.id === addressId)?.is_default
    if (hadDefault && updated.length > 0) {
      await setDefaultAddress(supabase, userId, updated[0].id)
      updated[0] = { ...updated[0], is_default: true }
    }
    setAddresses(updated)
    toast.success('Address removed')
  }

  function handleSaved() {
    setShowForm(false)
    setEditing(null)
    if (userId) loadAddrs(userId)
  }

  function startAdd() { setEditing(null); setShowForm(true) }
  function startEdit(a: SavedAddress) { setShowForm(false); setEditing(a) }
  function closeForm() { setShowForm(false); setEditing(null) }

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

  const formOpen = showForm || !!editing

  return (
    <div className="min-h-screen bg-surface">
      <Toaster position="top-center" />

      <header className="bg-white border-b border-border sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/profile" className="text-sm text-primary font-semibold">← Profile</Link>
          <h1 className="font-bold text-text">Saved Addresses</h1>
          <button
            onClick={() => (formOpen ? closeForm() : startAdd())}
            className="text-sm text-primary font-semibold flex items-center gap-1"
          >
            {formOpen ? <X size={14} /> : <Plus size={14} />}
            {formOpen ? 'Cancel' : 'Add'}
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5 space-y-4 pb-12">

        {formOpen && userId && (
          <AddressFormCard
            userId={userId}
            initial={editing ? toInitial(editing) : undefined}
            addressId={editing?.id}
            onSaved={handleSaved}
            onCancel={closeForm}
          />
        )}

        {loadingAddresses ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : addresses.length === 0 && !formOpen ? (
          <div className="bg-white rounded-card border border-border p-10 text-center">
            <MapPin size={40} className="text-muted mx-auto mb-3" />
            <h2 className="font-bold text-text mb-1">No saved addresses</h2>
            <p className="text-sm text-secondary mb-5">Add an address to speed up checkout.</p>
            <button
              onClick={startAdd}
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
                onEdit={() => startEdit(addr)}
                onDelete={() => handleDelete(addr.id)}
              />
            ))}
            {!formOpen && (
              <button
                onClick={startAdd}
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
