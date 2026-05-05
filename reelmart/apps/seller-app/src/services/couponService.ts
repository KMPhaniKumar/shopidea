import { supabase } from '../lib/supabase'

export interface Coupon {
  id: string
  store_id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  min_order_amount: number | null
  max_discount: number | null
  max_uses: number | null
  total_uses: number | null
  valid_until: string | null
  is_active: boolean | null
  created_at: string | null
}

export async function getStoreCoupons(storeId: string): Promise<Coupon[]> {
  const { data } = await supabase
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  return (data ?? []) as Coupon[]
}

export async function createCoupon(storeId: string, data: {
  code: string
  discountType: 'percentage' | 'fixed'
  discountValue: number
  minOrderAmount?: number
  maxDiscount?: number
  maxUses?: number
  validUntil?: string
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('coupons').insert({
    store_id: storeId,
    code: data.code.toUpperCase().trim(),
    type: data.discountType === 'percentage' ? 'percent' : 'fixed',
    value: data.discountValue,
    min_order_amount: data.minOrderAmount ?? 0,
    max_discount: data.maxDiscount ?? null,
    max_uses: data.maxUses ?? null,
    valid_until: data.validUntil ?? null,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function toggleCoupon(couponId: string, isActive: boolean): Promise<void> {
  await supabase.from('coupons').update({ is_active: isActive }).eq('id', couponId)
}

export async function deleteCoupon(couponId: string): Promise<void> {
  await supabase.from('coupons').delete().eq('id', couponId)
}

export interface BroadcastRecord {
  id: string
  message: string
  recipient_count: number
  sent_at: string
}

export async function getBroadcastHistory(storeId: string): Promise<BroadcastRecord[]> {
  const { data } = await supabase
    .from('broadcasts')
    .select('id, message, recipient_count, sent_at')
    .eq('store_id', storeId)
    .order('sent_at', { ascending: false })
    .limit(20)
  return (data ?? []) as BroadcastRecord[]
}

export async function sendBroadcast(storeId: string, message: string): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/whatsapp/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, message }),
    })
    const data = await response.json()
    if (!data.success) return { success: false, error: data.error }
    return { success: true, count: data.count }
  } catch {
    return { success: false, error: 'Network error. Please try again.' }
  }
}
