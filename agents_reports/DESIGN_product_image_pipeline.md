# DESIGN: Product Image Upload + WebP Resize Pipeline
**Status:** Draft for review — engineers implement after architect sign-off
**Date:** 2026-06-25
**Author:** Architect agent

---

## 0. Deviations from the Pasted Spec (index; details inline)

| # | Spec says | ReelMart reality | Decision |
|---|---|---|---|
| D1 | Fastify + `@fastify/multipart` | Express/TS microservices | multer memory-storage in catalog-service |
| D2 | `se_123` / `pr_456` style ids | UUIDs everywhere | Storage path uses UUIDs |
| D3 | Brand colors `#f97316` / `#16b7a0` | `#FF6B2B` primary (tailwind `primary`) | Use `primary` token; `#FF6B2B` in inline styles |
| D4 | New `product_images` table from scratch | `products.images TEXT[]` already exists | Add `product_images` table AND keep denormalized `images[0]` on `products` for zero-regression list rendering |
| D5 | Max 8 images / product | Current UI caps at 5 | Raise to 8 per spec (breaking for UI only; backwards-compatible for DB) |
| D6 | HEIC handled server-side (libheif in libvips) | node:22-alpine has no libheif; adding it costs 60-80 MB and Alpine build friction | Frontend `heic2any` conversion (client-side, chosen path) |
| D7 | Client uploads directly to Supabase Storage | Security requirement: backend API only (no client-side service key) | Frontend POSTs to catalog-service; backend writes to Supabase with service key |
| D8 | "Original discarded; only 3 WebP variants" | Spec choice, adopted | Confirmed: only thumb/medium/full persisted |
| D9 | Auth pattern unspecified | `supabase.auth.getSession()` → `Authorization: Bearer <access_token>` (same pattern as orders/delivery pages) | Mirror existing seller auth |
| D10 | Sharp on Alpine with libvips | node:22-alpine ships libvips-compatible `sharp` via prebuilt binaries; `sharp` v0.33+ provides `linux-x64` prebuilt; Alpine `musl` requires the `linux-musl-x64` variant | Dockerfile must set `SHARP_IGNORE_GLOBAL_LIBVIPS=1` and install `vips-dev` as a build-stage dep or use the npm prebuilt — see risk R1 |

---

## 1. Current State Assessment

### 1.1 Database — `products.images TEXT[]`

Migration `003_products.sql` defines `images TEXT[] DEFAULT '{}'`. No separate images table exists. The column stores an ordered array of **full Supabase Storage public URLs** (absolute HTTPS strings like `https://nysgwdpmpxqmfwelfaxo.supabase.co/storage/v1/object/public/product-images/<store_uuid>/<timestamp_random>.jpg`).

There are no WebP variants, no per-image metadata (width, height, position), no thumb/medium/full distinctions.

### 1.2 Storage Bucket — `product-images`

Defined in `012_rls_fixes.sql`:
- Public bucket (no auth needed to read)
- `file_size_limit = 2 MB` (spec wants 12 MB — must be updated)
- `allowed_mime_types = ['image/jpeg','image/png','image/webp']` (no HEIC — correct, handled client-side)
- Path layout: `{store_uuid}/{timestamp}_{random}.{ext}`
- RLS: upload policy checks `(storage.foldername(name))[1] = store_id WHERE seller_id = auth.uid()`

The current RLS model keys paths by `store_id`. The new layout will key by `product_id` — the storage policy will need updating but remains equivalent in ownership semantics.

### 1.3 Current Upload Flow

Both the new-product (`products/new/page.tsx`) and edit-product (`products/[id]/page.tsx`) pages:
1. Call `supabase.storage.from('product-images').upload(path, file)` **directly from the browser** using the Supabase anon/session key.
2. Store the returned `publicUrl` string in local `images: string[]` state.
3. On form submit, pass the URL array to `supabase.from('products').insert/update({ images })`.

**Problems with this today:**
- Client uploads bypass the backend entirely — no resize, no format normalization, no decode-verify, no file-size enforcement beyond the bucket cap.
- 2 MB cap is too small for phone camera shots (typical HEIC = 4-8 MB).
- Max 5 images enforced only in the UI.
- No EXIF rotation strip.
- Images arrive as JPEG/PNG at original resolution — cards use `images[0]` as a full-res cover image.

### 1.4 Image Rendering (current)

| Surface | Code | What it reads |
|---|---|---|
| Storefront product grid (`StoreClient.tsx`) | `<img src={p.images[0]} />` | First URL in `images[]` |
| Product detail page (`ProductClient.tsx`) | `activeImage` index into `product.images` array | Any URL in `images[]` |
| Buyer app home/storefront (`StorefrontScreen.tsx`) | `getFirstImage(product.images)` | First URL, via `imageUrl.ts` helper |
| Buyer app product page | `product.images[activeImage]` | Any URL in `images[]` |
| Buyer app cart, wishlist | `p.images[0]` | First URL |

