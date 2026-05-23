// Shared category list for the marketplace + store-browsing surfaces.
// Add a new entry here and it shows up everywhere (home product widgets,
// /stores seller widgets, /stores/[category] pages) automatically.
export interface Category {
  id: string // matches stores.category / products' store category
  label: string
  icon: string
  bg: string
  accent: string
}

export const CATEGORIES: Category[] = [
  { id: 'jewellery',   label: 'Jewellery',          icon: '💍', bg: '#FFF9E6', accent: '#C99A00' },
  { id: 'clothing',    label: 'Clothing & Fashion', icon: '👗', bg: '#FDEAF3', accent: '#D6336C' },
  { id: 'food',        label: 'Food & Beverages',   icon: '🍱', bg: '#FFF4EC', accent: '#FF6B2B' },
  { id: 'electronics', label: 'Electronics',        icon: '📱', bg: '#E9F1FF', accent: '#1E88E5' },
  { id: 'home',        label: 'Home & Decor',       icon: '🏡', bg: '#E9F8F0', accent: '#1A8F5A' },
  { id: 'beauty',      label: 'Beauty & Wellness',  icon: '💄', bg: '#F4EAFE', accent: '#7C3AED' },
  { id: 'other',       label: 'More products',      icon: '🛍️', bg: '#F4F4F5', accent: '#555555' },
]

export function categoryById(id: string | null | undefined): Category | undefined {
  return CATEGORIES.find(c => c.id === id)
}

// Bucket a store's stored category into a known category id (falls back to 'other').
export function bucketCategory(category: string | null | undefined): string {
  return CATEGORIES.some(c => c.id === category) ? (category as string) : 'other'
}

// Normalise a stored Instagram handle to a bare username (no @, no URL).
export function instaUsername(handle: string | null | undefined): string | null {
  if (!handle) return null
  let h = handle.trim()
  if (!h) return null
  h = h.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/+$/, '')
  h = h.replace(/^@/, '')
  return h || null
}
