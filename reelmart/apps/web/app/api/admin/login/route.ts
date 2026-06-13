import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

// Server-side admin login. The app has no session-sync middleware, so a
// client-side signInWithPassword() never establishes the server-readable auth
// cookies the admin dashboard layout checks (it gates with getUser() in a
// Server Component) — the user would log in then bounce straight back to
// /admin/login. Route Handlers CAN write cookies, so doing the sign-in here
// sets the session cookies properly; the subsequent hard nav to /admin then
// passes the SSR gate.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
  }
  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  if (!email || !password) {
    return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Route Handler context allows writing cookies — this persists the
        // Supabase session so Server Components can read it.
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Invalid email or password' },
      { status: 401 }
    )
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', data.user.id)
    .single()

  if (!profile?.is_admin) {
    await supabase.auth.signOut()
    return NextResponse.json({ success: false, error: 'You do not have admin access.' }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
