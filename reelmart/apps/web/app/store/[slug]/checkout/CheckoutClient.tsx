'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft, MapPin, ChevronRight, Plus, Loader2, Search } from 'lucide-react'
import { CartItem, loadCart, clearCart, cartTotal } from '@/lib/cart'
import { saveAddress, searchPlaces, fetchPlaceDetails, type PlacePrediction } from '@/lib/saved-addresses'
import { sendOtp as msg91Send, verifyOtp as msg91Verify, exchangeForSupabaseSession } from '@/lib/msg91-otp'

interface Store {
  id: string
  store_name: string
  logo_url: string | null
  store_slug: string
  pincode: string | null
}

interface Address {
  id: string
  label: string
  name: string
  phone: string
  alt_phone: string | null
  line1: string
  line2: string | null
  area: string | null
  city: string
  state: string
  pincode: string
  is_default: boolean
}

const DELIVERY_FEE = 60
const FREE_DELIVERY_THRESHOLD = 500

type Step = 'cart' | 'phone' | 'otp' | 'address' | 'review'

export default function CheckoutClient({ store }: { store: Store }) {
  const supabase = createClient()
  const router = useRouter()
  const [step, setStep] = useState<Step>('cart')
  const [cart, setCart] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Auth state
  const [userId, setUserId] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)

  // Address
  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newAddr, setNewAddr] = useState<{
    label: 'Home' | 'Work' | 'Other'
    name: string; phone: string; alt_phone: string
    line1: string; line2: string; area: string; city: string; state: string; pincode: string
  }>({
    label: 'Home',
    name: '', phone: '', alt_phone: '',
    line1: '', line2: '', area: '', city: '', state: '', pincode: '',
  })
  const [savingAddr, setSavingAddr] = useState(false)

  // Delivery estimate (fetched from delivery-service when both pincodes known)
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    days: number
    deliverable: boolean
    fetchedFor: string // "pickup-delivery" key so we don't re-fetch unnecessarily
  } | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

  // Order placement
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cod'>('cod')
  const [placing, setPlacing] = useState(false)

  // Hydrate cart + check session
  useEffect(() => {
    setCart(loadCart(store.store_slug))
    setHydrated(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id)
        const loginPhone = user.phone?.replace(/^\+?91/, '') ?? ''
        setPhone(loginPhone)
        setNewAddr(a => ({ ...a, phone: loginPhone }))
        loadAddresses(user.id)
      }
    })
  }, [])

  async function loadAddresses(uid: string) {
    const { data } = await supabase
      .from('addresses').select('*')
      .eq('user_id', uid).order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
    const list = (data ?? []) as Address[]
    setAddresses(list)
    setSelectedAddressId(list.find(a => a.is_default)?.id ?? list[0]?.id ?? null)
  }

  const subtotal = cartTotal(cart)
  const deliveryFee = subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE
  const total = subtotal + deliveryFee
  const selectedAddress = useMemo(
    () => addresses.find(a => a.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  )

  // Fetch ETA when both pincodes are known. Cached by pickup-delivery key
  // so toggling between saved addresses doesn't re-hit the courier API.
  useEffect(() => {
    const pickup = store.pincode
    const delivery = selectedAddress?.pincode
    if (!pickup || !delivery || !/^\d{6}$/.test(delivery)) return
    const key = `${pickup}-${delivery}`
    if (deliveryEstimate?.fetchedFor === key) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
    if (!apiUrl) return

    setEstimateLoading(true)
    fetch(`${apiUrl}/api/delivery/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickupPincode: pickup,
        deliveryPincode: delivery,
        weight: 0.5,
        paymentType: paymentMethod,
        orderAmount: subtotal,
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (!json?.success) return
        setDeliveryEstimate({
          days: json.data.estimatedDays ?? 3,
          deliverable: !!json.data.deliverable,
          fetchedFor: key,
        })
      })
      .catch(() => {})
      .finally(() => setEstimateLoading(false))
  }, [store.pincode, selectedAddress?.pincode, paymentMethod, subtotal])

  // STEP HANDLERS

  function startCheckout() {
    if (cart.length === 0) { toast.error('Cart is empty'); return }
    if (userId) { setStep(addresses.length > 0 ? 'review' : 'address') }
    else setStep('phone')
  }

  async function sendOtp() {
    if (!/^[6-9]\d{9}$/.test(phone)) { toast.error('Enter a valid 10-digit number'); return }
    setOtpLoading(true)
    try {
      await msg91Send(`+91${phone}`)
      toast.success('OTP sent!')
      setStep('otp')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not send OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  async function verifyOtp() {
    if (otp.length !== 6) { toast.error('Enter the 6-digit code'); return }
    setOtpLoading(true)
    try {
      const { accessToken } = await msg91Verify(otp)
      const { userId: uid } = await exchangeForSupabaseSession(accessToken, 'buyer')
      setUserId(uid)
      setNewAddr(a => ({ ...a, phone: a.phone || phone }))
      await loadAddresses(uid)
      setStep('address')
      toast.success('Logged in!')
    } catch (err: any) {
      toast.error(err?.message ?? 'Invalid OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  async function saveNewAddress() {
    if (!userId) return
    if (!newAddr.name.trim()) return toast.error('Enter the recipient name')
    const cleanedPhone = newAddr.phone.replace(/\D/g, '')
    if (!/^[6-9]\d{9}$/.test(cleanedPhone)) return toast.error('Enter a valid 10-digit contact number')
    if (newAddr.alt_phone && !/^[6-9]\d{9}$/.test(newAddr.alt_phone.replace(/\D/g, ''))) {
      return toast.error('Alternate number must be a valid 10-digit Indian mobile')
    }
    if (!newAddr.line1.trim()) return toast.error('Enter address line')
    if (!/^\d{6}$/.test(newAddr.pincode)) return toast.error('Invalid pincode')
    if (!newAddr.city.trim() || !newAddr.state.trim()) return toast.error('Enter city and state')
    setSavingAddr(true)
    try {
      const saved = await saveAddress(supabase, userId, {
        label: newAddr.label,
        name: newAddr.name,
        phone: newAddr.phone,
        alt_phone: newAddr.alt_phone || undefined,
        line1: newAddr.line1,
        line2: newAddr.line2 || undefined,
        area: newAddr.area || undefined,
        city: newAddr.city,
        state: newAddr.state,
        pincode: newAddr.pincode,
      })
      // Refresh list so the new/updated row appears in its proper sort order
      await loadAddresses(userId)
      setSelectedAddressId(saved.id)
      setShowNewForm(false)
      setNewAddr({
        label: 'Home', name: '', phone, alt_phone: '',
        line1: '', line2: '', area: '', city: '', state: '', pincode: '',
      })
      setStep('review')
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not save address')
    } finally {
      setSavingAddr(false)
    }
  }

  async function placeOrder() {
    if (!userId || !selectedAddress) return
    setPlacing(true)
    const { data, error } = await supabase.from('orders').insert({
      buyer_id: userId,
      store_id: store.id,
      items: cart as any,
      subtotal,
      delivery_fee: deliveryFee,
      discount_amount: 0,
      total_amount: total,
      delivery_address: {
        name: selectedAddress.name,
        phone: selectedAddress.phone,
        alt_phone: selectedAddress.alt_phone,
        line1: selectedAddress.line1,
        line2: selectedAddress.line2,
        area: selectedAddress.area,
        city: selectedAddress.city,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
      } as any,
      payment_method: paymentMethod,
      status: 'pending',
      payment_status: paymentMethod === 'cod' ? 'pending' : 'pending',
    }).select('id, order_number').single()

    if (error || !data) { setPlacing(false); toast.error(error?.message ?? 'Order failed'); return }

    // Fire-and-forget: ask backend to send WhatsApp + SMS to the buyer.
    // Idempotent on the server, so a slow/aborted call doesn't hurt.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
    if (apiUrl) {
      fetch(`${apiUrl}/api/notifications/order-placed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: data.id }),
      }).catch(() => {})
    }

    // For online payment, redirect to payment page (TODO: Razorpay integration)
    // For COD, go straight to confirmation
    clearCart(store.store_slug)
    router.push(`/order/${data.id}`)
  }

  if (!hydrated) return null

  if (cart.length === 0 && step === 'cart') {
    return (
      <EmptyCart store={store} onBack={() => router.push(`/store/${store.store_slug}`)} />
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      <Toaster position="top-center" />

      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => step === 'cart' ? router.back() : setStep('cart')} className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-[#1A1A1A]">Checkout</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 pb-32 space-y-3">
        {/* Order summary */}
        <Section title={`Order from ${store.store_name}`}>
          {cart.map((it, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
              <span className="flex-1 truncate pr-3">{it.name} × {it.qty}</span>
              <span className="font-semibold">₹{it.price * it.qty}</span>
            </div>
          ))}
          <div className="pt-3 mt-2 border-t border-gray-100 space-y-1.5">
            <Row label="Subtotal" value={`₹${subtotal}`} />
            <Row label="Delivery" value={deliveryFee === 0 ? <span className="text-green-600 font-bold">FREE</span> : `₹${deliveryFee}`} />
            {deliveryFee === 0 && (
              <p className="text-xs text-green-600">🎉 Free delivery on orders above ₹{FREE_DELIVERY_THRESHOLD}</p>
            )}
            <Row label={<span className="font-bold text-base">Total</span>} value={<span className="font-black text-base">₹{total}</span>} />
          </div>
          {(estimateLoading || deliveryEstimate) && (
            <div className="mt-3 -mb-1 px-3 py-2 bg-orange-50 border border-orange-100 rounded-xl flex items-center gap-2">
              <span className="text-base">📦</span>
              <div className="text-xs text-[#1A1A1A]">
                {estimateLoading && !deliveryEstimate && (
                  <span className="text-gray-500">Checking delivery time…</span>
                )}
                {deliveryEstimate && deliveryEstimate.deliverable && (
                  <>
                    <span className="font-semibold">Arriving by {formatDeliveryDate(deliveryEstimate.days)}</span>
                    <span className="text-gray-500"> · {deliveryEstimate.days}-day delivery</span>
                  </>
                )}
                {deliveryEstimate && !deliveryEstimate.deliverable && (
                  <span className="text-red-600 font-semibold">
                    Sorry, we don't deliver to this pincode yet.
                  </span>
                )}
              </div>
            </div>
          )}
        </Section>

        {/* Phone OTP step */}
        {step === 'phone' && (
          <Section title="Verify your phone">
            <p className="text-sm text-gray-500 mb-3">We'll send a 6-digit code to verify it's you.</p>
            <div className="flex rounded-xl overflow-hidden border border-gray-200 focus-within:border-[#FF6B2B]">
              <span className="px-4 bg-gray-50 flex items-center text-sm text-gray-600 border-r border-gray-200">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                className="flex-1 px-4 py-3 text-sm outline-none"
                autoFocus
              />
            </div>
            <button
              onClick={sendOtp}
              disabled={phone.length !== 10 || otpLoading}
              className="mt-4 w-full bg-[#FF6B2B] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#e55a1f]"
            >
              {otpLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Send OTP →'}
            </button>
          </Section>
        )}

        {step === 'otp' && (
          <Section title="Enter the OTP">
            <p className="text-sm text-gray-500 mb-3">Sent to +91 {phone}</p>
            <input
              type="tel"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="• • • • • •"
              className="w-full px-4 py-3 text-xl font-bold text-center tracking-[0.5em] border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B]"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep('phone')} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                ← Change number
              </button>
              <button
                onClick={verifyOtp}
                disabled={otp.length !== 6 || otpLoading}
                className="flex-1 bg-[#00B98E] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#009e79]"
              >
                {otpLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Verify →'}
              </button>
            </div>
          </Section>
        )}

        {/* Address selection */}
        {(step === 'address' || step === 'review') && (
          <Section title="Delivery Address" right={addresses.length > 0 && !showNewForm ? (
            <button onClick={() => setShowNewForm(true)} className="text-xs text-[#FF6B2B] font-bold flex items-center gap-1">
              <Plus size={12} /> Add new
            </button>
          ) : null}>
            {!showNewForm && addresses.length > 0 && (
              <div className="space-y-2">
                {addresses.map(addr => (
                  <label key={addr.id} className={`flex gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                    selectedAddressId === addr.id ? 'border-[#FF6B2B] bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      checked={selectedAddressId === addr.id}
                      onChange={() => setSelectedAddressId(addr.id)}
                      className="mt-0.5 accent-[#FF6B2B]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold bg-gray-100 px-2 py-0.5 rounded-full">{addr.label}</span>
                        {addr.is_default && <span className="text-[10px] text-[#FF6B2B] font-bold">DEFAULT</span>}
                      </div>
                      <p className="text-sm font-semibold text-[#1A1A1A]">{addr.name} · {addr.phone}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">
                        {[addr.line1, addr.line2, addr.area, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {(showNewForm || addresses.length === 0) && (
              <NewAddressForm
                value={newAddr}
                onChange={setNewAddr}
                onCancel={addresses.length > 0 ? () => setShowNewForm(false) : null}
                onSave={saveNewAddress}
                saving={savingAddr}
              />
            )}
          </Section>
        )}

        {/* Payment + place */}
        {step === 'review' && selectedAddress && !showNewForm && (
          <Section title="Payment Method">
            <div className="space-y-2">
              {(['cod', 'online'] as const).map(m => (
                <label key={m} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                  paymentMethod === m ? 'border-[#FF6B2B] bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" checked={paymentMethod === m} onChange={() => setPaymentMethod(m)} className="accent-[#FF6B2B]" />
                  <div className="flex-1">
                    <p className="font-semibold text-[#1A1A1A]">{m === 'cod' ? '💵 Cash on Delivery' : '💳 Pay Online'}</p>
                    <p className="text-xs text-gray-500">{m === 'cod' ? 'Pay when your order arrives' : 'UPI, Card, NetBanking via Razorpay'}</p>
                  </div>
                </label>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Footer CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500">{cart.reduce((s, i) => s + i.qty, 0)} items</p>
            <p className="text-lg font-black text-[#1A1A1A]">₹{total}</p>
          </div>
          {step === 'cart' && (
            <button onClick={startCheckout} className="flex-1 bg-[#FF6B2B] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#e55a1f]">
              Continue →
            </button>
          )}
          {step === 'address' && selectedAddressId && !showNewForm && (
            <button onClick={() => setStep('review')} className="flex-1 bg-[#FF6B2B] text-white py-3 px-6 rounded-full font-bold text-sm hover:bg-[#e55a1f]">
              Continue →
            </button>
          )}
          {step === 'review' && selectedAddress && !showNewForm && (
            <button
              onClick={placeOrder}
              disabled={placing}
              className="flex-1 bg-[#00B98E] text-white py-3 px-6 rounded-full font-bold text-sm disabled:opacity-50 hover:bg-[#009e79] flex items-center justify-center gap-2"
            >
              {placing ? <Loader2 className="animate-spin" size={18} /> : (paymentMethod === 'cod' ? 'Place Order' : 'Pay & Place Order')} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="flex justify-between text-sm"><span className="text-gray-600">{label}</span><span>{value}</span></div>
}

function NewAddressForm({
  value, onChange, onCancel, onSave, saving,
}: {
  value: any; onChange: (v: any) => void; onCancel: (() => void) | null; onSave: () => void; saving: boolean
}) {
  const set = (k: string) => (v: string) => onChange({ ...value, [k]: v })
  const [query, setQuery] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setPredictions([]); setSearching(false); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const list = await searchPlaces(query)
      setPredictions(list)
      setSearching(false)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function pickPrediction(p: PlacePrediction) {
    const details = await fetchPlaceDetails(p.place_id)
    onChange({
      ...value,
      area: details.area || value.area,
      city: details.city || value.city,
      state: details.state || value.state,
      pincode: details.pincode || value.pincode,
    })
    setQuery('')
    setPredictions([])
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['Home', 'Work', 'Other'] as const).map(l => (
          <button key={l} type="button" onClick={() => set('label')(l)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition ${
              value.label === l ? 'bg-[#FF6B2B] text-white border-[#FF6B2B]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      <div className="relative">
        <label className="block text-xs font-semibold text-gray-600 mb-1">Search your location</label>
        <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF6B2B] transition">
          <Search size={14} className="text-gray-400 ml-3" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Apartment, street or landmark"
            className="flex-1 px-2.5 py-2.5 text-sm outline-none"
          />
          {searching && <Loader2 className="animate-spin text-gray-400 mr-3" size={14} />}
        </div>
        {predictions.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-auto">
            {predictions.map(p => (
              <li key={p.place_id}>
                <button type="button" onClick={() => pickPrediction(p)}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 border-b border-gray-100 last:border-0">
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{p.main_text}</p>
                  <p className="text-xs text-gray-500 truncate">{p.secondary_text}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-gray-400 mt-1">Pick a result to auto-fill city, state and pincode.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input label="Full Name" value={value.name} onChange={set('name')} />
        <PhoneInput label="Contact Number" value={value.phone} onChange={v => set('phone')(v.replace(/\D/g, '').slice(0, 10))} />
      </div>
      <PhoneInput label="Alternate Number (optional)" value={value.alt_phone} onChange={v => set('alt_phone')(v.replace(/\D/g, '').slice(0, 10))} />
      <Input label="Address Line 1" value={value.line1} onChange={set('line1')} placeholder="Flat / House / Building" />
      <Input label="Address Line 2 (optional)" value={value.line2} onChange={set('line2')} placeholder="Street, Landmark" />
      <Input label="Area / Locality" value={value.area} onChange={set('area')} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="City" value={value.city} onChange={set('city')} />
        <Input label="Pincode" value={value.pincode} onChange={v => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
      </div>
      <Input label="State" value={value.state} onChange={set('state')} />
      <div className="flex gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        )}
        <button onClick={onSave} disabled={saving} className="flex-1 bg-[#FF6B2B] text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-[#e55a1f]">
          {saving ? <Loader2 className="animate-spin mx-auto" size={16} /> : 'Save Address'}
        </button>
      </div>
    </div>
  )
}

function PhoneInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <div className="flex border border-gray-200 rounded-xl overflow-hidden focus-within:border-[#FF6B2B] transition">
        <span className="px-2.5 bg-gray-50 flex items-center text-xs text-gray-600 border-r border-gray-200">+91</span>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          inputMode="numeric"
          placeholder="9876543210"
          className="flex-1 px-2.5 py-2.5 text-sm outline-none"
        />
      </div>
    </label>
  )
}

function Input({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: any }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#FF6B2B] transition"
      />
    </label>
  )
}

function formatDeliveryDate(daysFromNow: number) {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(1, Math.round(daysFromNow)))
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function EmptyCart({ store, onBack }: { store: Store; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-6xl mb-4">🛒</div>
      <h2 className="text-xl font-black text-[#1A1A1A] mb-2">Your cart is empty</h2>
      <p className="text-sm text-gray-500 mb-6">Add some products from {store.store_name} first</p>
      <button onClick={onBack} className="bg-[#FF6B2B] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-[#e55a1f]">
        ← Back to Store
      </button>
    </div>
  )
}
