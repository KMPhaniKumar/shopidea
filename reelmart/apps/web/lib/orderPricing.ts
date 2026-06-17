// Pure helper — no side-effects, no imports. Safe to use in server and client.

export interface OrderPricingInput {
  items: Array<{
    price: number
    qty: number
    compare_price?: number | null
  }>
  subtotal: number
  delivery_fee: number
  discount_amount?: number | null
  coins_discount?: number | null
  total_amount: number
  payment_method: string
  payment_method_detail?: string | null
}

export interface PriceBreakup {
  listingTotal: number
  specialTotal: number
  fees: number
  otherDiscount: number
  total: number
  hasMrp: boolean
  paidBy: string
}

function prettifyPaymentDetail(detail: string | null | undefined): string {
  if (!detail) return 'Online'
  const map: Record<string, string> = {
    upi: 'UPI',
    card: 'Card',
    netbanking: 'NetBanking',
    wallet: 'Wallet',
    emi: 'EMI',
  }
  return map[detail.toLowerCase()] ?? 'Online'
}

export function computePriceBreakup(order: OrderPricingInput): PriceBreakup {
  const listingTotal = order.items.reduce((acc, it) => {
    const mrp =
      it.compare_price != null && it.compare_price > it.price
        ? it.compare_price
        : it.price
    return acc + mrp * it.qty
  }, 0)

  const specialTotal = order.subtotal
  const fees = order.delivery_fee
  const otherDiscount = (order.discount_amount ?? 0) + (order.coins_discount ?? 0)
  const total = order.total_amount
  const hasMrp = listingTotal > specialTotal

  let paidBy: string
  if (order.payment_method === 'cod') {
    paidBy = 'Cash on Delivery'
  } else {
    paidBy = prettifyPaymentDetail(order.payment_method_detail)
  }

  return { listingTotal, specialTotal, fees, otherDiscount, total, hasMrp, paidBy }
}

/** Format a rupee amount: no decimals for integers, en-IN locale */
export function fmtRupee(n: number): string {
  return n % 1 === 0
    ? n.toLocaleString('en-IN')
    : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
