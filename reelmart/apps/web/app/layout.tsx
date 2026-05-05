import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '700'] })

export const metadata: Metadata = {
  title: { default: 'ReelMart', template: '%s | ReelMart' },
  description: 'Real Products. Real Sellers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={outfit.className}>{children}</body>
    </html>
  )
}
