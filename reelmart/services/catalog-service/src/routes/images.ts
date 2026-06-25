/**
 * images.ts — Product image upload, delete, and reorder endpoints.
 *
 * Routes:
 *   POST   /api/catalog/products/:id/images          — upload one image
 *   DELETE /api/catalog/products/:id/images/:imageId — delete one image (idempotent)
 *   PATCH  /api/catalog/products/:id/images/reorder  — reorder images
 *
 * Auth:      requireAuth (Bearer → supabaseAdmin.auth.getUser)
 * Ownership: getProductStore() bound to req.user.id — IDOR discipline; seller_id is
 *            NEVER read from the request body or path.
 */

import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, AuthRequest } from '../middleware/auth'
import {
  ALLOWED_MIME,
  MAX_FILE_BYTES,
  MAX_IMAGES,
  processAndUpload,
  removeImage,
  syncProductImagesArray,
} from '../lib/imageService'

export const imagesRouter = Router()

// ── Helpers (mirror products.ts) ──────────────────────────────────────────────

/** Returns the store_id + seller_id for a product, or null if not found. */
async function getProductStore(
  productId: string,
): Promise<{ store_id: string; seller_id: string } | null> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('store_id, stores!store_id(seller_id)')
    .eq('id', productId)
    .single()
  if (!data) return null
  return {
    store_id: (data as any).store_id,
    seller_id: (data as any).stores?.seller_id,
  }
}

/** Returns true iff the store is currently suspended. */
async function isStoreSuspended(storeId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('stores')
    .select('suspended')
    .eq('id', storeId)
    .single()
  return !!data && (data as any).suspended === true
}

// ── multer setup ──────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true)
    } else {
      // Reject with a typed error; the handler below detects it.
      cb(
        Object.assign(new Error('Unsupported media type'), {
          code: 'LIMIT_UNSUPPORTED_TYPE',
        }) as any,
      )
    }
  },
})

/** multer error handler — converts multer errors to consistent API responses. */
function handleMulterError(
  err: any,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!err) return next()
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large (max 12 MB)',
      code: 'FILE_TOO_LARGE',
    })
  }
  if (err.code === 'LIMIT_UNSUPPORTED_TYPE') {
    return res.status(415).json({
      success: false,
      error: 'Unsupported media type. Allowed: JPEG, PNG, WebP',
      code: 'UNSUPPORTED_MEDIA',
    })
  }
  next(err)
}

// ── POST /api/catalog/products/:id/images ────────────────────────────────────

imagesRouter.post(
  '/products/:id/images',
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    // Run multer as middleware; surface multer errors via handleMulterError.
    upload.single('image')(req, res, (err) => handleMulterError(err, req, res, next))
  },
  async (req: AuthRequest, res: Response) => {
    const productId = req.params.id

    // 1. Ownership — bind to verified JWT user id, never to body/path seller_id
    const ps = await getProductStore(productId)
    if (!ps || ps.seller_id !== req.user!.id) {
      return res.status(ps === null ? 404 : 403).json({
        success: false,
        error: ps === null ? 'Product not found' : 'Forbidden',
        code: ps === null ? 'PRODUCT_NOT_FOUND' : 'FORBIDDEN',
      })
    }

    // 2. Suspension guard
    if (await isStoreSuspended(ps.store_id)) {
      return res.status(403).json({
        success: false,
        error: 'Store is suspended',
        code: 'STORE_SUSPENDED',
      })
    }

    // 3. multer must have produced a file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Missing "image" field in multipart form',
        code: 'VALIDATION_ERROR',
      })
    }

    // 4. Check image count limit
    const { count, error: countError } = await supabaseAdmin
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('product_id', productId)

    if (countError) {
      return res.status(500).json({ success: false, error: 'Internal error', code: 'INTERNAL' })
    }
    if ((count ?? 0) >= MAX_IMAGES) {
      return res.status(422).json({
        success: false,
        error: `A product can have at most ${MAX_IMAGES} images`,
        code: 'IMG_LIMIT',
      })
    }

    // 5. Determine position = current max + 1 (or 0 for the first image)
    const { data: existing } = await supabaseAdmin
      .from('product_images')
      .select('position')
      .eq('product_id', productId)
      .order('position', { ascending: false })
      .limit(1)

    const position =
      existing && existing.length > 0 ? (existing[0] as any).position + 1 : 0

    // 6. Process (validate + resize) + upload
    let variants
    try {
      variants = await processAndUpload({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        productId,
        sellerId: ps.seller_id, // from DB lookup, never from request
      })
    } catch (err: any) {
      if (err.code === 'MIME_NOT_ALLOWED') {
        return res.status(415).json({
          success: false,
          error: 'Unsupported media type',
          code: 'UNSUPPORTED_MEDIA',
        })
      }
      if (err.code === 'FILE_TOO_LARGE') {
        return res.status(413).json({
          success: false,
          error: 'File too large (max 12 MB)',
          code: 'FILE_TOO_LARGE',
        })
      }
      if (err.code === 'IMG_DECODE_FAIL') {
        return res.status(422).json({
          success: false,
          error: 'Invalid or undecodable image',
          code: 'IMG_DECODE_FAIL',
        })
      }
      return res.status(500).json({ success: false, error: 'Internal error', code: 'INTERNAL' })
    }

    // 7. Insert product_images row
    const { data: row, error: insertError } = await supabaseAdmin
      .from('product_images')
      .insert({
        product_id: productId,
        seller_id: ps.seller_id,
        thumb_url: variants.thumbUrl,
        medium_url: variants.mediumUrl,
        full_url: variants.fullUrl,
        width: variants.width,
        height: variants.height,
        position,
      })
      .select('id, thumb_url, medium_url, full_url, position, width, height')
      .single()

    if (insertError || !row) {
      return res.status(500).json({ success: false, error: 'Internal error', code: 'INTERNAL' })
    }

    // 8. Sync products.images[] denorm array
    await syncProductImagesArray(productId)

    return res.status(201).json({ success: true, data: row })
  },
)