All surfaces read `products.images` directly. This means any migration must keep `images[0]` pointing to a valid, publicly accessible image — the new design maintains this as a denormalized pointer.

### 1.5 Service Placement

`catalog-service` owns the `products` table and all product CRUD. It already has:
- `requireAuth` middleware (Bearer token → `supabaseAdmin.auth.getUser()`)
- `userOwnsProduct()` / `getProductStore()` ownership helpers
- `isStoreSuspended()` guard
- `supabaseAdmin` (service-role key) for storage writes

This is the correct home for image upload endpoints. No new service is needed.

### 1.6 Auth Pattern in Seller Web

API calls from the seller dashboard that talk to backend services use:
```
const { data: { session } } = await supabase.auth.getSession()
fetch(`${API_URL}/api/...`, {
  headers: { Authorization: `Bearer ${session?.access_token}` }
})
```
This is the pattern in `orders/page.tsx`, `marketing/page.tsx`, `register/page.tsx`. The new uploader hook follows the same pattern. `API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api-dev.reelmart.in'`.

---

## 2. Target Architecture

```
Browser (seller dashboard)
  └─ ProductImageUploader component
       ├─ Client: HEIC→JPEG (heic2any), pre-compress (browser-image-compression)
       ├─ POST multipart/form-data → api-dev.reelmart.in/api/catalog/products/:id/images
       │    Authorization: Bearer <supabase_access_token>
       └─ PATCH /api/catalog/products/:id/images/reorder  (position update)
       └─ DELETE /api/catalog/products/:id/images/:imageId  (removes 3 objects + row)

catalog-service (Express/TS, ECS Fargate)
  └─ POST /api/catalog/products/:id/images
       ├─ requireAuth → userOwnsProduct() → isStoreSuspended()
       ├─ multer memoryStorage (field: "image", 12 MB limit, 1 file per request)
       ├─ validate MIME allowlist + decode-verify (sharp metadata probe)
       ├─ check product image count <= 8
       ├─ imageService.processAndUpload(buffer, productId, sellerId)
       │    ├─ sharp: rotate (EXIF) → resize → WebP → strip metadata
       │    ├─ generate UUID for image: imgId = uuidv4()
       │    ├─ paths: products/{productId}/{imgId}_thumb.webp
       │    │         products/{productId}/{imgId}_medium.webp
       │    │         products/{productId}/{imgId}_full.webp
       │    └─ supabaseAdmin.storage.from('product-images').upload() × 3
       ├─ INSERT into product_images (id, product_id, seller_id, thumb_url, medium_url, full_url, position)
       └─ UPDATE products SET images = [first_img_url, ...] (denormalized, thumb URLs)

Supabase Storage: product-images (public bucket)
  └─ products/{productId}/{imgId}_{variant}.webp
       Cache-Control: public, max-age=31536000, immutable
```

### 2.1 WebP Variants

| Variant | Dimension | Quality | Used by |
|---|---|---|---|
| thumb | 400x400 cover (no upscale) | q80 | Product cards, cart thumbnails, buyer-app home, wishlist |
| medium | ≤800px longest side (no upscale) | q82 | Product detail hero, storefront page |
| full | ≤1400px longest side (no upscale) | q82 | Zoom/lightbox (future), og:image |

---

## 3. Schema Design (Decision 1 — Schema Reconciliation)

### Decision: Add `product_images` table + denormalize `images[0]` on `products`

Rationale:
- A dedicated table gives us ordered metadata (position, dimensions, variant URLs) without breaking existing `images[]` consumers.
- Every existing `images[0]` read keeps working if we maintain `products.images` as a denormalized array of **thumb URLs** in position order. This is a single UPDATE triggered after any image write and is cheap.
- Avoids touching the 10+ sites that read `products.images[0]` across web and mobile.
- We do NOT migrate existing image URLs into `product_images` automatically — they stay as-is in `products.images` and will not have variant rows. Sellers with existing products get the new uploader for future uploads; old images render fine from `images[]`.

### Migration 042 — SQL

