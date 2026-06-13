import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// POST /api/seller/signature
//
// Accepts a base64-encoded PNG (from the client-side canvas auto-generator or
// an uploaded file blob) and saves it to the private `seller-documents` bucket,
// then writes `stores.signature_path` via the service role.
//
// signature_path on `stores` is excluded from the authenticated role's UPDATE
// grant (migration 024), so this must go through a service-role route.

const SIG_BUCKET = 'seller-documents'

const supabaseAdmin = () =>
  createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

export async function POST(req: NextRequest) {
  // --- Resolve caller ---
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // --- Accept form-data with a single `file` field (PNG or JPEG image) ---
  const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg'] as const
  let fileBuffer: Buffer
  let fileContentType: string
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 })
    }
    // Validate MIME type from the File object (browser-reported type).
    // The storage upload uses this server-validated value — not a client header.
    const reportedType = file.type ?? ''
    if (!ALLOWED_MIME_TYPES.includes(reportedType as typeof ALLOWED_MIME_TYPES[number])) {
      return NextResponse.json(
        { success: false, error: 'Only PNG or JPEG images are accepted' },
        { status: 415 }
      )
    }
    fileContentType = reportedType
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'Signature file must be under 2MB' },
        { status: 400 }
      )
    }
    fileBuffer = Buffer.from(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 })
  }

  const admin = supabaseAdmin()

  // Verify the seller has a store
  const { data: store } = await admin
    .from('stores')
    .select('id')
    .eq('seller_id', user.id)
    .single()

  if (!store) {
    return NextResponse.json({ success: false, error: 'Store not found' }, { status: 404 })
  }

  // --- Upload to private bucket ---
  // Use fileContentType (validated above) so the stored object has the correct
  // Content-Type header.  Extension stays .png for predictable path; content-type
  // is the authoritative type for serving.
  const path = `${user.id}/signature.png`
  const { error: uploadErr } = await admin.storage
    .from(SIG_BUCKET)
    .upload(path, fileBuffer, {
      upsert: true,
      contentType: fileContentType,
    })

  if (uploadErr) {
    return NextResponse.json({ success: false, error: uploadErr.message }, { status: 400 })
  }

  // --- Persist path to stores ---
  const { error: updateErr } = await admin
    .from('stores')
    .update({ signature_path: path })
    .eq('id', store.id)

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 400 })
  }

  return NextResponse.json({ success: true, data: { signature_path: path } })
}
