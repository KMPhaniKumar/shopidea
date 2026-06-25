'use client'
/**
 * useImageUpload — manages the per-file pipeline for ProductImageUploader.
 *
 * Pipeline per file:
 *   1. HEIC/HEIF → JPEG conversion (heic2any, client-side)
 *   2. Pre-compress to ≤3 MB (browser-image-compression, reduces mobile upload size)
 *   3. Upload via imageApi.upload with per-file progress (XHR for progress events)
 *   4. Max 3 concurrent uploads (semaphore)
 *
 * State model:
 *   images   — server-confirmed ProductImageRecord[] (includes initialImages)
 *   pending  — PendingFile[] for in-flight or errored uploads (optimistic previews)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import imageCompression from 'browser-image-compression'
import { createClient } from '@/lib/supabase/client'
import { imageApi, type ProductImageRecord } from '@/lib/imageApi'

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://api-dev.reelmart.in').replace(/\/$/, '')
const MAX_INPUT_BYTES = 12 * 1024 * 1024  // 12 MB — reject before even converting

export type PendingStatus =
  | { status: 'converting' }
  | { status: 'compressing' }
  | { status: 'uploading'; progress: number }
  | { status: 'error'; message: string }

export interface PendingFile {
  id: string          // stable client-side key (crypto.randomUUID)
  file: File
  objectUrl: string   // preview URL — revoked when done or on unmount
  state: PendingStatus
}

interface UseImageUploadReturn {
  images: ProductImageRecord[]
  pending: PendingFile[]
  addFiles: (files: File[]) => void
  removeImage: (imageId: string) => Promise<void>
  reorder: (newIds: string[]) => Promise<void>
  isUploading: boolean
  canAddMore: boolean
}

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

/** Simple semaphore — limits to `max` concurrent async tasks */
function makeSemaphore(max: number) {
  let running = 0
  const queue: Array<() => void> = []
  return {
    acquire(): Promise<void> {
      return new Promise(resolve => {
        if (running < max) { running++; resolve() }
        else queue.push(() => { running++; resolve() })
      })
    },
    release() {
      running--
      const next = queue.shift()
      if (next) next()
    },
  }
}

/**
 * Upload a single file with XHR so we get upload progress events.
 * Returns the confirmed ProductImageRecord.
 */
