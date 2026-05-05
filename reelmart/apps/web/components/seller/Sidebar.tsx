'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2,
  Users, Wallet, Megaphone, Settings,
} from 'lucide-react'

const items = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/seller/dashboard' },
  { icon: Package,         label: 'Products',   href: '/seller/products'  },
  { icon: ShoppingBag,     label: 'Orders',     href: '/seller/orders'    },
  { icon: BarChart2,       label: 'Analytics',  href: '/seller/analytics' },
  { icon: Users,           label: 'Customers',  href: '/seller/customers' },
  { icon: Wallet,          label: 'Payouts',    href: '/seller/payouts'   },
  { icon: Megaphone,       label: 'Marketing',  href: '/seller/marketing' },
  { icon: Settings,        label: 'Settings',   href: '/seller/settings'  },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-60 bg-[#1A1A1A] flex flex-col shrink-0">
      <div className="p-6">
        <span className="text-2xl font-bold">
          <span className="text-[#FF6B2B]">Reel</span>
          <span className="text-white">Mart</span>
        </span>
      </div>
      <nav className="flex-1 px-3 pb-6 space-y-1">
        {items.map(({ icon: Icon, label, href }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#FF6B2B] text-white'
                  : 'text-[#AAAAAA] hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
