/**
 * P3 — OrderTrackingScreen (order tracking): order header, price breakup,
 * delivery address, the embedded OrderTimeline (status header + ALL UPDATES),
 * and the courier-tracking card once shipped.
 *
 * Renders the REAL screen + REAL OrderTimeline. We:
 *   - seed the order into useOrderStore so the screen finds it locally
 *     (no getOrderById round-trip),
 *   - keep orderEvents' REAL pure logic but mock its network/realtime helpers
 *     (fetchOrderEvents / subscribeToOrderEvents) so the timeline renders from
 *     controlled events with no Supabase call,
 *   - mock orderService.subscribeToOrderStatus to a no-op channel.
 * supabase is mocked at the boundary (removeChannel on unmount).
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

// Keep the pure catalog/derive logic; stub only the data + realtime helpers.
jest.mock('../../src/services/orderEvents', () => {
  const actual = jest.requireActual('../../src/services/orderEvents');
  return {
    ...actual,
    fetchOrderEvents: jest.fn(async () => []),
    subscribeToOrderEvents: jest.fn(() => ({ unsubscribe: jest.fn() })),
  };
});
// Don't open a real orders channel; keep the label/helper exports real.
jest.mock('../../src/services/orderService', () => {
  const actual = jest.requireActual('../../src/services/orderService');
  return {
    ...actual,
    subscribeToOrderStatus: jest.fn(() => ({ unsubscribe: jest.fn() })),
    getOrderById: jest.fn(async () => null),
  };
});

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import OrderTrackingScreen from '../../src/screens/orders/OrderTrackingScreen';
import { useOrderStore } from '../../src/store/orderStore';
import * as orderEvents from '../../src/services/orderEvents';

const nav = { navigate: jest.fn() } as any;
const route = { params: { orderId: 'o1' } } as any;

const ADDRESS = {
  name: 'Asha', phone: '9999999999', line1: '12 MG Road', line2: 'Flat 4',
  area: 'Tilak Nagar', city: 'Bapatla', state: 'Andhra Pradesh', pincode: '522101',
};

function seedOrder(overrides: any = {}) {
  useOrderStore.setState({
    orders: [{
      id: 'o1',
      order_number: 'RM1ABCD',
      status: 'pending',
      created_at: '2026-06-01T10:00:00.000Z',
      items: [{ name: 'Cotton Kurti', price: 799, qty: 2 }],
      subtotal: 1598,
      delivery_fee: 60,
      discount_amount: 0,
      coins_discount: 0,
      total_amount: 1658,
      delivery_address: ADDRESS,
      payment_method: 'cod',
      stores: { store_name: 'Blue Whale', store_slug: 'blue-whale', logo_url: null },
      ...overrides,
    }] as any,
    loading: false,
  });
}

function evRow(code: string, title: string, occurred_at: string, extra: any = {}) {
  return {
    id: code, order_id: 'o1', code, title, description: null, location: null,
    source: 'system', is_exception: false, estimated_delivery: null,
    occurred_at, meta: null, created_at: occurred_at, ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (orderEvents.fetchOrderEvents as jest.Mock).mockResolvedValue([]);
});

describe('OrderTrackingScreen — header + order detail', () => {
  it('renders the order number, store name, items and price breakup', async () => {
    seedOrder();
    render(<OrderTrackingScreen navigation={nav} route={route} />);

    expect(await screen.findByText('RM1ABCD')).toBeOnTheScreen();
    expect(screen.getByText('Blue Whale')).toBeOnTheScreen();
    expect(screen.getByText('Cotton Kurti')).toBeOnTheScreen();
    // item line: ₹{price*qty} ×{qty} → ₹1598 ×2
    expect(screen.getByText('₹1598 ×2')).toBeOnTheScreen();
    // grand total appears in the price details (₹1,658 with Indian grouping)
    expect(screen.getByText('₹1,658')).toBeOnTheScreen();
  });

  it('renders the COD "paid by" pill and the delivery address lines', async () => {
    seedOrder();
    render(<OrderTrackingScreen navigation={nav} route={route} />);
    await screen.findByText('RM1ABCD');

    expect(screen.getByText('Cash on Delivery')).toBeOnTheScreen();
    expect(screen.getByText('12 MG Road, Flat 4, Tilak Nagar')).toBeOnTheScreen();
    expect(screen.getByText('Bapatla, Andhra Pradesh – 522101')).toBeOnTheScreen();
    expect(screen.getByText('Asha')).toBeOnTheScreen();
  });

  it('returns null (renders nothing) when the order is unknown and fetch yields none', async () => {
    useOrderStore.setState({ orders: [], loading: false });
    const { toJSON } = render(<OrderTrackingScreen navigation={nav} route={{ params: { orderId: 'missing' } } as any} />);
    await waitFor(() => expect(toJSON()).toBeNull());
  });
});

describe('OrderTrackingScreen — embedded OrderTimeline', () => {
  it('shows the default "Order placed" header + empty-feed copy with no events', async () => {
    seedOrder();
    render(<OrderTrackingScreen navigation={nav} route={route} />);

    expect(await screen.findByText('ALL UPDATES')).toBeOnTheScreen();
    // deriveTimelineState([]) → headline "Order placed"
    expect(screen.getByText('Order placed')).toBeOnTheScreen();
    expect(
      screen.getByText('Tracking updates will appear here as your order progresses.')
    ).toBeOnTheScreen();
  });

  it('renders the event feed + latest headline when events exist', async () => {
    (orderEvents.fetchOrderEvents as jest.Mock).mockResolvedValue([
      evRow('order_placed', 'Order placed', '2026-06-01T10:00:00Z'),
      evRow('order_accepted', 'Order accepted', '2026-06-01T11:00:00Z'),
      evRow('shipment_booked', 'Shipment booked', '2026-06-02T09:00:00Z'),
    ]);
    seedOrder();
    render(<OrderTrackingScreen navigation={nav} route={route} />);

    // Latest event headline appears in the status header (and the feed).
    expect(await screen.findAllByText('Shipment booked')).toBeTruthy();
    expect(screen.getByText('Order accepted')).toBeOnTheScreen();
  });
});

describe('OrderTrackingScreen — shipped courier card', () => {
  it('shows the AWB tracking card once the order is shipped with a tracking url', async () => {
    seedOrder({ status: 'shipped', tracking_url: 'https://track.example/AWB123', awb_code: 'AWB123' });
    render(<OrderTrackingScreen navigation={nav} route={route} />);
    await screen.findByText('RM1ABCD');

    expect(screen.getByText('🚚 Track with Courier')).toBeOnTheScreen();
    expect(screen.getByText('AWB: AWB123')).toBeOnTheScreen();
  });

  it('shows the "tracking pending" notice when shipped without a url yet', async () => {
    seedOrder({ status: 'shipped', tracking_url: null });
    render(<OrderTrackingScreen navigation={nav} route={route} />);
    await screen.findByText('RM1ABCD');
    expect(screen.getByText('📦 Shipped — tracking pending')).toBeOnTheScreen();
  });
});
