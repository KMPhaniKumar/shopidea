import { supabase } from '../lib/supabase'
import * as ImageManipulator from 'expo-image-manipulator'
import type { Database } from '../types/supabase'

type StoreInsert = Database['public']['Tables']['stores']['Insert']
type Store = Database['public']['Tables']['stores']['Row']

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)
}

export async function getUniqueSlug(name: string): Promise<string> {
  const base = generateSlug(name)
  let slug = base
  let counter = 1
  while (true) {
    const { data } = await supabase
      .from('stores')
      .select('id')
      .eq('store_slug', slug)
      .maybeSingle()
    if (!data) return slug
    slug = `${base}${counter}`
    counter++
  }
}

export async function uploadLogo(storeId: string, localUri: string): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: 400, height: 400 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
  )
  const response = await fetch(compressed.uri)
  const blob = await response.blob()
  const path = `${storeId}/logo.jpg`
  const { error } = await supabase.storage
    .from('store-logos')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('store-logos').getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function createStore(params: {
  sellerId: string
  storeName: string
  category: StoreInsert['category']
  city: string
  area?: string
  description?: string
  whatsappNumber?: string
}): Promise<Store> {
  const slug = await getUniqueSlug(params.storeName)
  const { data, error } = await supabase
    .from('stores')
    .insert({
      seller_id: params.sellerId,
      store_name: params.storeName,
      store_slug: slug,
      category: params.category,
      city: params.city,
      area: params.area ?? null,
      description: params.description ?? null,
      whatsapp_number: params.whatsappNumber ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export function getStoreUrl(slug: string): string {
  return `https://reelmart.in/store/${slug}`
}
