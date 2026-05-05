import axios from 'axios'

const GUPSHUP_API = 'https://api.gupshup.io/sm/api/v1/msg'

export async function sendWhatsApp(to: string, message: string): Promise<void> {
  const phone = to.startsWith('+') ? to.slice(1) : to
  await axios.post(
    GUPSHUP_API,
    new URLSearchParams({
      channel: 'whatsapp',
      source: process.env.GUPSHUP_SOURCE_NUMBER!,
      destination: phone,
      message: JSON.stringify({ type: 'text', text: message }),
      'src.name': process.env.GUPSHUP_APP_NAME!,
    }),
    {
      headers: {
        apikey: process.env.GUPSHUP_API_KEY!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  )
}

export function buildNewOrderMessage(orderNumber: string, buyerName: string, amount: number): string {
  return `🛍️ New Order!\n\nOrder: ${orderNumber}\nFrom: ${buyerName}\nAmount: ₹${amount}\n\nOpen the app to accept or reject this order.`
}

export function buildOrderConfirmationMessage(orderNumber: string, storeName: string, amount: number): string {
  return `✅ Order Confirmed!\n\nYour order ${orderNumber} from ${storeName} has been placed.\nAmount: ₹${amount}\n\nWe'll update you when the seller accepts your order.`
}

export function buildOrderStatusMessage(orderNumber: string, status: string, extra?: { trackingUrl?: string; rejectionReason?: string }): string {
  const messages: Record<string, string> = {
    accepted: `✅ Your order ${orderNumber} has been accepted and is being prepared!`,
    packed: `📦 Your order ${orderNumber} is packed and ready for pickup.`,
    shipped: `🚚 Your order ${orderNumber} is on the way!${extra?.trackingUrl ? `\n\nTrack here: ${extra.trackingUrl}` : ''}`,
    delivered: `🎉 Your order ${orderNumber} has been delivered. Enjoy your purchase!\n\nLeave a review on ReelMart to earn loyalty coins 🪙`,
    rejected: `❌ Your order ${orderNumber} was not accepted.${extra?.rejectionReason ? `\nReason: ${extra.rejectionReason}` : ''}\n\nYour payment will be refunded in 3–5 business days.`,
  }
  return messages[status] || `Your order ${orderNumber} status: ${status}`
}

// Unified notify object — call from notification route handlers
export const notify = {
  newOrder: (sellerPhone: string, orderNumber: string, buyerName: string, amount: number) =>
    sendWhatsApp(sellerPhone, buildNewOrderMessage(orderNumber, buyerName, amount)).catch(() => {}),

  orderConfirmed: (buyerPhone: string, orderNumber: string, storeName: string, amount: number) =>
    sendWhatsApp(buyerPhone, buildOrderConfirmationMessage(orderNumber, storeName, amount)).catch(() => {}),

  orderStatusChanged: (buyerPhone: string, orderNumber: string, status: string, extra?: { trackingUrl?: string; rejectionReason?: string }) =>
    sendWhatsApp(buyerPhone, buildOrderStatusMessage(orderNumber, status, extra)).catch(() => {}),
}
