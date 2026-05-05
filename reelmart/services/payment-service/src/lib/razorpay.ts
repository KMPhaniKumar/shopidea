import crypto from 'crypto'

const KEY_ID = process.env.RAZORPAY_KEY_ID!
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET!
const AUTH = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')

export async function createRazorpayOrder(amount: number, receipt: string): Promise<any> {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(amount * 100), currency: 'INR', receipt }),
  })
  if (!res.ok) throw new Error(`Razorpay error: ${await res.text()}`)
  return res.json() as Promise<any>
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
  return expected === signature
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex')
  return expected === signature
}

export async function createRefund(paymentId: string, amountPaise: number): Promise<any> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise }),
  })
  if (!res.ok) throw new Error(`Refund error: ${await res.text()}`)
  return res.json() as Promise<any>
}
