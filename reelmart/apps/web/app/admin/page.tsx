import { redirect } from 'next/navigation'

// Dynamic so the redirect isn't statically prerendered + CDN-cached as a
// Location-less 307 (which dead-ended navigation to the dashboard).
export const dynamic = 'force-dynamic'

export default function AdminRoot() {
  redirect('/admin/dashboard')
}
