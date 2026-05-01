import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'ReelMart', template: '%s | ReelMart' },
  description: 'Real Products. Real Sellers.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
