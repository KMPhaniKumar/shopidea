'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/seller/Sidebar'
import { TopBar } from '@/components/seller/TopBar'
import { SellerGate } from '@/components/seller/SellerGate'
import { createClient } from '@/lib/supabase/client'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [featuresUnlocked, setFeaturesUnlocked] = useState(true) // optimistic default

  useEffect(() => {
    const supabase = createClient()
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('seller_verification')
        .select('features_unlocked')
        .eq('seller_id', user.id)
        .maybeSingle()
      // If view not available, keep optimistic true
      if (data !== null) setFeaturesUnlocked(data?.features_unlocked ?? false)
    }
    check()
  }, [])

  return (
    <SellerGate>
      <div className="flex h-screen bg-[#F9F9F9]">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} featuresUnlocked={featuresUnlocked} />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar onMenuClick={() => setMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto p-3 md:p-6">{children}</main>
        </div>
      </div>
    </SellerGate>
  )
}
