import { supabaseAdmin } from '../lib/supabaseAdmin'
import { sendWhatsApp } from '../notifications/whatsapp'

interface BotSession {
  storeSlug: string
  storeId: string
  storeName: string
  step: 'menu' | 'product_selected' | 'quantity' | 'address' | 'payment_sent'
  products?: Product[]
  selectedProduct?: Product
  selectedVariant?: VariantOption | null
  quantity?: number
  lastActivity: number
}

interface Product {
  id: string
  name: string
  price: number
  variants: VariantGroup[] | null
}

interface VariantGroup {
  name: string
  options: string[]
  prices?: Record<string, number>
}

interface VariantOption {
  groupName: string
  option: string
  price: number
}

// In-memory sessions (per phone number) — auto-expire after 30 min
const sessions: Record<string, BotSession> = {}
const SESSION_TTL_MS = 30 * 60 * 1000

function getSession(phone: string): BotSession | undefined {
  const s = sessions[phone]
  if (!s) return undefined
  if (Date.now() - s.lastActivity > SESSION_TTL_MS) {
    delete sessions[phone]
    return undefined
  }
  return s
}

function saveSession(phone: string, session: BotSession): void {
  sessions[phone] = { ...session, lastActivity: Date.now() }
}

function clearSession(phone: string): void {
  delete sessions[phone]
}

async function fetchStore(slug: string): Promise<{ id: string; store_name: string } | null> {
  const { data } = await supabaseAdmin
    .from('stores')
    .select('id, store_name')
    .eq('store_slug', slug)
    .eq('is_open', true)
    .single()
  return data
}

async function fetchProducts(storeId: string): Promise<Product[]> {
  const { data } = await supabaseAdmin
    .from('products')
    .select('id, name, price, variants')
    .eq('store_id', storeId)
    .eq('is_available', true)
    .limit(10)
  return (data ?? []) as Product[]
}

async function createOrderAndPaymentLink(
  session: BotSession,
  addressText: string,
  buyerPhone: string
): Promise<string | null> {
  try {
    const product = session.selectedProduct!
    const qty = session.quantity ?? 1
    const itemPrice = session.selectedVariant?.price ?? product.price
    const subtotal = itemPrice * qty
    const deliveryFee = subtotal >= 500 ? 0 : 60
    const total = subtotal + deliveryFee

    const items = [{
      product_id: product.id,
      name: product.name,
      qty,
      price: itemPrice,
      variant: session.selectedVariant
        ? { name: session.selectedVariant.groupName, option: session.selectedVariant.option }
        : undefined,
    }]

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .insert({
        store_id: session.storeId,
        items,
        subtotal,
        delivery_fee: deliveryFee,
        total_amount: total,
        delivery_address: { raw: addressText, phone: buyerPhone },
        payment_method: 'online',
        payment_status: 'pending',
        status: 'pending',
      })
      .select('id, order_number')
      .single()

    if (error || !order) return null

    // Create Razorpay payment link
    const authHeader = `Basic ${Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64')}`

    const resp = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: total * 100,
        currency: 'INR',
        description: `Order ${order.order_number}`,
        customer: { contact: buyerPhone },
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: Math.floor((Date.now() + 30 * 60 * 1000) / 1000),
        callback_url: `${process.env.BACKEND_URL}/api/whatsapp/payment-callback?orderId=${order.id}`,
        callback_method: 'get',
      }),
    })

    const linkData = await resp.json()
    return (linkData.short_url as string) ?? null
  } catch {
    return null
  }
}

function buildMenuText(storeName: string, products: Product[]): string {
  const list = products.map((p, i) => `${i + 1}. ${p.name} — ₹${p.price}`).join('\n')
  return `👋 Welcome to *${storeName}*!\n\nHere's what we have:\n\n${list}\n\nReply with a number to order, or type *0* to see this menu again.`
}

