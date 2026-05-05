import { create } from 'zustand'

interface SellerStore {
  store: any | null
  pendingOrderCount: number
  setStore: (s: any) => void
  setPendingOrderCount: (n: number) => void
}

export const useSellerStore = create<SellerStore>((set) => ({
  store: null,
  pendingOrderCount: 0,
  setStore: (store) => set({ store }),
  setPendingOrderCount: (pendingOrderCount) => set({ pendingOrderCount }),
}))
