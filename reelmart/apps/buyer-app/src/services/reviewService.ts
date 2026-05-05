import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

export interface Review {
  id: string
  order_id: string
  buyer_id: string
  store_id: string
  rating: number
  review_text: string | null
  comment?: string | null
  photos: string[]
  seller_reply: string | null
  seller_replied_at: string | null
  created_at: string
  users?: { name: string; full_name?: string; avatar_url: string | null }
}

export async function submitReview(params: {
  orderId: string
  buyerId: string
  storeId: string
  rating: number
  reviewText?: string
  photoUris?: string[]
}): Promise<void> {
  // Upload photos to Supabase Storage first
  const photoUrls: string[] = []
  if (params.photoUris && params.photoUris.length > 0) {
    for (let i = 0; i < params.photoUris.length; i++) {
      const uri = params.photoUris[i]
      const res = await fetch(uri)
      const blob = await res.blob()
      const path = `${params.orderId}/${i}.jpg`
      const { error } = await supabase.storage
        .from('review-photos')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const { data: urlData } = supabase.storage.from('review-photos').getPublicUrl(path)
        photoUrls.push(urlData.publicUrl)
      }
    }
  }

  await api.post('/api/catalog/reviews', {
    store_id: params.storeId,
    order_id: params.orderId,
    rating: params.rating,
    comment: params.reviewText?.trim() || undefined,
    photos: photoUrls,
  })
}

export async function getStoreReviews(storeId: string): Promise<Review[]> {
  const data = await api.get<Review[]>(`/api/catalog/stores/${storeId}/reviews`)
  return data ?? []
}

export async function hasReviewedOrder(orderId: string): Promise<boolean> {
  const { data } = await supabase.from('reviews').select('id').eq('order_id', orderId).single()
  return !!data
}