export async function handleBotMessage(
  buyerPhone: string,
  message: string,
  storeSlug: string
): Promise<void> {
  const text = message.trim()
  let session = getSession(buyerPhone)

  // Always initialize storeId on fresh session or storeSlug change
  if (!session || session.storeSlug !== storeSlug) {
    const store = await fetchStore(storeSlug)
    if (!store) {
      await sendWhatsApp(buyerPhone, '❌ Sorry, this store is currently closed.')
      return
    }
    session = {
      storeSlug,
      storeId: store.id,
      storeName: store.store_name,
      step: 'menu',
      lastActivity: Date.now(),
    }
  }

  // Global reset command
  if (text === '0' || text.toLowerCase() === 'menu' || text.toLowerCase() === 'hi') {
    const products = await fetchProducts(session.storeId)
    if (products.length === 0) {
      await sendWhatsApp(buyerPhone, `😔 *${session.storeName}* has no products available right now. Check back later!`)
      clearSession(buyerPhone)
      return
    }
    await sendWhatsApp(buyerPhone, buildMenuText(session.storeName, products))
    saveSession(buyerPhone, { ...session, step: 'product_selected', products })
    return
  }

  // STEP: Waiting for product selection
  if (session.step === 'menu' || session.step === 'product_selected') {
    const products = session.products ?? await fetchProducts(session.storeId)
    const idx = parseInt(text, 10) - 1

    if (isNaN(idx) || idx < 0 || idx >= products.length) {
      await sendWhatsApp(buyerPhone, `Please reply with a number between 1 and ${products.length}, or type *0* to see the menu.`)
      saveSession(buyerPhone, { ...session, step: 'product_selected', products })
      return
    }

    const product = products[idx]
    const firstVariantGroup = product.variants?.[0]

    if (firstVariantGroup && firstVariantGroup.options.length > 0) {
      const opts = firstVariantGroup.options.map((o, i) => `${i + 1}. ${o}`).join('\n')
      await sendWhatsApp(buyerPhone,
        `*${product.name}* — ₹${product.price}\n\nSelect ${firstVariantGroup.name}:\n${opts}`
      )
      saveSession(buyerPhone, { ...session, step: 'quantity', products, selectedProduct: product })
      return
    }

    // No variants — go straight to quantity
    await sendWhatsApp(buyerPhone, `*${product.name}* — ₹${product.price}\n\nHow many do you want? (Reply with a number)`)
    saveSession(buyerPhone, { ...session, step: 'quantity', products, selectedProduct: product, selectedVariant: null })
    return
  }

  // STEP: Waiting for variant or quantity
  if (session.step === 'quantity') {
    const product = session.selectedProduct!
    const variantGroup = product.variants?.[0]

    // If we haven't resolved variant yet (selectedVariant is undefined = not set yet)
    if (variantGroup && session.selectedVariant === undefined) {
      const optIdx = parseInt(text, 10) - 1
      if (isNaN(optIdx) || optIdx < 0 || optIdx >= variantGroup.options.length) {
        const opts = variantGroup.options.map((o, i) => `${i + 1}. ${o}`).join('\n')
        await sendWhatsApp(buyerPhone, `Please choose a valid option:\n${opts}`)
        saveSession(buyerPhone, session)
        return
      }
      const chosenOption = variantGroup.options[optIdx]
      const variantPrice = variantGroup.prices?.[chosenOption] ?? product.price
      const variant: VariantOption = { groupName: variantGroup.name, option: chosenOption, price: variantPrice }

      await sendWhatsApp(buyerPhone,
        `*${product.name}* (${chosenOption}) — ₹${variantPrice}\n\nHow many do you want? (Reply with a number)`
      )
      saveSession(buyerPhone, { ...session, selectedVariant: variant })
      return
    }

    // Resolve quantity
    const qty = parseInt(text, 10)
    if (isNaN(qty) || qty < 1 || qty > 20) {
      await sendWhatsApp(buyerPhone, 'Please reply with a valid quantity (1–20).')
      saveSession(buyerPhone, session)
      return
    }

    const itemPrice = session.selectedVariant?.price ?? product.price
    const subtotal = itemPrice * qty
    const deliveryFee = subtotal >= 500 ? 0 : 60
    const total = subtotal + deliveryFee

    const variantLabel = session.selectedVariant ? ` (${session.selectedVariant.option})` : ''
    await sendWhatsApp(buyerPhone,
      `✅ *Order Summary*\n\n` +
      `${product.name}${variantLabel} x${qty} = ₹${subtotal}\n` +
      `Delivery: ${deliveryFee === 0 ? 'FREE 🎉' : `₹${deliveryFee}`}\n` +
      `*Total: ₹${total}*\n\n` +
      `Please share your delivery address:\n` +
      `_Format: Name, Full address, City, Pincode, Phone_`
    )
    saveSession(buyerPhone, { ...session, step: 'address', quantity: qty })
    return
  }

  // STEP: Waiting for address → create order + send payment link
  if (session.step === 'address') {
    await sendWhatsApp(buyerPhone, '⏳ Creating your order...')
    const paymentLink = await createOrderAndPaymentLink(session, text, buyerPhone)

    if (!paymentLink) {
      await sendWhatsApp(buyerPhone, '❌ Something went wrong. Please try again or contact the seller directly.')
      clearSession(buyerPhone)
      return
    }

    await sendWhatsApp(buyerPhone,
      `📦 *Almost done!*\n\nPay here to confirm your order:\n${paymentLink}\n\n_This link expires in 30 minutes._\n\nType *0* to start a new order.`
    )
    saveSession(buyerPhone, { ...session, step: 'payment_sent' })
    return
  }

  // STEP: After payment link sent — wait for new conversation
  if (session.step === 'payment_sent') {
    const products = await fetchProducts(session.storeId)
    await sendWhatsApp(buyerPhone, buildMenuText(session.storeName, products))
    saveSession(buyerPhone, { ...session, step: 'product_selected', products })
  }
}
