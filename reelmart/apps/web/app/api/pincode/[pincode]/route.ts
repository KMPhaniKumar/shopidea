import { NextResponse } from 'next/server'
import { stateForPincode } from '@/lib/pincode-state'

// Pincode → { city, state } resolver.
//
// Primary source: India Post's free public API (no key required). It returns
// the District (our "city") and State for a 6-digit pincode. If it's
// unreachable / returns nothing, we fall back to the offline prefix map in
// lib/pincode-state.ts for the state (city stays null and the form lets the
// seller/buyer type it manually).
//
// Server-side so the third-party call is centralised and CORS-free.

const INDIA_POST_URL = 'https://api.postalpincode.in/pincode'

// Keep API spellings aligned with lib/pincode-state.ts and the interstate-GST
// checks (which compare on these names).
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw.trim().replace(/\s+and\s+/gi, ' & ')
}

async function lookupFromIndiaPost(pincode: string): Promise<{ city: string | null; state: string | null } | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(`${INDIA_POST_URL}/${pincode}`, { signal: controller.signal })
    if (!res.ok) return null
    const json = await res.json()
    const entry = Array.isArray(json) ? json[0] : null
    const offices = entry?.PostOffice
    if (entry?.Status !== 'Success' || !Array.isArray(offices) || offices.length === 0) return null
    return {
      city: (offices[0].District ?? '').trim() || null,
      state: normalizeState(offices[0].State),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(_req: Request, { params }: { params: { pincode: string } }) {
  const pincode = (params.pincode ?? '').trim()
  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ success: false, error: 'Pincode must be 6 digits', code: 'INVALID_PINCODE' }, { status: 400 })
  }

  const apiResult = await lookupFromIndiaPost(pincode)
  if (apiResult && apiResult.state) {
    return NextResponse.json({ success: true, data: { city: apiResult.city, state: apiResult.state } })
  }

  // Fallback: offline prefix map gives us the state only.
  const fallbackState = stateForPincode(pincode)
  if (fallbackState) {
    return NextResponse.json({ success: true, data: { city: apiResult?.city ?? null, state: fallbackState } })
  }

  return NextResponse.json({ success: false, error: 'Could not resolve pincode', code: 'PINCODE_NOT_FOUND' }, { status: 404 })
}
