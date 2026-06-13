import { createBrowserClient } from '@supabase/ssr'

// Memoize a single browser client for the whole tab. createBrowserClient is
// meant to be instantiated once — returning a fresh client per call means each
// component holds its own GoTrueClient with its own in-memory session, so a
// setSession() on one instance isn't seen by another instance's getUser()
// without a full page reload. Sharing one instance makes auth state propagate
// in-page.
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export const createClient = () => {
  if (browserClient) return browserClient
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return browserClient
}
