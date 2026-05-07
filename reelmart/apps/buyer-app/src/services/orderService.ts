import { supabase } from '../lib/supabase'
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
  const { data, error } = await supabase
    .from('orders')
    .insert({
      buyer_id: params.buyerId,
      store_id: params.storeId,
      items: params.items as any,
      subtotal: params.subtotal,
      delivery_fee: params.deliveryFee,
      discount_amount: params.discountAmount,
      total_amount: params.totalAmount,
      delivery_address: params.deliveryAddress as any,
      payment_method: params.paymentMethod,
      status: 'pending',
      payment_status: 'pending',
    })
    .select('id, order_number')
    .single()

  if (error) throw new Error(error.message)
  return { orderId: data.id, orderNumber: data.order_number ?? '' }
}

export async function getBuyerOrders(buyerId: string): Promise<OrderWithStore[]> {
  const { data } = await supabase
    .from('orders')
    .select('*, stores(store_name, logo_url, store_slug)')
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
    .limit(50)
  return (data as OrderWithStore[]) ?? []
}

export async function getOrderById(orderId: string): Promise<OrderWithStore | null> {
  const { data } = await supabase
    .from('orders')
    .select('*, stores(store_name, logo_url, store_slug)')
    .eq('id', orderId)
    .single()
  return data as OrderWithStore | null
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
  shipped:   'Shipped',
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
