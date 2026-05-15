'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/seller/Sidebar'
import { TopBar } from '@/components/seller/TopBar'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="flex h-screen bg-[#F9F9F9]">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  )
}