```sql
-- Migration 042: product_images table for WebP variant pipeline

CREATE TABLE public.product_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thumb_url     TEXT NOT NULL,   -- 400x400 cover WebP
  medium_url    TEXT NOT NULL,   -- <=800px WebP
  full_url      TEXT NOT NULL,   -- <=1400px WebP
  width         INTEGER,         -- original image width (pixels, from sharp metadata)
  height        INTEGER,         -- original image height (pixels)
  position      INTEGER NOT NULL DEFAULT 0,  -- display order (0 = primary/cover)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ownership index (ownership queries need this)
CREATE INDEX product_images_product_idx ON public.product_images (product_id, position);
CREATE INDEX product_images_seller_idx  ON public.product_images (seller_id);

-- RLS
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Public reads (storefront, buyer-app can query image metadata)
CREATE POLICY "product_images_public_read"
  ON public.product_images FOR SELECT
  USING (
    product_id IN (
      SELECT p.id FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.is_available = true
        AND s.is_active = true
        AND s.approval_status = 'approved'
        AND s.suspended = false
    )
  );

-- Sellers read all their own product images (incl. hidden products, for dashboard)
CREATE POLICY "product_images_seller_read"
  ON public.product_images FOR SELECT
  USING (seller_id = auth.uid());

-- INSERT/UPDATE/DELETE are handled exclusively by catalog-service using the
-- service-role key (supabaseAdmin). No direct client writes to this table.
-- We do NOT create INSERT/UPDATE/DELETE policies for authenticated users.
-- This is intentional: upload flow goes through the backend API which enforces
-- ownership, suspension, and quota checks before writing.

-- Bucket file_size_limit must be raised to 12 MB for raw uploads.
-- Run after migration (Supabase dashboard or SQL):
-- UPDATE storage.buckets SET file_size_limit = 12582912 WHERE id = 'product-images';
-- UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
--   WHERE id = 'product-images';
-- (gif rejected by decode-verify in code; listed here only to avoid bucket-level rejection of unusual browsers)
```

### Storage Policy Update (append to migration 042 or run separately)

```sql
-- Drop the old path-based storage policy (keys by store_id folder)
DROP POLICY IF EXISTS "Sellers upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Sellers delete product images" ON storage.objects;

-- New policies: catalog-service uses service-role key (bypasses RLS).
-- Direct client access to product-images is read-only; all writes go via API.
-- We keep public read as-is and add no new client write policies.
-- (The old INSERT policy allowed direct-from-client uploads — that door is now closed.)
```

Note: the service-role key used by catalog-service bypasses RLS entirely, so no storage INSERT/DELETE policy for `authenticated` role is needed.

### Backfill Plan

No automatic backfill of existing products. Rationale:
- Existing images are absolute public URLs stored in `products.images[]`. They render fine today.
- Backfilling would require re-downloading, re-encoding, and re-uploading every image — risky, time-consuming, and provides no immediate user value.
- New images uploaded via the new uploader will have `product_images` rows and WebP variants.
- A future optional background job can backfill when/if needed (out of scope for this design).

### Denormalization sync

After every image write (insert, delete, reorder), the endpoint syncs `products.images` to an ordered array of `thumb_url` values from `product_images WHERE product_id = $1 ORDER BY position ASC`. This is a single `UPDATE products SET images = $2 WHERE id = $1` in the same request lifecycle.

Products with no `product_images` rows retain their existing `images[]` content untouched.

---

## 4. Backend Design (catalog-service)

### 4.1 New Dependencies

```json
{
  "multer": "^1.4.5-lts.1",
  "sharp": "^0.33.5",
  "uuid": "^9.0.1"
}
```
```json
{
  "@types/multer": "^1.4.11",
  "@types/uuid": "^9.0.8"
}
```

### 4.2 File: `src/lib/imageService.ts`

Responsibilities: validate, resize all three variants, upload to Supabase Storage, return URLs.

```typescript
// src/lib/imageService.ts  (design contract — engineer implements)

export interface ImageVariants {
  imgId: string
  thumbUrl: string
  mediumUrl: string
  fullUrl: string
  width: number
  height: number
}

export interface ImageServiceOptions {
  buffer: Buffer
  mimeType: string        // validated before this call
  productId: string
  sellerId: string
}

// Allowed MIME types at the API layer
export const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp',
])

// Max file size for the raw upload (12 MB)
export const MAX_FILE_BYTES = 12 * 1024 * 1024

// Max images per product
export const MAX_IMAGES = 8

// processAndUpload: does resize + upload, returns URLs
// Throws on invalid image (sharp decode fails) or storage error
export async function processAndUpload(opts: ImageServiceOptions): Promise<ImageVariants>
```

Implementation notes for the backend engineer:

**Validation order:**
1. MIME type in `ALLOWED_MIME` (checked by multer filter before buffer arrives)
2. Buffer byte length <= `MAX_FILE_BYTES` (multer `limits.fileSize` is the first gate; also checked explicitly)
3. `sharp(buffer).metadata()` to decode-verify (if sharp throws, it is not a valid image); capture `width`, `height`

