/**
 * P3 — ProfileScreen: profile card, loyalty-coins card, quick stats, nav rows,
 * and the sign-out confirmation.
 *
 * Renders the REAL screen. It reads three Zustand stores (auth, order, cart) and
 * calls getCoinBalance on mount. We mock:
 *   - profileService (getCoinBalance, buildReferralLink) to control coins/referral
 *   - orderService.getBuyerOrders + cartService.getCart so the stores' fetch
 *     effects resolve against controlled fixtures
 *   - supabase at the boundary (stores import it transitively)
 * Alert is spied to assert the sign-out confirm dialog.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

jest.mock('../../src/services/profileService', () => ({
  getCoinBalance: jest.fn(async () => 250),
  buildReferralLink: (code: string) => `https://reelmart.in/join?ref=${code}`,
}));
jest.mock('../../src/services/orderService', () => ({
  getBuyerOrders: jest.fn(async () => []),
}));
jest.mock('../../src/services/cartService', () => ({
  getCart: jest.fn(async () => []),
  calculateCartTotals: () => ({ subtotal: 0, itemCount: 0 }),
  cartItemsToCheckout: () => [],
}));

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../../src/screens/profile/ProfileScreen';
import { useAuthStore } from '../../src/store/authStore';
import { useOrderStore } from '../../src/store/orderStore';
import * as orderService from '../../src/services/orderService';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;

const ORDERS = [
  { id: 'o1', status: 'pending', total_amount: 1060, stores: null },
  { id: 'o2', status: 'delivered', total_amount: 500, stores: null },
  { id: 'o3', status: 'shipped', total_amount: 800, stores: null },
] as any[];

function signIn(profileOverride: any = {}) {
  useAuthStore.setState({
    session: { access_token: 'a', refresh_token: 'r', user: { id: 'buyer-1', phone: '+919999999999' } } as any,
    profile: { id: 'buyer-1', name: 'Asha', ...profileOverride } as any,
    loading: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useOrderStore.setState({ orders: [], loading: false });
});

describe('ProfileScreen — identity + coins', () => {
  it('renders the buyer name, masked +91 phone, and coin balance', async () => {
    signIn();
    render(<ProfileScreen navigation={nav} />);

    expect(await screen.findByText('Asha')).toBeOnTheScreen();
    expect(screen.getByText('+91 9999999999')).toBeOnTheScreen();
    expect(screen.getByText('🪙 250 coins')).toBeOnTheScreen();
    // 250 coins ≈ ₹25 off (floor(250/10))
    expect(screen.getByText('≈ ₹25 off your next order')).toBeOnTheScreen();
  });

  it('shows the avatar initial from the profile name', async () => {
    signIn({ name: 'Bharath' });
    render(<ProfileScreen navigation={nav} />);
    expect(await screen.findByText('B')).toBeOnTheScreen();
  });
});

describe('ProfileScreen — stats + navigation', () => {
  it('renders order count + active-order count once orders load', async () => {
    (orderService.getBuyerOrders as jest.Mock).mockResolvedValue(ORDERS);
    signIn();
    render(<ProfileScreen navigation={nav} />);

    // wait for the on-mount fetchOrders to populate the store
    await waitFor(() => expect(screen.getByText('Order History')).toBeOnTheScreen());
    // 3 orders, 2 active (pending + shipped; delivered excluded)
    expect(screen.getByText('3 orders')).toBeOnTheScreen();
    expect(screen.getByText('2 active')).toBeOnTheScreen();
  });

  it('navigates to Addresses when "Saved Addresses" is tapped', async () => {
    signIn();
    render(<ProfileScreen navigation={nav} />);
    fireEvent.press(await screen.findByText('Saved Addresses'));
    expect(nav.navigate).toHaveBeenCalledWith('Addresses');
  });

  it('navigates to Wishlist when "Wishlist" is tapped', async () => {
    signIn();
    render(<ProfileScreen navigation={nav} />);
    fireEvent.press(await screen.findByText('Wishlist'));
    expect(nav.navigate).toHaveBeenCalledWith('Wishlist');
  });
});

describe('ProfileScreen — sign out', () => {
  it('opens a confirmation Alert (does not sign out immediately)', async () => {
    signIn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<ProfileScreen navigation={nav} />);

    fireEvent.press(await screen.findByText('Sign Out'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Sign out',
      'Are you sure?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Sign Out', style: 'destructive' }),
      ]),
    );
    alertSpy.mockRestore();
  });
});
