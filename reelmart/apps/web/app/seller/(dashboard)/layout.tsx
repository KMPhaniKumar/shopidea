'use client'

import { useState } from 'react'
import { Sidebar } from '@/components/seller/Sidebar'
import { TopBar } from '@/components/seller/TopBar'
import { SellerGate, useSellerVerification } from '@/components/seller/SellerGate'

// Inner layout reads features_unlocked from the context that SellerGate provides.
function DashboardShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { verification } = useSellerVerification()
  const featuresUnlocked = verification?.features_unlocked ?? true // optimistic while loading

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        featuresUnlocked={featuresUnlocked}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar onMenuClick={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  )
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SellerGate>
      <DashboardShell>{children}</DashboardShell>
    </SellerGate>
  )
}