**Sharp pipeline (per variant), run in parallel with `Promise.all`:**
```
sharp(buffer)
  .rotate()                         // strip EXIF rotation, apply it
  .resize(W, H, { fit: 'cover',    // thumb: 400,400 / medium: null,800 / full: null,1400
                   withoutEnlargement: true })
  .webp({ quality: Q })             // thumb: 80 / medium+full: 82
  .withMetadata(false)              // strip ALL metadata
  .toBuffer()
```

For medium/full: use `.resize(null, 800, { fit: 'inside', withoutEnlargement: true })` — `fit:'inside'` preserves aspect ratio without cropping.

**Storage path:**
```
products/{productId}/{imgId}_thumb.webp
products/{productId}/{imgId}_medium.webp
products/{productId}/{imgId}_full.webp
```
Public URL: `${SUPABASE_URL}/storage/v1/object/public/product-images/products/{productId}/{imgId}_thumb.webp`

**Upload via supabaseAdmin.storage:**
```typescript
await supabaseAdmin.storage
  .from('product-images')
  .upload(path, buffer, {
    contentType: 'image/webp',
    upsert: false,                  // never overwrite; imgId is fresh UUID
    cacheControl: '31536000',       // 1 year, immutable
  })
```

### 4.3 Shared `syncProductImages` helper

After any image write, call this to keep `products.images` in sync:

```typescript
async function syncProductImagesArray(productId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('product_images')
    .select('thumb_url')
    .eq('product_id', productId)
    .order('position', { ascending: true })
  const urls = (data ?? []).map(r => r.thumb_url)
  await supabaseAdmin
    .from('products')
    .update({ images: urls })
    .eq('id', productId)
}
```

### 4.4 New Route File: `src/routes/images.ts`

Mount at `app.use('/api/catalog', imagesRouter)` in `index.ts`.

#### POST `/api/catalog/products/:id/images` — Upload one image

```
Auth:     requireAuth
Guard:    userOwnsProduct + !isStoreSuspended
Multipart: multer.single('image'), limits: { fileSize: MAX_FILE_BYTES }
           fileFilter: reject if mimetype not in ALLOWED_MIME → 415
```

Pre-flight checks:
- Product exists and belongs to seller (ownership enforced via `req.user.id`, not path/body seller_id — IDOR fix is preserved)
- Count of rows in `product_images WHERE product_id = :id` < `MAX_IMAGES` → 422 `{ error: 'MAX_IMAGES_REACHED', code: 'IMG_LIMIT' }`
- Buffer size <= `MAX_FILE_BYTES` → 413

Processing:
- Call `processAndUpload()` — if sharp decode throws → 422 `{ error: 'Invalid image', code: 'IMG_DECODE_FAIL' }`
- Determine `position` = current max position + 1 (or 0 if first image)
- INSERT into `product_images`
- `syncProductImagesArray(productId)` to update `products.images`

Response `201`:
```json
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "thumb_url": "...",
    "medium_url": "...",
    "full_url": "...",
    "position": 0,
    "width": 1200,
    "height": 1200
  }
}
```

Error codes:
| HTTP | code | when |
|---|---|---|
| 400 | VALIDATION_ERROR | missing field, Zod |
| 401 | UNAUTHORIZED | no/invalid token |
| 403 | FORBIDDEN | seller doesn't own product |
| 403 | STORE_SUSPENDED | store is suspended |
| 404 | PRODUCT_NOT_FOUND | product doesn't exist |
| 413 | FILE_TOO_LARGE | > 12 MB |
| 415 | UNSUPPORTED_MEDIA | MIME not in allowlist |
| 422 | IMG_LIMIT | already 8 images |
| 422 | IMG_DECODE_FAIL | not a valid image |
| 500 | INTERNAL | storage upload failure |

#### DELETE `/api/catalog/products/:id/images/:imageId` — Delete one image (idempotent)

```
Auth:     requireAuth
Guard:    userOwnsProduct + !isStoreSuspended
```

Procedure:
1. Fetch row from `product_images` WHERE `id = :imageId AND product_id = :id`. If not found, return `200 { success: true, data: null }` (idempotent).
2. Derive the three storage object paths from `product_id` + `imgId` (parse from thumb_url or reconstruct).
3. Delete all three storage objects via `supabaseAdmin.storage.from('product-images').remove([...paths])`. If a storage object is missing, ignore the error (idempotent).
4. DELETE the `product_images` row.
5. Re-number `position` values: `UPDATE product_images SET position = position - 1 WHERE product_id = :id AND position > deletedPosition`.
6. `syncProductImagesArray(productId)`.

Response `200 { success: true, data: null }`.

**Orphan cleanup:** because step 3 runs before step 4, a crash between 3 and 4 leaves a dangling row with no objects. Acceptable for now. An optional background job can run weekly: find rows whose `thumb_url` returns 404 from Supabase and delete the rows. Mark as a future task.