async function xhrUpload(
  productId: string,
  file: File | Blob,
  token: string,
  onProgress: (pct: number) => void,
): Promise<ProductImageRecord> {
  return new Promise((resolve, reject) => {
    const fd = new FormData()
    fd.append('file', file)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}/api/catalog/products/${productId}/images`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText)
          resolve(json.data as ProductImageRecord)
        } catch {
          reject(new Error('Invalid response from server'))
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText)
          // Map backend codes to readable messages
          const codeMap: Record<string, string> = {
            FILE_TOO_LARGE:     'File is too large (max 12 MB).',
            UNSUPPORTED_MEDIA:  'Unsupported file type. Use JPG, PNG, or WebP.',
            IMG_LIMIT:          'This product already has the maximum number of images (8).',
            IMG_DECODE_FAIL:    'File could not be read as an image. Try a different file.',
            FORBIDDEN:          'You do not have permission to edit this product.',
            STORE_SUSPENDED:    'Your store is currently suspended.',
            PRODUCT_NOT_FOUND:  'Product not found.',
            UNAUTHORIZED:       'Session expired. Please log in again.',
          }
          reject(new Error(codeMap[body?.code] ?? body?.error ?? 'Upload failed. Please try again.'))
        } catch {
          reject(new Error('Upload failed. Please try again.'))
        }
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Network error. Please check your connection.')))
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')))
    xhr.send(fd)
  })
}

export function useImageUpload(
  productId: string,
  initialImages: ProductImageRecord[],
  maxImages: number = 8,
): UseImageUploadReturn {
  const supabase = createClient()
  const [images, setImages] = useState<ProductImageRecord[]>(initialImages)
  const [pending, setPending] = useState<PendingFile[]>([])
  // Semaphore shared across all upload calls — max 3 concurrent
  const semaphore = useRef(makeSemaphore(3))
  // Track object URLs for cleanup
  const objectUrls = useRef<Set<string>>(new Set())

  // Sync initialImages if the prop changes (e.g. after product is first created)
  useEffect(() => {
    setImages(initialImages)
  }, [initialImages])

  // Revoke all object URLs on unmount
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u))
    }
  }, [])

  function revokeObjectUrl(url: string) {
    URL.revokeObjectURL(url)
    objectUrls.current.delete(url)
  }

  function updatePending(id: string, state: PendingStatus) {
    setPending(prev => prev.map(p => p.id === id ? { ...p, state } : p))
  }

  const addFiles = useCallback(
    (rawFiles: File[]) => {
      // Determine how many slots remain
      const currentTotal = images.length + pending.filter(p => p.state.status !== 'error').length
      const available = maxImages - currentTotal
      if (available <= 0) return

      const files = rawFiles.slice(0, available)

      for (const originalFile of files) {
        // Reject files over 12 MB immediately (before conversion)
        if (originalFile.size > MAX_INPUT_BYTES) {
          // We still add an error card so the user sees the rejection
          const id = newId()
          const objectUrl = URL.createObjectURL(originalFile)
          objectUrls.current.add(objectUrl)
          setPending(prev => [...prev, {
            id,
            file: originalFile,
            objectUrl,
            state: { status: 'error', message: `"${originalFile.name}" is too large (max 12 MB).` },
          }])
          continue
        }

        const id = newId()
        const objectUrl = URL.createObjectURL(originalFile)
        objectUrls.current.add(objectUrl)

        // Add pending card immediately (converting state)
        setPending(prev => [...prev, {
          id,
          file: originalFile,
          objectUrl,
          state: { status: 'converting' },
        }])

        // Run pipeline asynchronously
        ;(async () => {
          try {
            // ── Step 1: HEIC/HEIF → JPEG ──────────────────────────────────────
            let workingFile: File | Blob = originalFile
            const isHeic = /heic|heif/i.test(originalFile.type) ||
                           /\.(heic|heif)$/i.test(originalFile.name)
            if (isHeic) {
              updatePending(id, { status: 'converting' })
              let converted: Blob | Blob[]
              try {
                // Dynamic import to avoid SSR issues
                const heic2any = (await import('heic2any')).default
                converted = await heic2any({ blob: originalFile, toType: 'image/jpeg', quality: 0.85 })
                const blob = Array.isArray(converted) ? converted[0] : converted
                if (!blob || blob.size === 0) throw new Error('HEIC conversion produced empty file')
                workingFile = new File([blob], originalFile.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
              } catch {
                updatePending(id, { status: 'error', message: 'HEIC conversion failed. Please use JPG or PNG.' })
                return
              }
            }

            // ── Step 2: Pre-compress ───────────────────────────────────────────
            updatePending(id, { status: 'compressing' })
            try {
              const compressed = await imageCompression(workingFile as File, {
                maxSizeMB: 3,
                maxWidthOrHeight: 2000,
                useWebWorker: true,
                fileType: 'image/jpeg',
              })
              workingFile = compressed
            } catch {
              // Compression failing is non-fatal — upload the converted file as-is
            }

            // ── Step 3: Upload with progress ──────────────────────────────────
            updatePending(id, { status: 'uploading', progress: 0 })
            await semaphore.current.acquire()
            try {
              const { data: { session } } = await supabase.auth.getSession()
              if (!session?.access_token) {
                updatePending(id, { status: 'error', message: 'Session expired. Please log in again.' })
                return
              }
              const confirmed = await xhrUpload(
                productId,
                workingFile,
                session.access_token,
                pct => updatePending(id, { status: 'uploading', progress: pct }),
              )
              // Success — move from pending to confirmed images
              revokeObjectUrl(objectUrl)
              setPending(prev => prev.filter(p => p.id !== id))
              setImages(prev => [...prev, confirmed])
            } finally {
              semaphore.current.release()
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.'
            updatePending(id, { status: 'error', message: msg })
          }
        })()
      }
    },
    [productId, images, pending, maxImages],
  )

  const removeImage = useCallback(
    async (imageId: string) => {
      // Optimistic removal
      const prev = images
      setImages(imgs => imgs.filter(img => img.id !== imageId))
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Session expired')
        await imageApi.remove(productId, imageId, session.access_token)
      } catch (err) {
        // Revert on failure
        setImages(prev)
        throw err
      }
    },
    [productId, images],
  )

  const reorder = useCallback(
    async (newIds: string[]) => {
      // Build optimistic order from the id list
      const idToImg = Object.fromEntries(images.map(img => [img.id, img]))
      const reordered = newIds.map(id => idToImg[id]).filter(Boolean)
      const prevImages = images
      setImages(reordered)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) throw new Error('Session expired')
        await imageApi.reorder(productId, newIds, session.access_token)
      } catch (err) {
        // Revert
        setImages(prevImages)
        throw err
      }
    },
    [productId, images],
  )

  const isUploading = pending.some(p =>
    p.state.status === 'converting' ||
    p.state.status === 'compressing' ||
    p.state.status === 'uploading',
  )

  const canAddMore = (images.length + pending.filter(p => p.state.status !== 'error').length) < maxImages

  return { images, pending, addFiles, removeImage, reorder, isUploading, canAddMore }
}
