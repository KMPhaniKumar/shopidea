// Client helper: resolve a 6-digit pincode to its city + state via the
// same-origin /api/pincode/[pincode] proxy (India Post + offline fallback).
//
// `ok` is true when we got a usable result. `city` may still be null even when
// ok is true (offline-fallback path returns state only) — callers should let
// the user type the city manually in that case.

export interface PincodeResult {
  city: string | null
  state: string | null
  ok: boolean
}

export async function lookupPincode(pincode: string): Promise<PincodeResult> {
  if (!/^\d{6}$/.test(pincode)) return { city: null, state: null, ok: false }
  try {
    const res = await fetch(`/api/pincode/${pincode}`)
    const json = await res.json()
    if (!res.ok || !json.success) return { city: null, state: null, ok: false }
    return { city: json.data.city ?? null, state: json.data.state ?? null, ok: true }
  } catch {
    return { city: null, state: null, ok: false }
  }
}