#### PATCH `/api/catalog/products/:id/images/reorder` — Reorder images

```
Auth:     requireAuth
Body:     { order: string[] }  // array of product_images IDs, desired order
```

Validation (Zod):
- `order` must be an array of UUIDs
- All IDs must belong to the product (fetch all `product_images.id WHERE product_id = :id`, compare sets)

Procedure:
- For each id in `order`, UPDATE `position = index` where index is its position in the array.
- `syncProductImagesArray(productId)`.
- Return `200 { success: true, data: { order } }`.

### 4.5 Dockerfile Change for sharp on Alpine

```dockerfile
# catalog-service Dockerfile (modified)
FROM node:22-alpine AS builder
WORKDIR /app

# sharp on Alpine musl requires vips build dependencies
RUN apk add --no-cache vips-dev fftw-dev build-base python3

COPY package*.json ./
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=0
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

RUN apk add --no-cache vips

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Alternatively (simpler, recommended for the engineer): use `sharp` with `--ignore-scripts=false` and the npm prebuilt for `linux-musl-x64`. Sharp 0.33+ downloads a platform-matched prebuilt during `npm install` without requiring Alpine build tools. The engineer should verify this works in the target image by running a test build locally with `docker buildx build --platform linux/amd64`.

Risk: see R1 below.

### 4.6 Memory Budget on Fargate (256 CPU / 512 MB)

Per-image memory during processing:
- 12 MB raw input buffer
- sharp decodes to uncompressed RGBA: worst case 12 MB JPEG → ~48 MP image = 192 MB uncompressed. This is unrealistic for phone photos.
- Realistic phone shot at 12 MP: 12 MB JPEG → ~48 MB uncompressed in RAM
- Three variant outputs (small WebP) add ~2-4 MB

Realistic peak per request: ~60 MB heap.

Decision: **multer memory storage, one image per upload request** (not batch). This keeps per-request peak well within 512 MB even under 2 concurrent uploads to the same task. If concurrency becomes a concern, the Fargate task definition can be bumped to 512 CPU / 1024 MB via Terraform without code changes.

Do NOT allow multi-file batch upload in a single request. The frontend sends files sequentially (max 3 concurrent requests across all products, not per-product).

---

## 5. Frontend Design (`ProductImageUploader`)

### 5.1 New Dependencies (web package.json)

```json
"@dnd-kit/core": "^6.3.1",
"@dnd-kit/sortable": "^8.0.0",
"@dnd-kit/utilities": "^3.2.2",
"browser-image-compression": "^2.0.2",
"heic2any": "^0.0.4"
```

Note: `react-dropzone` is already installed (used by current image upload). `lucide-react` already installed.

### 5.2 Component: `components/seller/ProductImageUploader.tsx`

**Props:**
```typescript
interface Props {
  productId: string
  initialImages: ProductImageRecord[]  // fetched from product_images table on load
  onChange?: (images: ProductImageRecord[]) => void
  maxImages?: number  // default 8
  disabled?: boolean
}

interface ProductImageRecord {
  id: string
  thumb_url: string
  medium_url: string
  full_url: string
  position: number
  width?: number
  height?: number
}
```

**Directive:** `'use client'`

**State model:**
```typescript
type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }  // 0-100 via XHR or fetch progress
  | { status: 'error'; message: string }

// Per-slot in the upload queue
interface PendingFile {
  id: string         // temp client id for key
  file: File
  objectUrl: string  // for preview before upload
  state: UploadState
}
```

Internal state:
- `images: ProductImageRecord[]` — confirmed server images (from `initialImages`, updated after each successful upload/delete/reorder)
- `pending: PendingFile[]` — files queued or in-flight (optimistic preview)
- Active uploads tracked via a semaphore (max 3 concurrent)

### 5.3 Hook: `hooks/useImageUpload.ts`

```typescript
// design contract — engineer implements
export function useImageUpload(productId: string, maxImages: number) {
  // Returns:
  return {
    images,           // ProductImageRecord[] — current server-confirmed images
    pending,          // PendingFile[] — in-flight uploads for optimistic UI
    addFiles,         // (files: File[]) => void — entry point from dropzone
    removeImage,      // (imageId: string) => Promise<void> — DELETE + optimistic remove
    reorder,          // (newOrder: string[]) => Promise<void> — PATCH reorder + optimistic
    isUploading,      // boolean
    canAddMore,       // boolean (images.length + pending.length < maxImages)
  }
}
```

**`addFiles` logic:**
```
for each file:
  1. If file.type matches /heic/i or file.name ends .heic/.HEIC:
       await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
       replace file with the converted Blob
  2. await imageCompression(file, { maxSizeMB: 3, useWebWorker: true })
     (pre-compress to keep upload fast on 4G; backend re-encodes anyway)
  3. Push PendingFile with objectUrl = URL.createObjectURL(file), status: 'uploading'
  4. Enqueue in the semaphore (max 3 concurrent)

