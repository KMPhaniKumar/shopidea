import type { Metadata } from 'next'
import AddressesClient from './AddressesClient'

export const metadata: Metadata = {
  title: 'Saved Addresses · ReelMart',
  description: 'Manage your saved delivery addresses.',
}

export const dynamic = 'force-dynamic'

export default function AddressesPage() {
  return <AddressesClient />
}
