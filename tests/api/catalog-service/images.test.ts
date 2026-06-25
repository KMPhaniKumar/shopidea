/**
 * catalog-service — product image pipeline tests
 *
 * Covers:
 *  POST /api/catalog/products/:id/images
 *    - 401 when no auth
 *    - 403 when cross-seller upload (IDOR fix)
 *    - 404 when product not found
 *    - 413 when file exceeds 12 MB
 *    - 415 when non-image MIME type (e.g. text/plain)
 *    - 422 when buffer is non-decodable (corrupt file)
 *    - 422 when product already has 8 images (IMG_LIMIT)
 *    - 201 happy path — returns thumb_url/medium_url/full_url/position
 *
 *  DELETE /api/catalog/products/:id/images/:imageId
 *    - 401 when no auth
 *    - 403 cross-seller delete denied (IDOR)
 *    - 200 idempotent — deleting an already-gone image returns 200
 *    - 200 happy path
 *
 *  PATCH /api/catalog/products/:id/images/reorder
 *    - 401 when no auth
 *    - 400 when order array contains IDs not on this product
 *    - 400 when order is empty or body missing
 *    - 200 happy path — returns { order }
 *
 * Mock strategy:
 *  - supabaseAdmin: absolute-path vi.mock (same pattern as existing catalog tests)
 *  - sharp: vi.mock('@/sharp') — returns predictable toBuffer() values
 *  - imageService functions are mocked at the route import level so we do NOT
 *    exercise the real sharp/storage in this test file. Integration (Docker)
 *    verification is done separately.
 *
 * The test app uses supertest with multipart uploads via `.attach()`.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, OTHER_SELLER, STORE,
  makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockStorage = {
  from: vi.fn(),
}

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
  storage: mockStorage,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Mock imageService ──────────────────────────────────────────────────────
// We mock at the imageService module level so tests don't need a real sharp binary
// or Supabase Storage connection. Each test controls what processAndUpload returns.

const mockProcessAndUpload = vi.fn()
const mockRemoveImage = vi.fn()
const mockSyncProductImagesArray = vi.fn()
const mockValidate = vi.fn()

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/lib/imageService',
  () => ({
    ALLOWED_MIME: new Set(['image/jpeg', 'image/png', 'image/webp']),
    MAX_FILE_BYTES: 12 * 1024 * 1024,
    MAX_IMAGES: 8,
    processAndUpload: mockProcessAndUpload,
    removeImage: mockRemoveImage,
    syncProductImagesArray: mockSyncProductImagesArray,
    validate: mockValidate,
  }),
)

// ── 3. Build test Express app ─────────────────────────────────────────────────

let app: express.Application

beforeAll(async () => {
  const { imagesRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/catalog-service/src/routes/images'
  )
  app = express()
  app.use(express.json())
  app.use('/api/catalog', imagesRouter)
})

// ── 4. Fixture constants ──────────────────────────────────────────────────────

const PRODUCT_ID  = 'dddddddd-0001-4000-8000-000000000001'
const IMAGE_ID    = 'eeeeeeee-0001-4000-8000-000000000001'
const IMAGE_ID_2  = 'ffffffff-0001-4000-8000-000000000001'

const SUPABASE_URL = 'https://test.supabase.co'

/** A product row whose store is owned by SELLER */
const OWNED_PRODUCT = {
  id: PRODUCT_ID,
  store_id: STORE.id,
  name: 'Test Product',
  price: 500,
  stores: { seller_id: SELLER.id },
}

/** Successful processAndUpload response */
const MOCK_VARIANTS = {
  imgId: IMAGE_ID,
  thumbUrl:  `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/${IMAGE_ID}_thumb.webp`,
  mediumUrl: `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/${IMAGE_ID}_medium.webp`,
  fullUrl:   `${SUPABASE_URL}/storage/v1/object/public/product-images/products/${PRODUCT_ID}/${IMAGE_ID}_full.webp`,
  width: 1200,
  height: 1200,
}

/** DB row returned after INSERT */
const INSERTED_ROW = {
  id: IMAGE_ID,
  thumb_url:  MOCK_VARIANTS.thumbUrl,
  medium_url: MOCK_VARIANTS.mediumUrl,
  full_url:   MOCK_VARIANTS.fullUrl,
  position: 0,
  width: 1200,
  height: 1200,
}

