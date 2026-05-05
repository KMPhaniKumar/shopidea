import { create } from 'zustand'
import {
  getCart, addToCart, updateCartItemQuantity, removeCartItem, clearCart,
  calculateCartTotals, cartItemsToCheckout, CartItemRow,
} from '../services/cartService'

interface CartState {
  items: CartItemRow[]
  itemCount: number
  subtotal: number
  storeId: string | null
  storeName: string | null
  storeSlug: string | null
  loading: boolean
  fetchCart: (userId: string) => Promise<void>
  addItem: (params: Parameters<typeof addToCart>[0]) => Promise<{ success: boolean; error?: string }>
  updateQty: (userId: string, cartItemId: string, qty: number) => Promise<void>
  removeItem: (userId: string, cartItemId: string) => Promise<void>
  clearAll: (userId: string) => Promise<void>
  getCheckoutItems: () => ReturnType<typeof cartItemsToCheckout>
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  itemCount: 0,
  subtotal: 0,
  storeId: null,
  storeName: null,
  storeSlug: null,
  loading: false,

  fetchCart: async (userId) => {
    set({ loading: true })
    const items = await getCart(userId)
    const { subtotal, itemCount } = calculateCartTotals(items)
    const store = items[0]?.stores ?? null
    set({
      items,
      subtotal,
      itemCount,
      storeId: store?.id ?? null,
      storeName: store?.store_name ?? null,
      storeSlug: store?.store_slug ?? null,
      loading: false,
    })
  },

  addItem: async (params) => {
    const result = await addToCart(params)
    if (result.success) await get().fetchCart(params.userId)
    return result
  },

  updateQty: async (userId, cartItemId, qty) => {
    await updateCartItemQuantity(userId, cartItemId, qty)
    await get().fetchCart(userId)
  },

  removeItem: async (userId, cartItemId) => {
    await removeCartItem(userId, cartItemId)
    await get().fetchCart(userId)
  },

  clearAll: async (userId) => {
    await clearCart(userId)
    set({ items: [], itemCount: 0, subtotal: 0, storeId: null, storeName: null, storeSlug: null })
  },

  getCheckoutItems: () => cartItemsToCheckout(get().items),
}))
