import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Marketplace } from '@/components/home/Marketplace'
import BuyerAuthNav from '@/components/BuyerAuthNav'
import BrowseMenu from '@/components/home/BrowseMenu'

// Always render fresh marketplace data (new stores/products show up without a redeploy).
export const revalidate = 60

export const metadata: Metadata = {
  title: 'ReelMart — Shop from real sellers across India',
  description:
    'Discover stores and products from local sellers on ReelMart. Browse by category, order in a tap, and track your delivery. Real products, real sellers.',
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-text">
      <Header />
      <Marketplace />
      <BuyerAppCallout />
      <Footer />
    </main>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        {/* Left: logo + Browse */}
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          <Link href="/" aria-label="ReelMart home" className="shrink-0">
            <Image src="/logo.png" alt="ReelMart" width={140} height={50} priority className="object-contain" />
          </Link>
          <BrowseMenu />
        </div>
        {/* Right: auth, then Sell on ReelMart pinned to the far right */}
        <nav className="flex items-center gap-1.5 sm:gap-3">
          <BuyerAuthNav />
          <Link
            href="/seller"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex h-10 px-5 items-center rounded-btn border border-border text-primary text-sm font-medium hover:bg-surface transition"
          >
            Sell on ReelMart →
          </Link>
        </nav>
      </div>
    </header>
  )
}

function BuyerAppCallout() {
  return (
    <section id="get-app" className="px-6 py-20">
      <div className="max-w-4xl mx-auto bg-text text-white rounded-card p-10 sm:p-14 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">Get the ReelMart app</h2>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">
          Track orders, save addresses, and reorder favourites in seconds.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a
            href="#"
            aria-label="Download on the App Store"
            className="inline-flex h-12 px-5 items-center gap-3 rounded-btn bg-white text-text hover:opacity-90 transition"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M16.365 1.43c.04 1.31-.45 2.59-1.31 3.51-.86.92-2.27 1.63-3.55 1.53-.06-1.27.5-2.55 1.34-3.42.86-.9 2.31-1.55 3.52-1.62zM20.5 17.4c-.55 1.27-.81 1.84-1.52 2.97-.99 1.57-2.39 3.52-4.13 3.54-1.55.02-1.94-1.01-4.04-1-2.1.01-2.54 1.02-4.09 1-1.74-.02-3.07-1.78-4.06-3.35-2.78-4.41-3.07-9.59-1.36-12.34 1.21-1.95 3.13-3.09 4.93-3.09 1.83 0 2.98 1 4.49 1 1.47 0 2.36-1 4.48-1 1.6 0 3.3.87 4.51 2.38-3.97 2.18-3.32 7.85.79 9.89z" />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-wide">Download on the</span>
              <span className="block text-base font-semibold">App Store</span>
            </span>
          </a>
          <a
            href="#"
            aria-label="Get it on Google Play"
            className="inline-flex h-12 px-5 items-center gap-3 rounded-btn bg-white text-text hover:opacity-90 transition"
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6">
              <path fill="#34A853" d="M3 20.5V3.5c0-.46.18-.87.47-1.18l10.31 10.18L3.47 21.68A1.66 1.66 0 0 1 3 20.5z" />
              <path fill="#FBBC04" d="M16.81 16.34l-3.03-3.04 3.03-3.04 3.55 2c.95.55.95 1.93 0 2.48l-3.55 1.6z" />
              <path fill="#EA4335" d="M13.78 12.5L3.47 21.68c.31.32.78.49 1.34.32l12.0-6.66-3.03-2.84z" />
              <path fill="#4285F4" d="M3.47 2.32a1.4 1.4 0 0 1 1.34-.32l12.0 6.66-3.03 2.84L3.47 2.32z" />
            </svg>
            <span className="text-left leading-tight">
              <span className="block text-[10px] uppercase tracking-wide">Get it on</span>
              <span className="block text-base font-semibold">Google Play</span>
            </span>
          </a>
        </div>
        <p className="mt-4 text-xs text-white/60">Coming soon to App Store and Play Store.</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="ReelMart" width={100} height={36} className="object-contain" />
          <span className="text-sm text-muted">© 2026 ReelMart™</span>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-secondary">
          <Link href="/stores" className="hover:text-primary">Browse stores</Link>
          <Link href="/seller" className="hover:text-primary">Sell on ReelMart</Link>
          <a href="/legal/privacy-policy.html" className="hover:text-primary">Privacy Policy</a>
          <a href="/legal/terms.html" className="hover:text-primary">Terms &amp; Conditions</a>
          <a href="/legal/refund-return.html" className="hover:text-primary">Refund &amp; Returns</a>
          <a href="mailto:support@reelmart.in" className="hover:text-primary">Contact</a>
        </nav>
      </div>
    </footer>
  )
}
