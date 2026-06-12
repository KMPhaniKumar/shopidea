// NimbusPost API client — shipment booking, tracking, and pickup-warehouse
// registration. Centralised here so the request/response field mapping lives in
// one place (NimbusPost's payload shapes are not strongly documented, so the
// parsing below is intentionally defensive).
//
// Auth model:
//   1. If NIMBUS_AUTH_TOKEN is set, use it verbatim (testing override; skips login).
//   2. Otherwise login with NIMBUS_EMAIL + NIMBUS_PASSWORD, cache the JWT in
//      memory, and re-login automatically on 401 or when near expiry (~3 h).
//   3. If neither is configured the module operates in stub mode — isConfigured()
//      returns false, and callers fall back to stub responses without crashing.
//
// NEVER log or return the token or password in any error, response, or log line.

const NP_BASE = 'https://api.nimbuspost.com/v1'
const REQUEST_TIMEOUT_MS = 15_000
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry

// ---- Typed error -------------------------------------------------------

export class NimbusError extends Error {
  public readonly raw: unknown
  constructor(message: string, raw?: unknown) {
    super(message)
    this.name = 'NimbusError'
    this.raw = raw
  }
}

// ---- Auth state (module-level cache) -----------------------------------

interface TokenCache {
  token: string
  expiresAt: number // ms since epoch
}

let _tokenCache: TokenCache | null = null
let _loginInFlight: Promise<string> | null = null

/** True when at least one of the two auth paths is configured. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NIMBUS_AUTH_TOKEN ||
    (process.env.NIMBUS_EMAIL && process.env.NIMBUS_PASSWORD)
  )
}

/**
 * Returns a valid Bearer token, logging in (or using the override) as needed.
 * Throws NimbusError if neither auth path is configured.
 */
