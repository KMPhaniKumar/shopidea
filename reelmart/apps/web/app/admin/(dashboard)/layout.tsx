import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminNav from './AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <AdminNav adminName="Dev Admin" />
        <main className="flex-1 ml-60 p-8">{children}</main>
      </div>
    )
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin, name')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/admin/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminNav adminName={profile.name ?? 'Admin'} />
      <main className="flex-1 ml-60 p-8">{children}</main>
    </div>
  )
}
