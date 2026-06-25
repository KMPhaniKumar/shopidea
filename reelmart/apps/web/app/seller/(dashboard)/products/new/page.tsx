'use client'
/**
 * New Product page — two-step creation flow (Design Option B):
 *
 * Step 1 (draft):  Seller fills the product form and selects images via
 *                  ProductImageUploader. Because the uploader needs a productId
 *                  to call the backend image API, we create the product as a
 *                  draft (is_available = false) the first time an image is
 *                  dropped. The uploader is disabled until the store loads.
 *
 * Step 2 (save):   "Add Product" submit UPDATEs the draft row with all the
 *                  form fields and sets is_available per the seller's toggle,
 *                  then navigates to /seller/products. Images are already
 *                  persisted on the server — no extra step needed.
 *
 * If the seller clicks "Add Product" without dropping any images (no draft
 * was created), a fresh INSERT is made instead.
 *
 * Risk R4 (design doc): if the browser closes after the draft is created but
 * before "Add Product" is submitted, a hidden draft (0 images, is_available=false)
 * is left in the seller's product list. They can open it to edit/delete.
 */
import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDropzone } from 'react-dropzone'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { Lock } from 'lucide-react'
import { useSellerVerification } from '@/components/seller/SellerGate'
import { productCategoriesFor } from '@/lib/businessCategories'
import ProductImageUploader from '@/components/seller/ProductImageUploader'

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

// ─── Inner component: image section for new-product page ─────────────────────
//
// Before a draft product exists: shows a placeholder dropzone. On first file
// drop, calls onEnsureDraft() to create the product, then switches to rendering
// the full ProductImageUploader.
//
// After draft creation: mounts ProductImageUploader with the real productId.

interface NewProductImageSectionProps {
  storeId: string
  featuresUnlocked: boolean
  draftProductId: string | null
  onEnsureDraft: () => Promise<string | null>
}

