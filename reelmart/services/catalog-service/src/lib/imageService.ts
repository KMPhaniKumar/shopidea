/**
 * imageService.ts — WebP variant pipeline for product images.
 *
 * Responsibilities:
 *  - validate()       MIME allowlist + decode-verify via sharp.metadata() + size cap
 *  - processVariants() generate 3 WebP variants (thumb/medium/full) from a raw buffer
 *  - upload()         write all 3 objects to Supabase Storage (service-role client)
 *  - remove()         delete all 3 objects + the product_images DB row (idempotent)
 *
 * Env dependencies: SUPABASE_URL (for building public URLs)
 * Client dependency: supabaseAdmin (service-role; bypasses RLS — ownership already
 *   enforced at the route layer before any call here reaches storage).
 */

import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from './supabase'

// ── Constants ─────────────────────────────────────────────────────────────────

/** MIME types accepted at the multipart layer and in validate(). */
export const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Hard cap on raw upload bytes (12 MB). multer enforces this first; we also
 *  check explicitly so the code path is testable without a real multipart. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024 // 12 MB

/** Maximum images allowed per product. */
export const MAX_IMAGES = 8

/** Supabase Storage bucket name. */
const BUCKET = 'product-images'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageVariants {
  imgId: string
  thumbUrl: string
  mediumUrl: string
  fullUrl: string
  /** Original image width (px), after EXIF rotation is applied. */
  width: number
  /** Original image height (px), after EXIF rotation is applied. */
  height: number
}

export interface ImageServiceOptions {
  buffer: Buffer
  mimeType: string   // already validated before this call
  productId: string
  sellerId: string   // taken from DB ownership lookup — never from request body
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * validate() — three checks in order:
 *   1. MIME type in ALLOWED_MIME
 *   2. Buffer byte length <= MAX_FILE_BYTES
 *   3. sharp.metadata() decode-verify (non-decodable → throws)
 *
 * Returns { width, height } from the decoded metadata on success.
 * Throws a typed Error with a `.code` property for the route to translate:
 *   'MIME_NOT_ALLOWED'  → 415
 *   'FILE_TOO_LARGE'    → 413
 *   'IMG_DECODE_FAIL'   → 422
 */
export async function validate(
  buffer: Buffer,
  mimeType: string,
): Promise<{ width: number; height: number }> {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw Object.assign(new Error('Unsupported media type'), { code: 'MIME_NOT_ALLOWED' })
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    throw Object.assign(new Error('File too large'), { code: 'FILE_TOO_LARGE' })
  }
  let meta: sharp.Metadata
  try {
    // .rotate() before metadata so EXIF-rotated dimensions are resolved correctly.
    meta = await sharp(buffer).rotate().metadata()
  } catch {
    throw Object.assign(new Error('Cannot decode image'), { code: 'IMG_DECODE_FAIL' })
  }
  if (!meta.width || !meta.height) {
    throw Object.assign(new Error('Cannot decode image'), { code: 'IMG_DECODE_FAIL' })
  }
  return { width: meta.width, height: meta.height }
}

// ── Processing ────────────────────────────────────────────────────────────────

interface VariantBuffers {
  thumb: Buffer
  medium: Buffer
  full: Buffer
}

/**
 * Generate all three WebP variant buffers from the raw input buffer.
 * Runs the three sharp pipelines in parallel.
 *
 * Design notes (from architecture doc):
 *  - .rotate() FIRST on every pipeline (strip + apply EXIF orientation)
 *  - thumb: 400x400 cover crop, quality 80
 *  - medium: longest edge ≤800px, aspect preserved (fit:inside), quality 82
 *  - full:   longest edge ≤1400px, aspect preserved (fit:inside), quality 82
 *  - withoutEnlargement: true on all variants (never upscale)
 *  - sharp strips all metadata by default after .rotate(); no explicit call needed
 */
