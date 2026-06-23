/**
 * Stub for next/headers — consumed by route handlers that call cookies().
 *
 * Tests override `mockCookieStore` per-test to simulate authenticated /
 * unauthenticated sessions. The cookies() function is also vi.mock'd at the
 * test level when the route handler imports it at module load time; this file
 * is only needed so the alias resolves during config-time loading.
 */

export const mockCookieStore = {
  getAll: () => [] as { name: string; value: string }[],
  set: (_name: string, _value: string, _options?: Record<string, unknown>) => {},
}

export function cookies() {
  return mockCookieStore
}
