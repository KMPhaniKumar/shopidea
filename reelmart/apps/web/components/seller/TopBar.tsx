'use client'
import { Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSellerStore } from '@/store/sellerStore'

export function TopBar() {
  const { store, pendingOrderCount } = useSellerStore()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/seller/login')
  }

  return (
    <header className="h-14 bg-white border-b border-[#EEEEEE] px-6 flex items-center justify-between shrink-0">
      <span className="font-semibold text-[#1A1A1A]">{store?.store_name ?? 'My Store'}</span>
      <div className="flex items-center gap-4">
        <button className="relative p-2 rounded-lg hover:bg-[#F9F9F9]">
          <Bell size={20} className="text-[#666666]" />
          {pendingOrderCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#FF6B2B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {pendingOrderCount}
            </span>
          )}
        </button>
        <button onClick={signOut} className="p-2 rounded-lg hover:bg-[#F9F9F9]">
          <LogOut size={18} className="text-[#666666]" />
        </button>
      </div>
    </header>
  )
}
