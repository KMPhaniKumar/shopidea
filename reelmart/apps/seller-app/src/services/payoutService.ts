import { supabase } from '../lib/supabase'

export interface BankAccount {
  id: string
  seller_id: string
  account_holder: string
  account_number: string
  ifsc_code: string
  bank_name: string | null
  is_verified: boolean | null
  created_at: string | null
}

export interface Payout {
  id: string
  seller_id: string
  amount: number
  status: string | null
  order_count: number | null
  period_start: string | null
  period_end: string | null
  processed_at: string | null
  created_at: string | null
}

export interface PayoutSummary {
  totalEarned: number
  totalPaid: number
  pendingAmount: number
  payouts: Payout[]
}

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/

export async function getBankAccount(sellerId: string): Promise<BankAccount | null> {
  const { data } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('seller_id', sellerId)
    .single()
  return data as BankAccount ?? null
}

export async function saveBankAccount(sellerId: string, params: {
  accountHolderName: string
  accountNumber: string
  confirmAccountNumber: string
  ifscCode: string
  bankName: string
}): Promise<void> {
  if (params.accountNumber !== params.confirmAccountNumber) {
    throw new Error('Account numbers do not match')
  }
  const ifsc = params.ifscCode.toUpperCase().trim()
  if (!IFSC_REGEX.test(ifsc)) {
    throw new Error('Invalid IFSC code (format: ABCD0123456)')
  }
  const { error } = await supabase
    .from('bank_accounts')
    .upsert({
      seller_id: sellerId,
      account_holder: params.accountHolderName.trim(),
      account_number: params.accountNumber.trim(),
      ifsc_code: ifsc,
      bank_name: params.bankName.trim(),
      is_verified: false,
    }, { onConflict: 'seller_id' })
  if (error) throw new Error(error.message)
}

export async function getPayoutSummary(storeId: string, sellerId: string): Promise<PayoutSummary> {
  const [ordersRes, payoutsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('total_amount, payment_status, status')
      .eq('store_id', storeId)
      .eq('payment_status', 'paid')
      .eq('status', 'delivered'),
    supabase
      .from('payouts')
      .select('*')
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false }),
  ])

  const orders = ordersRes.data ?? []
  const payouts = (payoutsRes.data as unknown as Payout[]) ?? []
  const COMMISSION = 0.02

  const totalEarned = orders.reduce((s, o) => s + ((o.total_amount ?? 0) * (1 - COMMISSION)), 0)
  const totalPaid = payouts
    .filter(p => p.status === 'done')
    .reduce((s, p) => s + p.amount, 0)

  return {
    totalEarned: Math.round(totalEarned),
    totalPaid: Math.round(totalPaid),
    pendingAmount: Math.round(totalEarned - totalPaid),
    payouts,
  }
}

export interface SellerPreferences {
  auto_accept_orders: boolean | null
  new_order_push: boolean | null
  new_order_whatsapp: boolean | null
  order_update_push: boolean | null
  order_update_whatsapp: boolean | null
  promotions_push: boolean | null
}

export async function getSellerPreferences(userId: string): Promise<SellerPreferences | null> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()
  return data as SellerPreferences ?? null
}

export async function saveSellerPreferences(userId: string, prefs: Partial<SellerPreferences>): Promise<void> {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...prefs }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}
