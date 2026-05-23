// All sellers in one category — the "View all" target from /stores.
// Static grid of seller cards (no marquee). Server component.
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { categoryById } from '@/lib/categories'
import { SellerCard } from '@/components/home/SellerCarousel'
import { loadSellersByCategory } from '../page'

export const revalidate = 60

interface Props { params: { category: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = categoryById(params.category)
  if (!cat) return { title: 'Category not found · ReelMart' }
  return {
    title: `${cat.label} sellers · ReelMart`,
    description: `Browse ${cat.label} Instagram sellers on ReelMart across India.`,
  }
}

export default async function CategoryStoresPage({ params }: Props) {
  const cat = categoryById(params.category)
  if (!cat) notFound()

  const sellersByCat = await loadSellersByCategory()
  const sellers = sellersByCat.get(cat.id) ?? []

  return (
    <main className="min-h-screen bg-white text-text">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="ReelMart home">
            <Image src="/logo.png" alt="ReelMart" width={140} height={50} priority className="object-contain" />
          </Link>
          <Link href="/stores" className="text-sm font-medium text-primary hover:opacity-80">
            ← All stores
          </Link>
        </div>
      </header>

      <section className="px-6 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2 mb-8">
            <span className="text-3xl">{cat.icon}</span>
            <h1 className="text-3xl font-bold" style={{ color: cat.accent }}>{cat.label}</h1>
            <span className="text-sm text-secondary">· {sellers.length} {sellers.length === 1 ? 'seller' : 'sellers'}</span>
          </div>

          {sellers.length === 0 ? (
            <div className="text-center py-16">
              <h2 className="text-2xl font-bold">No sellers here yet</h2>
              <p className="mt-2 text-secondary">Check back soon — new {cat.label.toLowerCase()} sellers are joining ReelMart.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {sellers.map(s => (
                <SellerCard key={s.store_slug} seller={s} accent={cat.accent} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
