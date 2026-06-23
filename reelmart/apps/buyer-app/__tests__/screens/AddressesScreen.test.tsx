/**
 * P3 — AddressesScreen (address book): list render, default badge, empty state,
 * set-default persistence, and delete confirmation.
 *
 * Renders the REAL screen. The savedAddresses lib is mocked so we control the
 * list + the remove result; LocationPromptModal is stubbed to a no-op (it pulls
 * in react-native-maps / Places autocomplete which need native modules).
 * AsyncStorage is the in-memory mock from jest.setup.js.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

jest.mock('../../src/lib/savedAddresses', () => ({
  getSavedAddresses: jest.fn(),
  removeAddress: jest.fn(),
}));
// LocationPromptModal renders nothing in tests (avoids native maps / Places).
jest.mock('../../src/components/LocationPromptModal', () => () => null);

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AddressesScreen from '../../src/screens/profile/AddressesScreen';
import * as saved from '../../src/lib/savedAddresses';

const nav = { navigate: jest.fn(), goBack: jest.fn() } as any;

const ADDR_HOME = {
  id: 'a1', label: 'Home', line1: '12 MG Road', line2: null, area: 'Tilak Nagar',
  city: 'Bapatla', state: 'Andhra Pradesh', pincode: '522101', name: 'Asha', phone: '9999999999',
};
const ADDR_WORK = {
  id: 'a2', label: 'Work', line1: 'Tech Park', line2: null, area: 'Hitech City',
  city: 'Hyderabad', state: 'Telangana', pincode: '500081', name: 'Asha', phone: '9999999999',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('AddressesScreen — list rendering', () => {
  it('renders saved addresses with name, city and the default badge on the first', async () => {
    (saved.getSavedAddresses as jest.Mock).mockResolvedValue([ADDR_HOME, ADDR_WORK]);
    render(<AddressesScreen navigation={nav} />);

    expect(await screen.findByText('12 MG Road')).toBeOnTheScreen();
    expect(screen.getByText('Tech Park')).toBeOnTheScreen();
    // both cards share the same name+phone line
    expect(screen.getAllByText('Asha · 9999999999')).toHaveLength(2);
    // No persisted default id → falls back to addrs[0] → the Home card shows "Default"
    expect(screen.getByText('Default')).toBeOnTheScreen();
    // The non-default card offers a "Set Default" action
    expect(screen.getByText('Set Default')).toBeOnTheScreen();
  });

  it('shows the empty state when there are no saved addresses', async () => {
    (saved.getSavedAddresses as jest.Mock).mockResolvedValue([]);
    render(<AddressesScreen navigation={nav} />);
    expect(await screen.findByText('No saved addresses')).toBeOnTheScreen();
    expect(screen.getByText('+ Add Address')).toBeOnTheScreen();
  });
});

describe('AddressesScreen — set default', () => {
  it('persists the chosen address id + city when "Set Default" is pressed', async () => {
    (saved.getSavedAddresses as jest.Mock).mockResolvedValue([ADDR_HOME, ADDR_WORK]);
    render(<AddressesScreen navigation={nav} />);
    await screen.findByText('Tech Park');

    await act(async () => {
      fireEvent.press(screen.getByText('Set Default'));
    });

    await waitFor(async () => {
      expect(await AsyncStorage.getItem('@reelmart_default_address_id')).toBe('a2');
    });
    expect(await AsyncStorage.getItem('@reelmart_city')).toBe('Hyderabad');
  });
});

describe('AddressesScreen — delete', () => {
  it('asks for confirmation, then removes via the lib and re-renders the list', async () => {
    (saved.getSavedAddresses as jest.Mock).mockResolvedValue([ADDR_HOME, ADDR_WORK]);
    (saved.removeAddress as jest.Mock).mockResolvedValue([ADDR_WORK]); // a1 gone

    // Auto-confirm the destructive action in the Alert.
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, btns: any) => {
      const del = btns?.find((b: any) => b.style === 'destructive');
      del?.onPress?.();
    });

    render(<AddressesScreen navigation={nav} />);
    await screen.findByText('12 MG Road');

    // Two "Delete" buttons (one per card). Press the first (Home).
    await act(async () => {
      fireEvent.press(screen.getAllByText('Delete')[0]);
    });

    await waitFor(() => expect(saved.removeAddress).toHaveBeenCalledWith('a1'));
    // Home card removed from the list, Work remains.
    await waitFor(() => expect(screen.queryByText('12 MG Road')).toBeNull());
    expect(screen.getByText('Tech Park')).toBeOnTheScreen();
    alertSpy.mockRestore();
  });
});
