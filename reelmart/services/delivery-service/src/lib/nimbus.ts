// NimbusPost API client — shipment booking, tracking, and pickup-warehouse
// registration. Centralised here so the request/response field mapping lives in
// one place (NimbusPost's payload shapes are not strongly documented, so the
// parsing below is intentionally defensive).

const NP_BASE = 'https://api.nimbuspost.com/v1'
export const NP_TOKEN = process.env.NIMBUS_AUTH_TOKEN ?? ''

function npHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'NP-AUTH-TOKEN': NP_TOKEN,
  }
}

export async function npPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${NP_BASE}${path}`, {
    method: 'POST',
    headers: npHeaders(),
    body: JSON.stringify(body),
  })
  return res.json() as Promise<any>
}

export async function npGet(path: string): Promise<any> {
  const res = await fetch(`${NP_BASE}${path}`, { headers: npHeaders() })
  return res.json() as Promise<any>
}

// ---- Pickup warehouse registration -----------------------------------------

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

// Reads a verification signal out of NimbusPost's warehouse payload. NimbusPost
// may queue an address for manual verification before it can be used as a
// pickup, so we only return 'verified' when nothing says otherwise.
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

  if (!NP_TOKEN) {
    return { pickupId: null, warehouseName, status: 'failed', error: 'Courier not configured' }
  }
  if (!hasCompletePickupAddress(store)) {
    return { pickupId: null, warehouseName, status: 'failed', error: 'Incomplete pickup address' }
  }

  const address = [store.address, store.area].filter(Boolean).join(', ')
  const phone = (store.whatsapp_number ?? '').replace(/^\+91/, '').replace(/\D/g, '')

  const resp = await npPost('/warehouse', {
    warehouse_name: warehouseName,
    name: store.store_name,
    address,
    city: store.city,
    state: store.state,
    pincode: store.pincode,
    phone,
  })

  const ok = resp?.status === true || resp?.success === true || Boolean(resp?.data)
  const alreadyExists = /already\s*exist/i.test(String(resp?.message ?? ''))

  if (!ok && !alreadyExists) {
    return {
      pickupId: null,
      warehouseName,
      status: 'failed',
      error: resp?.message ?? 'NimbusPost rejected the pickup address',
      raw: resp,
    }
  }

  return {
    pickupId: extractPickupId(resp?.data, warehouseName),
    warehouseName,
    status: alreadyExists ? 'verified' : interpretStatus(resp?.data),
    raw: resp,
  }
}

// Re-poll NimbusPost for a warehouse that was left 'pending', to see whether it
// has since been verified. Returns null if the status can't be determined.
export async function fetchPickupStatus(warehouseName: string): Promise<PickupStatus | null> {
  if (!NP_TOKEN) return null
  try {
    const resp = await npGet('/warehouse')
    const list: any[] = resp?.data ?? resp?.warehouses ?? []
    const match = list.find((w) => (w?.warehouse_name ?? w?.name) === warehouseName)
    if (!match) return null
    return interpretStatus(match)
  } catch {
    return null
  }
}
