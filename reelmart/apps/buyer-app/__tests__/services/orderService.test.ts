/**
 * P1 — orderService create/read + status label/icon maps.
 *
 * Targets the REAL module:
 *   src/services/orderService.ts
 *     createOrder        (insert → { orderId, orderNumber }; throws on error)
 *     getBuyerOrders     (returns rows or [])
 *     getOrderById       (returns row or null)
 *     STATUS_LABELS / STATUS_ICONS / STATUS_STEPS
 *
 * Supabase replaced at module boundary. The fake resolves `.single()` and the
 * thenable to the configured `orders` response.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import { setTableResponse, resetSupabaseMock, supabase } from '../mocks/supabaseMock';
import {
  createOrder,
  getBuyerOrders,
  getOrderById,
  STATUS_LABELS,
  STATUS_ICONS,
  STATUS_STEPS,
  type DeliveryAddress,
} from '../../src/services/orderService';

const ADDR: DeliveryAddress = {
  name: 'Asha', phone: '9876543210', line1: '12 MG Rd',
  city: 'Hyderabad', state: 'Telangana', pincode: '500034',
};

beforeEach(() => resetSupabaseMock());

describe('orderService.createOrder', () => {
  it('inserts a pending COD order and returns its id + number', async () => {
    setTableResponse('orders', { id: 'order-123', order_number: 'RM1ABC' });

    const res = await createOrder({
      buyerId: 'buyer-1', storeId: 'store-A',
      items: [{ productId: 'p1', name: 'Saree', image: '', price: 600, qty: 2 }],
      subtotal: 1200, deliveryFee: 60, discountAmount: 0, totalAmount: 1260,
      deliveryAddress: ADDR, paymentMethod: 'cod',
    });

    expect(res).toEqual({ orderId: 'order-123', orderNumber: 'RM1ABC' });

    // Insert payload carries the pending status + the right money fields.
    const builder = (supabase.from as jest.Mock).mock.results.at(-1)!.value;
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        buyer_id: 'buyer-1', store_id: 'store-A',
        subtotal: 1200, delivery_fee: 60, total_amount: 1260,
        payment_method: 'cod', status: 'pending', payment_status: 'pending',
      }),
    );
  });

  it('returns an empty orderNumber when the DB row lacks one', async () => {
    setTableResponse('orders', { id: 'order-x', order_number: null });
    const res = await createOrder({
      buyerId: 'b', storeId: 's', items: [], subtotal: 0, deliveryFee: 0,
      discountAmount: 0, totalAmount: 0, deliveryAddress: ADDR, paymentMethod: 'cod',
    });
    expect(res.orderNumber).toBe('');
  });

  it('throws when the insert errors (e.g. interstate-GST DB trigger)', async () => {
    setTableResponse('orders', null, { message: 'INTERSTATE_GST: seller cannot ship here' });
    await expect(
      createOrder({
        buyerId: 'b', storeId: 's', items: [], subtotal: 0, deliveryFee: 0,
        discountAmount: 0, totalAmount: 0, deliveryAddress: ADDR, paymentMethod: 'cod',
      }),
    ).rejects.toThrow(/INTERSTATE_GST/);
  });
});

describe('orderService.getBuyerOrders / getOrderById', () => {
  it('returns the buyer order rows', async () => {
    setTableResponse('orders', [{ id: 'o1' }, { id: 'o2' }]);
    const orders = await getBuyerOrders('buyer-1');
    expect(orders.map(o => o.id)).toEqual(['o1', 'o2']);
  });

  it('returns [] when there are no orders', async () => {
    setTableResponse('orders', null);
    expect(await getBuyerOrders('buyer-1')).toEqual([]);
  });

  it('getOrderById returns the single row', async () => {
    setTableResponse('orders', { id: 'o9', total_amount: 999 });
    const o = await getOrderById('o9');
    expect(o?.id).toBe('o9');
  });

  it('getOrderById returns null when not found', async () => {
    setTableResponse('orders', null);
    expect(await getOrderById('missing')).toBeNull();
  });
});

describe('orderService — status label/icon maps (order-list & detail badges)', () => {
  it('STATUS_STEPS is the happy-path lifecycle in order', () => {
    expect(STATUS_STEPS).toEqual(['pending', 'accepted', 'packed', 'shipped', 'delivered']);
  });

  it('every lifecycle status has a human label and an icon', () => {
    for (const s of [...STATUS_STEPS, 'rejected', 'cancelled']) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(STATUS_ICONS[s]).toBeTruthy();
    }
  });

  it('uses buyer-friendly copy ("Order Placed" for pending, "Delivered")', () => {
    expect(STATUS_LABELS.pending).toBe('Order Placed');
    expect(STATUS_LABELS.delivered).toBe('Delivered');
  });
});