async function getToken(): Promise<string> {
  // Override: always use verbatim
  const override = process.env.NIMBUS_AUTH_TOKEN
  if (override) return override

  // Email+password path
  if (!process.env.NIMBUS_EMAIL || !process.env.NIMBUS_PASSWORD) {
    throw new NimbusError('NimbusPost not configured (no credentials)')
  }

  const now = Date.now()
  if (_tokenCache && _tokenCache.expiresAt - now > TOKEN_REFRESH_BUFFER_MS) {
    return _tokenCache.token
  }

  // Deduplicate concurrent refresh attempts
  if (_loginInFlight) return _loginInFlight

  _loginInFlight = (async () => {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(`${NP_BASE}/users/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: process.env.NIMBUS_EMAIL,
            password: process.env.NIMBUS_PASSWORD,
          }),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(timer)
      }

      let body: any
      try {
        body = await res!.json()
      } catch {
        throw new NimbusError('NimbusPost login: invalid JSON response')
      }

      if (!body?.status || !body?.data) {
        // Never include password or email in the thrown error
        throw new NimbusError(
          `NimbusPost login failed: ${body?.message ?? 'unknown error'}`,
          { status: body?.status }
        )
      }

      const jwt: string = body.data
      // Parse expiry from JWT payload (standard exp claim, seconds since epoch)
      let expiresAt = now + 3 * 60 * 60 * 1000 // default 3 h
      try {
        const payload = JSON.parse(
          Buffer.from(jwt.split('.')[1], 'base64').toString('utf8')
        )
        if (typeof payload.exp === 'number') {
          expiresAt = payload.exp * 1000
        }
      } catch {
        // Ignore; use default expiry
      }

      _tokenCache = { token: jwt, expiresAt }
      return jwt
    } finally {
      // Only clear the in-flight sentinel after the full token negotiation
      // completes (success or failure). Clearing it inside the fetch's own
      // finally block would allow a new concurrent caller to start a second
      // login before _tokenCache is populated.
      _loginInFlight = null
    }
  })()

  return _loginInFlight
}

/** Invalidate cached token so the next call forces a re-login. */
function invalidateToken(): void {
  _tokenCache = null
}

// ---- Core request function ---------------------------------------------

/**
 * Make one authenticated request to NimbusPost. Retries once after re-login
 * on a 401. Applies a 15 s AbortController timeout. Throws NimbusError on
 * status:false responses or network failures.
 */
export async function npRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown
): Promise<any> {
  const doRequest = async (token: string): Promise<{ httpStatus: number; body: any }> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${NP_BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      })
    } catch (err: any) {
      clearTimeout(timer)
      if (err?.name === 'AbortError') {
        throw new NimbusError('NimbusPost request timed out', { path })
      }
      throw new NimbusError(`NimbusPost network error: ${err?.message ?? 'unknown'}`, { path })
    }
    clearTimeout(timer)

    let parsed: any
    try {
      parsed = await res.json()
    } catch {
      throw new NimbusError(`NimbusPost returned non-JSON (HTTP ${res.status})`, { path, httpStatus: res.status })
    }

    return { httpStatus: res.status, body: parsed }
  }

  const token = await getToken()
  let { httpStatus, body: parsed } = await doRequest(token)

  // Retry once after re-login on 401
  if (httpStatus === 401) {
    invalidateToken()
    const freshToken = await getToken()
    ;({ httpStatus, body: parsed } = await doRequest(freshToken))
  }

  if (parsed?.status === false) {
    throw new NimbusError(
      parsed?.message ?? 'NimbusPost returned status:false',
      { path, code: parsed?.code }
    )
  }

  return parsed
}

// ---- Typed API methods -------------------------------------------------

export interface CreateShipmentPayload {
  order_number: string
  shipping_charges: number
  discount: number
  cod_charges: number
  payment_type: 'cod' | 'prepaid' | 'reverse'
  order_amount: number
  package_weight: number   // grams
  package_length: number   // cm
  package_breadth: number  // cm
  package_height: number   // cm
  request_auto_pickup: 'yes' | 'no'
  consignee: {
    name: string
    address: string
    address_2?: string
    city: string
    state: string
    pincode: string
    phone: string
  }
  pickup: {
    warehouse_name: string
    name?: string
    address?: string
    address_2?: string
    city?: string
    state?: string
    pincode?: string
    phone?: string
  }
  order_items: { name: string; qty: string; price: string; sku: string }[]
  courier_id?: string
  is_insurance?: '0' | '1'
  tags?: string
}

export interface ShipmentResult {
  order_id: string | number
  shipment_id: string | number
  awb_number: string
  courier_id: string | number
  courier_name: string
  status: string
  payment_type: string
  label: string
}

export interface TrackingEvent {
  status_code: string
  location: string
  event_time: string
  message: string
}

export interface TrackingResult {
  awb_number: string
  status: string
  rto_status: string
  shipment_info: unknown
  history: TrackingEvent[]
}

export interface CourierRate {
  id: string | number
  name: string
  freight_charges: number
  cod_charges: number
  total_charges: number
  min_weight: number
  chargeable_weight: number
}

export interface NdrItem {
  awb_number: string
  event_date: string
  courier_remarks: string
  total_attempts: number
}

export interface NdrActionItem {
  awb: string
  action: 're-attempt' | 'change_address' | 'change_phone'
  action_data:
    | { re_attempt_date: string }
    | { name: string; address_1: string; address_2?: string }
    | { phone: string }
}

export interface NdrActionResult {
  status: boolean
  awb: string
  message: string
}

/** Book a new shipment. Returns the full NimbusPost shipment data. */
export async function createShipment(payload: CreateShipmentPayload): Promise<ShipmentResult> {
  const resp = await npRequest('POST', '/shipments', payload)
  return resp.data as ShipmentResult
}

/** Track a single shipment by AWB (GET /shipments/track/{awb}). */
export async function trackShipment(awb: string): Promise<TrackingResult> {
  const resp = await npRequest('GET', `/shipments/track/${encodeURIComponent(awb)}`)
  return resp.data as TrackingResult
}

/** Bulk-track up to 100 AWBs. */
export async function bulkTrack(awbs: string[]): Promise<TrackingResult[]> {
  const resp = await npRequest('POST', '/shipments/track/bulk', { awb: awbs })
  return (resp.data ?? []) as TrackingResult[]
}

/** Request a manifest PDF for a set of AWBs. Returns a PDF URL. */
export async function manifest(awbs: string[]): Promise<string> {
  const resp = await npRequest('POST', '/shipments/manifest', { awbs })
  return resp.data as string
}

/** Cancel a shipment by AWB. */
export async function cancelShipment(awb: string): Promise<{ message: string }> {
  const resp = await npRequest('POST', '/shipments/cancel', { awb })
  return { message: resp?.message ?? 'Shipment Cancelled' }
}

/** Create a hyperlocal shipment (adds lat/lng to consignee + pickup). */
export async function createHyperlocal(
  payload: CreateShipmentPayload & {
    consignee: CreateShipmentPayload['consignee'] & { latitude: string; longitude: string }
    pickup: CreateShipmentPayload['pickup'] & { latitude: string; longitude: string }
  }
): Promise<ShipmentResult> {
  const resp = await npRequest('POST', '/shipments/hyperlocal', payload)
  return resp.data as ShipmentResult
}

/** List available couriers for this account. */
export async function courierList(): Promise<{ id: string | number; name: string }[]> {
  const resp = await npRequest('GET', '/courier')
  return (resp.data ?? []) as { id: string | number; name: string }[]
}

/** Fetch the full list of serviceable pincodes (large list). */
export async function serviceablePincodes(): Promise<
  { pincode: string; cod: boolean; prepaid: boolean }[]
> {
  const resp = await npRequest('GET', '/courier/serviceability')
  return (resp.data ?? []) as { pincode: string; cod: boolean; prepaid: boolean }[]
}

export interface RateServiceabilityParams {
  origin: string
  destination: string
  payment_type: 'cod' | 'prepaid'
  order_amount: number
  weight?: number
  length?: number
  breadth?: number
  height?: number
}

/** Check rates and serviceability for a given origin → destination. */
export async function rateServiceability(params: RateServiceabilityParams): Promise<CourierRate[]> {
  const resp = await npRequest('POST', '/courier/serviceability', {
    origin: params.origin,
    destination: params.destination,
    payment_type: params.payment_type,
    order_amount: String(params.order_amount),
    weight: String(params.weight ?? 500),
    length: String(params.length ?? 10),
    breadth: String(params.breadth ?? 10),
    height: String(params.height ?? 10),
  })
  return (resp.data ?? []) as CourierRate[]
}

export interface NdrListParams {
  awb_number?: string
  page_no?: number
  per_page?: number
}

/** List NDR (failed delivery) records. */
export async function ndrList(params: NdrListParams): Promise<NdrItem[]> {
  const qs = new URLSearchParams()
  if (params.awb_number) qs.set('awb_number', params.awb_number)
  if (params.page_no != null) qs.set('page_no', String(params.page_no))
  if (params.per_page != null) qs.set('per_page', String(params.per_page))
  const resp = await npRequest('GET', `/ndr?${qs.toString()}`)
  return (resp.data ?? []) as NdrItem[]
}

/** Submit NDR actions for one or more AWBs. */
export async function ndrAction(actions: NdrActionItem[]): Promise<NdrActionResult[]> {
  const resp = await npRequest('POST', '/ndr/action', actions)
  // NimbusPost returns an array directly
  return (Array.isArray(resp) ? resp : [resp]) as NdrActionResult[]
}

// ---- Pickup warehouse --------------------------------------------------

export type PickupStatus = 'pending' | 'verified' | 'failed'

export interface StorePickupInput {
  id: string
  store_name: string
  address?: string | null
  area?: string | null
  city?: string | null
  state?: string | null
  pincode?: string | null
  whatsapp_number?: string | null
}

export interface PickupRegistration {
  pickupId: string | null
  warehouseName: string
  status: PickupStatus
  error?: string
  raw?: any
}

// A NimbusPost warehouse_name must be unique per merchant account. Derive a
// stable one from the store id so re-registering the same store is idempotent.
export function warehouseNameForStore(storeId: string): string {
  return `rm_${storeId.replace(/-/g, '').slice(0, 16)}`
}

// True only when we have everything NimbusPost needs to register a pickup.
export function hasCompletePickupAddress(s: StorePickupInput): boolean {
  return Boolean(
    s.address?.trim() &&
    s.city?.trim() &&
    s.state?.trim() &&
    /^\d{6}$/.test((s.pincode ?? '').trim())
  )
}

// Reads a verification signal out of NimbusPost's warehouse payload.
function interpretStatus(data: any): PickupStatus {
  const flag = data?.verified ?? data?.is_verified ?? data?.status
  if (flag === false || flag === 0) return 'pending'
  const text = String(data?.verification_status ?? data?.warehouse_status ?? '').toLowerCase()
  if (text.includes('pending') || text.includes('unverified') || text.includes('review')) return 'pending'
  return 'verified'
}

function extractPickupId(data: any, fallbackName: string): string | null {
  if (data == null) return null
  if (typeof data === 'string' || typeof data === 'number') return String(data)
  return (
    data.warehouse_id ??
    data.id ??
    data.warehouse?.id ??
    data.warehouse_name ??
    fallbackName ??
    null
  )?.toString() ?? null
}

// Register (or re-register) the store's address as a NimbusPost pickup
// warehouse. Idempotent on warehouse_name: if NimbusPost reports the warehouse
// already exists we treat that as success rather than an error.
export async function registerPickupWarehouse(store: StorePickupInput): Promise<PickupRegistration> {
  const warehouseName = warehouseNameForStore(store.id)

  if (!isConfigured()) {
    return { pickupId: null, warehouseName, status: 'failed', error: 'Courier not configured' }
  }
  if (!hasCompletePickupAddress(store)) {
    return { pickupId: null, warehouseName, status: 'failed', error: 'Incomplete pickup address' }
  }

  const address = [store.address, store.area].filter(Boolean).join(', ')
  const phone = (store.whatsapp_number ?? '').replace(/^\+91/, '').replace(/\D/g, '')

  let resp: any
  try {
    resp = await npRequest('POST', '/warehouse', {
      warehouse_name: warehouseName,
      name: store.store_name,
      address,
      city: store.city,
      state: store.state,
      pincode: store.pincode,
      phone,
    })
  } catch (err: any) {
    const alreadyExists = /already\s*exist/i.test(String(err?.message ?? ''))
    if (!alreadyExists) {
      return { pickupId: null, warehouseName, status: 'failed', error: err.message }
    }
    return { pickupId: null, warehouseName, status: 'verified' }
  }

  const alreadyExists = /already\s*exist/i.test(String(resp?.message ?? ''))
  return {
    pickupId: extractPickupId(resp?.data, warehouseName),
    warehouseName,
    status: alreadyExists ? 'verified' : interpretStatus(resp?.data),
    raw: resp,
  }
}

// Re-poll NimbusPost for a warehouse that was left 'pending'.
export async function fetchPickupStatus(warehouseName: string): Promise<PickupStatus | null> {
  if (!isConfigured()) return null
  try {
    const resp = await npRequest('GET', '/warehouse')
    const list: any[] = resp?.data ?? resp?.warehouses ?? []
    const match = list.find((w) => (w?.warehouse_name ?? w?.name) === warehouseName)
    if (!match) return null
    return interpretStatus(match)
  } catch {
    return null
  }
}
