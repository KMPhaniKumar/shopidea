import { supabaseAdmin } from '../lib/supabase'
import { sendWhatsApp } from '../lib/gupshup'
import { createPaymentLink } from '../lib/razorpay'
import { getSession, setSession, clearSession, BotSession } from './session'

export async function handleBotMessage(phone: string, message: string, storeSlug: string) {
  const msg = message.trim()
  let session = getSession(phone)

  if (!session || session.storeSlug !== storeSlug) {
    const { data: store } = await supabaseAdmin.from('stores').select('id, store_name').eq('store_slug', storeSlug).single()
    if (!store) return
    session = { storeSlug, storeId: store.id, storeName: store.store_name, step: 'menu' }
  }

  if (['hi', '0', 'menu'].includes(msg.toLowerCase())) session.step = 'menu'

  switch (session.step) {
    case 'menu': {
      const { data: products } = await supabaseAdmin
        .from('products').select('id, name, price').eq('store_id', session.storeId).eq('is_available', true).limit(10)
      const menu = (products ?? []).map((p, i) => `${i + 1}. ${p.name} — ₹${p.price}`).join('\n')
      await sendWhatsApp(phone, `👋 Welcome to *${session.storeName}*!\n\nHere's what we have:\n\n${menu}\n\n_Reply with a number to order_\n_Reply 0 for menu_`)
      session.products = products ?? []
      session.step = 'qty'
      break
    }
    case 'qty': {
      const product = session.products?.[parseInt(msg) - 1]
      if (!product) { await sendWhatsApp(phone, '❓ Please reply with a valid number from the menu.'); break }
      session.selectedProduct = product
      await sendWhatsApp(phone, `*${product.name}* — ₹${product.price}\n\nHow many would you like? (Reply with number)`)
      session.step = 'address'
      break
    }
    case 'address': {
      const qty = parseInt(msg)
      if (isNaN(qty) || qty < 1) { await sendWhatsApp(phone, '❓ Please reply with a valid quantity (e.g. 1, 2, 3)'); break }
      session.quantity = qty
      await sendWhatsApp(phone, `✅ *${session.selectedProduct.name} x${qty}*\n\nPlease share your delivery address:\n\nFormat: Name, Full Address, City, Pincode`)
      session.step = 'done'
      break
    }
    case 'done': {
      const product = session.selectedProduct!
      const qty = session.quantity!
      const total = product.price * qty + 60

      const { data: order } = await supabaseAdmin.from('orders').insert({
        store_id: session.storeId,
        order_number: `RM${Date.now().toString(36).toUpperCase()}`,
        items: [{ productId: product.id, name: product.name, price: product.price, qty }],
        subtotal: product.price * qty,
        delivery_fee: 60,
        total_amount: total,
        delivery_address: { raw: msg, phone },
        status: 'pending',
        payment_status: 'pending',
      }).select('id, order_number').single()

      if (!order) { await sendWhatsApp(phone, '❌ Something went wrong. Please try again.'); clearSession(phone); break }

      const paymentLink = await createPaymentLink(order.id, total, order.order_number, phone)
      await sendWhatsApp(phone, `📦 *Order Summary*\n\n${product.name} x${qty} = ₹${product.price * qty}\nDelivery = ₹60\n*Total = ₹${total}*\n\n💳 Pay to confirm:\n${paymentLink}\n\n_Link expires in 30 minutes_`)
      clearSession(phone)
      break
    }
  }

  setSession(phone, session)
}
