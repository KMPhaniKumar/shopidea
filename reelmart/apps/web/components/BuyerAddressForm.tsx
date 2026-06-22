'use client'

// Shared buyer address form — used by both checkout and the profile addresses
// page so the add/edit experience is identical everywhere.
//
// Flow the product asked for:
//   1. Google search box (or "Use current location") → fills Area / Locality
//      with the full resolved address, and silently derives city/state/pincode.
//   2. Flat / Home / Building, Full name, 10-digit mobile.
//   3. Pincode stays visible + editable as a safety net.
//
// On save it hands the parent a complete AddressDraft.

import { useEffect, useRef, useState } from 'react'
import { Search, Loader2, LocateFixed } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  searchPlaces,
  fetchPlaceDetails,
  reverseGeocode,
  type PlacePrediction,
  type PlaceDetails,
  type AddressDraft,
} from '@/lib/saved-addresses'
import { lookupPincode } from '@/lib/pincode-lookup'

type Draft = {
  label: 'Home' | 'Work' | 'Other'
  name: string
  phone: string
  line1: string
  area: string
  city: string
  state: string
  pincode: string
}

const EMPTY: Draft = { label: 'Home', name: '', phone: '', line1: '', area: '', city: '', state: '', pincode: '' }

export function BuyerAddressForm({
  initial,
  defaultPhone,
  saving,
  onSave,
  onCancel,
}: {
  initial?: Partial<AddressDraft>
  defaultPhone?: string
  saving: boolean
  onSave: (draft: AddressDraft) => void | Promise<void>
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<Draft>({
    ...EMPTY,
    ...(initial as Partial<Draft>),
    phone: (initial?.phone as string) || defaultPhone || '',
  })
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  // Pincode-driven city/state lookup. `failed` un-locks the fields for manual
  // entry when the lookup can't resolve the pincode.
  const [pinLookup, setPinLookup] = useState<{ loading: boolean; failed: boolean }>({ loading: false, failed: false })
  const lastLookedUp = useRef<string>('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }))

  // Whenever the pincode reaches 6 digits (typed, from search, or from current
  // location) resolve city + state and lock them — pincode is the source of truth.
  useEffect(() => {
    const pin = draft.pincode
    if (!/^\d{6}$/.test(pin)) { setPinLookup({ loading: false, failed: false }); return }
    if (pin === lastLookedUp.current) return
    lastLookedUp.current = pin
    let cancelled = false
    setPinLookup({ loading: true, failed: false })
    lookupPincode(pin).then(({ city, state, ok }) => {
      if (cancelled) return
      if (ok && state) {
        setDraft(d => ({ ...d, city: city ?? d.city, state }))
        setPinLookup({ loading: false, failed: !city })
      } else {
        setPinLookup({ loading: false, failed: true })
      }
    })
    return () => { cancelled = true }
  }, [draft.pincode])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setPredictions([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      setPredictions(await searchPlaces(query))
      setSearching(false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Apply a resolved place to the form: full address → Area/Locality, plus the
  // derived city/state/pincode.
  function applyPlace(p: PlaceDetails) {
    setDraft(d => ({
      ...d,
      area: p.formatted || p.area || d.area,
      city: p.city || d.city,
      state: p.state || d.state,
      pincode: p.pincode || d.pincode,
    }))
  }

  async function pickPrediction(p: PlacePrediction) {
    setQuery('')
    setPredictions([])
    applyPlace(await fetchPlaceDetails(p.place_id))
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      toast.error('Location is not available on this device')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
        setLocating(false)
        if (!place.formatted && !place.pincode) {
          toast.error('Could not detect your address — try the search box')
          return
        }
        applyPlace(place)
        toast.success('Location detected')
      },
      () => {
        setLocating(false)
        toast.error('Location permission denied — try the search box')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  function submit() {
    if (!draft.area.trim()) return toast.error('Search your location or use current location')
    if (!draft.line1.trim()) return toast.error('Enter your flat / home / building')
    if (!draft.name.trim()) return toast.error('Enter the full name')
    if (!/^[6-9]\d{9}$/.test(draft.phone.replace(/\D/g, ''))) return toast.error('Enter a valid 10-digit mobile number')
    if (!/^\d{6}$/.test(draft.pincode)) return toast.error('Enter a valid 6-digit pincode')
    if (!draft.city.trim() || !draft.state.trim()) {
      return toast.error('Please pick your location from search so we can detect city & state')
    }
    onSave({
      label: draft.label,
      name: draft.name.trim(),
      phone: draft.phone.replace(/\D/g, ''),
      line1: draft.line1.trim(),
      area: draft.area.trim(),
      city: draft.city.trim(),
      state: draft.state.trim(),
      pincode: draft.pincode,
    })
  }

  return (
    <div className="space-y-3">
      {/* Label chips */}
      <div className="flex gap-2">
        {(['Home', 'Work', 'Other'] as const).map(l => (
          <button key={l} type="button" onClick={() => set('label')(l)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
              draft.label === l ? 'bg-[#FF6B2B] text-white border-[#FF6B2B]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Use current location */}
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex items-center gap-2 w-full justify-center py-2.5 rounded-xl border border-[#FF6B2B] text-[#FF6B2B] text-sm font-semibold hover:bg-[#FF6B2B]/5 disabled:opacity-50"
      >
        {locating ? <Loader2 className="animate-spin" size={15} /> : <LocateFixed size={15} />}
        {locating ? 'Detecting location…' : 'Use current location'}
      </button>

      {/* Search */}
      <div className="relative">
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF6B2B] transition">
          <Search size={14} className="text-gray-400 ml-3 shrink-0" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your address, area or landmark"
            className="flex-1 px-2.5 py-2.5 text-sm outline-none"
          />
          {searching && <Loader2 className="animate-spin text-gray-400 mr-3 shrink-0" size={14} />}
        </div>
        {predictions.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
            {predictions.map(p => (
              <li key={p.place_id}>
                <button type="button" onClick={() => pickPrediction(p)}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{p.main_text}</p>
                  <p className="text-xs text-gray-500 truncate">{p.secondary_text}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Area / Locality — holds the full searched / detected address */}
      <Field label="Area / Locality" required>
        <textarea
          value={draft.area}
          onChange={e => set('area')(e.target.value)}
          rows={2}
          placeholder="Pick from search above, or use current location"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition resize-none"
        />
      </Field>

      <Field label="Flat / Home / Building No." required>
        <input value={draft.line1} onChange={e => set('line1')(e.target.value)}
          placeholder="e.g. B-403, Aparna Cyber Commune"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition" />
      </Field>

      <Field label="Full Name" required>
        <input value={draft.name} onChange={e => set('name')(e.target.value)}
          placeholder="Recipient's name"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Mobile Number" required>
          <div className="flex border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF6B2B] transition">
            <span className="px-2.5 bg-gray-50 flex items-center text-xs text-gray-600 border-r border-gray-200">+91</span>
            <input value={draft.phone} onChange={e => set('phone')(e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric" placeholder="9876543210"
              className="flex-1 px-2.5 py-2.5 text-sm outline-none" />
          </div>
        </Field>
        <Field label="Pincode" required>
          <div className="relative">
            <input value={draft.pincode} onChange={e => set('pincode')(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric" placeholder="500019"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition" />
            {pinLookup.loading && <Loader2 className="animate-spin text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" size={14} />}
          </div>
        </Field>
      </div>

      {/* City + State — auto-filled from pincode and locked (editable only if the
          lookup couldn't resolve the pincode). */}
      <div className="grid grid-cols-2 gap-2">
        <Field label="City" required>
          <input value={draft.city} onChange={e => set('city')(e.target.value)}
            readOnly={!pinLookup.failed}
            placeholder="Auto-filled from pincode"
            className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition ${!pinLookup.failed ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
        </Field>
        <Field label="State" required>
          <input value={draft.state} onChange={e => set('state')(e.target.value)}
            readOnly={!pinLookup.failed}
            placeholder="Auto-filled from pincode"
            className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition ${!pinLookup.failed ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
        </Field>
      </div>
      {pinLookup.failed && (
        <p className="text-xs text-[#E2A03F] -mt-1">Couldn&apos;t auto-detect city &amp; state for this pincode — please enter them.</p>
      )}

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        )}
        <button type="button" onClick={submit} disabled={saving}
          className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-[#e55a1f]">
          {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save Address'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{required && <span className="text-[#E23744]"> *</span>}
      </span>
      {children}
    </label>
  )
}
