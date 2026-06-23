import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Host-based area routing
// ---------------------------------------------------------------------------
// The seller dashboard and admin portal each live on their own subdomain:
//   seller.dev.reelmart.in / seller.reelmart.in  → the /seller/* app
//   admin.dev.reelmart.in  / admin.reelmart.in   → the /admin/*  app
// The public storefront + marketplace stay on the bare host
// (dev.reelmart.in / reelmart.in).
//
// We keep the existing path prefixes (/seller, /admin) so every internal link
// and redirect keeps working unchanged — the subdomain only enforces isolation
// and the landing page. On the bare host we forward the old path-based
// /seller and /admin URLs to their new subdomains so existing links/bookmarks
// keep working. On localhost and Vercel previews (no subdomains) everything
// stays path-based, so local dev is unaffected.

// Hosts that own real subdomains. localhost / *.vercel.app are NOT here, so
// path-based routing is preserved there.
const ROOT_HOSTS = new Set(['dev.reelmart.in', 'reelmart.in'])

type Area = 'seller' | 'admin' | 'main'

function hostname(host: string): string {
  return host.split(':')[0].toLowerCase()
}

function areaForHost(host: string): Area {
  const h = hostname(host)
  if (h.startsWith('admin.')) return 'admin'
  if (h.startsWith('seller.')) return 'seller'
  return 'main'
}

// The subdomain host for an area, or null when the current host has no
// subdomains (localhost / previews) — in which case we don't forward.
function subHostFor(host: string, sub: 'seller' | 'admin'): string | null {
  const h = hostname(host)
  if (!ROOT_HOSTS.has(h)) return null
  return `${sub}.${h}`
}

function redirectToHost(url: URL, newHost: string): NextResponse {
  const target = new URL(url)
  target.host = newHost
  return NextResponse.redirect(target)
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl
  const path = url.pathname
  const host = request.headers.get('host') ?? ''
  const area = areaForHost(host)

  // ── Seller subdomain: only the /seller app is served here ────────────────
  if (area === 'seller') {
    if (path.startsWith('/admin')) {
      // Admin doesn't belong on the seller host.
      return NextResponse.redirect(new URL('/seller', url))
    }
    if (path !== '/seller' && !path.startsWith('/seller/') && !path.startsWith('/api')) {
      // Bare '/' and any storefront path → the seller landing.
      return NextResponse.redirect(new URL('/seller', url))
    }
  }

  // ── Admin subdomain: only the /admin app is served here ──────────────────
  else if (area === 'admin') {
    if (path.startsWith('/seller')) {
      return NextResponse.redirect(new URL('/admin', url))
    }
    if (path !== '/admin' && !path.startsWith('/admin/') && !path.startsWith('/api')) {
      return NextResponse.redirect(new URL('/admin', url))
    }
  }

  // ── Bare host (storefront): forward old path-based area URLs to subdomains ─
  else {
    if (path === '/seller' || path.startsWith('/seller/')) {
      const target = subHostFor(host, 'seller')
      if (target) return redirectToHost(url, target)
    }
    if (path === '/admin' || path.startsWith('/admin/')) {
      const target = subHostFor(host, 'admin')
      if (target) return redirectToHost(url, target)
    }
  }

  // ── Session refresh ──────────────────────────────────────────────────────
  // Standard @supabase/ssr middleware: refresh the auth cookie and make the
  // request per-request so Vercel's CDN can't cache the dashboard's auth
  // redirect. Only needed in the authenticated areas (seller/admin), keyed off
  // the host OR the path so it also runs for path-based dev/preview hosts.
  const needsSession =
    area !== 'main' || path.startsWith('/seller') || path.startsWith('/admin')

  let response = NextResponse.next({ request })
  if (needsSession) {
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
  }

  return response
}

export const config = {
  // Run on everything except Next internals and static files. Host/area logic
  // inside decides what (if anything) to do — the storefront just does two
  // cheap string checks unless it's a /seller or /admin path.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[\\w]+$).*)'],
}
