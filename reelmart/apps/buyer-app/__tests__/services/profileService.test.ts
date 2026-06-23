/**
 * P3 — profileService: buyer profile, wishlist toggle, coins, referral link.
 *
 * Targets the REAL module:
 *   src/services/profileService.ts
 *     getSavedAddresses / getWishlist / toggleWishlist / isWishlisted
 *     getCoinBalance / updateBuyerProfile / buildReferralLink
 *
 * Supabase is replaced at the module boundary by the controllable fake. We set
 * per-table responses and assert the REAL branching (toggle add vs remove,
 * error propagation), not the DB.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import { setTableResponse, resetSupabaseMock, supabase } from '../mocks/supabaseMock';
import {
  getSavedAddresses,
  getWishlist,
  toggleWishlist,
  isWishlisted,
  getCoinBalance,
  updateBuyerProfile,
  buildReferralLink,
} from '../../src/services/profileService';

const USER = 'buyer-1';

beforeEach(() => {
  resetSupabaseMock();
  jest.clearAllMocks();
});

describe('profileService — saved addresses', () => {
  it('returns rows scoped to the user, default-first', async () => {
    setTableResponse('addresses', [
      { id: 'a1', user_id: USER, label: 'Home', is_default: true, city: 'Bapatla' },
      { id: 'a2', user_id: USER, label: 'Work', is_default: false, city: 'Ongole' },
    ]);
    const rows = await getSavedAddresses(USER);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('a1');
    expect(supabase.from).toHaveBeenCalledWith('addresses');
  });

  it('returns [] when there are no saved addresses', async () => {
    setTableResponse('addresses', null);
    expect(await getSavedAddresses(USER)).toEqual([]);
  });
});

describe('profileService — wishlist', () => {
  it('getWishlist returns the joined rows', async () => {
    setTableResponse('wishlists', [
      { product_id: 'p1', created_at: '2026-06-01', products: { id: 'p1', name: 'Kurti', price: 799, images: [], is_available: true, stores: null } },
    ]);
    const items = await getWishlist(USER);
    expect(items).toHaveLength(1);
    expect(items[0].products?.name).toBe('Kurti');
  });

  it('toggleWishlist ADDS when not already wishlisted (no existing row)', async () => {
    // maybeSingle() → { data: null } means "not wishlisted yet"
    setTableResponse('wishlists', null);
    const nowWishlisted = await toggleWishlist(USER, 'p1');
    expect(nowWishlisted).toBe(true);
  });

  it('toggleWishlist REMOVES when already wishlisted (existing row)', async () => {
    setTableResponse('wishlists', { user_id: USER });
    const nowWishlisted = await toggleWishlist(USER, 'p1');
    expect(nowWishlisted).toBe(false);
  });

  it('isWishlisted reflects presence of a row', async () => {
    setTableResponse('wishlists', { user_id: USER });
    expect(await isWishlisted(USER, 'p1')).toBe(true);
    setTableResponse('wishlists', null);
    expect(await isWishlisted(USER, 'p2')).toBe(false);
  });
});

describe('profileService — coins + profile + referral', () => {
  it('getCoinBalance reads loyalty_coins, defaulting to 0', async () => {
    setTableResponse('users', { loyalty_coins: 120 });
    expect(await getCoinBalance(USER)).toBe(120);

    setTableResponse('users', { loyalty_coins: null });
    expect(await getCoinBalance(USER)).toBe(0);
  });

  it('updateBuyerProfile resolves when the update succeeds', async () => {
    setTableResponse('users', null, null); // no error
    await expect(updateBuyerProfile(USER, { name: 'Asha' })).resolves.toBeUndefined();
  });

  it('updateBuyerProfile throws the DB error message on failure', async () => {
    setTableResponse('users', null, { message: 'permission denied' });
    await expect(updateBuyerProfile(USER, { name: 'Asha' })).rejects.toThrow('permission denied');
  });

  it('buildReferralLink composes the join URL with the code', () => {
    expect(buildReferralLink('ASHA100')).toBe('https://reelmart.in/join?ref=ASHA100');
  });
});
