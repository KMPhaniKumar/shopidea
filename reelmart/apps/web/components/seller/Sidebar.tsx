'use client'
import Link from 'next/link'
import Image from 'next/image'
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
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-100">
        <Image src="/logo.png" alt="ReelMart" width={140} height={48} className="object-contain" />
        <div className="text-xs text-gray-400 mt-1">Seller Panel</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ icon: Icon, label, href }) => {
          const active = pathname.startsWith(href)
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
    </aside>
  )
}
