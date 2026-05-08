import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ReelMart — Sell on WhatsApp & Instagram with your own storefront',
  description:
    'Launch your online store in 60 seconds. Share one link, take orders on WhatsApp, accept UPI/cards, and ship across India. Built for Indian micro-sellers.',
}

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-text">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <Testimonials />
      <BuyerAppCallout />
      <FinalCTA />
      <Footer />
    </main>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="ReelMart home">
          <Image src="/logo.png" alt="ReelMart" width={140} height={50} priority className="object-contain" />
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/seller/login"
            className="hidden sm:inline-flex h-10 px-4 items-center text-sm font-medium text-text hover:text-primary"
          >
            Seller login
          </Link>
          <Link
            href="/seller/register"
            className="inline-flex h-10 px-5 items-center rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
          >
            Get started
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
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/seller/register"
            className="inline-flex h-12 px-7 items-center justify-center rounded-btn bg-primary text-white font-medium hover:opacity-90 transition"
          >
            Start your store
          </Link>
          <Link
            href="/seller/login"
            className="inline-flex h-12 px-7 items-center justify-center rounded-btn bg-white border border-border text-text font-medium hover:bg-surface transition"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">Set up in minutes. Start selling today.</p>
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
      body: 'UPI, cards, and netbanking via Razorpay. Auto-create Shiprocket pickups and track every shipment in one place.',
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

function Testimonials() {
  const quotes = [
    { name: 'Priya S.', city: 'Hyderabad', role: 'Saree boutique', body: 'Set up my store between two WhatsApp orders. My bio link finally does the work for me.' },
    { name: 'Rahul M.', city: 'Pune', role: 'Home bakery', body: 'Buyers pay upfront now. No more chasing UPI screenshots after midnight.' },
    { name: 'Anjali K.', city: 'Jaipur', role: 'Handmade jewellery', body: 'Shiprocket pickups happen on their own. I just print labels and pack.' },
  ]
  return (
    <section className="bg-surface border-y border-border px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold">Loved by sellers across India</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {quotes.map((q) => (
            <figure key={q.name} className="bg-white rounded-card border border-border p-7 shadow-card">
              <blockquote className="text-text leading-relaxed">&ldquo;{q.body}&rdquo;</blockquote>
              <figcaption className="mt-5 pt-5 border-t border-border">
                <div className="font-semibold">{q.name}</div>
                <div className="text-sm text-secondary">{q.role} · {q.city}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function BuyerAppCallout() {
  return (
    <section className="px-6 py-20">
      <div className="max-w-4xl mx-auto bg-text text-white rounded-card p-10 sm:p-14 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold">Shopping on ReelMart?</h2>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">
          Track orders, save addresses, and reorder favourites in seconds. Get the buyer app.
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
          Create my store
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
          <Link href="/seller/login" className="hover:text-primary">Seller login</Link>
          <Link href="/seller/register" className="hover:text-primary">Get started</Link>
          <a href="mailto:hello@reelmart.in" className="hover:text-primary">Contact</a>
        </nav>
      </div>
    </footer>
  )
}