// ── DELETE /api/catalog/products/:id/images/:imageId ─────────────────────────

imagesRouter.delete(
  '/products/:id/images/:imageId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const { id: productId, imageId } = req.params

    // 1. Ownership check
    const ps = await getProductStore(productId)
    if (!ps || ps.seller_id !== req.user!.id) {
      return res.status(ps === null ? 404 : 403).json({
        success: false,
        error: ps === null ? 'Product not found' : 'Forbidden',
        code: ps === null ? 'PRODUCT_NOT_FOUND' : 'FORBIDDEN',
      })
    }

    // 2. Suspension guard
    if (await isStoreSuspended(ps.store_id)) {
      return res.status(403).json({
        success: false,
        error: 'Store is suspended',
        code: 'STORE_SUSPENDED',
      })
    }

    // 3. Fetch the image row (for idempotency: if already gone, 200 immediately)
    const { data: imageRow } = await supabaseAdmin
      .from('product_images')
      .select('id, thumb_url, position')
      .eq('id', imageId)
      .eq('product_id', productId)
      .single()

    if (!imageRow) {
      // Already deleted (or never existed) — idempotent 200
      return res.json({ success: true, data: null })
    }

    const deletedPosition = (imageRow as any).position
    const thumbUrl = (imageRow as any).thumb_url

    // 4. Remove storage objects + DB row
    await removeImage(imageId, productId, thumbUrl)

    // 5. Re-sequence positions: decrement all rows with position > deletedPosition.
    // supabase-js has no native "position = position - 1" expression, so we fetch
    // the affected rows (max 7 after a delete) and update each individually.
    const { data: remaining } = await supabaseAdmin
      .from('product_images')
      .select('id, position')
      .eq('product_id', productId)
      .gt('position', deletedPosition)

    if (remaining && remaining.length > 0) {
      await Promise.all(
        (remaining as Array<{ id: string; position: number }>).map((r) =>
          supabaseAdmin
            .from('product_images')
            .update({ position: r.position - 1 })
            .eq('id', r.id),
        ),
      )
    }

    // 6. Sync denorm array
    await syncProductImagesArray(productId)

    return res.json({ success: true, data: null })
  },
)

// ── PATCH /api/catalog/products/:id/images/reorder ───────────────────────────

const reorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
})

imagesRouter.patch(
  '/products/:id/images/reorder',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const productId = req.params.id

    // 1. Validate body
    const parsed = reorderSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.message,
        code: 'VALIDATION_ERROR',
      })
    }
    const { order } = parsed.data

    // 2. Ownership
    const ps = await getProductStore(productId)
    if (!ps || ps.seller_id !== req.user!.id) {
      return res.status(ps === null ? 404 : 403).json({
        success: false,
        error: ps === null ? 'Product not found' : 'Forbidden',
        code: ps === null ? 'PRODUCT_NOT_FOUND' : 'FORBIDDEN',
      })
    }

    // 3. Suspension guard
    if (await isStoreSuspended(ps.store_id)) {
      return res.status(403).json({
        success: false,
        error: 'Store is suspended',
        code: 'STORE_SUSPENDED',
      })
    }

    // 4. Validate all provided IDs belong to this product
    const { data: existingRows } = await supabaseAdmin
      .from('product_images')
      .select('id')
      .eq('product_id', productId)

    const existingIds = new Set((existingRows ?? []).map((r: any) => r.id))
    const invalidIds = order.filter((id) => !existingIds.has(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Image IDs not found on this product: ${invalidIds.join(', ')}`,
        code: 'VALIDATION_ERROR',
      })
    }

    // 5. Update position for each id in the provided order
    await Promise.all(
      order.map((id, index) =>
        supabaseAdmin
          .from('product_images')
          .update({ position: index })
          .eq('id', id)
          .eq('product_id', productId),
      ),
    )

    // 6. Sync denorm array
    await syncProductImagesArray(productId)

    return res.json({ success: true, data: { order } })
  },
)
