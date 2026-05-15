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

export async function setDefaultAddress(
  supabase: SupabaseClient, userId: string, addressId: string,
): Promise<void> {
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId)
  await supabase.from('addresses').update({ is_default: true })
    .eq('id', addressId).eq('user_id', userId)
}

// ─── Google Places autocomplete helpers ───────────────────────────────────

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''

export interface PlacePrediction {
  place_id: string
  main_text: string
  secondary_text: string
}

export async function searchPlaces(query: string): Promise<PlacePrediction[]> {
  if (!query.trim() || !MAPS_KEY) return []
  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json`
    + `?input=${encodeURIComponent(query)}`
    + `&key=${MAPS_KEY}&language=en&components=country:in&types=geocode`
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.status !== 'OK') return []
    return json.predictions.map((p: any) => ({
      place_id: p.place_id,
      main_text: p.structured_formatting?.main_text ?? p.description,
      secondary_text: p.structured_formatting?.secondary_text ?? '',
    }))
  } catch { return [] }
}

export interface PlaceDetails { area: string; city: string; state: string; pincode: string }

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  if (!MAPS_KEY) return { area: '', city: '', state: '', pincode: '' }
  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${placeId}&key=${MAPS_KEY}&fields=address_components&language=en`
  try {
    const res = await fetch(url)
    const json = await res.json()
    const c = json.result?.address_components ?? []
    const get = (...types: string[]) => {
      for (const t of types) {
        const m = c.find((x: any) => x.types.includes(t))
        if (m?.long_name) return m.long_name
      }
      return ''
    }
    return {
      area: get('sublocality_level_1', 'sublocality_level_2', 'sublocality', 'neighborhood', 'locality'),
      city: get('administrative_area_level_2', 'locality', 'administrative_area_level_1'),
      state: get('administrative_area_level_1'),
      pincode: get('postal_code'),
    }
  } catch { return { area: '', city: '', state: '', pincode: '' } }
}
