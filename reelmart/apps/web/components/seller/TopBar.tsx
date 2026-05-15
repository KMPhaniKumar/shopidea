'use client'
import { Bell, LogOut, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSellerStore } from '@/store/sellerStore'

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { store, pendingOrderCount } = useSellerStore()
  const router = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/seller/login')
  }

  return (
    <header className="h-14 bg-white border-b border-[#EEEEEE] px-3 md:px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-[#F9F9F9]"
        >
          <Menu size={20} className="text-[#666666]" />
        </button>
        <span className="font-semibold text-[#1A1A1A] truncate">{store?.store_name ?? 'My Store'}</span>
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
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
