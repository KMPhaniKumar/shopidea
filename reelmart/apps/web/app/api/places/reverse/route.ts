import { NextRequest, NextResponse } from 'next/server'

// GET /api/places/reverse?lat=<lat>&lng=<lng>
//
// Server-side proxy for the Google Geocoding API (reverse geocoding). Takes the
// browser's / device's current-location coordinates and resolves them to a
// human-readable address plus structured components (area/city/state/pincode),
// mirroring the /api/places/details response shape so the same form code can
// consume either.
//
// Env: GOOGLE_MAPS_KEY (server-only) or NEXT_PUBLIC_GOOGLE_MAPS_KEY (fallback).

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get('lat')?.trim()
  const lng = req.nextUrl.searchParams.get('lng')?.trim()
  if (!lat || !lng || isNaN(Number(lat)) || isNaN(Number(lng))) {
    return NextResponse.json({ success: false, error: 'lat and lng are required' }, { status: 400 })
  }

  const key = process.env.GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  if (!key) {
    return NextResponse.json({ success: false, error: 'Google Maps key not configured' }, { status: 503 })
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${encodeURIComponent(`${lat},${lng}`)}` +
    `&key=${key}&language=en&region=in`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    const json = await res.json()

    if (json.status !== 'OK' || !json.results?.length) {
      return NextResponse.json(
        { success: false, error: `Geocoding error: ${json.status}` },
        { status: 502 },
      )
    }

    // Prefer the most specific result (first) for the formatted address, but
    // scan all results' components for the best structured values.
    const best = json.results[0]
    const allComponents: any[] = json.results.flatMap((r: any) => r.address_components ?? [])
    const get = (...types: string[]): string => {
      for (const t of types) {
        const m = allComponents.find((x) => x.types.includes(t))
        if (m?.long_name) return m.long_name
      }
      return ''
    }

    const details = {
      formatted: (best.formatted_address as string) ?? '',
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
