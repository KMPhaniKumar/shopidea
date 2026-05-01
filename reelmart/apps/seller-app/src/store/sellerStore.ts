import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

type Store = Database['public']['Tables']['stores']['Row']

interface SellerState {
  store: Store | null
  loading: boolean
  fetchStore: (sellerId: string) => Promise<void>
  updateStore: (data: Partial<Store>) => Promise<{ error: string | null }>
  setStore: (store: Store) => void
}

export const useSellerStore = create<SellerState>((set, get) => ({
  store: null,
  loading: false,

  setStore: (store) => set({ store }),

  fetchStore: async (sellerId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('seller_id', sellerId)
      .maybeSingle()
    set({ store: data ?? null, loading: false })
  },

  updateStore: async (data) => {
    const { store } = get()
    if (!store) return { error: 'No store found' }
    const { error } = await supabase
      .from('stores')
      .update(data)
      .eq('id', store.id)
    if (!error) set(state => ({ store: state.store ? { ...state.store, ...data } : null }))
    return { error: error?.message ?? null }
  },
}))
