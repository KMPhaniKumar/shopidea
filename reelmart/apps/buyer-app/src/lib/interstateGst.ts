/**
 * interstateGst.ts
 *
 * Session-level cache for successful pincode checks per store, so the
 * GST pincode modal is only shown once per store per session.
 *
 * Also provides the fire-and-forget interstate-demand POST (deduped via
 * AsyncStorage so it fires at most once per (store, buyerState) pair
 * across sessions).
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

// In-memory set of storeIds whose pincode check has already passed this session.
const SESSION_CLEARED = new Set<string>()

/** Mark a store as "pincode checked and cleared" for this session. */
export function markPincodeCleared(storeId: string): void {
  SESSION_CLEARED.add(storeId)
}

/** Has this store's pincode already been checked (and passed) this session? */
export function isPincodeCleared(storeId: string): boolean {
  return SESSION_CLEARED.has(storeId)
}

/**
 * Fire-and-forget POST to /api/store/interstate-demand.
 * Deduped once per (storeId, buyerState) pair via AsyncStorage.
 */
export async function fireInterstateDemand(storeId: string, buyerState: string): Promise<void> {
  const key = `idemand:${storeId}:${buyerState.toLowerCase()}`
  try {
    const already = await AsyncStorage.getItem(key)
    if (already) return
    await AsyncStorage.setItem(key, '1')
  } catch {
    // AsyncStorage failure should not block the UI; continue with the POST anyway.
  }
  // Fire-and-forget — ignore result.
  fetch(`${API_URL}/api/store/interstate-demand`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, buyerState }),
  }).catch(() => {})
}
