// Address persistence — backed by Supabase `addresses` table for cross-device sync.
// Falls back to AsyncStorage for unauthenticated guests; merges into Supabase on login.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

const LOCAL_KEY = '@reelmart_addresses'        // guest fallback only
const DEFAULT_KEY = '@reelmart_default_address_id'

export interface SavedAddress {
  id: string
  label: string
  line1: string
  line2?: string | null
  area: string
  city: string
  state: string
  pincode: string
  name: string
  phone: string
  is_default?: boolean
  usedAt?: number
}

interface DbAddress {
  id: string
  user_id: string
  label: string
  name: string
  phone: string
  line1: string
  line2: string | null
  area: string | null
  city: string
  state: string
  pincode: string
  is_default: boolean
  created_at: string
}

function dbToLocal(a: DbAddress): SavedAddress {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    area: a.area ?? '',
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    is_default: a.is_default,
    usedAt: new Date(a.created_at).getTime(),
  }
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

export async function getSavedAddresses(): Promise<SavedAddress[]> {
  const userId = await getCurrentUserId()
  if (!userId) {
    // Guest — fall back to local storage
    try {
      const raw = await AsyncStorage.getItem(LOCAL_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }
  const { data } = await supabase
    .from('addresses').select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  return (data ?? []).map(dbToLocal as any)
}

export async function saveAddress(addr: Omit<SavedAddress, 'id' | 'usedAt'>): Promise<SavedAddress> {
  const userId = await getCurrentUserId()
  if (!userId) {
    // Guest path: write to AsyncStorage with generated id
    const local: SavedAddress = { ...addr, id: Date.now().toString(), usedAt: Date.now() }
    const list = await getSavedAddresses()
    const filtered = list.filter(a => !(a.line1 === addr.line1 && a.pincode === addr.pincode))
    const updated = [local, ...filtered].slice(0, 5)
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(updated))
    return local
  }

  // De-dupe on (line1, pincode) for the same user
  const { data: existing } = await supabase
    .from('addresses').select('id')
    .eq('user_id', userId)
    .eq('line1', addr.line1).eq('pincode', addr.pincode)
    .maybeSingle()

  if (existing?.id) {
    const { data } = await supabase
      .from('addresses')
      .update({
        label: addr.label || 'Home', name: addr.name, phone: addr.phone,
        line1: addr.line1, line2: addr.line2 ?? null, area: addr.area || null,
        city: addr.city, state: addr.state, pincode: addr.pincode,
      })
      .eq('id', existing.id).select('*').single()
    return dbToLocal(data as DbAddress)
  }

  const { count } = await supabase
    .from('addresses').select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  const isFirst = (count ?? 0) === 0

  const { data, error } = await supabase
    .from('addresses').insert({
      user_id: userId,
      label: addr.label || 'Home',
      name: addr.name,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2 ?? null,
      area: addr.area || null,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      is_default: isFirst,
    }).select('*').single()
  if (error) throw error
  return dbToLocal(data as DbAddress)
}

export async function removeAddress(id: string): Promise<SavedAddress[]> {
  const userId = await getCurrentUserId()
  if (!userId) {
    const list = await getSavedAddresses()
    const updated = list.filter(a => a.id !== id)
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(updated))
    return updated
  }
  await supabase.from('addresses').delete().eq('id', id).eq('user_id', userId)
  return getSavedAddresses()
}

export async function setDefaultAddress(id: string): Promise<void> {
  const userId = await getCurrentUserId()
  if (!userId) {
    await AsyncStorage.setItem(DEFAULT_KEY, id)
    return
  }
  // Atomically swap default within user scope
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId)
  await supabase.from('addresses').update({ is_default: true }).eq('id', id).eq('user_id', userId)
}

// On login: merge any guest-stored addresses into the user's Supabase rows.
// Call once after a successful sign-in.
export async function mergeGuestAddressesIntoAccount(): Promise<void> {
  const userId = await getCurrentUserId()
  if (!userId) return
  const raw = await AsyncStorage.getItem(LOCAL_KEY)
  if (!raw) return
  const guests: SavedAddress[] = JSON.parse(raw)
  for (const g of guests) {
    try { await saveAddress(g) } catch { /* skip dupes */ }
  }
  await AsyncStorage.removeItem(LOCAL_KEY)
}
