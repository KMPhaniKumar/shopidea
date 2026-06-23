import { createBrowserClient } from '@supabase/ssr'

// Memoize a single browser client for the whole tab. createBrowserClient is
// meant to be instantiated once — returning a fresh client per call means each
// component holds its own GoTrueClient with its own in-memory session, so a
// setSession() on one instance isn't seen by another instance's getUser()
// without a full page reload. Sharing one instance makes auth state propagate
// in-page.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

// Keep buyers signed in for 2 weeks. The Supabase auth cookie is what bounds how
// long a session survives in the browser (the access token auto-refreshes every
// jwt_expiry seconds; refresh tokens don't expire by default), so a 14-day cookie
// maxAge keeps the session alive for two weeks before a fresh login is required.
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14 // 14 days

export const createClient = () => {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { maxAge: SESSION_MAX_AGE_SECONDS } }
  )
  return browserClient
}
