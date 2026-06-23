/**
 * Global Jest setup for the buyer-app test harness.
 *
 * Registers RNTL's built-in matchers and installs TEST-MODE mocks for every
 * external provider so no test can ever touch a real device API, the MSG91
 * OTP bridge, Supabase, or the network.
 *
 * Mocked here:
 *   - @testing-library/react-native matchers (toBeOnTheScreen, toHaveTextContent…)
 *   - @react-native-async-storage/async-storage  (in-memory)
 *   - expo-secure-store                            (in-memory)
 *   - expo-constants                               (extra env)
 *   - expo-font / @expo/vector-icons               (no native font loading)
 *   - global.fetch                                 (blocks real api-dev.reelmart.in calls)
 *
 * The Supabase client (../lib/supabase) and the MSG91 OTP bridge are mocked
 * per-suite (see __tests__/mocks/) because each test needs to control their
 * return values; a blanket fetch stub here is the last line of defence.
 */

// RNTL v13 ships built-in matchers (toBeOnTheScreen, toHaveTextContent, …).
// They are auto-registered on import of the main entry; the dedicated
// matchers entry is also available for explicit extension.
require('@testing-library/react-native/matchers');

// ── AsyncStorage: official in-memory mock ──────────────────────────────────────
jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// ── expo-secure-store: in-memory key/value mock ────────────────────────────────
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    __esModule: true,
    setItemAsync: jest.fn(async (k, v) => { store.set(k, String(v)); }),
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    deleteItemAsync: jest.fn(async (k) => { store.delete(k); }),
    isAvailableAsync: jest.fn(async () => true),
    WHEN_UNLOCKED: 'whenUnlocked',
    __reset: () => store.clear(),
  };
});

// ── expo-constants: surface the extra env the app reads ────────────────────────
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { EXPO_PUBLIC_API_URL: 'https://api-dev.reelmart.in' },
    },
  },
}));

// ── expo-font / vector-icons: avoid native font loading in component tests ──────
jest.mock('expo-font', () => ({
  __esModule: true,
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(async () => {}),
  useFonts: () => [true, null],
}));

// ── global.fetch: hard block real network (esp. the MSG91 bridge / api-dev) ─────
// Individual suites override this with jest.fn() to assert call shapes.
global.fetch = jest.fn(async (url) => {
  throw new Error(
    `[TEST GUARD] Unmocked fetch to "${url}". Mock fetch in the suite — ` +
    `tests must never hit api-dev.reelmart.in / MSG91 / Supabase for real.`
  );
});

// Provide the public env vars the supabase lib reads at import time so that,
// even if a test imports the real client by accident, construction does not
// throw on undefined URL/key (the client is still mocked per-suite).
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'https://api-dev.reelmart.in';

// Silence the RN "not implemented" Animated/legacy warnings that clutter output.
jest.spyOn(console, 'warn').mockImplementation((msg) => {
  if (typeof msg === 'string' && /Animated|useNativeDriver|deprecated/i.test(msg)) return;
  // eslint-disable-next-line no-console
  console.info(msg);
});
