'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: '📊 Dashboard', exact: true },
  { href: '/admin/analytics', label: '📈 Analytics' },
  { href: '/admin/sellers', label: '🏪 Sellers' },
  { href: '/admin/buyers', label: '👤 Buyers' },
  { href: '/admin/orders', label: '📦 Orders' },
  { href: '/admin/returns', label: '↩️ Returns' },
  { href: '/admin/payouts', label: '💰 Payouts' },
  { href: '/admin/settings', label: '⚙️ Settings' },
]

export default function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-100">
        <div className="text-xl font-black text-orange-500">ReelMart</div>
        <div className="text-xs text-gray-400 mt-1">Admin Panel</div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-2">Logged in as {adminName}</p>
        <button
          onClick={handleSignOut}
          className="w-full text-sm text-red-500 font-semibold py-2 rounded-xl hover:bg-red-50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  )
}