// ── 5. Helpers ────────────────────────────────────────────────────────────────

function authAs(identity: { id: string }) {
  mockGetUser.mockResolvedValue({
    data: { user: makeSupabaseUser(identity) },
    error: null,
  })
}

function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

/**
 * Fluent query builder that handles chained supabase-js calls.
 * Supports select/eq/gt/order/limit/single/insert/update/delete + then().
 * Each table maps to a { data, error } result.
 *
 * The `count` variant supports { count: 'exact', head: true } by returning
 * { count: result.count, error: null } from the terminal call.
 */
function makeQueryBuilder(tableResults: Record<string, { data: any; error: any; count?: number | null }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null, count: null }
    let isCountQuery = false

    const builder: any = {
      select: (_cols?: string, opts?: any) => {
        if (opts?.count === 'exact') isCountQuery = true
        return builder
      },
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      gt: () => builder,
      gte: () => builder,
      ilike: () => builder,
      in: () => builder,
      is: () => builder,
      limit: () => builder,
      order: () => builder,
      single: () => {
        if (isCountQuery) return { count: result.count ?? null, error: result.error }
        return result
      },
      maybeSingle: () => result,
      then: (fn: any) => {
        if (isCountQuery) return Promise.resolve({ count: result.count ?? null, error: result.error }).then(fn)
        return Promise.resolve(result).then(fn)
      },
    }
    return builder
  }
}

/**
 * A builder factory for the Supabase count query pattern:
 *   supabaseAdmin.from('product_images').select('id', { count: 'exact', head: true }).eq(...)
 * The chain terminates implicitly via .then() (no .single()).
 */
function makeCountBuilder(count: number | null, error: any = null) {
  // Returns a function that, when called as mockFrom(table), returns the chain
  return (_table: string) => {
    const builder: any = {
      select: (_cols?: string, _opts?: any) => builder,
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      eq: () => builder,
      neq: () => builder,
      gt: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => ({ count, error }),
      maybeSingle: () => ({ count, error }),
      // The route awaits the chain directly (no .single() on count queries)
      then: (fn: any) => Promise.resolve({ count, error }).then(fn),
    }
    return builder
  }
}

/** Minimal valid JPEG magic bytes (SOI marker) */
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])

