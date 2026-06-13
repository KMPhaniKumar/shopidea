/**
 * Canonical test identity fixtures.
 * All IDs are RFC 4122 valid UUIDs (required by Zod z.string().uuid() validation
 * in the service routes).
 *
 * Phone numbers and roles match what's seeded in dev Supabase
 * (AUDIT_gaps.md §3 "Test accounts").
 *
 * For API tests we never mint real tokens — we mock the Supabase
 * auth.getUser() call to return these identities directly.
 */

export const BUYER = {
  id: '11111111-0001-4000-8000-000000000001',
  phone: '+919999900001',
  role: 'buyer',
}

export const SELLER = {
  id: '22222222-0002-4000-8000-000000000002',
  phone: '+919999900002',
  role: 'seller',
}

export const ADMIN = {
  id: '33333333-0003-4000-8000-000000000003',
  phone: '+919999900003',
  role: 'admin',
}

export const OTHER_BUYER = {
  id: '99999999-0099-4000-8000-000000000099',
  phone: '+919999900099',
  role: 'buyer',
}

export const OTHER_SELLER = {
  id: '88888888-0088-4000-8000-000000000088',
  phone: '+919999900088',
  role: 'seller',
}

export const STORE = {
  id: 'aaaaaaaa-0001-4000-8000-000000000001',
  seller_id: SELLER.id,
  store_name: 'Test Store',
  store_slug: 'test-store',
  is_active: true,
}

export const OTHER_STORE = {
  id: 'bbbbbbbb-0002-4000-8000-000000000002',
  seller_id: OTHER_SELLER.id,
  store_name: 'Other Store',
  store_slug: 'other-store',
  is_active: true,
}

export const ORDER = {
  id: 'cccccccc-0001-4000-8000-000000000001',
  buyer_id: BUYER.id,
  store_id: STORE.id,
  order_number: 'RM1TEST',
  items: [{ productId: 'prod-1', name: 'Test Product', price: 500, qty: 2 }],
  subtotal: 1000,
  delivery_fee: 60,
  discount: 0,
  total_amount: 1060,
  payment_status: 'pending',
  status: 'pending',
  razorpay_order_id: 'order_test_razorpay_001',
  razorpay_payment_id: null,
  stores: {
    seller_id: SELLER.id,
    store_name: 'Test Store',
    store_slug: 'test-store',
  },
}

/** A fake Supabase auth user object (what auth.getUser resolves to) */
export function makeSupabaseUser(identity: { id: string; phone?: string }) {
  return {
    id: identity.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${identity.id}@test.local`,
    phone: identity.phone ?? '',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  }
}

/** Bearer token sentinel — always 'Bearer test-token-<id>' */
export function bearerToken(identity: { id: string }) {
  return `Bearer test-token-${identity.id}`
}
