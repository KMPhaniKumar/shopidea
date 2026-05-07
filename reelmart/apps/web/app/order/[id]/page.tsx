import OrderConfirmedClient from './OrderConfirmedClient'

interface Props { params: { id: string } }

export const dynamic = 'force-dynamic'

export default function OrderConfirmedPage({ params }: Props) {
  return <OrderConfirmedClient orderId={params.id} />
}
