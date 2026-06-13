import { NextRequest, NextResponse } from 'next/server'

// GET /api/places/autocomplete?q=<query>
//
// Server-side proxy for the Google Places Autocomplete API.
// Calling Google's Places REST API directly from the browser is blocked by CORS.
// This route fetches server-side (no CORS issue, key stays off the client bundle)
// and returns predictions in our {success, data} shape.
//
// Env: GOOGLE_MAPS_KEY (server-only) or NEXT_PUBLIC_GOOGLE_MAPS_KEY (fallback).
// The key must NOT have HTTP-referrer restrictions — set IP or no restriction
// since requests originate from the Vercel edge, not a browser origin.

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) {
    return NextResponse.json({ success: true, data: [] })
  }

  const key = process.env.GOOGLE_MAPS_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  if (!key) {
    return NextResponse.json({ success: false, error: 'Google Maps key not configured' }, { status: 503 })
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
    `?input=${encodeURIComponent(q)}` +
    `&key=${key}&language=en&components=country:in&types=geocode`

  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    const json = await res.json()

    if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      return NextResponse.json(
        { success: false, error: `Places API error: ${json.status}` },
        { status: 502 },
      )
    }

    const predictions = (json.predictions ?? []).map((p: any) => ({
      place_id: p.place_id,
      main_text: p.structured_formatting?.main_text ?? p.description,
      secondary_text: p.structured_formatting?.secondary_text ?? '',
    }))

    return NextResponse.json({ success: true, data: predictions })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Upstream fetch failed' },
      { status: 502 },
    )
  }
}
