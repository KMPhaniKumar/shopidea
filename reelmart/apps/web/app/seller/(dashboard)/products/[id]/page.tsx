'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { productCategoriesFor } from '@/lib/businessCategories'
import ProductImageUploader from '@/components/seller/ProductImageUploader'
import type { ProductImageRecord } from '@/lib/imageApi'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be > 0'),
  compare_price: z.coerce.number().optional(),
  category: z.string().optional(),
  weight_grams: z.union([
    z.literal('').transform(() => undefined),
    z.coerce.number().int('Must be a whole number').min(1, 'Must be greater than 0'),
  ]).optional(),
  track_stock: z.boolean().default(false),
  stock_quantity: z.coerce.number().int().min(0).optional(),
  low_stock_threshold: z.coerce.number().int().min(0).default(3),
  is_available: z.boolean().default(true),
})
type FormData = z.infer<typeof schema>

export default function EditProductPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [storeCategory, setStoreCategory] = useState('')
  const [saving, setSaving] = useState(false)
  // product_images rows fetched from Supabase (new pipeline)
  const [productImages, setProductImages] = useState<ProductImageRecord[]>([])
  // loading guard — don't render the uploader until we've attempted to load images
  const [imagesLoaded, setImagesLoaded] = useState(false)

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { track_stock: false, is_available: true, low_stock_threshold: 3 },
  })
  const trackStock = watch('track_stock')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const storeQuery = user
        ? supabase.from('stores').select('id, category').eq('seller_id', user.id).single()
        : supabase.from('stores').select('id, category').limit(1).single()
      const { data: store } = await storeQuery
      if (!store) return
      setStoreCategory(store.category ?? '')

      const { data: product } = await supabase.from('products').select('*').eq('id', params.id).single()
      if (product) {
        reset({
          name: product.name,
          description: product.description ?? '',
          price: product.price,
          compare_price: product.compare_price,
          category: product.category ?? '',
          weight_grams: (product as any).weight_grams ?? undefined,
          track_stock: product.stock_type === 'counted',
          stock_quantity: product.stock_type === 'counted' ? product.stock_count : undefined,
          low_stock_threshold: product.low_stock_threshold ?? 3,
          is_available: product.is_available,
        })
      }

      // Fetch product_images rows (new pipeline). Falls back gracefully if the
      // table doesn't exist yet (before migration 042 is applied) — the uploader
      // will show empty and the seller can start fresh.
      const { data: imgRows } = await supabase
        .from('product_images')
        .select('id, thumb_url, medium_url, full_url, position, width, height')
        .eq('product_id', params.id)
        .order('position', { ascending: true })
      setProductImages((imgRows as ProductImageRecord[]) ?? [])
      setImagesLoaded(true)
    }
    init()
  }, [])

  const productCategories = productCategoriesFor(storeCategory)

  async function onSubmit(data: FormData) {
    setSaving(true)
    // Images are already persisted server-side via the uploader — no image field needed here.
    const { error } = await supabase.from('products').update({
      name: data.name,
      description: data.description,
      price: data.price,
      compare_price: data.compare_price || null,
      category: data.category,
      weight_grams: data.weight_grams ?? null,
      stock_type: data.track_stock ? 'counted' : 'unlimited',
      stock_count: data.track_stock ? (data.stock_quantity ?? 0) : 0,
      low_stock_threshold: data.low_stock_threshold,
      is_available: data.is_available,
    }).eq('id', params.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Product updated!')
    router.push('/seller/products')
  }

  async function deleteProduct() {
    if (!confirm('Delete this product? This cannot be undone.')) return
    await supabase.from('products').delete().eq('id', params.id)
    toast.success('Product deleted')
    router.push('/seller/products')
  }

  return (
    <div className="max-w-2xl">
      <Toaster />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-[#1A1A1A]">Edit Product</h1>
        <button onClick={deleteProduct} className="px-3 py-1.5 text-sm text-[#E23744] border border-[#E23744] rounded-lg hover:bg-[#E23744]/5">
          Delete Product
        </button>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Photos */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Product Photos</h2>
          {imagesLoaded ? (
            <ProductImageUploader
              productId={params.id}
              initialImages={productImages}
            />
          ) : (
            <div className="h-20 flex items-center">
              <div className="w-5 h-5 border-2 border-[#FF6B2B] border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Product Details</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input {...register('name')} placeholder="e.g. Chocolate Truffle Cake" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            {errors.name && <p className="text-xs text-[#E23744] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea {...register('description')} rows={3} placeholder="Describe your product..." className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price (₹) *</label>
              <input {...register('price')} type="number" step="0.01" placeholder="499" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
              {errors.price && <p className="text-xs text-[#E23744] mt-1">{errors.price.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Compare Price (₹)</label>
              <input {...register('compare_price')} type="number" step="0.01" placeholder="599 (optional)" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Weight (grams)</label>
            <input
              {...register('weight_grams')}
              type="number"
              min="1"
              step="1"
              className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]"
              placeholder="500"
            />
            {errors.weight_grams && <p className="text-xs text-[#E23744] mt-1">{(errors.weight_grams as { message?: string }).message}</p>}
            <p className="text-xs text-[#AAAAAA] mt-1">Used to pick the cheapest courier and print the shipping label.</p>
          </div>
          <div>
            <label htmlFor="product-category" className="block text-sm font-medium mb-1">Category</label>
            <select id="product-category" {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] bg-white">
              <option value="">Select category</option>
              {productCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Inventory */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Inventory</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" {...register('track_stock')} className="w-4 h-4 accent-[#FF6B2B]" />
            <span className="text-sm font-medium">Track stock quantity</span>
          </label>
          {trackStock && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Stock quantity</label>
                <input {...register('stock_quantity')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Low stock alert at</label>
                <input {...register('low_stock_threshold')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-semibold text-[#1A1A1A]">Make product visible</span>
            <input type="checkbox" {...register('is_available')} className="w-4 h-4 accent-[#FF6B2B]" />
          </label>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => router.back()} className="flex-1 border border-[#EEEEEE] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F9F9F9]">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
