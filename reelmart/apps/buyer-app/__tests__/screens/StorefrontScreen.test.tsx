/**
 * P0/P1 — StorefrontScreen: add-to-cart wiring, qty stepper, checkout navigation
 * payload, and the sign-in auth guard.
 *
 * Renders the REAL screen. The data services it calls (discoveryService,
 * profileService) are mocked so we control the store + product fixtures; the
 * in-screen cart state, totals, and navigation payload are the REAL logic
 * under test. The GST interstate modal is bypassed by giving the store
 * gst_verified=true (so addToCart adds immediately, no pincode gate).
 *
 * supabase is mocked at the module boundary (interstateGst.fireInterstateDemand
 * etc. never run for an add). Alert is spied to assert the auth guard.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

jest.mock('../../src/services/discoveryService', () => ({
  getStoreBySlug: jest.fn(),
  getStoreProducts: jest.fn(),
  toggleFollowStore: jest.fn(async () => true),
  CATEGORIES: [{ id: 'clothing', label: 'Clothing', icon: '👗' }],
}));
jest.mock('../../src/services/profileService', () => ({
  getWishlist: jest.fn(async () => []),
  toggleWishlist: jest.fn(async () => true),
}));

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import StorefrontScreen from '../../src/screens/store/StorefrontScreen';
import { useAuthStore } from '../../src/store/authStore';
import * as discovery from '../../src/services/discoveryService';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;
const route = { params: { slug: 'blue-whale' } } as any;

const STORE = {
  id: 'store-bw', store_name: 'Blue Whale', store_slug: 'blue-whale',
  category: 'clothing', logo_url: null, area: 'Bapatla', city: 'Bapatla',
  state: 'Andhra Pradesh', gst_verified: true, is_verified: true, is_open: true,
  rating_avg: 4.5, total_reviews: 12, whatsapp_number: null,
};
const PRODUCTS = [
  { id: 'p1', name: 'Cotton Kurti', price: 799, images: ['k.jpg'], stock: 5, weight_grams: 300 },
  { id: 'p2', name: 'Silk Saree', price: 2499, images: ['s.jpg'], stock: 2, weight_grams: 600 },
];

function authed() {
  useAuthStore.setState({
    session: { access_token: 'a', refresh_token: 'r', user: { id: 'buyer-1' } } as any,
    profile: { id: 'buyer-1', name: 'Asha' } as any,
    loading: false,
  });
}
function guest() {
  useAuthStore.setState({ session: null, profile: null, loading: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  (discovery.getStoreBySlug as jest.Mock).mockResolvedValue(STORE);
  (discovery.getStoreProducts as jest.Mock).mockResolvedValue(PRODUCTS);
});

describe('StorefrontScreen — rendering', () => {
  it('renders the store header and product grid once loaded', async () => {
    authed();
    render(<StorefrontScreen navigation={nav} route={route} />);
    expect(await screen.findByText('Blue Whale')).toBeOnTheScreen();
    expect(screen.getByText('Cotton Kurti')).toBeOnTheScreen();
    expect(screen.getByText('₹799')).toBeOnTheScreen();
    expect(screen.getByText('Silk Saree')).toBeOnTheScreen();
    expect(screen.getByText('Products (2)')).toBeOnTheScreen();
  });

  it('shows a "Store not found" message when the slug resolves to nothing', async () => {
    authed();
    (discovery.getStoreBySlug as jest.Mock).mockResolvedValue(null);
    (discovery.getStoreProducts as jest.Mock).mockResolvedValue([]);
    render(<StorefrontScreen navigation={nav} route={route} />);
    expect(await screen.findByText('Store not found')).toBeOnTheScreen();
  });
});

describe('StorefrontScreen — add-to-cart wiring', () => {
  it('adds a product, swaps the Add button for a qty stepper, and shows the cart footer total', async () => {
    authed();
    render(<StorefrontScreen navigation={nav} route={route} />);
    await screen.findByText('Cotton Kurti');

    // Two "Add" buttons (one per product). Press the first.
    const addButtons = screen.getAllByText('Add');
    expect(addButtons).toHaveLength(2);
    fireEvent.press(addButtons[0]);

    // Stepper now shows qty 1; footer total ₹799 appears in addition to the
    // product price label (so there are two ₹799 nodes) + "1 item" footer copy.
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getAllByText('₹799').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('1 item')).toBeOnTheScreen();
  });

  it('increments quantity and recomputes the footer total via the + stepper', async () => {
    authed();
    render(<StorefrontScreen navigation={nav} route={route} />);
    await screen.findByText('Cotton Kurti');

    fireEvent.press(screen.getAllByText('Add')[0]); // qty 1
    fireEvent.press(screen.getByText('+'));          // qty 2

    expect(screen.getByText('2')).toBeOnTheScreen();
    // footer subtotal = 799 × 2 = 1598
    expect(screen.getByText('₹1598')).toBeOnTheScreen();
    expect(screen.getByText('2 items')).toBeOnTheScreen();
  });
});

describe('StorefrontScreen — checkout navigation + auth guard', () => {
  it('navigates to Checkout with storeId, name, items and subtotal', async () => {
    authed();
    render(<StorefrontScreen navigation={nav} route={route} />);
    await screen.findByText('Cotton Kurti');

    fireEvent.press(screen.getAllByText('Add')[0]); // add Cotton Kurti
    fireEvent.press(screen.getByText(/Proceed to Checkout/));

    expect(nav.navigate).toHaveBeenCalledWith('Checkout', expect.objectContaining({
      storeId: 'store-bw',
      storeName: 'Blue Whale',
      subtotal: 799,
      items: [expect.objectContaining({ productId: 'p1', name: 'Cotton Kurti', price: 799, qty: 1 })],
    }));
  });

  it('blocks add-to-wishlist for a guest with a sign-in prompt (no navigation)', async () => {
    guest();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    render(<StorefrontScreen navigation={nav} route={route} />);
    await screen.findByText('Cotton Kurti');

    // A guest CAN add to the in-session cart, but checkout requires sign-in.
    fireEvent.press(screen.getAllByText('Add')[0]);
    fireEvent.press(screen.getByText(/Proceed to Checkout/));

    expect(alertSpy).toHaveBeenCalledWith('Sign in required', expect.stringMatching(/sign in/i));
    expect(nav.navigate).not.toHaveBeenCalledWith('Checkout', expect.anything());
    alertSpy.mockRestore();
  });
});
