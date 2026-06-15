// Address persistence — backed by Supabase `addresses` for authenticated buyers.
// Mirrors reelmart/apps/buyer-app/src/lib/savedAddresses.ts so the two clients
// stay consistent. Dedupes on (line1, pincode) per user; first address becomes
// the default automatically.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SavedAddress {
  id: string
  user_id: string
  label: string
  name: string
  phone: string
  alt_phone: string | null
  line1: string
  line2: string | null
  area: string | null
  city: string
  state: string
  pincode: string
  is_default: boolean
}

export interface AddressDraft {
  label: 'Home' | 'Work' | 'Other'
  name: string
  phone: string
  alt_phone?: string
  line1: string
  line2?: string
  area?: string
  city: string
  state: string
  pincode: string
}

export async function listAddresses(
  supabase: SupabaseClient, userId: string,
): Promise<SavedAddress[]> {
  const { data } = await supabase
    .from('addresses').select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as SavedAddress[]
}

export async function saveAddress(
  supabase: SupabaseClient, userId: string, draft: AddressDraft,
): Promise<SavedAddress> {
  const cleanedPhone = draft.phone.replace(/\D/g, '')
  const cleanedAlt   = (draft.alt_phone ?? '').replace(/\D/g, '')

  const payload = {
    user_id: userId,
    label: draft.label || 'Home',
    name: draft.name.trim(),
    phone: cleanedPhone.startsWith('91') && cleanedPhone.length === 12
      ? `+${cleanedPhone}` : `+91${cleanedPhone}`,
    alt_phone: cleanedAlt
      ? (cleanedAlt.startsWith('91') && cleanedAlt.length === 12 ? `+${cleanedAlt}` : `+91${cleanedAlt}`)
      : null,
    line1: draft.line1.trim(),
    line2: draft.line2?.trim() || null,
    area: draft.area?.trim() || null,
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
  }

  // Dedupe: same (user, line1, pincode) → update in place
  const { data: existing } = await supabase
    .from('addresses').select('id')
    .eq('user_id', userId)
    .eq('line1', payload.line1)
    .eq('pincode', payload.pincode)
    .maybeSingle()

  if (existing?.id) {
    const { data, error } = await supabase
      .from('addresses').update(payload).eq('id', existing.id).select('*').single()
    if (error) throw error
    return data as SavedAddress
  }

  const { count } = await supabase
    .from('addresses').select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  const isFirst = (count ?? 0) === 0

  const { data, error } = await supabase
    .from('addresses').insert({ ...payload, is_default: isFirst })
    .select('*').single()
  if (error) throw error
  return data as SavedAddress
}

// Update an existing address in place (edit flow). Updates by id, scoped to
// the owner; keeps the row's is_default flag untouched.
export async function updateAddress(
  supabase: SupabaseClient, userId: string, addressId: string, draft: AddressDraft,
): Promise<SavedAddress> {
  const cleanedPhone = draft.phone.replace(/\D/g, '')
  const cleanedAlt   = (draft.alt_phone ?? '').replace(/\D/g, '')

  const payload = {
    label: draft.label || 'Home',
    name: draft.name.trim(),
    phone: cleanedPhone.startsWith('91') && cleanedPhone.length === 12
      ? `+${cleanedPhone}` : `+91${cleanedPhone}`,
    alt_phone: cleanedAlt
      ? (cleanedAlt.startsWith('91') && cleanedAlt.length === 12 ? `+${cleanedAlt}` : `+91${cleanedAlt}`)
      : null,
    line1: draft.line1.trim(),
    line2: draft.line2?.trim() || null,
    area: draft.area?.trim() || null,
    city: draft.city.trim(),
    state: draft.state.trim(),
    pincode: draft.pincode.trim(),
  }

  const { data, error } = await supabase
    .from('addresses').update(payload)
    .eq('id', addressId).eq('user_id', userId)
    .select('*').single()
  if (error) throw error
  return data as SavedAddress
}

export async function setDefaultAddress(
  supabase: SupabaseClient, userId: string, addressId: string,
): Promise<void> {
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId)
  await supabase.from('addresses').update({ is_default: true })
    .eq('id', addressId).eq('user_id', userId)
}

export async function deleteAddress(
  supabase: SupabaseClient, userId: string, addressId: string,
): Promise<void> {
  const { error } = await supabase
    .from('addresses').delete()
    .eq('id', addressId).eq('user_id', userId)
  if (error) throw error
}

// ─── Google Places autocomplete helpers ───────────────────────────────────
//
// NOTE: Google's Places REST API does not allow direct browser fetch (CORS).
// These helpers call our own server-side proxy routes (/api/places/*) which
// in turn call Google server-side. The key stays off the client bundle and
// avoids CORS errors entirely.

export interface PlacePrediction {
  place_id: string
  main_text: string
  secondary_text: string
}

export async function searchPlaces(query: string): Promise<PlacePrediction[]> {
  if (!query.trim()) return []
  try {
    const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(query)}`)
    const json = await res.json()
    if (!json.success) return []
    return json.data as PlacePrediction[]
  } catch { return [] }
}

export interface PlaceDetails { formatted: string; area: string; city: string; state: string; pincode: string }

const EMPTY_PLACE: PlaceDetails = { formatted: '', area: '', city: '', state: '', pincode: '' }

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  if (!placeId) return EMPTY_PLACE
  try {
    const res = await fetch(`/api/places/details?place_id=${encodeURIComponent(placeId)}`)
    const json = await res.json()
    if (!json.success) return EMPTY_PLACE
    return { ...EMPTY_PLACE, ...json.data } as PlaceDetails
  } catch { return EMPTY_PLACE }
}

// Resolve the device's current GPS coordinates to an address via reverse
// geocoding (used by the "Use current location" button).
export async function reverseGeocode(lat: number, lng: number): Promise<PlaceDetails> {
  try {
    const res = await fetch(`/api/places/reverse?lat=${lat}&lng=${lng}`)
    const json = await res.json()
    if (!json.success) return EMPTY_PLACE
    return { ...EMPTY_PLACE, ...json.data } as PlaceDetails
  } catch { return EMPTY_PLACE }
}
