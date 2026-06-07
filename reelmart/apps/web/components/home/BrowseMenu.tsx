'use client'

// Header "Browse" dropdown — All stores + each product category, linking to the
// store-browsing pages (/stores and /stores/[category]).
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Store } from 'lucide-react'
import { CATEGORIES } from '@/lib/categories'

export default function BrowseMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex h-10 px-3 items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80"
      >
        Browse <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-56 bg-white border border-border rounded-card shadow-hover py-1.5 z-50">
          <Link
            href="/stores"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface"
          >
            <Store size={15} /> All stores
          </Link>
          <div className="my-1 border-t border-border" />
          {CATEGORIES.map(c => (
            <Link
              key={c.id}
              href={`/stores/${c.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-secondary hover:bg-surface hover:text-text"
            >
              <span>{c.icon}</span> {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
