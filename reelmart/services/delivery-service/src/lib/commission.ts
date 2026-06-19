/**
 * commission.ts
 *
 * Delivery commission slab lookup for the /rates endpoint.
 *
 * The `delivery_commission_slabs` table has rows (up_to_grams, commission_rupees):
 *   (500, 20), (1000, 25), (NULL, 30)
 *
 * Lookup rule: for a shipment of N grams, find all slabs where
 *   up_to_grams IS NULL OR up_to_grams >= N,
 * then pick the one with the smallest non-null up_to_grams (NULL slab = catch-all,
 * sorts last). Return that slab's commission_rupees.
 *
 * Rows are cached in module memory for ~60 s to avoid a DB round-trip on every
 * rate call. Fallback: if the table is empty or the query errors, return 20.
 */

import { supabaseAdmin } from './supabase'

interface SlabRow {
  up_to_grams: number | null
  commission_rupees: number
}

interface SlabCache {
  rows: SlabRow[]
  fetchedAt: number
}

const CACHE_TTL_MS = 60_000

let cache: SlabCache | null = null

async function fetchSlabs(): Promise<SlabRow[]> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.rows
  }

  const { data, error } = await supabaseAdmin
    .from('delivery_commission_slabs')
    .select('up_to_grams, commission_rupees')

  if (error || !data || data.length === 0) {
    // Don't update the cache on error so the next call retries the DB.
    // If there are simply no rows, cache the empty result briefly so we
    // don't hammer the DB in a high-traffic burst, then fall through to
    // the default below.
    if (!error && data && data.length === 0) {
      cache = { rows: [], fetchedAt: now }
    }
    return []
  }

  const rows: SlabRow[] = data.map((r: any) => ({
    up_to_grams: r.up_to_grams === null ? null : Number(r.up_to_grams),
    commission_rupees: Number(r.commission_rupees),
  }))

  cache = { rows, fetchedAt: now }
  return rows
}

/**
 * Return the platform delivery commission (in ₹) for a shipment of `grams`.
 *
 * Never throws — returns a safe default of 20 on any error or empty table.
 */
export async function commissionForWeight(grams: number): Promise<number> {
  const FALLBACK = 20

  try {
    const rows = await fetchSlabs()
    if (rows.length === 0) return FALLBACK

    // Candidate slabs: those that cover this weight.
    const candidates = rows.filter(
      r => r.up_to_grams === null || r.up_to_grams >= grams
    )
    if (candidates.length === 0) return FALLBACK

    // Pick the tightest bounded slab (smallest non-null up_to_grams).
    // The NULL slab (unbounded / catch-all) sorts last.
    candidates.sort((a, b) => {
      if (a.up_to_grams === null && b.up_to_grams === null) return 0
      if (a.up_to_grams === null) return 1
      if (b.up_to_grams === null) return -1
      return a.up_to_grams - b.up_to_grams
    })

    return candidates[0].commission_rupees
  } catch {
    return FALLBACK
  }
}
