/**
 * Vitest config for Next.js web API route handler tests (tests/web-api/).
 *
 * The web app's node_modules is the authoritative module source for:
 *   - next/* (NextRequest, NextResponse, next/headers)
 *   - @supabase/ssr
 *   - zod (v4 — web app uses v4; main harness has v3)
 *   - bcryptjs
 *   - @/lib/* (web app path alias resolves to reelmart/apps/web/)
 *
 * The tests themselves mock all of these via vi.mock() but the resolved
 * module path must exist, so aliases point at the web app's copies.
 */

import { defineConfig } from 'vitest/config'
import path from 'path'

const WEB = path.resolve(__dirname, '../reelmart/apps/web')
const WEB_NM = path.resolve(WEB, 'node_modules')

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['web-api/**/*.test.ts'],
    bail: 0,
    testTimeout: 10000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      API_URL: 'http://localhost:3001',
      INTERNAL_API_KEY: 'test-internal-key',
    },
  },
  resolve: {
    alias: {
      // next/server — use the real Next.js exports from the web app
      'next/server': path.resolve(WEB_NM, 'next/dist/server/web/exports/index.js'),
      // next/headers — fully stubbed; tests mock cookies() per-test
      'next/headers': path.resolve(__dirname, 'web-api/__mocks__/next-headers.ts'),
      // @supabase/ssr — not in tests/node_modules; point at web app copy
      '@supabase/ssr': path.resolve(WEB_NM, '@supabase/ssr/dist/main/index.js'),
      // @supabase/supabase-js — both tests harness AND web app have a copy; routes
      // resolve to the web app copy (nearest node_modules). Alias ensures vi.mock()
      // and the route import use the SAME module ID so the mock factory intercepts.
      '@supabase/supabase-js': path.resolve(WEB_NM, '@supabase/supabase-js'),
      // zod v4 — web app routes use zod v4 API; tests harness has v3
      'zod': path.resolve(WEB_NM, 'zod'),
      // bcryptjs — only in web app's node_modules
      'bcryptjs': path.resolve(WEB_NM, 'bcryptjs'),
      // @/ alias — resolves to the web app root (same as tsconfig "@/*": ["./*"])
      '@/lib/pickup': path.resolve(WEB, 'lib/pickup.ts'),
      '@/lib/supabase/server': path.resolve(WEB, 'lib/supabase/server.ts'),
      '@/lib/supabase/client': path.resolve(WEB, 'lib/supabase/client.ts'),
    },
  },
})
