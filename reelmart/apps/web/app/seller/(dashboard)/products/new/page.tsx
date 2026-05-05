'use client'
import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { X } from 'lucide-react'

const schema = z.object({
  name: z.string().min(2, 'Name required'),
  description: z.string().optional(),
  price: z.coerce.number().positive('Price must be > 0'),
  compare_price: z.coerce.number().optional(),
  category: z.string().optional(),
  track_stock: z.boolean().default(false),
  stock_quantity: z.coerce.number().int().min(0).optional(),
  low_stock_threshold: z.coerce.number().int().min(0).default(3),
  is_available: z.boolean().default(true),
})
type FormData = z.infer<typeof schema>

export default function NewProductPage() {
  const supabase = createClient()
  const router = useRouter()
  const [storeId, setStoreId] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { track_stock: false, is_available: true, low_stock_threshold: 3 },
  })
  const trackStock = watch('track_stock')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: store } = await supabase.from('stores').select('id').eq('seller_id', user.id).single()
      if (store) setStoreId(store.id)
    }
    init()
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 5,
    maxSize: 2 * 1024 * 1024,
    disabled: images.length >= 5 || uploading,
    onDrop: async (files) => {
      setUploading(true)
      const urls = await Promise.all(
        files.slice(0, 5 - images.length).map(async (file) => {
          const path = `stores/${storeId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
          const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
          if (error) { toast.error('Upload failed'); return null }
          const { data } = supabase.storage.from('product-images').getPublicUrl(path)
          return data.publicUrl
        })
      )
      setImages(prev => [...prev, ...(urls.filter(Boolean) as string[])])
      setUploading(false)
    },
  })

  async function onSubmit(data: FormData) {
    setSaving(true)
    const payload = {
      store_id: storeId,
      name: data.name,
      description: data.description,
      price: data.price,
      compare_price: data.compare_price,
      category: data.category,
      stock_quantity: data.track_stock ? (data.stock_quantity ?? 0) : -1,
      low_stock_threshold: data.low_stock_threshold,
      is_available: data.is_available,
      images,
    }
    await supabase.from('products').insert(payload)
    toast.success('Product added')
    setSaving(false)
    router.push('/seller/products')
  }

  return (
    <div className="max-w-2xl">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A] mb-6">Add Product</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Product Photos</h2>
          <div className="flex gap-2 flex-wrap">
            {images.map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-[#EEEEEE]" />
                <button type="button" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#E23744] text-white rounded-full flex items-center justify-center">
                  <X size={10} />
                </button>
              </div>
            ))}
            {images.length < 5 && (
              <div {...getRootProps()}
                className={`w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors text-center ${
                  isDragActive ? 'border-[#FF6B2B] bg-[#FF6B2B]/5' : 'border-[#EEEEEE] hover:border-[#FF6B2B]'
                }`}>
                <input {...getInputProps()} />
                <span className="text-xl text-[#AAAAAA]">+</span>
                <span className="text-[10px] text-[#AAAAAA] mt-0.5">{uploading ? 'Uploading' : 'Add photo'}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-[#AAAAAA]">Max 5 photos, 2MB each. First photo is the cover.</p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-[#1A1A1A]">Product Details</h2>
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input {...register('name')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="e.g. Chocolate Truffle Cake" />
            {errors.name && <p className="text-xs text-[#E23744] mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea {...register('description')} rows={3} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B] resize-none" placeholder="Describe your product..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price (₹) *</label>
              <input {...register('price')} type="number" step="0.01" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="499" />
              {errors.price && <p className="text-xs text-[#E23744] mt-1">{errors.price.message}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Compare Price (₹)</label>
              <input {...register('compare_price')} type="number" step="0.01" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="599 (optional)" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <input {...register('category')} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="e.g. Cakes, Jewellery, Clothing..." />
          </div>
        </div>

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
                <input {...register('stock_quantity')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="50" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Low stock alert at</label>
                <input {...register('low_stock_threshold')} type="number" min="0" className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#FF6B2B]" placeholder="3" />
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

        <div className="flex gap-3">
          <button type="button" onClick={() => router.back()} className="flex-1 border border-[#EEEEEE] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F9F9F9]">Cancel</button>
          <button type="submit" disabled={saving} className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50">
            {saving ? 'Saving...' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  )
}
