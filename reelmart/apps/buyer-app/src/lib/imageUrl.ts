const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''

export function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  // Supabase storage path — build public URL
  const bucket = path.startsWith('product-images/') ? '' : 'product-images/'
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}${path}`
}

export function getFirstImage(images: any): string | null {
  let arr: string[] = []
  if (Array.isArray(images)) arr = images
  else if (typeof images === 'string') {
    try { arr = JSON.parse(images) } catch { arr = [images] }
  }
  return getImageUrl(arr[0] ?? null)
}