Per upload (inside semaphore slot):
  1. const { data: { session } } = await supabase.auth.getSession()
  2. const fd = new FormData(); fd.append('image', file)
  3. fetch(`${API_URL}/api/catalog/products/${productId}/images`, {
       method: 'POST',
       headers: { Authorization: `Bearer ${session.access_token}` },
       body: fd,
     })
  4. On success: move from pending → images (at end of list), revoke objectUrl
  5. On error: set pending slot to { status: 'error', message }
  6. Release semaphore slot
```

**`removeImage` logic (optimistic):**
1. Optimistically remove from `images` state immediately.
2. Call DELETE `/api/catalog/products/:id/images/:imageId`.
3. On network error: revert `images` state, show toast.

**`reorder` logic (optimistic):**
1. Optimistically reorder `images` state immediately (drag-end fires this).
2. Call PATCH `/api/catalog/products/:id/images/reorder` with `{ order: newOrder.map(i => i.id) }`.
3. On error: revert to pre-drag order, show toast.

**Object URL cleanup:**
- `useEffect` cleanup: revoke all `objectUrl` values in pending when component unmounts or file moves to confirmed.

### 5.4 Component Structure (JSX design)

```
<ProductImageUploader>
  <DndContext (collision: closestCenter, sensors: [PointerSensor, TouchSensor])>
    <SortableContext (strategy: rectSortingStrategy)>
      grid (flex wrap gap-2):
        [confirmed images in position order]:
          <SortableImageCard key={img.id} id={img.id}>
            - <img src={img.thumb_url} loading="lazy" />
            - position=0 badge: "Cover" (orange pill, #FF6B2B)
            - delete X button (top-right, red)
            - drag handle (bottom-left, 6-dot icon)
        [pending uploads]:
          <PendingCard key={pf.id}>
            - <img src={pf.objectUrl} /> (blurred if uploading)
            - progress ring or spinner overlay
            - error state: red border + retry icon
        [add slot (if canAddMore)]:
          <DropzoneSlot>
            - accepts: image/jpeg, image/png, image/webp (+ .heic on client side)
            - drag-active: border-[#FF6B2B] bg-[#FF6B2B]/5
            - idle: border-[#EEEEEE] hover:border-[#FF6B2B]
            - upload icon + "Add photo" label
  <DragOverlay> for drag ghost
  <p className="text-xs text-muted"> Max 8 photos. First is the cover. HEIC/JPG/PNG/WebP. </p>
```

### 5.5 `lib/imageApi.ts` — API Client

```typescript
// All image API calls; keeps component clean of fetch boilerplate

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api-dev.reelmart.in').replace(/\/$/, '')

export const imageApi = {
  async upload(productId: string, file: File | Blob, token: string): Promise<ProductImageRecord>,
  async remove(productId: string, imageId: string, token: string): Promise<void>,
  async reorder(productId: string, order: string[], token: string): Promise<void>,
  async list(productId: string, token: string): Promise<ProductImageRecord[]>,
}
```

### 5.6 Integration into Product Forms

**New product (`products/new/page.tsx`):**

Problem: the uploader component requires a `productId`, but the product doesn't exist until the form is submitted. Two options:

Option A (recommended): two-step creation — create a draft product on first image drop, then the uploader has a real `productId`.
Option B: buffer images in component state; on form submit, POST product first to get the id, then immediately upload images before navigating away.

Decision: **Option B** — simpler, no draft cleanup needed. Sequence:
1. Seller fills form + selects images (previews shown client-side via objectURLs)
2. On "Add Product" submit:
   a. POST to `/api/catalog/products` (existing endpoint) → get `productId`
   b. Upload all pending images sequentially (or max-3-concurrent) via the new endpoint
   c. Navigate to `/seller/products` only after all uploads settle
3. If product creation succeeds but an upload fails, the product exists with fewer images than expected. The seller can reopen the product edit page to retry.

**Edit product (`products/[id]/page.tsx`):**
- The product id is known on load. Fetch `product_images` for this product on mount.
- Images already uploaded appear immediately as confirmed cards.
- New drops upload immediately.
- Remove the existing `uploadImage` function and `images: string[]` state.
- Replace the dropzone section with `<ProductImageUploader productId={params.id} initialImages={productImages} />`.
- On form submit, images are already persisted on the server — no special handling needed.

**Auth token in the uploader:**
- Component calls `supabase.auth.getSession()` internally via the Supabase browser client (same pattern as orders page). Does not need `token` as a prop.

---

## 6. Storefront / Buyer-App Migration Path (Decision 5)

### No breaking change required

All existing consumers read `products.images[0]` (thumb) or `products.images[array]`. The new design keeps `products.images` as a denormalized array of `thumb_url` values, synced after every image operation.

Consumers of `images[0]` (card thumbnail) automatically get the 400x400 WebP thumb — smaller, faster, appropriate for the card use case.

**Future enhancement** (out of scope, flag for UI engineer):
- Product detail page currently uses `images[activeImage]` — this resolves to a `thumb_url` (400x400) even for the hero view. To use `medium_url` on the detail page, the product page would need to either:
  - Fetch `product_images` metadata alongside the product, or
  - Store `medium_url` as a separate field / second array on products.
- Recommended approach when that story is prioritized: add `images_medium TEXT[]` as a parallel denormalized column on `products`. Keep in scope for a future design ticket.

For now, all hero/product-detail images render from `thumb_url` (400x400 cover WebP) which is acceptable quality for the current UI scale.

---

## 7. Security Notes (IDOR prevention)

Ownership enforcement in all three new endpoints MUST bind to `req.user.id` (from the verified JWT, set by `requireAuth`). Never read `seller_id` from the request body or URL path to authorize the operation. The pattern already used in `productsRouter`:

```typescript
const ps = await getProductStore(req.params.id)  // fetches store ownership from DB
if (!ps || ps.seller_id !== req.user.id) {
  return res.status(403).json({ success: false, error: 'Forbidden' })
}
```

The image endpoints follow this exact same pattern. The `seller_id` stored in `product_images` is taken from `ps.seller_id` (DB lookup), not from any request field.

---

## 8. Endpoint Summary

| Method | Path | Auth | Body | Notes |
|---|---|---|---|---|
| POST | `/api/catalog/products/:id/images` | Bearer | multipart `image` field, 1 file, ≤12 MB | Upload + resize → 3 WebP variants |
| DELETE | `/api/catalog/products/:id/images/:imageId` | Bearer | — | Removes 3 objects + row; idempotent |
| PATCH | `/api/catalog/products/:id/images/reorder` | Bearer | `{ order: string[] }` | Position update; validates all IDs belong to product |
| GET | `/api/catalog/products/:id/images` | Bearer | — | List images for dashboard (optional, can query Supabase directly from client) |

---

## 9. Work Breakdown by Team

### database-engineer
1. Write and apply migration 042 (`product_images` table + RLS + storage policy updates).
2. Update `product-images` bucket: `file_size_limit = 12582912` (12 MB), verify public access.
3. Drop the old client-side upload storage INSERT/DELETE policies (no longer needed once the backend owns uploads).
4. Verify existing products' `images[]` data is unaffected (read a few rows before/after).

### backend-engineer (catalog-service)
1. Add `multer`, `sharp`, `uuid` to `package.json`.
2. Create `src/lib/imageService.ts` — `processAndUpload()`, `syncProductImagesArray()`, constants.
3. Create `src/routes/images.ts` — POST upload, DELETE, PATCH reorder handlers following the contracts in section 4.
4. Wire `imagesRouter` in `src/index.ts`.
5. Update `Dockerfile` for sharp/Alpine libvips (test `docker buildx build --platform linux/amd64` locally first — see R1).
6. Build and ship: `npm run build` → push ECR → `ecs update-service --force-new-deployment`.
7. Validate with `curl` against the deployed endpoint using a test Bearer token.

### ui-engineer (web)
1. Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `browser-image-compression`, `heic2any` to `web/package.json`.
2. Create `lib/imageApi.ts` (fetch wrapper).
3. Create `hooks/useImageUpload.ts` (semaphore, optimistic state).
4. Create `components/seller/ProductImageUploader.tsx` (dnd-kit grid, per-card states).
5. Update `app/seller/(dashboard)/products/[id]/page.tsx` — replace dropzone + `images` state with `<ProductImageUploader>`.
6. Update `app/seller/(dashboard)/products/new/page.tsx` — Option B two-step (create product, then upload).
7. Remove `uploadImage()` helper and direct Supabase storage calls from both product form pages.
8. Add `@types/heic2any` or use `// @ts-ignore` for the untyped package.

### infra-engineer
1. In `reelmart-infra/infra/terraform/environments/dev/services/main.tf` — the `catalog` service entry needs no new secrets (SUPABASE_SERVICE_KEY already in `base_secrets`). Verify the task memory is 512 MB; bump to 1024 MB if load testing shows OOM risk.
2. No SSM changes needed — `SUPABASE_SERVICE_KEY` is already injected via Secrets Manager.
3. After Dockerfile changes: the ECR push will be larger (libvips adds ~15-20 MB). Verify ECR has capacity and the push completes.
4. Consider adding `PRODUCT_IMAGE_MAX_BYTES` and `PRODUCT_IMAGE_MAX_COUNT` as env vars on the catalog task definition so limits can be tuned without a code redeploy.

---

## 10. Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `sharp` npm prebuilt doesn't match `node:22-alpine` (musl libc) | Medium | Build fails | Test `docker buildx --platform linux/amd64` before PR. If prebuilt fails, install `vips-dev` in build stage. Sharp 0.33+ has `linux-musl-x64` prebuilt — check the exact version. |
| R2 | 512 MB Fargate task OOM when processing large JPEG (>10 MP) | Low | Task restart; 503 for that request | Pre-compress client-side to ≤3 MB input (browser-image-compression). If needed, bump task memory to 1024 MB in Terraform. |
| R3 | `heic2any` conversion fails silently on Android Chrome (HEIC from Samsung camera) | Medium | Image drop rejected | Add explicit check: after heic2any, verify blob.size > 0. Show toast "Unsupported format — use JPG or PNG". |
| R4 | Two-step new-product creation (create product, then upload) leaves orphan products if browser closes during upload | Low | Seller has a product with 0 images | Product is still valid (images[] = []); seller sees it in the list and can add images on the edit page. |
| R5 | Storefront ISR caches `products.images[]` for 60 s after an image reorder | Low | Brief visual inconsistency | Acceptable. On-demand revalidation can be added later. |
| R6 | Old storage INSERT policy removal breaks existing flows if any code path still uploads directly from client | Medium | Upload silently fails for existing code | Before deploying the new policy: grep codebase for `.from('product-images').upload(` — should only exist in the two product form pages which are replaced in this change. |
| R7 | `product_images` RLS public-read policy may expose images of inactive/pending stores in a direct Supabase query | Low | Minor — images are still publicly hosted URLs anyway | Policy as designed only shows images for `is_available=true` products in approved active stores — matches the existing products policy. |

---

## 11. Open Questions

1. **Medium URL on product detail hero**: should the storefront product detail page (`/store/[slug]/product/[id]`) render `medium_url` (up to 800px) instead of `thumb_url` (400px)? If yes, what is the preferred data shape — a second `images_medium[]` column, or a separate fetch of `product_images` rows? Flagged for UI/product review.

2. **GET `/api/catalog/products/:id/images` endpoint**: is it needed for the dashboard, or can the edit-product page query Supabase directly (anon key is fine for public reads, seller's own products are readable via RLS)? Keeping the fetch simple via Supabase client avoids an extra endpoint. Propose: skip the GET endpoint; edit-product page fetches `product_images` directly via `supabase.from('product_images').select('*').eq('product_id', id).order('position')`.

3. **Backfill timeline**: when (if ever) should existing product images be retroactively processed into WebP variants? The answer affects storage cost projections.

4. **Catalog service task memory**: current limit is 512 MB. Does the infra-engineer want to pre-emptively bump to 1024 MB for the image-processing workload, or wait for a confirmed OOM in staging?

5. **HEIC on desktop Safari**: macOS Safari exports HEIC from clipboard paste. `heic2any` runs in a web worker and should handle this, but needs a test with a large iOS live photo (which is HEIC). Flag for QA.

6. **Progress bar accuracy**: `fetch()` does not expose upload progress. A `ProgressBar` requires `XMLHttpRequest` (`xhr.upload.addEventListener('progress', ...)`). Worth the complexity? Propose: show a spinner per card instead of a progress %; revisit if sellers request it.

---

## 12. Summary: Headline Decisions

| Decision | Choice | One-line rationale |
|---|---|---|
| Multipart handler | multer memory storage, 1 file per request | Simple, fits 512 MB Fargate; no temp-file cleanup |
| HEIC | Client-side `heic2any` (browser) | No libheif build complexity in Alpine |
| Sharp on Alpine | npm prebuilt (`linux-musl-x64`) | Sharp 0.33+ ships musl prebuilt; fall back to `vips-dev` in build stage if it fails |
| Schema | New `product_images` table + keep `products.images[]` as denorm thumb array | Zero regression for all existing image consumers |
| Backfill | None initially | Risky, no immediate value; existing URLs work fine |
| Storage paths | `products/{productId}/{imgId}_{variant}.webp` | Keyed by product UUID; ownership clear |
| Client auth | `supabase.auth.getSession()` → Bearer header | Mirrors existing seller API call pattern |
| Image upload from client | Via backend API only | Allows resize, validation, ownership enforcement; no client service key |
| Primary image denorm | Sync `products.images` = `[thumb_url...]` after each write | All existing consumers `images[0]` keep working |
| Max images | 8 per product (up from current UI cap of 5) | Spec requirement; DB/storage supports it trivially |
