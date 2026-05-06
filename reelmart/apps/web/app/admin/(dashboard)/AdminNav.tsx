'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, BarChart2, Store, Users, ShoppingBag,
  RotateCcw, Wallet, Settings,
} from 'lucide-react'

const items = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/admin/dashboard', exact: true },
  { icon: BarChart2,       label: 'Analytics',  href: '/admin/analytics' },
  { icon: Store,           label: 'Sellers',    href: '/admin/sellers'   },
  { icon: Users,           label: 'Buyers',     href: '/admin/buyers'    },
  { icon: ShoppingBag,     label: 'Orders',     href: '/admin/orders'    },
  { icon: RotateCcw,       label: 'Returns',    href: '/admin/returns'   },
  { icon: Wallet,          label: 'Payouts',    href: '/admin/payouts'   },
  { icon: Settings,        label: 'Settings',   href: '/admin/settings'  },
]

export default function AdminNav({ adminName }: { adminName: string }) {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-100">
        <Image src="/logo.png" alt="ReelMart" width={140} height={48} className="object-contain" />
        <div className="text-xs text-gray-400 mt-1">Admin Panel</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ icon: Icon, label, href, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-orange-50 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-gray-100">
        <p className="text-xs text-gray-500 truncate mb-1">{adminName}</p>
      </div>
    </aside>
  )
}
