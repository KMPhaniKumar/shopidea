import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const createServerSupabase = () =>
  createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookies().getAll(), setAll: () => {} } }
  )

export const createClient = createServerSupabase
