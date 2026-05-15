import type { Metadata } from 'next'
import OrdersClient from './OrdersClient'

export const metadata: Metadata = {
  title: 'My Orders · ReelMart',
  description: 'View your past orders on ReelMart.',
}

export const dynamic = 'force-dynamic'

export default function OrdersPage() {
  return <OrdersClient />
}
