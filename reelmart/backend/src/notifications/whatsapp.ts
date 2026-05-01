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

export function buildOrderStatusMessage(orderNumber: string, status: string): string {
  const messages: Record<string, string> = {
    accepted: `✅ Your order ${orderNumber} has been accepted and is being prepared!`,
    packed: `📦 Your order ${orderNumber} is packed and ready for pickup.`,
    shipped: `🚚 Your order ${orderNumber} is on the way!`,
    delivered: `🎉 Your order ${orderNumber} has been delivered. Enjoy!`,
    rejected: `❌ Your order ${orderNumber} was rejected. You will receive a full refund.`,
  }
  return messages[status] || `Order ${orderNumber} status: ${status}`
}
