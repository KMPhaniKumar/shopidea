import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Standard @supabase/ssr session middleware. It (1) refreshes the auth session
// cookie on each request and (2) makes the matched routes per-request, which
// stops Vercel's CDN from caching the dashboard's auth redirect (a cached 307
// was bouncing logged-in admins back to /admin/login regardless of cookies).
// Previously disabled for an Edge-bundling crash with @supabase/ssr 0.3.0 —
// resolved by upgrading to 0.12.0.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Touch the session so an expired token is refreshed (and cookies re-synced).
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/seller/:path*'],
}
