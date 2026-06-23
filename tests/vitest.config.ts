import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Run tests sequentially within a file; parallel files is fine
    globals: true,
    environment: 'node',
    // Fail loudly — never silence. Any test that errors is a fail.
    bail: 0,
    // Exclude web-api/ — those tests require next/server and run under
    // vitest.web-api.config.ts (npm run test:web-api).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'web-api/**',
    ],
    // Coverage via v8 (fast, no instrumentation needed)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      // Include service source files in coverage
      include: [
        '../reelmart/services/*/src/**/*.ts',
      ],
      exclude: [
        '../reelmart/services/*/src/index.ts', // app bootstrap
        '../reelmart/services/*/dist/**',
        '**/node_modules/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
    // Set up env so supabase/lib modules don't throw on import
    env: {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_KEY: 'test-service-key',
      RAZORPAY_KEY_ID: 'rzp_test_key',
      RAZORPAY_KEY_SECRET: 'test_razorpay_secret_16chr',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      ALLOWED_ORIGINS: 'https://dev.reelmart.in',
      AUTH_BRIDGE_ALLOWED_ORIGINS: 'https://dev.reelmart.in',
      INTERNAL_API_KEY: 'test-internal-key',
      // admin-service auth bridge — needed so the module-level constants are non-empty
      MSG91_WIDGET_AUTHKEY: 'test-msg91-authkey',
      MSG91_OTP_TEMPLATE_ID: 'test-otp-template',
      AUTH_BRIDGE_SECRET: 'test-auth-bridge-secret-32-chars!!',
    },
    // Per-test timeout (ms)
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      // Allow tests to import service source directly
      '@payment-svc': path.resolve(__dirname, '../reelmart/services/payment-service/src'),
      '@order-svc': path.resolve(__dirname, '../reelmart/services/order-service/src'),
      '@payout-svc': path.resolve(__dirname, '../reelmart/services/payout-service/src'),
    },
  },
})
