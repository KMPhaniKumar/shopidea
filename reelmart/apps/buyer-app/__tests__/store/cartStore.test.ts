/**
 * P0 — Cart Zustand store + cartService logic.
 *
 * Targets the REAL modules:
 *   src/store/cartStore.ts          (useCartStore)
 *   src/services/cartService.ts     (calculateCartTotals, cartItemsToCheckout)
 *   src/services/orderPricing.ts    (fmtRupee — ₹ formatting)
 *
 * Supabase is mocked at the module boundary (../lib/supabase) so the store's
 * fetch/add/update/remove/clear paths exercise their real reducer logic while
 * the DB layer returns controlled rows. No network/native code runs.
 */
// Replace the supabase client used by cartService with our fake.
// The factory must require lazily (jest hoists mocks above imports).
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import { setTableResponse, resetSupabaseMock } from '../mocks/supabaseMock';

import { useCartStore } from '../../src/store/cartStore';
import {
  calculateCartTotals,
  cartItemsToCheckout,
  type CartItemRow,
} from '../../src/services/cartService';
import { fmtRupee } from '../../src/services/orderPricing';

const USER = 'user-test-id';
const STORE = {
  id: 'store-1',
  store_name: 'Kiran Sarees',
  store_slug: 'kiran-sarees',
  logo_url: null,
  city: 'Hyderabad',
};

function makeItem(over: Partial<CartItemRow> & { id: string; price: number; quantity: number; comparePrice?: number | null; variantPrice?: number | null }): CartItemRow {
  return {
    id: over.id,
    user_id: USER,
    product_id: `prod-${over.id}`,
    store_id: STORE.id,
    quantity: over.quantity,
    variant_id: null,
    selected_variant:
      over.variantPrice != null
        ? { name: 'Size', value: 'M', price: over.variantPrice }
        : null,
    created_at: '2026-06-23T00:00:00Z',
    products: {
      id: `prod-${over.id}`,
      name: `Product ${over.id}`,
      price: over.price,
      compare_price: over.comparePrice ?? null,
      weight_grams: 500,
      images: ['https://img/x.jpg'],
      stock_count: 10,
      stock_type: 'limited',
      is_available: true,
    },
    stores: STORE,
  } as CartItemRow;
}

beforeEach(() => {
  resetSupabaseMock();
  // Reset the zustand store between tests.
  useCartStore.setState({
    items: [], itemCount: 0, subtotal: 0,
    storeId: null, storeName: null, storeSlug: null, loading: false,
  });
});

describe('cartService.calculateCartTotals — subtotal / total math', () => {
  it('sums price × quantity across items', () => {
    const items = [
      makeItem({ id: '1', price: 200, quantity: 2 }), // 400
      makeItem({ id: '2', price: 150, quantity: 3 }), // 450
    ];
    const { subtotal, itemCount } = calculateCartTotals(items);
    expect(subtotal).toBe(850);
    expect(itemCount).toBe(5);
  });

  it('prefers the selected variant price over the base product price', () => {
    const items = [
      makeItem({ id: '1', price: 200, quantity: 2, variantPrice: 250 }), // 500
    ];
    expect(calculateCartTotals(items).subtotal).toBe(500);
  });

  it('returns zero totals for an empty cart', () => {
    expect(calculateCartTotals([])).toEqual({ subtotal: 0, itemCount: 0 });
  });
});

describe('orderPricing.fmtRupee — ₹ formatting (en-IN)', () => {
  it('formats integers without decimals using Indian grouping', () => {
    expect(fmtRupee(850)).toBe('850');
    expect(fmtRupee(125000)).toBe('1,25,000'); // Indian lakh grouping
  });

  it('formats non-integers to two decimals', () => {
    expect(fmtRupee(99.5)).toBe('99.50');
  });
});

describe('useCartStore — fetch / add / update / remove / clear', () => {
  it('fetchCart loads items and derives subtotal, count and store metadata', async () => {
    const items = [
      makeItem({ id: '1', price: 200, quantity: 2 }),
      makeItem({ id: '2', price: 100, quantity: 1 }),
    ];
    setTableResponse('cart_items', items);

    await useCartStore.getState().fetchCart(USER);

    const s = useCartStore.getState();
    expect(s.items).toHaveLength(2);
    expect(s.subtotal).toBe(500);
    expect(s.itemCount).toBe(3);
    expect(s.storeId).toBe('store-1');
    expect(s.storeName).toBe('Kiran Sarees');
    expect(s.storeSlug).toBe('kiran-sarees');
    expect(s.loading).toBe(false);
  });

  it('addItem inserts then re-fetches the cart (quantity reflected)', async () => {
    // After upsert, the re-fetch returns the new cart state.
    setTableResponse('cart_items', [makeItem({ id: '1', price: 300, quantity: 2 })]);

    const result = await useCartStore.getState().addItem({
      userId: USER, productId: 'prod-1', storeId: STORE.id, quantity: 2,
    });

    expect(result.success).toBe(true);
    const s = useCartStore.getState();
    expect(s.itemCount).toBe(2);
    expect(s.subtotal).toBe(600);
  });

  it('addItem rejects items from a second store (single-store cart rule)', async () => {
    // Existing cart already has an item from a DIFFERENT store.
    setTableResponse('cart_items', [{ store_id: 'other-store' }]);

    const result = await useCartStore.getState().addItem({
      userId: USER, productId: 'prod-9', storeId: STORE.id, quantity: 1,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/another store/i);
  });

  it('updateQty changes quantity and recomputes totals', async () => {
    // updateCartItemQuantity issues a DB update, then fetchCart returns new state.
    setTableResponse('cart_items', [makeItem({ id: '1', price: 200, quantity: 4 })]);

    await useCartStore.getState().updateQty(USER, '1', 4);

    const s = useCartStore.getState();
    expect(s.itemCount).toBe(4);
    expect(s.subtotal).toBe(800);
  });

  it('removeItem deletes and re-fetches the remaining cart', async () => {
    setTableResponse('cart_items', [makeItem({ id: '2', price: 100, quantity: 1 })]);

    await useCartStore.getState().removeItem(USER, '1');

    const s = useCartStore.getState();
    expect(s.items.map((i) => i.id)).toEqual(['2']);
    expect(s.subtotal).toBe(100);
  });

  it('clearAll empties the cart and resets store metadata immediately', async () => {
    // Seed a non-empty state first.
    setTableResponse('cart_items', [makeItem({ id: '1', price: 200, quantity: 2 })]);
    await useCartStore.getState().fetchCart(USER);
    expect(useCartStore.getState().subtotal).toBe(400);

    await useCartStore.getState().clearAll(USER);

    const s = useCartStore.getState();
    expect(s.items).toEqual([]);
    expect(s.itemCount).toBe(0);
    expect(s.subtotal).toBe(0);
    expect(s.storeId).toBeNull();
    expect(s.storeName).toBeNull();
  });
});

describe('cartService.cartItemsToCheckout — checkout payload shape', () => {
  it('maps cart rows to checkout line-items with variant price + first image', () => {
    const items = [makeItem({ id: '1', price: 200, quantity: 2, comparePrice: 300, variantPrice: 250 })];
    const out = cartItemsToCheckout(items);
    expect(out).toEqual([
      {
        productId: 'prod-1',
        name: 'Product 1',
        image: 'https://img/x.jpg',
        price: 250,            // variant price wins
        compare_price: 300,
        weight_grams: 500,
        variant: 'M',
        qty: 2,
      },
    ]);
  });
});
