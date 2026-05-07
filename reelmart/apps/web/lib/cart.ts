// Cart persistence in localStorage, namespaced per store slug.
// Survives page reload + browser tabs. Cleared after successful order.

export interface CartItem {
  productId: string
  name: string
  image: string
  price: number
  variant?: string
  variantId?: string
  qty: number
}

const KEY_PREFIX = 'reelmart_cart_'

export function loadCart(storeSlug: string): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY_PREFIX + storeSlug)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCart(storeSlug: string, items: CartItem[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY_PREFIX + storeSlug, JSON.stringify(items))
}

export function clearCart(storeSlug: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KEY_PREFIX + storeSlug)
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0)
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.qty, 0)
}
