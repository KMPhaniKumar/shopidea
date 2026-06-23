/**
 * P3 — HomeScreen search: the debounced search box switches the feed to results
 * (shops + products), shows the no-results empty state, and ignores blank input.
 *
 * Renders the REAL screen. discoveryService is fully mocked so we control the
 * home-feed loaders AND the search() result; savedAddresses + LocationPromptModal
 * are stubbed (native maps / Places). Uses REAL timers + waitFor to ride out the
 * 400ms debounce (fake timers + RNTL auto-cleanup race on this screen's async
 * address effect), so each test renders exactly once.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

jest.mock('../../src/components/LocationPromptModal', () => () => null);
jest.mock('../../src/lib/savedAddresses', () => ({
  getSavedAddresses: jest.fn(async () => []),
}));

jest.mock('../../src/services/discoveryService', () => ({
  getAllTopRated: jest.fn(async () => []),
  getAllNewStores: jest.fn(async () => []),
  getAllStoresByCategory: jest.fn(async () => []),
  getFollowedStores: jest.fn(async () => []),
  getProductsByCategory: jest.fn(async () => []),
  search: jest.fn(),
  CATEGORIES: [
    { id: 'clothing', label: 'Clothing', icon: '👗' },
    { id: 'jewellery', label: 'Jewellery', icon: '💍' },
    { id: 'beauty', label: 'Beauty', icon: '💄' },
  ],
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../../src/screens/home/HomeScreen';
import { useAuthStore } from '../../src/store/authStore';
import * as discovery from '../../src/services/discoveryService';

const nav = { navigate: jest.fn() } as any;

const STORE = {
  id: 's1', store_name: 'Blue Whale', store_slug: 'blue-whale', category: 'clothing',
  logo_url: null, city: 'Bapatla', area: null, description: 'Boutique', rating_avg: 4.5,
  total_reviews: 12, total_orders: 30, is_verified: true,
};
const PRODUCT = {
  id: 'p1', name: 'Cotton Kurti', price: 799, images: [], description: 'Soft cotton',
  store_id: 's1', stores: { store_name: 'Blue Whale', store_slug: 'blue-whale', city: 'Bapatla' },
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ session: null, profile: null, loading: false });
});

describe('HomeScreen — search results', () => {
  it('renders matching shops + products after the debounce flushes', async () => {
    (discovery.search as jest.Mock).mockResolvedValue({ stores: [STORE], products: [PRODUCT] });
    render(<HomeScreen navigation={nav} />);

    fireEvent.changeText(
      await screen.findByPlaceholderText('Search stores or products...'),
      'Whale',
    );

    // 400ms debounce → search() → results render
    await waitFor(() => expect(screen.getByText('Shops (1)')).toBeOnTheScreen());
    expect(discovery.search).toHaveBeenCalledWith('Whale', expect.any(String));
    expect(screen.getByText('Products (1)')).toBeOnTheScreen();
    expect(screen.getAllByText('Blue Whale').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Cotton Kurti')).toBeOnTheScreen();
  });

  it('shows the no-results empty state when search returns nothing', async () => {
    (discovery.search as jest.Mock).mockResolvedValue({ stores: [], products: [] });
    render(<HomeScreen navigation={nav} />);

    fireEvent.changeText(
      await screen.findByPlaceholderText('Search stores or products...'),
      'zzzzz',
    );

    await waitFor(() => expect(screen.getByText('No results found')).toBeOnTheScreen());
  });

  it('does NOT call search for a whitespace-only query', async () => {
    (discovery.search as jest.Mock).mockResolvedValue({ stores: [STORE], products: [] });
    render(<HomeScreen navigation={nav} />);

    fireEvent.changeText(
      await screen.findByPlaceholderText('Search stores or products...'),
      '   ',
    );

    // give the debounce window time to (not) fire
    await new Promise(r => setTimeout(r, 500));
    expect(discovery.search).not.toHaveBeenCalled();
  });
});
