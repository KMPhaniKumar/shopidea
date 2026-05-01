import { supabase } from '../lib/supabase'
import type { Database } from '../types/supabase'

type Order = Database['public']['Tables']['orders']['Row']

export interface OrderWithBuyer extends Order {
  users: { name: string | null; phone: string } | null
}

export async function getStoreOrders(storeId: string, status?: string): Promise<OrderWithBuyer[]> {
  let query = supabase
    .from('orders')
    .select('*, users!buyer_id(name, phone)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)
  const { data } = await query
  return (data as OrderWithBuyer[]) ?? []
}

export async function acceptOrder(orderId: string): Promise<void> {
  await supabase
    .from('orders')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', orderId)
}

export async function rejectOrder(orderId: string, reason: string): Promise<void> {
  await supabase
    .from('orders')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', orderId)
}

export async function updateOrderStatus(
  orderId: string,
  status: Order['status']
): Promise<void> {
  const extra: Partial<Order> = {}
  if (status === 'shipped') extra.shipped_at = new Date().toISOString()
  if (status === 'delivered') extra.delivered_at = new Date().toISOString()
  await supabase.from('orders').update({ status, ...extra }).eq('id', orderId)
}

export function subscribeToNewOrders(storeId: string, onNew: (order: Order) => void) {
  return supabase
    .channel(`store-orders-${storeId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` },
      payload => onNew(payload.new as Order)
    )
    .subscribe()
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending:   'New Order',
  accepted:  'Accepted',
  packed:    'Packed',
  shipped:   'Shipped',
  delivered: 'Delivered',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
  return_requested: 'Return Requested',
  returned:  'Returned',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:   '#F59E0B',
  accepted:  '#3B82F6',
  packed:    '#8B5CF6',
  shipped:   '#06B6D4',
  delivered: '#25D366',
  rejected:  '#E23744',
  cancelled: '#9CA3AF',
  return_requested: '#F97316',
  returned:  '#6B7280',
}
