import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import type { Database } from '../types/supabase'

type Order = Database['public']['Tables']['orders']['Row']

export interface CartItem {
  productId: string
  name: string
  image: string
  price: number
  variant?: string
  variantId?: string
  qty: number
}

export interface DeliveryAddress {
  name: string
  phone: string
  line1: string
  line2?: string
  area?: string
  city: string
  state: string
  pincode: string
}

export interface OrderWithStore extends Order {
  stores: { store_name: string; logo_url: string | null; store_slug: string } | null
}

export async function createOrder(params: {
  buyerId: string
  storeId: string
  items: CartItem[]
  subtotal: number
  deliveryFee: number
  discountAmount: number
  totalAmount: number
  deliveryAddress: DeliveryAddress
  paymentMethod: 'online' | 'cod'
  couponId?: string
  notes?: string
}): Promise<{ orderId: string; orderNumber: string }> {
  const addressLine = [params.deliveryAddress.line1, params.deliveryAddress.line2, params.deliveryAddress.area]
    .filter(Boolean).join(', ')

  const data = await api.post('/api/orders', {
    store_id: params.storeId,
    items: params.items,
    subtotal: params.subtotal,
    delivery_fee: params.deliveryFee,
    discount: params.discountAmount,
    total_amount: params.totalAmount,
    delivery_address: {
      name: params.deliveryAddress.name,
      phone: params.deliveryAddress.phone,
      address: addressLine,
      city: params.deliveryAddress.city,
      pincode: params.deliveryAddress.pincode,
    },
  })

  return { orderId: data.id, orderNumber: data.order_number ?? '' }
}

export async function getBuyerOrders(buyerId: string): Promise<OrderWithStore[]> {
  const data = await api.get<OrderWithStore[]>(`/api/orders?buyerId=${buyerId}`)
  return data ?? []
}

export async function getOrderById(orderId: string): Promise<OrderWithStore | null> {
  try {
    return await api.get<OrderWithStore>(`/api/orders/${orderId}`)
  } catch {
    return null
  }
}

export function subscribeToOrderStatus(orderId: string, onChange: (order: Order) => void) {
  return supabase
    .channel(`order-${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      payload => onChange(payload.new as Order)
    )
    .subscribe()
}

export const STATUS_STEPS = ['pending', 'accepted', 'packed', 'shipped', 'delivered'] as const

export const STATUS_LABELS: Record<string, string> = {
  pending:   'Order Placed',
  accepted:  'Confirmed',
  packed:    'Packed',
  shipped:   'Out for Delivery',
  delivered: 'Delivered',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
}

export const STATUS_ICONS: Record<string, string> = {
  pending:   '🕐',
  accepted:  '✅',
  packed:    '📦',
  shipped:   '🚚',
  delivered: '🎉',
  rejected:  '❌',
  cancelled: '✖️',
}
