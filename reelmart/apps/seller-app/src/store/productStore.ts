import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

type Product = Database['public']['Tables']['products']['Row']
type Variant = Database['public']['Tables']['product_variants']['Row']

export interface ProductWithVariants extends Product {
  product_variants: Variant[]
}

interface ProductState {
  products: ProductWithVariants[]
  loading: boolean
  fetchProducts: (storeId: string) => Promise<void>
  addProduct: (product: ProductWithVariants) => void
  updateProduct: (id: string, data: Partial<Product>) => void
  removeProduct: (id: string) => void
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  loading: false,

  fetchProducts: async (storeId) => {
    set({ loading: true })
    const { data } = await supabase
      .from('products')
      .select('*, product_variants(*)')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
    set({ products: (data as ProductWithVariants[]) ?? [], loading: false })
  },

  addProduct: (product) =>
    set(state => ({ products: [product, ...state.products] })),

  updateProduct: (id, data) =>
    set(state => ({
      products: state.products.map(p => p.id === id ? { ...p, ...data } : p),
    })),

  removeProduct: (id) =>
    set(state => ({ products: state.products.filter(p => p.id !== id) })),
}))
