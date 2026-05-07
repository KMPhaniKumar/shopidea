import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CheckoutClient from './CheckoutClient'

interface Props { params: { slug: string } }

export const dynamic = 'force-dynamic'

export default async function CheckoutPage({ params }: Props) {
  const supabase = createClient()
  const { data: store } = await supabase
    .from('stores')
    .select('id, store_name, logo_url, store_slug')
    .eq('store_slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!store) notFound()

  return <CheckoutClient store={store as any} />
}