async function processVariants(buffer: Buffer): Promise<VariantBuffers> {
  const [thumb, medium, full] = await Promise.all([
    // Thumb: square cover crop 400×400
    sharp(buffer)
      .rotate()
      .resize(400, 400, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer(),

    // Medium: longest edge ≤800, preserve aspect
    sharp(buffer)
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),

    // Full: longest edge ≤1400, preserve aspect
    sharp(buffer)
      .rotate()
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer(),
  ])
  return { thumb, medium, full }
}

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * Build the Supabase Storage public URL for a given path.
 * Pattern: {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
 */
function publicUrl(path: string): string {
  const base = (process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}

/**
 * processAndUpload — full pipeline: validate → resize → upload 3 objects.
 *
 * Called AFTER the route has verified:
 *   - the seller owns the product
 *   - the product image count is below MAX_IMAGES
 *
 * Throws on sharp decode failure or storage upload failure.
 */
export async function processAndUpload(opts: ImageServiceOptions): Promise<ImageVariants> {
  const { buffer, mimeType, productId } = opts

  // 1. Decode-verify and capture original dimensions
  const { width, height } = await validate(buffer, mimeType)

  // 2. Generate WebP variants in parallel
  const variants = await processVariants(buffer)

  // 3. Assign a fresh UUID for this image (makes paths immutable + collision-free)
  const imgId = uuidv4()

  // 4. Build storage paths
  const thumbPath  = `products/${productId}/${imgId}_thumb.webp`
  const mediumPath = `products/${productId}/${imgId}_medium.webp`
  const fullPath   = `products/${productId}/${imgId}_full.webp`

  // 5. Upload all three objects in parallel
  const uploadResults = await Promise.all([
    supabaseAdmin.storage.from(BUCKET).upload(thumbPath, variants.thumb, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(mediumPath, variants.medium, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: '31536000',
    }),
    supabaseAdmin.storage.from(BUCKET).upload(fullPath, variants.full, {
      contentType: 'image/webp',
      upsert: false,
      cacheControl: '31536000',
    }),
  ])

  // Surface the first storage error (all-or-nothing for the happy path)
  for (const result of uploadResults) {
    if (result.error) {
      throw Object.assign(
        new Error(`Storage upload failed: ${result.error.message}`),
        { code: 'STORAGE_ERROR' },
      )
    }
  }

  return {
    imgId,
    thumbUrl:  publicUrl(thumbPath),
    mediumUrl: publicUrl(mediumPath),
    fullUrl:   publicUrl(fullPath),
    width,
    height,
  }
}

// ── Remove ────────────────────────────────────────────────────────────────────

/**
 * removeImage — delete all 3 storage objects AND the product_images row.
 * Idempotent: missing objects or a missing row are silently ignored (no 500).
 *
 * Paths are derived from the stored thumb_url to avoid reconstructing logic
 * from the route layer. Falls back to path-building from productId + imgId
 * if the URL is non-standard.
 */
export async function removeImage(
  imageId: string,
  productId: string,
  thumbUrl: string,
): Promise<void> {
  // Derive the imgId from the thumb_url path.
  // URL pattern: .../products/{productId}/{imgId}_thumb.webp
  let imgId: string
  try {
    const urlPath = new URL(thumbUrl).pathname
    const filename = urlPath.split('/').pop() ?? ''
    imgId = filename.replace('_thumb.webp', '')
  } catch {
    // Fallback: use imageId directly as imgId (shouldn't happen in practice)
    imgId = imageId
  }

  const paths = [
    `products/${productId}/${imgId}_thumb.webp`,
    `products/${productId}/${imgId}_medium.webp`,
    `products/${productId}/${imgId}_full.webp`,
  ]

  // Delete storage objects — ignore "not found" errors (idempotent)
  await supabaseAdmin.storage.from(BUCKET).remove(paths)
  // Note: supabase-js storage.remove() does not error on missing objects.

  // Delete the DB row — ignore if already gone
  await supabaseAdmin
    .from('product_images')
    .delete()
    .eq('id', imageId)
}

// ── Sync helper ───────────────────────────────────────────────────────────────

/**
 * syncProductImagesArray — keeps products.images[] in sync as a denormalized
 * array of thumb_url values ordered by position.
 *
 * Called after every image write (insert, delete, reorder). Products that have
 * no product_images rows are left untouched (images[] retains legacy content).
 */
export async function syncProductImagesArray(productId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('product_images')
    .select('thumb_url')
    .eq('product_id', productId)
    .order('position', { ascending: true })

  const urls = (data ?? []).map((r: { thumb_url: string }) => r.thumb_url)

  // Only update if this product has at least one managed image row;
  // skip if urls is empty to avoid wiping legacy images[] on old products.
  if (urls.length === 0) return

  await supabaseAdmin
    .from('products')
    .update({ images: urls })
    .eq('id', productId)
}
