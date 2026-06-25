/**
 * imageApi.ts — typed client for the catalog-service image endpoints.
 * All calls require an active Supabase Bearer token (call supabase.auth.getSession()
 * at the call site, same pattern as orders/marketing pages).
 */

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api-dev.reelmart.in').replace(/\/$/, '')

export interface ProductImageRecord {
  id: string
  thumb_url: string
  medium_url: string
  full_url: string
  position: number
  width?: number
  height?: number
}

/** Map backend error codes to human-readable messages */
function codeToMessage(code: string | undefined, status: number): string {
  switch (code) {
    case 'FILE_TOO_LARGE':   return 'File is too large (max 12 MB).'
    case 'UNSUPPORTED_MEDIA': return 'Unsupported file type. Use JPG, PNG, or WebP.'
    case 'IMG_LIMIT':        return 'This product already has the maximum number of images (8).'
    case 'IMG_DECODE_FAIL':  return 'File could not be read as an image. Try a different file.'
    case 'FORBIDDEN':        return 'You do not have permission to edit this product.'
    case 'STORE_SUSPENDED':  return 'Your store is currently suspended.'
    case 'PRODUCT_NOT_FOUND': return 'Product not found.'
    case 'UNAUTHORIZED':     return 'Session expired. Please log in again.'
  }
  if (status === 413) return 'File is too large (max 12 MB).'
  if (status === 415) return 'Unsupported file type.'
  if (status === 403) return 'Permission denied.'
  if (status === 401) return 'Session expired. Please log in again.'
  return 'Upload failed. Please try again.'
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return codeToMessage(body?.code, res.status)
  } catch {
    return codeToMessage(undefined, res.status)
  }
}

export const imageApi = {
  /**
   * Upload a single image file for a product.
   * Uses multipart FormData with field name `file` as required by the backend.
   */
  async upload(productId: string, file: File | Blob, token: string): Promise<ProductImageRecord> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${API_URL}/api/catalog/products/${productId}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    if (!res.ok) {
      throw new Error(await parseError(res))
    }
    const json = await res.json()
    return json.data as ProductImageRecord
  },

  /**
   * Delete a single image by id. Idempotent — resolves even if already deleted.
   */
  async remove(productId: string, imageId: string, token: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/catalog/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(await parseError(res))
    }
  },

  /**
   * Reorder images. `order` is the full array of image IDs in the desired order.
   */
  async reorder(productId: string, order: string[], token: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/catalog/products/${productId}/images/reorder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ order }),
    })
    if (!res.ok) {
      throw new Error(await parseError(res))
    }
  },
}
