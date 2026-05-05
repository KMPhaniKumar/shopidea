import { Sidebar } from '@/components/seller/Sidebar'
import { TopBar } from '@/components/seller/TopBar'

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#F9F9F9]">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}
