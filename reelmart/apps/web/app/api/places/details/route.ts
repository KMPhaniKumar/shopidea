import { NextRequest, NextResponse } from 'next/server'

// GET /api/places/details?place_id=<id>
//
// Server-side proxy for the Google Places Details API.
// Returns the structured address components (area/city/state/pincode) needed
// to auto-fill the address form fields.
//
// Env: GOOGLE_MAPS_KEY (server-only) or NEXT_PUBLIC_GOOGLE_MAPS_KEY (fallback).
// The key must NOT have HTTP-referrer restrictions — use IP or no restriction.

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('place_id')?.trim()
  if (!placeId) {
    return NextResponse.json({ success: false, error: 'place_id is required' }, { status: 400 })
  }

  const key = process.env.GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  if (!key) {
    return NextResponse.json({ success: false, error: 'Google Maps key not configured' }, { status: 503 })
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&key=${key}&fields=address_components,formatted_address&language=en`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    const json = await res.json()

    if (json.status !== 'OK') {
      return NextResponse.json(
        { success: false, error: `Places API error: ${json.status}` },
        { status: 502 },
      )
    }

    const c: any[] = json.result?.address_components ?? []
    const get = (...types: string[]): string => {
      for (const t of types) {
        const m = c.find((x) => x.types.includes(t))
        if (m?.long_name) return m.long_name
      }
      return ''
    }

    const details = {
      // Full human-readable address — used to fill the "Area / Locality" box.
      formatted: (json.result?.formatted_address as string) ?? '',
      area: get('sublocality_level_1', 'sublocality_level_2', 'sublocality', 'neighborhood', 'locality'),
      city: get('administrative_area_level_2', 'locality', 'administrative_area_level_1'),
      state: get('administrative_area_level_1'),
      pincode: get('postal_code'),
    }

    return NextResponse.json({ success: true, data: details })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Upstream fetch failed' },
      { status: 502 },
    )
  }
}
