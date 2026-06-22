// Resolve a 6-digit pincode to its city + state.
//
// Primary: India Post's free public API (no key, no CORS issue in RN).
// Fallback: the offline prefix map in pincode-state.ts (state only).
//
// `ok` is true when we got a usable result; `city` may be null on the
// offline-fallback path, in which case the form should let the user type it.

import { stateForPincode } from './pincode-state'

const INDIA_POST_URL = 'https://api.postalpincode.in/pincode'

export interface PincodeResult {
  city: string | null
  state: string | null
  ok: boolean
}

function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw.trim().replace(/\s+and\s+/gi, ' & ')
}

export async function lookupPincode(pincode: string): Promise<PincodeResult> {
  if (!/^\d{6}$/.test(pincode)) return { city: null, state: null, ok: false }

  let apiCity: string | null = null
  let apiState: string | null = null
  try {
    const res = await fetch(`${INDIA_POST_URL}/${pincode}`)
    const json = await res.json()
    const entry = Array.isArray(json) ? json[0] : null
    const offices = entry?.PostOffice
    if (entry?.Status === 'Success' && Array.isArray(offices) && offices.length > 0) {
      apiCity = (offices[0].District ?? '').trim() || null
      apiState = normalizeState(offices[0].State)
    }
  } catch {
    // fall through to offline map
  }

  if (apiState) return { city: apiCity, state: apiState, ok: true }

  const fallbackState = stateForPincode(pincode)
  if (fallbackState) return { city: apiCity, state: fallbackState, ok: true }

  return { city: null, state: null, ok: false }
}
