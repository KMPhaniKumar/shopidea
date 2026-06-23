/**
 * P0 — Auth / session flow.
 *
 * Targets the REAL module:
 *   src/store/authStore.ts  (useAuthStore: sendOTP, verifyOTP, signOut, initialize)
 *
 * Flow under test:  phone → OTP (mocked MSG91 bridge over fetch) → session set
 * via supabase.auth.setSession → persisted to AsyncStorage → restored on relaunch
 * (initialize/getSession) → logout clears it.
 *
 * Mocked:
 *   ../lib/supabase       → in-memory fake (session round-trips through AsyncStorage)
 *   global.fetch          → MSG91 bridge (otp/send + otp/verify) — NO real OTP/SMS
 *   ../lib/api            → registerFcmToken no-op (no push)
 *   ../lib/savedAddresses → mergeGuestAddressesIntoAccount no-op
 */
// jest.mock factories are hoisted; require the fake lazily inside them.
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));
jest.mock('../../src/lib/api', () => ({
  registerFcmToken: jest.fn(async () => {}),
}));
jest.mock('../../src/lib/savedAddresses', () => ({
  mergeGuestAddressesIntoAccount: jest.fn(async () => {}),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTableResponse, resetSupabaseMock } from '../mocks/supabaseMock';
import { installMsg91BridgeMock, bridgeCalls } from '../mocks/msg91BridgeMock';
import { useAuthStore } from '../../src/store/authStore';

const SESSION_KEY = 'sb-test-auth-token'; // must match supabaseMock

beforeEach(async () => {
  resetSupabaseMock();
  await AsyncStorage.clear();
  useAuthStore.setState({ session: null, profile: null, loading: true });
  installMsg91BridgeMock(); // default: send ok, verify ok
});

describe('sendOTP — MSG91 bridge over fetch (no real SMS)', () => {
  it('formats the phone to +91 and POSTs to /otp/send; returns no error on success', async () => {
    const { error } = await useAuthStore.getState().sendOTP('9999999999');
    expect(error).toBeNull();

    expect(bridgeCalls).toHaveLength(1);
    expect(bridgeCalls[0].url).toMatch(/\/api\/admin\/auth\/otp\/send$/);
    expect(bridgeCalls[0].body.phone).toBe('+919999999999');
  });

  it('keeps an already-+91 number intact', async () => {
    await useAuthStore.getState().sendOTP('+919876543210');
    expect(bridgeCalls[0].body.phone).toBe('+919876543210');
  });

  it('maps RATE_LIMITED to a friendly error', async () => {
    installMsg91BridgeMock({ send: { success: false, code: 'RATE_LIMITED' } });
    const { error } = await useAuthStore.getState().sendOTP('9999999999');
    expect(error).toMatch(/wait a minute/i);
  });

  it('maps OTP_NOT_CONFIGURED to a friendly error', async () => {
    installMsg91BridgeMock({ send: { success: false, code: 'OTP_NOT_CONFIGURED' } });
    const { error } = await useAuthStore.getState().sendOTP('9999999999');
    expect(error).toMatch(/not available/i);
  });
});

describe('verifyOTP — session minted + persisted to AsyncStorage', () => {
  it('verifies the code, sets the supabase session, and persists it on device', async () => {
    // New user: users table returns no name → isNewUser true.
    setTableResponse('users', { name: null });

    const { error, isNewUser } = await useAuthStore
      .getState()
      .verifyOTP('9999999999', '123456');

    expect(error).toBeNull();
    expect(isNewUser).toBe(true);

    // POSTed correct payload (phone normalized + role buyer + otp).
    const verifyCall = bridgeCalls.find((c) => c.url.endsWith('/otp/verify'))!;
    expect(verifyCall.body).toMatchObject({ phone: '+919999999999', otp: '123456', role: 'buyer' });

    // setSession persisted the tokens to AsyncStorage (the device store).
    const persisted = await AsyncStorage.getItem(SESSION_KEY);
    expect(persisted).not.toBeNull();
    expect(JSON.parse(persisted!).access_token).toBe('access-tok-123');
  });

  it('flags an existing user (has name) as NOT a new user', async () => {
    setTableResponse('users', { name: 'Asha' });
    const { isNewUser } = await useAuthStore.getState().verifyOTP('9999999999', '123456');
    expect(isNewUser).toBe(false);
  });

  it('returns an error and does NOT persist a session on a wrong/expired code', async () => {
    installMsg91BridgeMock({ verify: { success: false, code: 'OTP_INVALID' } });

    const { error } = await useAuthStore.getState().verifyOTP('9999999999', '000000');
    expect(error).toMatch(/incorrect or expired/i);

    const persisted = await AsyncStorage.getItem(SESSION_KEY);
    expect(persisted).toBeNull(); // no session created
  });
});

describe('initialize — session restore on relaunch', () => {
  it('restores a persisted session from device storage and loads the profile', async () => {
    // Simulate a prior login: a session already on the device.
    await AsyncStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        access_token: 'a', refresh_token: 'r', user: { id: 'user-test-id' },
      })
    );
    setTableResponse('users', { id: 'user-test-id', name: 'Asha', role: 'buyer' });

    const unsubscribe = useAuthStore.getState().initialize();
    // initialize() resolves getSession asynchronously; flush microtasks.
    await new Promise((r) => setImmediate(r));

    const s = useAuthStore.getState();
    expect(s.session).not.toBeNull();
    expect(s.session!.access_token).toBe('a');
    expect(s.loading).toBe(false);
    expect(s.profile?.name).toBe('Asha');

    unsubscribe();
  });

  it('leaves session null when nothing is persisted (fresh install)', async () => {
    const unsubscribe = useAuthStore.getState().initialize();
    await new Promise((r) => setImmediate(r));

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().loading).toBe(false);
    unsubscribe();
  });
});

describe('signOut — clears session from device', () => {
  it('removes the persisted session and resets store state', async () => {
    // Establish a session first.
    setTableResponse('users', { name: 'Asha' });
    await useAuthStore.getState().verifyOTP('9999999999', '123456');
    expect(await AsyncStorage.getItem(SESSION_KEY)).not.toBeNull();

    await useAuthStore.getState().signOut();

    expect(await AsyncStorage.getItem(SESSION_KEY)).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });
});
