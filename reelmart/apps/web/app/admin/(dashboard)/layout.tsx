import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from './AdminNav'
import { AdminTopBar } from '@/components/admin/TopBar'

// Admin dashboard is always rendered per-request (auth + service-role data);
// never statically pre-rendered at build (which would instantiate a Supabase
// client with no env and crash `next build`).
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, name')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/admin/login')

  const adminName = profile.name ?? 'Admin'

  return (
    <div className="flex h-screen bg-[#F9F9F9]">
      <AdminNav adminName={adminName} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <AdminTopBar adminName={adminName} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
