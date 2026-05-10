import { NextResponse, type NextRequest } from 'next/server'

// Temporarily disabled: the @supabase/ssr import + Edge runtime combo was
// causing MIDDLEWARE_INVOCATION_FAILED on Vercel. Auth gates are still
// enforced client-side and at the API layer; re-enable once we sort the
// Edge bundling issue.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = { matcher: ['/seller/:path*'] }
