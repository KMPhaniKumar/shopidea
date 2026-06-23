'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import {
  LayoutDashboard, Package, ShoppingBag, BarChart2,
  Users, Wallet, Megaphone, UserCircle,
} from 'lucide-react'

// write-gated = the seller can VIEW the page but write actions (add product etc.)
// are blocked inside those pages until features_unlocked.
// We keep all items visible and clickable; a small orange dot signals "pending" state.
const ALL_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',  href: '/seller/dashboard', writeGated: false },
  { icon: Package,         label: 'Products',   href: '/seller/products',  writeGated: true  },
  { icon: ShoppingBag,     label: 'Orders',     href: '/seller/orders',    writeGated: false },
  { icon: BarChart2,       label: 'Analytics',  href: '/seller/analytics', writeGated: false },
  { icon: Users,           label: 'Customers',  href: '/seller/customers', writeGated: false },
  { icon: Wallet,          label: 'Payouts',    href: '/seller/payouts',   writeGated: false },
  { icon: Megaphone,       label: 'Marketing',  href: '/seller/marketing', writeGated: false },
  { icon: UserCircle,      label: 'Profile',    href: '/seller/settings',  writeGated: false },
]

interface SidebarProps {
  open: boolean
  onClose: () => void
  /**
   * When false, write-gated nav items show a small pending badge.
   * All items remain clickable — write blocking happens inside the page.
   */
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
            <Link href="/seller/dashboard" aria-label="ReelMart seller dashboard">
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
          {ALL_ITEMS.map(({ icon: Icon, label, href, writeGated }) => {
            const active = pathname.startsWith(href)
            const showPending = writeGated && !featuresUnlocked

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
                <span className="flex-1">{label}</span>
                {showPending && (
                  <span
                    title="Unlocks after store approval"
                    className="w-2 h-2 rounded-full bg-primary shrink-0"
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
