import type { Metadata } from 'next'
import ProfileClient from './ProfileClient'

export const metadata: Metadata = {
  title: 'My Profile · ReelMart',
  description: 'View and edit your ReelMart profile.',
}

export const dynamic = 'force-dynamic'

export default function ProfilePage() {
  return <ProfileClient />
}
