import { supabase } from '../lib/supabase'
import type { Json } from '../types/supabase'

// ─── Saved Addresses ────────────────────────────────────────────────────────

export interface SavedAddress {
  id: string
  user_id: string
  label: string | null
  name: string
  phone: string
  line1: string
  line2: string | null
  area: string | null
  city: string
  state: string
  pincode: string
  is_default: boolean | null
  created_at: string | null
}

export async function getSavedAddresses(userId: string): Promise<SavedAddress[]> {
  const { data } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
  return (data as SavedAddress[]) ?? []
}

export async function saveAddress(userId: string, address: {
  label: string
  name: string
  phone: string
  line1: string
  line2?: string
  area?: string
  city: string
  state: string
  pincode: string
  isDefault?: boolean
}): Promise<void> {
  if (address.isDefault) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId)
  }
  const { error } = await supabase.from('addresses').insert({
    user_id: userId,
    label: address.label,
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    area: address.area ?? null,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    is_default: address.isDefault ?? false,
  })
  if (error) throw new Error(error.message)
}

export async function deleteAddress(addressId: string, userId: string): Promise<void> {
  await supabase.from('addresses').delete().eq('id', addressId).eq('user_id', userId)
}

export async function setDefaultAddress(addressId: string, userId: string): Promise<void> {
  await supabase.from('addresses').update({ is_default: false }).eq('user_id', userId)
  await supabase.from('addresses').update({ is_default: true }).eq('id', addressId).eq('user_id', userId)
}

// ─── Wishlist ────────────────────────────────────────────────────────────────

export interface WishlistItem {
  product_id: string
  created_at: string | null
  products: {
    id: string
    name: string
    price: number
    images: string[] | null
    is_available: boolean | null
    stores: { store_name: string; store_slug: string } | null
  } | null
}

export async function getWishlist(userId: string): Promise<WishlistItem[]> {
  const { data } = await supabase
    .from('wishlists')
    .select('product_id, created_at, products(id, name, price, images, is_available, stores(store_name, store_slug))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data as WishlistItem[]) ?? []
}

export async function toggleWishlist(userId: string, productId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('wishlists')
    .select('user_id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle()

  if (existing) {
    await supabase.from('wishlists').delete().eq('user_id', userId).eq('product_id', productId)
    return false
  }
  await supabase.from('wishlists').insert({ user_id: userId, product_id: productId })
  return true
}

export async function isWishlisted(userId: string, productId: string): Promise<boolean> {
  const { data } = await supabase
    .from('wishlists')
    .select('user_id')
    .eq('user_id', userId)
    .eq('product_id', productId)
    .maybeSingle()
  return !!data
}

// ─── Loyalty Coins ───────────────────────────────────────────────────────────

export interface CoinTransaction {
  id: string
  coins: number
  reason: string
  created_at: string | null
}

export async function getCoinBalance(userId: string): Promise<number> {
  const { data } = await supabase.from('users').select('loyalty_coins').eq('id', userId).single()
  return (data as any)?.loyalty_coins ?? 0
}

export async function getCoinHistory(userId: string): Promise<CoinTransaction[]> {
  const { data } = await supabase
    .from('coin_transactions')
    .select('id, coins, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as CoinTransaction[]) ?? []
}

// ─── Buyer Profile ───────────────────────────────────────────────────────────

export async function updateBuyerProfile(userId: string, params: { name: string }): Promise<void> {
  const { error } = await supabase.from('users').update({ name: params.name }).eq('id', userId)
  if (error) throw new Error(error.message)
}

// ─── Referral ────────────────────────────────────────────────────────────────

export function buildReferralLink(referralCode: string): string {
  return `https://reelmart.in/join?ref=${referralCode}`
}
