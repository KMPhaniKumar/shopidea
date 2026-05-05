import { supabase } from '../lib/supabase'

export interface CartItemRow {
  id: string
  user_id: string
  product_id: string
  store_id: string
  quantity: number
  variant_id: string | null
  selected_variant: { name: string; value: string; price: number } | null
  created_at: string | null
  products: {
    id: string
    name: string
    price: number
    images: string[] | null
    stock_count: number | null
    stock_type: string | null
    is_available: boolean | null
  }
  stores: {
    id: string
    store_name: string
    store_slug: string
    logo_url: string | null
    city: string
  }
}

export interface CartTotals {
  subtotal: number
  itemCount: number
}

export async function getCart(userId: string): Promise<CartItemRow[]> {
  const { data } = await supabase
    .from('cart_items')
    .select('*, products(id, name, price, images, stock_count, stock_type, is_available), stores(id, store_name, store_slug, logo_url, city)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  return (data as unknown as CartItemRow[]) ?? []
}

export async function addToCart(params: {
  userId: string
  productId: string
  storeId: string
  quantity: number
  selectedVariant?: { name: string; value: string; price: number } | null
}): Promise<{ success: boolean; error?: string }> {
  // Enforce single-store cart
  const { data: existing } = await supabase
    .from('cart_items')
    .select('store_id')
    .eq('user_id', params.userId)
    .limit(1)

  if (existing && existing.length > 0 && existing[0].store_id !== params.storeId) {
    return { success: false, error: 'Your cart has items from another store. Clear cart to add from this store.' }
  }

  const { error } = await supabase
    .from('cart_items')
    .upsert({
      user_id: params.userId,
      product_id: params.productId,
      store_id: params.storeId,
      quantity: params.quantity,
      selected_variant: params.selectedVariant ?? null,
    }, { onConflict: 'user_id,product_id' })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateCartItemQuantity(userId: string, cartItemId: string, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await supabase.from('cart_items').delete().eq('id', cartItemId).eq('user_id', userId)
  } else {
    await supabase.from('cart_items').update({ quantity }).eq('id', cartItemId).eq('user_id', userId)
  }
}

export async function removeCartItem(userId: string, cartItemId: string): Promise<void> {
  await supabase.from('cart_items').delete().eq('id', cartItemId).eq('user_id', userId)
}

export async function clearCart(userId: string): Promise<void> {
  await supabase.from('cart_items').delete().eq('user_id', userId)
}

export function calculateCartTotals(items: CartItemRow[]): CartTotals {
  const subtotal = items.reduce((sum, item) => {
    const price = item.selected_variant?.price ?? item.products.price
    return sum + price * item.quantity
  }, 0)
  return { subtotal, itemCount: items.reduce((s, i) => s + i.quantity, 0) }
}

export interface CouponValidation {
  valid: boolean
  discount: number
  code: string
  error?: string
}

export async function validateCoupon(storeId: string, code: string, orderAmount: number): Promise<CouponValidation> {
  if (!code.trim()) return { valid: false, discount: 0, code, error: 'Enter a coupon code' }

  const { data: coupon } = await supabase
    .from('coupons')
    .select('*')
    .eq('store_id', storeId)
    .eq('code', code.toUpperCase().trim())
    .eq('is_active', true)
    .single()

  if (!coupon) return { valid: false, discount: 0, code, error: 'Invalid coupon code' }
  if (coupon.valid_until && new Date(coupon.valid_until) < new Date())
    return { valid: false, discount: 0, code, error: 'Coupon has expired' }
  if (coupon.max_uses && coupon.total_uses >= coupon.max_uses)
    return { valid: false, discount: 0, code, error: 'Coupon usage limit reached' }
  if (orderAmount < (coupon.min_order_amount ?? 0))
    return { valid: false, discount: 0, code, error: `Min order ₹${coupon.min_order_amount} required` }

  let discount = coupon.type === 'percent'
    ? orderAmount * (coupon.value / 100)
    : coupon.value

  if (coupon.max_discount) discount = Math.min(discount, coupon.max_discount)
  discount = Math.round(discount)

  return { valid: true, discount, code }
}

export function cartItemsToCheckout(items: CartItemRow[]) {
  return items.map(item => ({
    productId: item.product_id,
    name: item.products.name,
    image: item.products.images?.[0] ?? '',
    price: item.selected_variant?.price ?? item.products.price,
    variant: item.selected_variant?.value,
    qty: item.quantity,
  }))
}
