'use client'

import { Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export function AdminTopBar({ adminName }: { adminName: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <header className="h-14 bg-white border-b border-[#EEEEEE] px-6 flex items-center justify-between shrink-0">
      <span className="font-semibold text-[#1A1A1A]">{adminName}</span>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-lg hover:bg-[#F9F9F9]">
          <Bell size={20} className="text-[#666666]" />
        </button>
        <button onClick={signOut} className="p-2 rounded-lg hover:bg-[#F9F9F9]">
          <LogOut size={18} className="text-[#666666]" />
        </button>
      </div>
    </header>
  )
}
