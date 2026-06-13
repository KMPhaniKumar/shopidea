/**
 * Playwright configuration for ReelMart e2e and UI tests.
 *
 * STATUS: Scaffold only — no tests written yet (see work-breakdown).
 * Install: npx playwright install --with-deps
 *
 * Test identity: TEST_PHONE=9999999999 / TEST_OTP=123456 (MSG91 dev test number).
 * Target: BASE_URL=https://dev.reelmart.in (dev environment).
 * Do NOT run against production.
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: ['tests/e2e/**/*.spec.ts', 'tests/ui/**/*.spec.ts'],
  fullyParallel: false, // mobile-first — sequential avoids flakiness on OTP flows
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker: OTP test login is stateful
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://dev.reelmart.in',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Mobile-first per the spec
    ...devices['Pixel 7'],
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Artifacts
  outputDir: 'test-results',
})
