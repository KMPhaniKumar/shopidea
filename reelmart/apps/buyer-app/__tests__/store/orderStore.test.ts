/**
 * P1 — Order Zustand store (drives OrderHistoryScreen + checkout optimistic add).
 *
 * Targets the REAL module:
 *   src/store/orderStore.ts  (useOrderStore: fetchOrders, updateOrder, prependOrder)
 *
 * orderService (and through it supabase) is mocked at the module boundary so the
 * store's reducer logic runs for real against controlled service results.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import { setTableResponse, resetSupabaseMock } from '../mocks/supabaseMock';
import { useOrderStore } from '../../src/store/orderStore';

beforeEach(() => {
  resetSupabaseMock();
  useOrderStore.setState({ orders: [], loading: false });
});

describe('useOrderStore.fetchOrders', () => {
  it('loads the buyer orders and clears the loading flag', async () => {
    setTableResponse('orders', [
      { id: 'o1', status: 'pending', total_amount: 500 },
      { id: 'o2', status: 'delivered', total_amount: 1200 },
    ]);

    await useOrderStore.getState().fetchOrders('buyer-1');

    const s = useOrderStore.getState();
    expect(s.orders.map(o => o.id)).toEqual(['o1', 'o2']);
    expect(s.loading).toBe(false);
  });

  it('leaves orders empty (and not loading) when the buyer has none', async () => {
    setTableResponse('orders', null);
    await useOrderStore.getState().fetchOrders('buyer-1');
    expect(useOrderStore.getState().orders).toEqual([]);
    expect(useOrderStore.getState().loading).toBe(false);
  });
});

describe('useOrderStore.updateOrder — realtime status patch', () => {
  it('merges a status update into the matching order only', () => {
    useOrderStore.setState({
      orders: [
        { id: 'o1', status: 'pending' } as any,
        { id: 'o2', status: 'pending' } as any,
      ],
      loading: false,
    });

    useOrderStore.getState().updateOrder('o2', { status: 'shipped' } as any);

    const orders = useOrderStore.getState().orders;
    expect(orders.find(o => o.id === 'o1')!.status).toBe('pending');
    expect(orders.find(o => o.id === 'o2')!.status).toBe('shipped');
  });

  it('is a no-op when the order id is unknown', () => {
    useOrderStore.setState({ orders: [{ id: 'o1', status: 'pending' } as any], loading: false });
    useOrderStore.getState().updateOrder('does-not-exist', { status: 'delivered' } as any);
    expect(useOrderStore.getState().orders[0].status).toBe('pending');
  });
});

describe('useOrderStore.prependOrder — optimistic insert after checkout', () => {
  it('places the new order at the front of the list', () => {
    useOrderStore.setState({ orders: [{ id: 'old' } as any], loading: false });
    useOrderStore.getState().prependOrder({ id: 'new' } as any);
    expect(useOrderStore.getState().orders.map(o => o.id)).toEqual(['new', 'old']);
  });
});
