/**
 * P3 — savedAddresses (address book persistence) — GUEST path.
 *
 * Targets the REAL module:
 *   src/lib/savedAddresses.ts
 *     getSavedAddresses / saveAddress / removeAddress / setDefaultAddress
 *
 * Drives the unauthenticated (guest) branch, which persists to AsyncStorage —
 * the deterministic, side-effect-isolated path. supabase is mocked at the
 * boundary; with no persisted session getCurrentUserId() returns null, so every
 * call takes the local-storage branch (the authed branch is exercised by the
 * profileService suite + Supabase RLS DB tests).
 *
 * The in-memory AsyncStorage mock (jest.setup.js) is reset between tests.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSavedAddresses,
  saveAddress,
  removeAddress,
  setDefaultAddress,
} from '../../src/lib/savedAddresses';

const BASE = {
  label: 'Home',
  line1: '12 MG Road',
  line2: null,
  area: 'Tilak Nagar',
  city: 'Bapatla',
  state: 'Andhra Pradesh',
  pincode: '522101',
  name: 'Asha',
  phone: '9999999999',
};

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('savedAddresses (guest) — read/write round-trip', () => {
  it('returns [] on a fresh install', async () => {
    expect(await getSavedAddresses()).toEqual([]);
  });

  it('saveAddress persists and getSavedAddresses reads it back', async () => {
    const saved = await saveAddress(BASE);
    expect(saved.id).toBeTruthy();
    expect(saved.city).toBe('Bapatla');

    const list = await getSavedAddresses();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ line1: '12 MG Road', pincode: '522101', name: 'Asha' });
  });

  it('de-dupes on (line1, pincode) — re-saving the same address keeps one row', async () => {
    await saveAddress(BASE);
    await saveAddress({ ...BASE, name: 'Asha R.' }); // same line1+pincode
    const list = await getSavedAddresses();
    expect(list).toHaveLength(1);
    // newest write wins (prepended)
    expect(list[0].name).toBe('Asha R.');
  });

  it('keeps distinct addresses and caps the guest list at 5', async () => {
    for (let i = 0; i < 7; i++) {
      await saveAddress({ ...BASE, line1: `${i} Main St`, pincode: `52210${i}` });
    }
    const list = await getSavedAddresses();
    expect(list).toHaveLength(5); // slice(0, 5)
  });
});

describe('savedAddresses (guest) — remove + default', () => {
  it('removeAddress deletes by id and returns the remaining list', async () => {
    // Guest address ids are Date.now()-based; two saves in the same millisecond
    // would collide. Force a monotonic clock so each gets a distinct id (this is
    // also a latent app robustness note: rapid guest adds can share an id).
    let t = 1_800_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => (t += 1000));

    const a = await saveAddress({ ...BASE, line1: 'A1', pincode: '500001' });
    const b = await saveAddress({ ...BASE, line1: 'B2', pincode: '500002' });
    expect(a.id).not.toBe(b.id);

    const remaining = await removeAddress(a.id);
    expect(remaining).toHaveLength(1);
    expect(remaining.find(x => x.id === a.id)).toBeUndefined();
    expect(remaining[0].id).toBe(b.id);
    nowSpy.mockRestore();
  });

  it('setDefaultAddress writes the default id to storage (guest)', async () => {
    const a = await saveAddress(BASE);
    await setDefaultAddress(a.id);
    expect(await AsyncStorage.getItem('@reelmart_default_address_id')).toBe(a.id);
  });
});
