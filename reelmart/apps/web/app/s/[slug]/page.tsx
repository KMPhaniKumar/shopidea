import { redirect } from 'next/navigation'

export default function LegacyStorefrontRedirect({ params }: { params: { slug: string } }) {
  redirect(`/store/${params.slug}`)
}
