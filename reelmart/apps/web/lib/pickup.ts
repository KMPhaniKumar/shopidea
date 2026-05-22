// Server-side helper: ask delivery-service to register a store's address as a
// NimbusPost pickup warehouse. Used by the admin store-approval route and the
// seller address-sync route. Best-effort — callers should not fail their own
// operation if pickup registration errors.
const API_URL = (process.env.API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export interface PickupResult {
  pickupId: string | null
  status: 'pending' | 'verified' | 'failed'
  error?: string
}

export async function registerStorePickup(storeId: string): Promise<PickupResult | null> {
  try {
    const res = await fetch(`${API_URL}/api/delivery/pickup/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': process.env.INTERNAL_API_KEY ?? '',
      },
      body: JSON.stringify({ storeId }),
      cache: 'no-store',
    })
    const json = await res.json()
    return (json?.data as PickupResult) ?? null
  } catch {
    return null
  }
}
