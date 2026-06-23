import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sell on ReelMart — your own storefront on WhatsApp & Instagram',
  description:
    'Launch your online store in 60 seconds. Share one link, take orders on WhatsApp, accept UPI/cards, and ship across India. Built for Indian micro-sellers.',
}

export default function SellerLandingPage() {
  return (
    <main className="min-h-screen bg-white text-text">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <FinalCTA />
      <Footer />
    </main>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/seller" aria-label="ReelMart for sellers">
          <Image src="/logo.png" alt="ReelMart" width={140} height={50} priority className="object-contain" />
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/seller/login"
            className="hidden sm:inline-flex h-10 px-4 items-center text-sm font-medium text-text hover:text-primary"
          >
            Login
          </Link>
          <Link
            href="/seller/register"
            className="inline-flex h-10 px-5 items-center rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
          >
            Signup
          </Link>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="max-w-4xl mx-auto text-center">
        <span className="inline-block px-3 py-1 rounded-full bg-surface border border-border text-xs font-medium text-secondary mb-6">
          Built for Indian micro-sellers
        </span>
        <h1 className="text-4xl sm:text-6xl font-bold leading-tight tracking-tight">
          One link. Your whole store.<br />
          <span className="text-primary">Sell on WhatsApp & Instagram.</span>
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-secondary max-w-2xl mx-auto">
          Set up your storefront in 60 seconds. Share the link in your bio, status, or DMs.
          Accept UPI and card payments, manage orders, and ship across India — all from one dashboard.
        </p>
      </div>
    </section>
  )
}

function Features() {
  const items = [
    {
      title: 'Shareable storefront',
      body: 'Your own reelmart.in/your-store link. Looks great on mobile, loads fast, ready for Instagram bio and WhatsApp status.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Orders on WhatsApp',
      body: 'Buyers chat your bot, browse products, and place orders without leaving WhatsApp. You get notified instantly.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Payments & delivery',
      body: 'UPI, cards, and netbanking via Razorpay. Auto-create courier pickups and track every shipment in one place.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-7 h-7">
          <rect x="2" y="6" width="20" height="13" rx="2" />
          <path d="M2 11h20" />
          <path d="M6 16h4" strokeLinecap="round" />
        </svg>
      ),
    },
  ]

  return (
    <section className="bg-surface border-y border-border px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold">Everything you need to run a store</h2>
          <p className="mt-3 text-secondary">No tech skills required. Built end-to-end for Indian sellers.</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {items.map((it) => (
            <div key={it.title} className="bg-white rounded-card border border-border p-7 shadow-card">
              <div className="w-12 h-12 rounded-card bg-primary/10 text-primary flex items-center justify-center mb-5">
                {it.icon}
              </div>
              <h3 className="text-lg font-semibold mb-2">{it.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: 1, title: 'Sign up & name your store', body: 'Phone OTP login. Pick a store name and your unique link.' },
    { n: 2, title: 'Add products', body: 'Upload photos, set prices, mark stock. Done in minutes.' },
    { n: 3, title: 'Share & start selling', body: 'Drop your reelmart.in link anywhere. Orders flow into your dashboard.' },
  ]
  return (
    <section className="px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold">Up and running in 3 steps</h2>
        </div>
        <ol className="grid sm:grid-cols-3 gap-8">
          {steps.map((s) => (
            <li key={s.n} className="text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary text-white font-bold flex items-center justify-center text-lg mb-5">
                {s.n}
              </div>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="px-6 py-20">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl sm:text-4xl font-bold">Ready to take your business online?</h2>
        <p className="mt-3 text-secondary">Join sellers across India growing on ReelMart.</p>
        <Link
          href="/seller/register"
          className="mt-8 inline-flex h-12 px-8 items-center justify-center rounded-btn bg-primary text-white font-medium hover:opacity-90 transition"
        >
          Signup
        </Link>
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
          <a href="/legal/terms.html" className="hover:text-primary">Terms &amp; Conditions</a>
          <a href="/legal/privacy-policy.html" className="hover:text-primary">Privacy Policy</a>
          <a href="/legal/refund-return.html" className="hover:text-primary">Refund &amp; Returns</a>
          <a href="mailto:support@reelmart.in" className="hover:text-primary">Contact</a>
        </nav>
      </div>
    </footer>
  )
}
