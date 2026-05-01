import { create } from 'zustand'
import { getStoreOrders, OrderWithBuyer } from '../services/orderService'

interface OrderState {
  orders: OrderWithBuyer[]
  loading: boolean
  fetchOrders: (storeId: string) => Promise<void>
  updateOrderInList: (orderId: string, data: Partial<OrderWithBuyer>) => void
  prependOrder: (order: OrderWithBuyer) => void
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  loading: false,

  fetchOrders: async (storeId) => {
    set({ loading: true })
    const orders = await getStoreOrders(storeId)
    set({ orders, loading: false })
  },

  updateOrderInList: (orderId, data) =>
    set(state => ({
      orders: state.orders.map(o => o.id === orderId ? { ...o, ...data } : o),
    })),

  prependOrder: (order) =>
    set(state => ({ orders: [order, ...state.orders] })),
}))