// ── Setup: reset mocks before each test ──────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  mockProcessAndUpload.mockResolvedValue(MOCK_VARIANTS)
  mockRemoveImage.mockResolvedValue(undefined)
  mockSyncProductImagesArray.mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/catalog/products/:id/images
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /api/catalog/products/:id/images — upload', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .attach('image', MINIMAL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 403 when a different seller tries to upload (IDOR fix)', async () => {
    authAs(OTHER_SELLER)
    // Product is owned by SELLER, not OTHER_SELLER
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(OTHER_SELLER))
      .attach('image', MINIMAL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('returns 404 when product does not exist', async () => {
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', MINIMAL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND')
  })

  it('returns 415 when MIME type is not in the allowlist (text/plain)', async () => {
    // The multer fileFilter rejects before we even reach the route handler.
    // No DB mock needed because auth + ownership checks haven't run yet.
    authAs(SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', Buffer.from('hello world'), { filename: 'doc.txt', contentType: 'text/plain' })
    expect(res.status).toBe(415)
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA')
  })

  it('returns 413 when file exceeds 12 MB', async () => {
    // multer's fileSize limit fires and we handle it in handleMulterError.
    authAs(SELLER)
    const bigBuffer = Buffer.alloc(13 * 1024 * 1024, 0xff) // 13 MB, all 0xFF
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', bigBuffer, { filename: 'huge.jpg', contentType: 'image/jpeg' })
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('FILE_TOO_LARGE')
  })

  it('returns 422 when the image buffer is non-decodable (corrupt)', async () => {
    authAs(SELLER)

    // Wire ownership + store + count queries so we reach processAndUpload
    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' && callCount === 0) {
        callCount++
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        // count query
        return makeCountBuilder(0)(table)
      }
      return makeQueryBuilder({})(table)
    })

    // processAndUpload throws IMG_DECODE_FAIL for a non-decodable buffer
    mockProcessAndUpload.mockRejectedValue(
      Object.assign(new Error('Cannot decode image'), { code: 'IMG_DECODE_FAIL' }),
    )

    const corruptBuffer = Buffer.from('not-an-image-at-all')
    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', corruptBuffer, { filename: 'corrupt.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('IMG_DECODE_FAIL')
  })

  it('returns 422 with code IMG_LIMIT when product already has 8 images', async () => {
    authAs(SELLER)

    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' && callIdx === 0) {
        callIdx++
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        // Return count = 8 → limit hit
        return makeCountBuilder(8)(table)
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', MINIMAL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(422)
    expect(res.body.code).toBe('IMG_LIMIT')
  })

  it('returns 201 with image URLs and position on happy path', async () => {
    authAs(SELLER)

    let productImagesCallIdx = 0
    mockFrom.mockImplementation((table: string) => {
      // Call order:
      // 1. products — ownership (getProductStore)
      // 2. stores   — suspension check
      // 3. product_images — count (head=true)
      // 4. product_images — max position query
      // 5. product_images — INSERT .select().single()
      // 6. product_images — syncProductImagesArray select
      // 7. products       — syncProductImagesArray update

      if (table === 'products') {
        const b: any = {
          select: () => b,
          update: () => b,
          eq: () => b,
          single: () => ({ data: OWNED_PRODUCT, error: null }),
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        productImagesCallIdx++
        if (productImagesCallIdx === 1) {
          // count query — 0 images so far
          return makeCountBuilder(0)(table)
        }
        if (productImagesCallIdx === 2) {
          // max position query → empty (first image)
          const b: any = {
            select: () => b,
            eq: () => b,
            order: () => b,
            limit: () => b,
            then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
          }
          return b
        }
        if (productImagesCallIdx === 3) {
          // INSERT .select().single()
          const b: any = {
            insert: () => b,
            select: () => b,
            single: () => ({ data: INSERTED_ROW, error: null }),
          }
          return b
        }
        // syncProductImagesArray select
        const b: any = {
          select: () => b,
          eq: () => b,
          order: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ thumb_url: MOCK_VARIANTS.thumbUrl }], error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .post(`/api/catalog/products/${PRODUCT_ID}/images`)
      .set('Authorization', bearerToken(SELLER))
      .attach('image', MINIMAL_JPEG, { filename: 'photo.jpg', contentType: 'image/jpeg' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      id: IMAGE_ID,
      thumb_url:  MOCK_VARIANTS.thumbUrl,
      medium_url: MOCK_VARIANTS.mediumUrl,
      full_url:   MOCK_VARIANTS.fullUrl,
      position: 0,
    })
    // processAndUpload should have been called with the seller_id from DB (not body)
    expect(mockProcessAndUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerId: SELLER.id,
        productId: PRODUCT_ID,
      }),
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/catalog/products/:id/images/:imageId
// ─────────────────────────────────────────────────────────────────────────────

describe('DELETE /api/catalog/products/:id/images/:imageId — delete', () => {
  it('returns 401 when no auth', async () => {
    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 when a different seller tries to delete (IDOR fix)', async () => {
    authAs(OTHER_SELLER)
    mockFrom.mockImplementation(makeQueryBuilder({
      products: { data: OWNED_PRODUCT, error: null },
    }))
    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
      .set('Authorization', bearerToken(OTHER_SELLER))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('returns 200 idempotently when image row does not exist (already deleted)', async () => {
    authAs(SELLER)

    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' && callIdx === 0) {
        callIdx++
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        // Row not found (already deleted)
        return makeQueryBuilder({ product_images: { data: null, error: { message: 'not found' } } })(table)
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeNull()
    // removeImage should NOT have been called (image was already gone)
    expect(mockRemoveImage).not.toHaveBeenCalled()
  })

  it('returns 200 and calls removeImage on happy path', async () => {
    authAs(SELLER)

    const IMAGE_ROW = {
      id: IMAGE_ID,
      thumb_url: MOCK_VARIANTS.thumbUrl,
      position: 2,
    }

    let productImagesCallIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') {
        const b: any = {
          select: () => b,
          update: () => b,
          eq: () => b,
          single: () => ({ data: OWNED_PRODUCT, error: null }),
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        productImagesCallIdx++
        if (productImagesCallIdx === 1) {
          // Fetch image row
          const b: any = {
            select: () => b,
            eq: () => b,
            single: () => ({ data: IMAGE_ROW, error: null }),
          }
          return b
        }
        if (productImagesCallIdx === 2) {
          // Re-sequence: fetch remaining rows with position > 2
          const b: any = {
            select: () => b,
            eq: () => b,
            gt: () => b,
            then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
          }
          return b
        }
        // syncProductImagesArray select
        const b: any = {
          select: () => b,
          eq: () => b,
          order: () => b,
          then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .delete(`/api/catalog/products/${PRODUCT_ID}/images/${IMAGE_ID}`)
      .set('Authorization', bearerToken(SELLER))

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(mockRemoveImage).toHaveBeenCalledWith(IMAGE_ID, PRODUCT_ID, MOCK_VARIANTS.thumbUrl)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/catalog/products/:id/images/reorder
// ─────────────────────────────────────────────────────────────────────────────

describe('PATCH /api/catalog/products/:id/images/reorder — reorder', () => {
  it('returns 401 when no auth', async () => {
    const res = await request(app)
      .patch(`/api/catalog/products/${PRODUCT_ID}/images/reorder`)
      .send({ order: [IMAGE_ID, IMAGE_ID_2] })
    expect(res.status).toBe(401)
  })

  it('returns 400 when order array is empty', async () => {
    authAs(SELLER)
    // Zod validation fires before DB calls
    mockFrom.mockImplementation(makeQueryBuilder({}))
    const res = await request(app)
      .patch(`/api/catalog/products/${PRODUCT_ID}/images/reorder`)
      .set('Authorization', bearerToken(SELLER))
      .send({ order: [] })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 when order contains an ID not belonging to this product', async () => {
    authAs(SELLER)

    const FOREIGN_ID = 'cccccccc-0001-4000-8000-000000000001'

    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products' && callIdx === 0) {
        callIdx++
        return makeQueryBuilder({ products: { data: OWNED_PRODUCT, error: null } })(table)
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        // Only IMAGE_ID belongs to this product
        const b: any = {
          select: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: [{ id: IMAGE_ID }], error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .patch(`/api/catalog/products/${PRODUCT_ID}/images/reorder`)
      .set('Authorization', bearerToken(SELLER))
      .send({ order: [IMAGE_ID, FOREIGN_ID] })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
    expect(res.body.error).toMatch(FOREIGN_ID)
  })

  it('returns 200 with { order } on happy path', async () => {
    authAs(SELLER)

    let callIdx = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') {
        const b: any = {
          select: () => b,
          update: () => b,
          eq: () => b,
          single: () => ({ data: OWNED_PRODUCT, error: null }),
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      if (table === 'stores') {
        return makeQueryBuilder({ stores: { data: { suspended: false }, error: null } })(table)
      }
      if (table === 'product_images') {
        callIdx++
        if (callIdx === 1) {
          // List all image IDs for this product
          const b: any = {
            select: () => b,
            eq: () => b,
            then: (fn: any) =>
              Promise.resolve({
                data: [{ id: IMAGE_ID }, { id: IMAGE_ID_2 }],
                error: null,
              }).then(fn),
          }
          return b
        }
        // Individual position update calls
        const b: any = {
          update: () => b,
          eq: () => b,
          then: (fn: any) => Promise.resolve({ data: null, error: null }).then(fn),
        }
        return b
      }
      return makeQueryBuilder({})(table)
    })

    const newOrder = [IMAGE_ID_2, IMAGE_ID] // reverse the order
    const res = await request(app)
      .patch(`/api/catalog/products/${PRODUCT_ID}/images/reorder`)
      .set('Authorization', bearerToken(SELLER))
      .send({ order: newOrder })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.order).toEqual(newOrder)
    expect(mockSyncProductImagesArray).toHaveBeenCalledWith(PRODUCT_ID)
  })
})
