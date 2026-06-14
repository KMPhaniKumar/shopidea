'use client'
import { useState } from 'react'
import { Bell, LogOut, Menu } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useSellerStore } from '@/store/sellerStore'

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { store, pendingOrderCount, setStore } = useSellerStore()
  const router = useRouter()
  const supabase = createClient()
  const [toggling, setToggling] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/seller/login')
  }

  // Manual Open/Closed switch. is_open is one of the few stores columns the
  // authenticated role may UPDATE directly (migration 024); RLS scopes the row
  // to this seller. Optimistic update, reverted on failure.
  async function toggleOpen() {
    if (!store?.id || toggling) return
    const next = !store.is_open
    setToggling(true)
    setStore({ ...store, is_open: next })
    const { error } = await supabase.from('stores').update({ is_open: next }).eq('id', store.id)
    setToggling(false)
    if (error) {
      setStore({ ...store, is_open: !next })
      toast.error('Could not update store status')
    } else {
      toast.success(next ? 'Store is now Open' : 'Store is now Closed')
    }
  }

  const storeName = store?.store_name
  const isOpen = !!store?.is_open

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
        {storeName ? (
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm text-[#666666] shrink-0">Hi,</span>
            <span className="font-semibold text-[#1A1A1A] truncate">{storeName} 👋</span>
          </div>
        ) : (
          <span className="font-semibold text-[#1A1A1A] truncate">My Store</span>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        {store && (
          <button
            type="button"
            role="switch"
            aria-checked={isOpen}
            onClick={toggleOpen}
            disabled={toggling}
            title={isOpen ? 'Your store is Open — tap to close it' : 'Your store is Closed — tap to open it'}
            aria-label={isOpen ? 'Store is open — tap to close' : 'Store is closed — tap to open'}
            className="flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-full border border-[#EEEEEE] bg-white hover:bg-[#F9F9F9] transition disabled:opacity-50"
          >
            <span className={`text-xs font-semibold ${isOpen ? 'text-green-700' : 'text-[#999999]'}`}>
              {isOpen ? 'Open' : 'Closed'}
            </span>
            {/* Sliding toggle: track + knob that moves to signal on/off */}
            <span
              className={`relative inline-flex items-center w-9 h-5 rounded-full transition-colors ${
                isOpen ? 'bg-green-500' : 'bg-[#D9D9D9]'
              }`}
            >
              <span
                className={`absolute w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                  isOpen ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        )}
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
