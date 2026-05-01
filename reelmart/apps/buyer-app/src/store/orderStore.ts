import { create } from 'zustand'
import { getBuyerOrders, OrderWithStore } from '../services/orderService'

interface OrderState {
  orders: OrderWithStore[]
  loading: boolean
  fetchOrders: (buyerId: string) => Promise<void>
  updateOrder: (orderId: string, data: Partial<OrderWithStore>) => void
  prependOrder: (order: OrderWithStore) => void
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  loading: false,

  fetchOrders: async (buyerId) => {
    set({ loading: true })
    const orders = await getBuyerOrders(buyerId)
    set({ orders, loading: false })
  },

  updateOrder: (orderId, data) =>
    set(state => ({
      orders: state.orders.map(o => o.id === orderId ? { ...o, ...data } : o),
    })),

  prependOrder: (order) =>
    set(state => ({ orders: [order, ...state.orders] })),
}))
