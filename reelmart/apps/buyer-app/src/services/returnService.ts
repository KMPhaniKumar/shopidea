import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'pickup_scheduled' | 'picked_up' | 'refund_initiated' | 'refunded'

export interface ReturnRequest {
  id: string
  order_id: string
  buyer_id: string
  store_id: string
  reason: string
  description: string | null
  photos: string[]
  status: ReturnStatus
  admin_notes: string | null
  refund_amount: number | null
  requested_at: string
  resolved_at: string | null
}

export const RETURN_REASONS = [
  'Wrong item received',
  'Damaged or defective',
  'Item not as described',
  'Missing parts or accessories',
  'Changed my mind',
  'Other',
]

const REASON_MAP: Record<string, string> = {
  'Wrong item received':          'wrong_item',
  'Damaged or defective':         'damaged',
  'Item not as described':        'not_as_described',
  'Missing parts or accessories': 'other',
  'Changed my mind':              'changed_mind',
  'Other':                        'other',
}

export async function getMyReturns(userId: string): Promise<ReturnRequest[]> {
  const data = await api.get<ReturnRequest[]>(`/api/returns?buyerId=${userId}`)
  return data ?? []
}

export async function getReturnForOrder(orderId: string): Promise<ReturnRequest | null> {
  const { data } = await supabase
    .from('returns')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle()
  return data as ReturnRequest | null
}

export async function requestReturn(params: {
  orderId: string
  buyerId: string
  storeId: string
  deliveredAt: string
  reason: string
  description?: string
  photos?: string[]
}): Promise<{ success: boolean; error?: string }> {
  try {
    await api.post('/api/returns', {
      order_id: params.orderId,
      reason: REASON_MAP[params.reason] ?? 'other',
      description: params.description,
      images: params.photos ?? [],
    })
    return { success: true }
  } catch (e: any) {
    if (e.message?.includes('23505') || e.message?.includes('already exists')) {
      return { success: false, error: 'A return request already exists for this order' }
    }
    return { success: false, error: e.message }
  }
}