function NewProductImageSection({
  storeId,
  featuresUnlocked,
  draftProductId,
  onEnsureDraft,
}: NewProductImageSectionProps) {
  const [resolvedProductId, setResolvedProductId] = useState<string | null>(draftProductId)
  const [creatingDraft, setCreatingDraft] = useState(false)

  // Sync in case parent resolved the draft id via a different code path
  useEffect(() => {
    if (draftProductId && !resolvedProductId) {
      setResolvedProductId(draftProductId)
    }
  }, [draftProductId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    multiple: true,
    disabled: !!resolvedProductId || !storeId || !featuresUnlocked || creatingDraft,
    onDrop: async (files: File[]) => {
      if (files.length === 0) return
      setCreatingDraft(true)
      const pid = await onEnsureDraft()
      setCreatingDraft(false)
      if (pid) {
        setResolvedProductId(pid)
        // The uploader mounts on the next render with resolvedProductId set.
        // Inform the seller the product was created; they re-drop or browse.
        toast('Product created — now add your photos.', { icon: 'ℹ️' })
      }
    },
  })

  if (resolvedProductId) {
    return (
      <ProductImageUploader
        productId={resolvedProductId}
        initialImages={[]}
        disabled={!featuresUnlocked}
      />
    )
  }

  // Placeholder dropzone — triggers draft creation
  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        data-testid="image-dropzone"
        className={`w-20 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${
          !storeId || !featuresUnlocked
            ? 'opacity-40 cursor-not-allowed border-[#EEEEEE]'
            : isDragActive
              ? 'border-[#FF6B2B] bg-[#FF6B2B]/5 cursor-copy'
              : 'border-[#EEEEEE] hover:border-[#FF6B2B] cursor-pointer'
        }`}
      >
        <input {...getInputProps()} />
        {creatingDraft ? (
          <div className="w-5 h-5 border-2 border-[#FF6B2B] border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            <svg className="w-4 h-4 text-[#AAAAAA]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-[10px] text-[#AAAAAA] mt-0.5 text-center leading-tight px-1">Add photo</span>
          </>
        )}
      </div>
      <p className="text-xs text-[#AAAAAA]">
        Up to 8 photos · JPG / PNG / HEIC · Clear, well-lit, square works best · First photo is the cover.
      </p>
    </div>
  )
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function NewProductPage() {
  const supabase = createClient()
  const router = useRouter()
  const { verification } = useSellerVerification()
  const featuresUnlocked = verification?.features_unlocked ?? true
  const [storeId, setStoreId] = useState('')
  const [storeCategory, setStoreCategory] = useState('')
  const [saving, setSaving] = useState(false)

  // Draft product id — null until the seller drops their first image
  const [draftProductId, setDraftProductId] = useState<string | null>(null)
  // Prevent concurrent draft creation if onEnsureDraft is called twice rapidly
  const creatingDraft = useRef(false)

  const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm<FormData>({
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
      if (store) {
        setStoreId(store.id)
        setStoreCategory(store.category ?? '')
      }
    }
    init()
  }, [])

  /**
   * Creates a hidden draft product on first image drop so the uploader has a
   * real productId to call the backend image API against.
   */
  async function ensureDraftProduct(): Promise<string | null> {
    if (draftProductId) return draftProductId
    if (creatingDraft.current) return null
    if (!storeId) { toast.error('Store not loaded yet. Please wait.'); return null }
    if (!featuresUnlocked) { toast.error('Adding products is locked until your store is approved.'); return null }

    creatingDraft.current = true
    const formName = getValues('name')?.trim()
    const draftName = formName && formName.length >= 2 ? formName : 'Draft product'

    const { data, error } = await supabase.from('products').insert({
      store_id: storeId,
      name: draftName,
      price: getValues('price') || 0,
      is_available: false,
      images: [],
    }).select('id').single()
    creatingDraft.current = false

    if (error || !data) {
      toast.error('Could not create product. Please try again.')
      return null
    }
    setDraftProductId(data.id)
    return data.id
  }

  const productCategories = productCategoriesFor(storeCategory)

  async function onSubmit(data: FormData) {
    if (!featuresUnlocked) {
      toast.error('Adding products is locked until your store is verified and approved.')
      return
    }
    if (!storeId) { toast.error('Store not loaded'); return }
    setSaving(true)

    if (draftProductId) {
      // Draft exists — UPDATE with final form values
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
      }).eq('id', draftProductId)
      if (error) { toast.error(error.message); setSaving(false); return }
    } else {
      // No images were added — INSERT fresh (no draft, no images)
      const { error } = await supabase.from('products').insert({
        store_id: storeId,
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
        images: [],
      })
      if (error) { toast.error(error.message); setSaving(false); return }
    }

    toast.success('Product added!')
    router.push('/seller/products')
  }

  return (
    <div className="max-w-2xl">
      <Toaster />
      <h1 className="text-xl font-bold text-[#1A1A1A] mb-6">Add Product</h1>

      {/* Gate notice — shown until store is verified */}
      {!featuresUnlocked && (
        <div data-testid="verification-locked-notice" className="flex items-start gap-3 bg-orange-50 border border-[#FF6B2B]/20 rounded-xl px-4 py-4 mb-6">
          <Lock size={18} className="text-[#FF6B2B] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#FF6B2B] mb-0.5">Store not yet approved</p>
            <p className="text-sm text-[#555555] leading-relaxed">
              You can preview this form, but saving products is not available yet.
              Complete your verification and wait for admin approval.
            </p>
            <Link href="/seller/dashboard" className="inline-block mt-2 text-xs font-medium text-[#FF6B2B] underline">
              View verification status
            </Link>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

        {/* Photos */}
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-[#1A1A1A]">Product Photos</h2>
          <NewProductImageSection
            storeId={storeId}
            featuresUnlocked={featuresUnlocked}
            draftProductId={draftProductId}
            onEnsureDraft={ensureDraftProduct}
          />
        </div>

        {/* Details */}
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

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => router.back()} className="flex-1 border border-[#EEEEEE] py-2.5 rounded-lg text-sm font-medium hover:bg-[#F9F9F9]">Cancel</button>
          <button
            type="submit"
            disabled={saving || !featuresUnlocked}
            title={!featuresUnlocked ? 'Available after your store is approved' : undefined}
            className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : !featuresUnlocked ? 'Store not approved yet' : 'Add Product'}
          </button>
        </div>
      </form>
    </div>
  )
}
