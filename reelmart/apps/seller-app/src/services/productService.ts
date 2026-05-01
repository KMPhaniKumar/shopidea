import { supabase } from '../lib/supabase'
import * as ImageManipulator from 'expo-image-manipulator'
import type { Database } from '../types/supabase'

type VariantInsert = Database['public']['Tables']['product_variants']['Insert']

export interface VariantGroup {
  type: 'size' | 'color' | 'flavor' | 'weight' | 'other'
  options: Array<{ name: string; priceAdjustment: number; stock: number }>
}

export interface CreateProductParams {
  storeId: string
  name: string
  description?: string
  price: number
  comparePrice?: number
  stockType: 'unlimited' | 'counted'
  stockCount: number
  lowStockThreshold: number
  imageUris: string[]
  variants: VariantGroup[]
}

export async function compressAndUploadImage(
  uri: string,
  storeId: string,
  productId: string,
  index: number
): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
  )
  const response = await fetch(compressed.uri)
  const blob = await response.blob()
  const path = `${storeId}/${productId}_${index}.jpg`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

export async function createProduct(params: CreateProductParams) {
  const { data: product, error } = await supabase
    .from('products')
    .insert({
      store_id: params.storeId,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      price: params.price,
      compare_price: params.comparePrice ?? null,
      stock_type: params.stockType,
      stock_count: params.stockType === 'counted' ? params.stockCount : 0,
      low_stock_threshold: params.lowStockThreshold,
      images: [],
      is_available: true,
    })
    .select('*')
    .single()

  if (error || !product) throw new Error(error?.message ?? 'Failed to create product')

  // Upload images in parallel
  if (params.imageUris.length > 0) {
    const urls = await Promise.all(
      params.imageUris.map((uri, i) =>
        compressAndUploadImage(uri, params.storeId, product.id, i)
      )
    )
    await supabase.from('products').update({ images: urls }).eq('id', product.id)
    product.images = urls
  }

  // Insert variants
  if (params.variants.length > 0) {
    const variantRows: VariantInsert[] = params.variants.flatMap(group =>
      group.options.map((opt, i) => ({
        product_id: product.id,
        variant_type: group.type,
        name: opt.name.trim(),
        price_adjustment: opt.priceAdjustment,
        stock_count: opt.stock,
        is_available: true,
        sort_order: i,
      }))
    )
    await supabase.from('product_variants').insert(variantRows)
  }

  const { data: full } = await supabase
    .from('products')
    .select('*, product_variants(*)')
    .eq('id', product.id)
    .single()

  return full!
}

export async function updateProduct(
  productId: string,
  storeId: string,
  params: Partial<CreateProductParams> & { existingImages?: string[] }
) {
  const updates: Record<string, any> = {}
  if (params.name) updates.name = params.name.trim()
  if (params.description !== undefined) updates.description = params.description?.trim() || null
  if (params.price !== undefined) updates.price = params.price
  if (params.comparePrice !== undefined) updates.compare_price = params.comparePrice ?? null
  if (params.stockType !== undefined) updates.stock_type = params.stockType
  if (params.stockCount !== undefined) updates.stock_count = params.stockCount
  if (params.lowStockThreshold !== undefined) updates.low_stock_threshold = params.lowStockThreshold

  // Append new images to existing
  if (params.imageUris && params.imageUris.length > 0) {
    const startIndex = params.existingImages?.length ?? 0
    const newUrls = await Promise.all(
      params.imageUris.map((uri, i) =>
        compressAndUploadImage(uri, storeId, productId, startIndex + i)
      )
    )
    updates.images = [...(params.existingImages ?? []), ...newUrls]
  } else if (params.existingImages) {
    updates.images = params.existingImages
  }

  await supabase.from('products').update(updates).eq('id', productId)
}

export async function deleteProduct(productId: string) {
  await supabase.from('products').delete().eq('id', productId)
}

export async function toggleAvailability(productId: string, isAvailable: boolean) {
  await supabase.from('products').update({ is_available: isAvailable }).eq('id', productId)
}

export function isLowStock(product: { stock_type: string; stock_count: number; low_stock_threshold: number }) {
  return product.stock_type === 'counted' && product.stock_count <= product.low_stock_threshold
}

export function isOutOfStock(product: { stock_type: string; stock_count: number }) {
  return product.stock_type === 'counted' && product.stock_count === 0
}
