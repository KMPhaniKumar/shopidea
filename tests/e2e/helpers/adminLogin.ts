/**
 * adminLogin — reusable helper for admin dashboard E2E specs.
 *
 * Strategy:
 *   The admin dashboard layout is a Next.js RSC that calls
 *   supabase.auth.getUser() server-side on every render. Playwright cannot
 *   intercept a server-side Supabase call, so mock-cookie tricks used in the
 *   seller specs don't work here — the RSC will still bounce to /admin/login.
 *
 *   The ONLY reliable path is to POST real credentials to
 *   POST /api/admin/login (which runs signInWithPassword server-side and
 *   writes the SSR Supabase session cookies to the response). After that the
 *   browser context holds real cookies and the RSC gate passes.
 *
 *   This helper does exactly that:
 *     1. Navigate to ADMIN_HOST/admin/login so the browser context is scoped
 *        to the admin host (cookie domain).
 *     2. POST /api/admin/login with credentials via fetch inside page.evaluate.
 *        page.evaluate fires from within the browser context so Same-Origin fetch
 *        carries the response's Set-Cookie headers back into the browser's jar.
 *     3. Hard-navigate (window.location.assign) to /admin/dashboard — exactly
 *        what the login page does after a successful POST.
 *     4. Wait for the dashboard heading to appear, proving the SSR gate passed.
 *
 * Usage:
 *   import { adminLogin } from './helpers/adminLogin'
 *   // inside a test:
 *   await adminLogin(page)
 *   // page is now on /admin/dashboard with a live SSR session.
 *
 * Failure contract:
 *   If the POST returns success=false or the dashboard heading does not appear
 *   within TIMEOUT_MS the helper throws — the test fails with a clear message,
 *   not a silent redirect-loop.
 */

import type { Page } from '@playwright/test'

export const ADMIN_HOST = 'https://admin.dev.reelmart.in'

const TIMEOUT_MS = 30_000

// Canonical admin credentials from tests/fixtures/users.ts DEV_ACCOUNTS.admin
const ADMIN_EMAIL    = 'admin@reelmart.test'
const ADMIN_PASSWORD = 'ReelMartAdmin#2026'

/**
 * Log in as the seeded admin user via POST /api/admin/login.
 *
 * After this call the page is on /admin/dashboard with live SSR session cookies.
 * Throws if the login fails or the dashboard never renders.
 */
export async function adminLogin(page: Page): Promise<void> {
  // Step 1 — land on the admin host so subsequent cookies are scoped correctly.
  await page.goto(`${ADMIN_HOST}/admin/login`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  })

  // Step 2 — POST credentials from inside the browser context.
  // The fetch runs Same-Origin relative to ADMIN_HOST; Set-Cookie headers in the
  // response are automatically written into the browser's cookie jar.
  const result = await page.evaluate(
    async ({ email, password }: { email: string; password: string }) => {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      })
      const body = await res.json().catch(() => ({ success: false, error: 'non-JSON response' }))
      return { status: res.status, body }
    },
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  )

  if (!result.body?.success) {
    throw new Error(
      `adminLogin: POST /api/admin/login failed — ` +
      `status=${result.status} error="${result.body?.error ?? 'unknown'}"`,
    )
  }

  // Step 3 — hard-navigate exactly as the login page does (cookies are now set).
  await page.goto(`${ADMIN_HOST}/admin/dashboard`, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUT_MS,
  })

  // Step 4 — confirm the RSC gate passed; dashboard heading must be visible.
  await page.waitForSelector('h1:text("Dashboard")', { timeout: TIMEOUT_MS })
}

/**
 * Lightweight check: is the current page inside the admin dashboard?
 * Call after navigating to any /admin/* page to confirm the session is alive.
 */
export async function assertAdminSession(page: Page): Promise<void> {
  const url = page.url()
  if (url.includes('/admin/login')) {
    throw new Error(
      `assertAdminSession: redirected to login — session expired or was never set. URL: ${url}`,
    )
  }
}
