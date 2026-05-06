'use client'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { Upload, CheckCircle, Clock } from 'lucide-react'

const CATEGORIES = [
  { id: 'food', label: 'Food & Beverages', icon: '🍱' },
  { id: 'jewellery', label: 'Jewellery', icon: '💍' },
  { id: 'clothing', label: 'Clothing & Fashion', icon: '👗' },
  { id: 'electronics', label: 'Electronics', icon: '📱' },
  { id: 'home', label: 'Home & Decor', icon: '🏡' },
  { id: 'beauty', label: 'Beauty & Wellness', icon: '💄' },
  { id: 'other', label: 'Other', icon: '🛍️' },
]

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat']

type Step = 'phone' | 'otp' | 'profile' | 'store' | 'pending'

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function SellerRegister() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [name, setName] = useState('')

  const [storeName, setStoreName] = useState('')
  const [storeSlug, setStoreSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')
  const [area, setArea] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [description, setDescription] = useState('')

  // Logo
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  function startCountdown() {
    setCountdown(60)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  async function sendOTP() {
    if (phone.length !== 10) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({ phone: `+91${phone}` })
    if (error) { toast.error(error.message); setLoading(false); return }
    setStep('otp')
    startCountdown()
    toast.success('OTP sent to +91 ' + phone)
    setLoading(false)
  }

  async function verifyOTP() {
    if (otp.length !== 6) return
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({ phone: `+91${phone}`, token: otp, type: 'sms' })
    if (error) { toast.error(error.message || 'Invalid OTP'); setLoading(false); return }
    if (!data?.session) { toast.error('Session error. Try again.'); setLoading(false); return }

    const { data: existingStore } = await supabase
      .from('stores')
      .select('id, approval_status')
      .eq('seller_id', data.session.user.id)
      .maybeSingle()

    if (existingStore) {
      if (existingStore.approval_status === 'approved') {
        toast.success('Welcome back!')
        router.push('/seller/dashboard')
      } else {
        setStep('pending')
      }
      return
    }

    setStep('profile')
    setLoading(false)
  }

  async function saveProfile() {
    if (!name.trim()) { toast.error('Enter your name'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Session expired'); setLoading(false); return }
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      phone: `+91${phone}`,
      name: name.trim(),
      role: 'seller',
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    setStep('store')
    setLoading(false)
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2MB'); return }
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function uploadLogo(storeId: string): Promise<string | null> {
    if (!logoFile) return null
    const ext = logoFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${storeId}/logo.${ext}`
    const { error } = await supabase.storage.from('store-logos').upload(path, logoFile, {
      upsert: true,
      contentType: logoFile.type,
    })
    if (error) { toast.error(`Logo upload failed: ${error.message}`); return null }
    const { data } = supabase.storage.from('store-logos').getPublicUrl(path)
    return data.publicUrl
  }

  async function createStore() {
    if (!storeName.trim()) { toast.error('Enter store name'); return }
    if (!storeSlug.trim()) { toast.error('Enter store URL'); return }
    if (!category) { toast.error('Select a category'); return }
    if (!city) { toast.error('Select your city'); return }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Session expired'); setLoading(false); return }

    const { data: existing } = await supabase
      .from('stores')
      .select('id')
      .eq('store_slug', storeSlug.trim())
      .maybeSingle()

    if (existing) {
      toast.error('This store URL is already taken. Try another.')
      setLoading(false)
      return
    }

    const { data: newStore, error } = await supabase.from('stores').insert({
      seller_id: user.id,
      store_name: storeName.trim(),
      store_slug: storeSlug.trim(),
      description: description.trim() || null,
      category,
      city,
      area: area.trim() || null,
      whatsapp_number: whatsapp ? `+91${whatsapp.replace(/\D/g, '')}` : null,
      is_active: false,
      is_open: false,
      approval_status: 'pending',
    }).select('id').single()

    if (error) { toast.error(error.message); setLoading(false); return }

    // Upload logo if provided
    if (logoFile && newStore?.id) {
      const logoUrl = await uploadLogo(newStore.id)
      if (logoUrl) {
        await supabase.from('stores').update({ logo_url: logoUrl }).eq('id', newStore.id)
      }
    }

    setStep('pending')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-12 relative overflow-hidden">
      <Toaster />
      <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-[#FF6B2B]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-[400px] h-[400px] rounded-full bg-[#00B98E]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <Image src="/logo.png" alt="ReelMart" width={300} height={110} className="object-contain mb-6" />

        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-[#1A1A1A] leading-snug mb-2">Start selling today.</h2>
          <p className="text-[#888888] text-sm leading-relaxed">Join sellers growing their business with ReelMart.</p>
        </div>

        {/* Pending approval screen */}
        {step === 'pending' && (
          <div className="w-full bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-10 text-center">
            <div className="flex justify-center mb-4">
              <Clock size={48} className="text-[#FF6B2B]" />
            </div>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Application Submitted!</h2>
            <p className="text-[#888888] text-sm leading-relaxed mb-6">
              Your store registration is under review. Our team will verify your details and approve your store within 24–48 hours.
              You'll be notified once approved.
            </p>
            <div className="bg-orange-50 rounded-xl p-4 text-left space-y-2 mb-6">
              <div className="flex items-center gap-2 text-sm text-[#555555]">
                <CheckCircle size={16} className="text-[#FF6B2B] shrink-0" />
                <span>Application received</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#AAAAAA]">
                <Clock size={16} className="shrink-0" />
                <span>Admin review in progress</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#AAAAAA]">
                <Clock size={16} className="shrink-0" />
                <span>Store activation</span>
              </div>
            </div>
            <p className="text-xs text-[#AAAAAA]">Questions? Contact support at support@reelmart.in</p>
          </div>
        )}

        {step !== 'pending' && (
          <div className="w-full bg-white border border-[#E5E5E5] rounded-2xl shadow-lg px-8 py-8">
            <div className="flex gap-1 mb-6">
              <div className="h-1 w-10 rounded-full bg-[#FF6B2B]" />
              <div className="h-1 w-4 rounded-full bg-[#00B98E]" />
            </div>

            {/* Phone */}
            {step === 'phone' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Create your account</h1>
                  <p className="text-[#888888] text-sm">Enter your phone number to get started</p>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Phone Number</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                      <span className="inline-flex items-center px-4 bg-[#F9F9F9] text-[#666666] text-sm font-medium border-r border-[#E5E5E5]">+91</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        className="flex-1 px-4 py-3.5 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                        autoFocus
                      />
                    </div>
                  </div>
                  <button onClick={sendOTP} disabled={phone.length !== 10 || loading}
                    className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm">
                    {loading ? 'Sending...' : 'Send OTP →'}
                  </button>
                  <p className="text-center text-xs text-[#AAAAAA] pt-2">
                    Already have an account?{' '}
                    <a href="/seller/login" className="text-[#FF6B2B] font-medium hover:underline">Sign in</a>
                  </p>
                </div>
              </div>
            )}

            {/* OTP */}
            {step === 'otp' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Verify your number</h1>
                  <p className="text-[#888888] text-sm">OTP sent to +91 {phone}</p>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Enter OTP</label>
                    <input
                      type="text"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="• • • • • •"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-center tracking-[0.5em] text-xl font-bold outline-none focus:border-[#FF6B2B] transition-colors"
                      autoFocus
                    />
                  </div>
                  <button onClick={verifyOTP} disabled={otp.length !== 6 || loading}
                    className="w-full bg-[#00B98E] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#009e79] transition-colors shadow-sm">
                    {loading ? 'Verifying...' : 'Verify & Continue →'}
                  </button>
                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep('phone')} className="text-sm text-[#888888] hover:text-[#1A1A1A]">← Change number</button>
                    <button onClick={sendOTP} disabled={countdown > 0} className="text-sm text-[#FF6B2B] font-medium disabled:opacity-40">
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Profile */}
            {step === 'profile' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Your details</h1>
                  <p className="text-[#888888] text-sm">Tell us your name to personalise your account</p>
                </div>
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3.5 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A]"
                      autoFocus
                    />
                  </div>
                  <button onClick={saveProfile} disabled={!name.trim() || loading}
                    className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-semibold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm">
                    {loading ? 'Saving...' : 'Continue →'}
                  </button>
                </div>
              </div>
            )}

            {/* Store */}
            {step === 'store' && (
              <div>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[#1A1A1A] mb-1">Create your store</h1>
                  <p className="text-[#888888] text-sm">Set up your ReelMart storefront</p>
                </div>
                <div className="space-y-4">

                  {/* Logo upload */}
                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Store Logo</label>
                    <label className="flex items-center gap-4 cursor-pointer">
                      <div className="w-16 h-16 rounded-xl border-2 border-dashed border-[#E5E5E5] flex items-center justify-center overflow-hidden hover:border-[#FF6B2B] transition-colors shrink-0">
                        {logoPreview ? (
                          <img src={logoPreview} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <Upload size={20} className="text-[#AAAAAA]" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-[#555555] font-medium">{logoPreview ? 'Change logo' : 'Upload logo'}</p>
                        <p className="text-xs text-[#AAAAAA]">JPG, PNG or WebP · max 2MB</p>
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoChange} />
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Store Name *</label>
                    <input type="text" value={storeName}
                      onChange={e => { setStoreName(e.target.value); if (!slugManual) setStoreSlug(slugify(e.target.value)) }}
                      placeholder="Rahul's Fashion"
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A]"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Store URL *</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                      <span className="inline-flex items-center px-3 bg-[#F9F9F9] text-[#999999] text-xs border-r border-[#E5E5E5] whitespace-nowrap">reelmart.in/</span>
                      <input type="text" value={storeSlug}
                        onChange={e => { setStoreSlug(slugify(e.target.value)); setSlugManual(true) }}
                        placeholder="rahuls-fashion"
                        className="flex-1 px-3 py-3 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                      />
                    </div>
                    <p className="text-xs text-[#AAAAAA] mt-1">Your shareable store link</p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Category *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CATEGORIES.map(cat => (
                        <button key={cat.id} type="button" onClick={() => setCategory(cat.id)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                            category === cat.id
                              ? 'border-[#FF6B2B] bg-orange-50 text-[#FF6B2B]'
                              : 'border-[#E5E5E5] text-[#555555] hover:border-[#FF6B2B]/50'
                          }`}>
                          <span className="text-base">{cat.icon}</span>
                          <span className="truncate text-xs">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">City *</label>
                    <select value={city} onChange={e => setCity(e.target.value)}
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A] bg-white">
                      <option value="">Select your city</option>
                      {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Area / Locality</label>
                    <input type="text" value={area} onChange={e => setArea(e.target.value)}
                      placeholder="Koramangala, Banjara Hills..."
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">WhatsApp Number</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#E5E5E5] focus-within:border-[#FF6B2B] transition-colors">
                      <span className="inline-flex items-center px-4 bg-[#F9F9F9] text-[#666666] text-sm border-r border-[#E5E5E5]">+91</span>
                      <input type="tel" value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9876543210"
                        className="flex-1 px-4 py-3 text-sm outline-none bg-white text-[#1A1A1A] placeholder:text-[#BBBBBB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1A1A1A] mb-1.5">Store Description</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)}
                      placeholder="Tell buyers what you sell..."
                      rows={2} maxLength={300}
                      className="w-full border border-[#E5E5E5] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#FF6B2B] transition-colors text-[#1A1A1A] resize-none"
                    />
                  </div>

                  <button onClick={createStore} disabled={!storeName || !storeSlug || !category || !city || loading}
                    className="w-full bg-[#FF6B2B] text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#e55a1f] transition-colors shadow-sm">
                    {loading ? 'Submitting...' : '🚀 Submit for Approval'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-xs text-[#CCCCCC] text-center">© 2025 ReelMart · Real Products. Real Sellers.</p>
      </div>
    </div>
  )
}
