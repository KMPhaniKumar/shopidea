// NimbusPost Legacy API client — ship.nimbuspost.com/api
//
// The legacy ("old") API authenticates with a static header key (NP-API-KEY)
// rather than the JWT used by the v1 API (api.nimbuspost.com/v1). It is used
// here exclusively for on-demand label PDF generation, which the v1 API does
// not expose as a separate endpoint.
//
// NEVER log or include process.env.NIMBUS_API_KEY in any error message, log
// line, or response body. The key must not appear in any output path.

const LEGACY_BASE = 'https://ship.nimbuspost.com/api'
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Returns true when NIMBUS_API_KEY is set in the environment.
 * When false, the legacy label path is dormant and callers should fall back
 * to whatever label_url was captured at booking time.
 */
export function isLegacyConfigured(): boolean {
  return Boolean(process.env.NIMBUS_API_KEY)
}

/**
 * Attempt to extract a PDF label URL from NimbusPost's loosely-documented
 * legacy response body. Tries several known shapes before falling back to a
 * brute-force scan of all string fields ending in ".pdf".
 */
function extractLabelUrl(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  // Known shapes (most-specific first):
  if (typeof b.data === 'object' && b.data !== null) {
    const d = b.data as Record<string, unknown>
    if (typeof d.label === 'string' && d.label) return d.label
    if (Array.isArray(d) && d.length > 0) {
      const first = d[0] as Record<string, unknown>
      if (typeof first?.label === 'string' && first.label) return first.label
    }
    if (typeof d.url === 'string' && d.url) return d.url
  }
  if (typeof b.label === 'string' && b.label) return b.label
  if (typeof b.url === 'string' && b.url) return b.url

  // Last resort: walk every string field at the top level and data object
  // looking for something that looks like a PDF URL.
  const candidates: string[] = []
  const collectStrings = (obj: Record<string, unknown>) => {
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && v.toLowerCase().endsWith('.pdf')) {
        candidates.push(v)
      }
    }
  }
  collectStrings(b)
  if (typeof b.data === 'object' && b.data !== null && !Array.isArray(b.data)) {
    collectStrings(b.data as Record<string, unknown>)
  }
  return candidates[0] ?? null
}

/**
 * Request a shipping-label PDF from NimbusPost's legacy API.
 *
 * @param shipmentIds  One or more NimbusPost shipment IDs (numbers or strings).
 *                     NimbusPost expects them comma-separated in the body.
 * @returns `{ url: string | null; raw: unknown }` — url is null when the
 *          response parses successfully but contains no recognisable PDF URL.
 * @throws  Error on non-2xx HTTP responses or network/timeout failures.
 *          Error messages never contain the API key.
 */
export async function generateLabel(
  shipmentIds: (string | number)[]
): Promise<{ url: string | null; raw: unknown }> {
  const key = process.env.NIMBUS_API_KEY
  if (!key) {
    throw new Error('NIMBUS_API_KEY is not configured')
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${LEGACY_BASE}/shipments/label`, {
      method: 'POST',
      headers: {
        'NP-API-KEY': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: shipmentIds.join(',') }),
      signal: ctrl.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timer)
    const name = err instanceof Error ? err.name : ''
    const msg = err instanceof Error ? err.message : 'unknown'
    if (name === 'AbortError') {
      throw new Error('NimbusPost legacy label request timed out')
    }
    throw new Error(`NimbusPost legacy label network error: ${msg}`)
  }
  clearTimeout(timer)

  if (!res.ok) {
    // Never include the key in the message — only the safe HTTP status.
    throw new Error(`NimbusPost legacy label request failed (HTTP ${res.status})`)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error('NimbusPost legacy label response is not valid JSON')
  }

  const url = extractLabelUrl(body)
  return { url, raw: body }
}
