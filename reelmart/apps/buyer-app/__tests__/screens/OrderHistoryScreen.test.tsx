/**
 * P1 — OrderHistoryScreen (orders list): status badges, ₹ amounts, empty state,
 * and tap → OrderTracking navigation.
 *
 * Renders the REAL screen with RNTL. We drive it purely through the two Zustand
 * stores it reads (useAuthStore, useOrderStore) — no Supabase fetch needed
 * because we pre-seed useOrderStore.orders. supabase is still mocked at the
 * module boundary (the screen opens a realtime channel on mount; our fake
 * returns a no-op channel).
 *
 * @react-navigation/native's useFocusEffect is replaced with a plain effect so
 * the screen can render outside a NavigationContainer.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

// useFocusEffect needs a navigation context; collapse it to a normal effect.
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => cb(), []);
    },
  };
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { resetSupabaseMock, setTableResponse } from '../mocks/supabaseMock';
import OrderHistoryScreen from '../../src/screens/orders/OrderHistoryScreen';
import { useOrderStore } from '../../src/store/orderStore';
import { useAuthStore } from '../../src/store/authStore';

const nav = { navigate: jest.fn() } as any;

function seedSession() {
  useAuthStore.setState({
    session: { access_token: 'a', refresh_token: 'r', user: { id: 'buyer-1' } } as any,
    profile: { id: 'buyer-1', name: 'Asha' } as any,
    loading: false,
  });
}

function makeOrder(over: any) {
  return {
    id: 'o1', order_number: 'RM1ABC', status: 'pending', total_amount: 1260,
    created_at: '2026-06-23T10:00:00Z',
    items: [{ name: 'Banarasi Saree' }, { name: 'Dupatta' }],
    stores: { store_name: 'Surya Boutiques', logo_url: null, store_slug: 'suryaboutiques' },
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  jest.clearAllMocks();
  seedSession();
  useOrderStore.setState({ orders: [], loading: false });
});

describe('OrderHistoryScreen — empty state', () => {
  it('shows the "No orders yet" empty state when the buyer has no orders', async () => {
    setTableResponse('orders', null); // focus-effect fetch resolves to []
    render(<OrderHistoryScreen navigation={nav} />);
    expect(await screen.findByText('No orders yet')).toBeOnTheScreen();
    expect(screen.getByText(/place your first order/i)).toBeOnTheScreen();
  });
});

describe('OrderHistoryScreen — order cards', () => {
  it('renders store name, order number, items, ₹ total and a status badge', async () => {
    setTableResponse('orders', [makeOrder({})]);
    render(<OrderHistoryScreen navigation={nav} />);

    expect(await screen.findByText('Surya Boutiques')).toBeOnTheScreen();
    expect(screen.getByText(/RM1ABC/)).toBeOnTheScreen();
    expect(screen.getByText('Banarasi Saree, Dupatta')).toBeOnTheScreen();
    expect(screen.getByText('₹1260')).toBeOnTheScreen();
    // pending → "Order Placed" badge (icon + label)
    expect(screen.getByText(/Order Placed/)).toBeOnTheScreen();
  });

  it('shows the "Delivered" badge and a Reorder action for delivered orders', async () => {
    setTableResponse('orders', [makeOrder({ id: 'od', status: 'delivered' })]);
    render(<OrderHistoryScreen navigation={nav} />);
    expect(await screen.findByText(/Delivered/)).toBeOnTheScreen();
    expect(screen.getByText(/Reorder/)).toBeOnTheScreen();
  });

  it('shows a "Rejected" badge and NO reorder button for rejected orders', async () => {
    setTableResponse('orders', [makeOrder({ id: 'or', status: 'rejected' })]);
    render(<OrderHistoryScreen navigation={nav} />);
    expect(await screen.findByText(/Rejected/)).toBeOnTheScreen();
    expect(screen.queryByText(/Reorder/)).toBeNull();
  });

  it('navigates to OrderTracking with the order id when a card is tapped', async () => {
    setTableResponse('orders', [makeOrder({ id: 'o42' })]);
    render(<OrderHistoryScreen navigation={nav} />);

    fireEvent.press(await screen.findByText('Surya Boutiques'));
    expect(nav.navigate).toHaveBeenCalledWith('OrderTracking', { orderId: 'o42' });
  });
});
