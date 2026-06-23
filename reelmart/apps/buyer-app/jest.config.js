/**
 * Jest config for the ReelMart buyer-app (Expo SDK 54 / React Native 0.81 / React 19).
 *
 * Uses the `jest-expo` preset which wires up the RN/Expo babel transform,
 * the metro module resolver, and the haste config. We extend it with:
 *  - a setup file that registers RNTL matchers + global mocks
 *  - transformIgnorePatterns that whitelist the RN / Expo / React-Navigation
 *    ESM packages that ship untranspiled and must be run through babel.
 *
 * TEST MODE: every external provider (Supabase, MSG91 bridge, fetch, native
 * storage) is mocked in jest.setup.js. No real OTP / SMS / network calls fire.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Only pick up our own tests; never crawl node_modules.
  testMatch: ['<rootDir>/__tests__/**/*.test.{ts,tsx}'],
  // jest-expo provides a base list; we widen it to cover every untranspiled
  // ESM dep the buyer-app pulls in (RN core, all expo-* modules, RN community
  // packages, React Navigation, gesture-handler, zustand, supabase).
  transformIgnorePatterns: [
    'node_modules/(?!(' +
      [
        'jest-runtime',
        '(jest-)?react-native',
        '@react-native',
        '@react-native-community',
        'react-native-.*',
        'expo',
        'expo-.*',
        '@expo',
        '@expo/.*',
        '@expo-google-fonts/.*',
        'react-navigation',
        '@react-navigation/.*',
        '@unimodules/.*',
        'unimodules',
        'sentry-expo',
        'native-base',
        '@supabase/.*',
        'zustand',
      ].join('|') +
      ')/)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  clearMocks: true,
  // Keep noise down; surface only test output.
  verbose: true,
};
