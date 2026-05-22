// Seller KYC helpers — PAN card + shop selfie uploads and validation.
// Documents go into the private `seller-documents` bucket (migration 012),
// keyed by the seller's user id so the bucket RLS lets the owner read/write
// their own folder. We persist only the object path; images are shown via
// short-lived signed URLs (the seller for themselves, admins via service role).
import { createClient } from '@/lib/supabase/client'

export const KYC_BUCKET = 'seller-documents'

export type KycKind = 'pan' | 'selfie'

// PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
// GSTIN: 15 chars — 2-digit state code, 10-char PAN, entity digit, 'Z', checksum.
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function isValidPan(v: string): boolean {
  return PAN_REGEX.test(v.trim().toUpperCase())
}

export function isValidGst(v: string): boolean {
  return GST_REGEX.test(v.trim().toUpperCase())
}

export async function uploadKycFile(userId: string, kind: KycKind, file: File): Promise<string> {
  const supabase = createClient()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}/${kind}_${Date.now()}.${ext}`
  const { error } = await supabase.storage
    .from(KYC_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

// Short-lived signed URL for previewing a private KYC document.
export async function signedKycUrl(path: string, expiresIn = 300): Promise<string | null> {
  if (!path) return null
  const supabase = createClient()
  const { data } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}
