import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = '@reelmart_addresses'
const MAX = 5

export interface SavedAddress {
  id: string
  label: string       // "Home", "Work", or first line of address
  line1: string
  area: string
  city: string
  state: string
  pincode: string
  name: string
  phone: string
  usedAt: number      // timestamp for sorting
}

export async function getSavedAddresses(): Promise<SavedAddress[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export async function saveAddress(addr: Omit<SavedAddress, 'id' | 'usedAt'>): Promise<SavedAddress> {
  const existing = await getSavedAddresses()
  const filtered = existing.filter(
    a => !(a.line1 === addr.line1 && a.pincode === addr.pincode)
  )
  const next: SavedAddress = {
    ...addr,
    id: Date.now().toString(),
    usedAt: Date.now(),
  }
  const updated = [next, ...filtered].slice(0, MAX)
  await AsyncStorage.setItem(KEY, JSON.stringify(updated))
  return next
}

export async function removeAddress(id: string): Promise<SavedAddress[]> {
  const existing = await getSavedAddresses()
  const updated = existing.filter(a => a.id !== id)
  await AsyncStorage.setItem(KEY, JSON.stringify(updated))
  return updated
}
