/**
 * P1 — cartService write paths + coupon validation + checkout payload.
 *
 * Targets the REAL module:
 *   src/services/cartService.ts
 *     addToCart            (single-store cart rule, upsert)
 *     updateCartItemQuantity (delete-on-zero vs update)
 *     validateCoupon       (expiry / usage-cap / min-order / percent vs flat / cap)
 *     cartItemsToCheckout  (variant price + first image mapping)
 *
 * Supabase is replaced at the module boundary by the controllable fake.
 * The fake's query builder resolves `.single/.maybeSingle/.then` to the
 * configured table response, and exposes the same chainable methods the
 * service calls — so we assert the REAL branching logic, not the DB.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import {
  setTableResponse,
  resetSupabaseMock,
  supabase,
} from '../mocks/supabaseMock';
import {
  addToCart,
  updateCartItemQuantity,
  validateCoupon,
  cartItemsToCheckout,
  type CartItemRow,
} from '../../src/services/cartService';

const USER = 'buyer-1';
const STORE = 'store-A';

beforeEach(() => resetSupabaseMock());

describe('cartService.addToCart — single-store cart enforcement', () => {
  it('allows adding when the cart is empty', async () => {
    setTableResponse('cart_items', []); // existing query → [] (and upsert → no error)
    const res = await addToCart({ userId: USER, productId: 'p1', storeId: STORE, quantity: 1 });
    expect(res.success).toBe(true);
  });

  it('allows adding another item from the SAME store', async () => {
    setTableResponse('cart_items', [{ store_id: STORE }]);
    const res = await addToCart({ userId: USER, productId: 'p2', storeId: STORE, quantity: 2 });
    expect(res.success).toBe(true);
  });

  it('rejects an item from a DIFFERENT store with a clear message', async () => {
    setTableResponse('cart_items', [{ store_id: 'store-OTHER' }]);
    const res = await addToCart({ userId: USER, productId: 'p9', storeId: STORE, quantity: 1 });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/another store/i);
  });

  it('passes the selected variant through to the upsert payload', async () => {
    setTableResponse('cart_items', []);
    const variant = { name: 'Size', value: 'L', price: 750 };
    await addToCart({ userId: USER, productId: 'p1', storeId: STORE, quantity: 1, selectedVariant: variant });
    // upsert was called on the cart_items builder with our payload.
    const builder = (supabase.from as jest.Mock).mock.results.at(-1)!.value;
    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ selected_variant: variant, product_id: 'p1', store_id: STORE }),
      { onConflict: 'user_id,product_id' },
    );
  });
});

describe('cartService.updateCartItemQuantity — delete-on-zero', () => {
  it('issues a DELETE when quantity drops to 0', async () => {
    await updateCartItemQuantity(USER, 'ci-1', 0);
    const builder = (supabase.from as jest.Mock).mock.results.at(-1)!.value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.update).not.toHaveBeenCalled();
  });

  it('issues an UPDATE for a positive quantity', async () => {
    await updateCartItemQuantity(USER, 'ci-1', 3);
    const builder = (supabase.from as jest.Mock).mock.results.at(-1)!.value;
    expect(builder.update).toHaveBeenCalledWith({ quantity: 3 });
    expect(builder.delete).not.toHaveBeenCalled();
  });
});

describe('cartService.validateCoupon', () => {
  it('rejects an empty code without hitting the DB', async () => {
    const res = await validateCoupon(STORE, '   ', 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/enter a coupon/i);
  });

  it('rejects an unknown code (no row)', async () => {
    setTableResponse('coupons', null); // .single() → { data: null }
    const res = await validateCoupon(STORE, 'NOPE', 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/invalid coupon/i);
  });

  it('rejects an expired coupon', async () => {
    setTableResponse('coupons', {
      type: 'flat', value: 100, is_active: true,
      valid_until: '2020-01-01T00:00:00Z',
    });
    const res = await validateCoupon(STORE, 'OLD10', 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/expired/i);
  });

  it('rejects when usage limit reached', async () => {
    setTableResponse('coupons', {
      type: 'flat', value: 100, is_active: true,
      max_uses: 5, total_uses: 5,
    });
    const res = await validateCoupon(STORE, 'MAXED', 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/usage limit/i);
  });

  it('rejects when order amount is below the minimum', async () => {
    setTableResponse('coupons', {
      type: 'flat', value: 100, is_active: true, min_order_amount: 1500,
    });
    const res = await validateCoupon(STORE, 'BIG', 1000);
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/min order/i);
  });

  it('applies a flat discount', async () => {
    setTableResponse('coupons', { type: 'flat', value: 100, is_active: true });
    const res = await validateCoupon(STORE, 'FLAT100', 1000);
    expect(res).toMatchObject({ valid: true, discount: 100 });
  });

  it('applies a percent discount and rounds it', async () => {
    setTableResponse('coupons', { type: 'percent', value: 10, is_active: true });
    const res = await validateCoupon(STORE, 'TEN', 1234);
    expect(res.valid).toBe(true);
    expect(res.discount).toBe(123); // round(123.4)
  });

  it('caps a percent discount at max_discount', async () => {
    setTableResponse('coupons', { type: 'percent', value: 50, is_active: true, max_discount: 200 });
    const res = await validateCoupon(STORE, 'HALF', 1000); // 500 → capped to 200
    expect(res.discount).toBe(200);
  });
});

describe('cartService.cartItemsToCheckout — checkout line-item mapping', () => {
  function row(over: Partial<CartItemRow>): CartItemRow {
    return {
      id: 'ci', user_id: USER, product_id: 'prod-1', store_id: STORE,
      quantity: 2, variant_id: null, selected_variant: null, created_at: null,
      products: {
        id: 'prod-1', name: 'Saree', price: 600, compare_price: 900,
        weight_grams: 400, images: ['a.jpg', 'b.jpg'],
        stock_count: 5, stock_type: 'limited', is_available: true,
      },
      stores: { id: STORE, store_name: 'S', store_slug: 's', logo_url: null, city: 'Hyd' },
      ...over,
    } as CartItemRow;
  }

  it('uses the base price + first image when no variant is selected', () => {
    expect(cartItemsToCheckout([row({})])).toEqual([
      {
        productId: 'prod-1', name: 'Saree', image: 'a.jpg',
        price: 600, compare_price: 900, weight_grams: 400,
        variant: undefined, qty: 2,
      },
    ]);
  });

  it('prefers the variant price and surfaces the variant value', () => {
    const out = cartItemsToCheckout([
      row({ selected_variant: { name: 'Size', value: 'XL', price: 720 } }),
    ]);
    expect(out[0].price).toBe(720);
    expect(out[0].variant).toBe('XL');
  });

  it('emits an empty image string when the product has no images', () => {
    const out = cartItemsToCheckout([
      row({ products: { ...row({}).products, images: null } }),
    ]);
    expect(out[0].image).toBe('');
  });
});
