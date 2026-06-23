/**
 * P0 — RootNavigator auth guard: which screen the app shows for a given auth
 * state. This is the buyer-app's equivalent of the web SellerGate — an
 * unauthenticated user must land on the login (Phone) screen and never on the
 * authenticated tabs.
 *
 * We render the REAL RootNavigator. Its decision logic (loading → spinner,
 * no session → Phone, session-without-name → ProfileSetup, full session →
 * Tabs) is the logic under test.
 *
 * To keep this a focused unit test (no real React Navigation runtime / native
 * stack / gesture-handler), we:
 *   - stub NavigationContainer to a passthrough,
 *   - stub createNativeStackNavigator so the Navigator renders ONLY its first
 *     <Screen> child (which is exactly what a real native stack shows on mount),
 *   - stub every screen component to a tiny <Text> tagged with its route name.
 * The auth store is the REAL Zustand store, driven via setState; initialize()
 * is stubbed to a no-op so it doesn't overwrite our seeded state.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

// ── React Navigation stubs ─────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { NavigationContainer: ({ children }: any) => React.createElement(React.Fragment, null, children) };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');
  // Navigator renders only the FIRST <Screen> (the on-mount active route).
  // RootNavigator wraps its Screens in fragments, so recurse to find the first
  // element that actually carries a `component` prop.
  const findFirstScreen = (node: any): any => {
    const arr = React.Children.toArray(node);
    for (const child of arr) {
      if (!child || typeof child !== 'object') continue;
      if (child.props?.component) return child;
      if (child.props?.children) {
        const nested = findFirstScreen(child.props.children);
        if (nested) return nested;
      }
    }
    return null;
  };
  const Navigator = ({ children }: any) => {
    const first = findFirstScreen(children);
    if (!first) return null;
    const Comp = first.props.component;
    return React.createElement(Comp, { route: { params: {} }, navigation: {} });
  };
  const Screen = () => null;
  return { createNativeStackNavigator: () => ({ Navigator, Screen }) };
});

// ── Screen component stubs (tag each by route name) ─────────────────────────────
// jest.mock requires an INLINE factory that references no out-of-scope vars, so
// each stub inlines a tiny <Text> labelled with its route name (require lazily).
jest.mock('../../src/screens/auth/PhoneScreen', () => () => require('react').createElement(require('react-native').Text, null, 'PHONE_SCREEN'));
jest.mock('../../src/screens/auth/OTPScreen', () => () => require('react').createElement(require('react-native').Text, null, 'OTP_SCREEN'));
jest.mock('../../src/screens/auth/ProfileSetupScreen', () => () => require('react').createElement(require('react-native').Text, null, 'PROFILE_SETUP_SCREEN'));
jest.mock('../../src/screens/store/StorefrontScreen', () => () => require('react').createElement(require('react-native').Text, null, 'STOREFRONT_SCREEN'));
jest.mock('../../src/screens/checkout/CheckoutScreen', () => () => require('react').createElement(require('react-native').Text, null, 'CHECKOUT_SCREEN'));
jest.mock('../../src/screens/checkout/PaymentScreen', () => () => require('react').createElement(require('react-native').Text, null, 'PAYMENT_SCREEN'));
jest.mock('../../src/screens/orders/OrderTrackingScreen', () => () => require('react').createElement(require('react-native').Text, null, 'ORDER_TRACKING_SCREEN'));
jest.mock('../../src/screens/reviews/WriteReviewScreen', () => () => require('react').createElement(require('react-native').Text, null, 'WRITE_REVIEW_SCREEN'));
jest.mock('../../src/screens/profile/AddressesScreen', () => () => require('react').createElement(require('react-native').Text, null, 'ADDRESSES_SCREEN'));
jest.mock('../../src/screens/shared/LocationPickerScreen', () => () => require('react').createElement(require('react-native').Text, null, 'LOCATION_PICKER_SCREEN'));
jest.mock('../../src/screens/profile/WishlistScreen', () => () => require('react').createElement(require('react-native').Text, null, 'WISHLIST_SCREEN'));
jest.mock('../../src/screens/returns/ReturnRequestScreen', () => () => require('react').createElement(require('react-native').Text, null, 'RETURN_REQUEST_SCREEN'));
jest.mock('../../src/navigation/TabNavigator', () => () => require('react').createElement(require('react-native').Text, null, 'TABS'));

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import RootNavigator from '../../src/navigation/RootNavigator';
import { useAuthStore } from '../../src/store/authStore';

const SESSION = { access_token: 'a', refresh_token: 'r', user: { id: 'buyer-1' } } as any;

beforeEach(() => {
  // initialize() runs in a mount effect; stub it so it doesn't clobber state.
  jest.spyOn(useAuthStore.getState(), 'initialize').mockReturnValue(() => {});
});

describe('RootNavigator — auth guard', () => {
  it('shows a loading spinner (no screen) while auth is initializing', () => {
    useAuthStore.setState({ session: null, profile: null, loading: true });
    render(<RootNavigator />);
    expect(screen.queryByText('PHONE_SCREEN')).toBeNull();
    expect(screen.queryByText('TABS')).toBeNull();
  });

  it('UNAUTHENTICATED → lands on the Phone (login) screen, NOT the tabs', () => {
    useAuthStore.setState({ session: null, profile: null, loading: false });
    render(<RootNavigator />);
    expect(screen.getByText('PHONE_SCREEN')).toBeOnTheScreen();
    expect(screen.queryByText('TABS')).toBeNull();
  });

  it('SESSION but PROFILE STILL LOADING (profile === null) → spinner, not tabs', () => {
    useAuthStore.setState({ session: SESSION, profile: null, loading: false });
    render(<RootNavigator />);
    expect(screen.queryByText('TABS')).toBeNull();
    expect(screen.queryByText('PROFILE_SETUP_SCREEN')).toBeNull();
  });

  it('SESSION + profile without a name → forced to ProfileSetup, NOT tabs', () => {
    useAuthStore.setState({ session: SESSION, profile: { id: 'buyer-1', name: null } as any, loading: false });
    render(<RootNavigator />);
    expect(screen.getByText('PROFILE_SETUP_SCREEN')).toBeOnTheScreen();
    expect(screen.queryByText('TABS')).toBeNull();
  });

  it('FULL SESSION (named profile) → lands on the authenticated Tabs', () => {
    useAuthStore.setState({ session: SESSION, profile: { id: 'buyer-1', name: 'Asha' } as any, loading: false });
    render(<RootNavigator />);
    expect(screen.getByText('TABS')).toBeOnTheScreen();
    expect(screen.queryByText('PHONE_SCREEN')).toBeNull();
  });
});
