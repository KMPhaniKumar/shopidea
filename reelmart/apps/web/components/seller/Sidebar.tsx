'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { X, Lock } from 'lucide-react'
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2,
  Users, Wallet, Megaphone, Settings,
} from 'lucide-react'

const ALL_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/seller/dashboard', gated: false },
  { icon: Package,         label: 'Products',   href: '/seller/products',  gated: true  },
  { icon: ShoppingBag,     label: 'Orders',     href: '/seller/orders',    gated: true  },
  { icon: BarChart2,       label: 'Analytics',  href: '/seller/analytics', gated: true  },
  { icon: Users,           label: 'Customers',  href: '/seller/customers', gated: true  },
  { icon: Wallet,          label: 'Payouts',    href: '/seller/payouts',   gated: true  },
  { icon: Megaphone,       label: 'Marketing',  href: '/seller/marketing', gated: true  },
  { icon: Settings,        label: 'Settings',   href: '/seller/settings',  gated: false },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
  /** When false, gated nav items are shown dimmed with a lock icon */
  featuresUnlocked?: boolean
}

export function Sidebar({ open, onClose, featuresUnlocked = true }: SidebarProps) {
  const pathname = usePathname()
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-60 bg-white border-r border-gray-200
          flex flex-col shrink-0 transition-transform
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <Link href="/" aria-label="ReelMart home">
              <Image src="/logo.png" alt="ReelMart" width={140} height={48} className="object-contain" />
            </Link>
            <div className="text-xs text-gray-400 mt-1">Seller Panel</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {ALL_ITEMS.map(({ icon: Icon, label, href, gated }) => {
            const locked = gated && !featuresUnlocked
            const active = pathname.startsWith(href)
            if (locked) {
              return (
                <div
                  key={href}
                  title="Complete onboarding to unlock"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-300 cursor-not-allowed select-none"
                >
                  <Icon size={18} />
                  <span className="flex-1">{label}</span>
                  <Lock size={13} className="text-gray-300 shrink-0" />
                </div>
              )
            }
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
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
    </>
  )
}
