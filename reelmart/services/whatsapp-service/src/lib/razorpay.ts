const AUTH = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')

export async function createPaymentLink(orderId: string, amount: number, orderNumber: string, phone: string): Promise<string> {
  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amount * 100,
      currency: 'INR',
      description: `ReelMart Order ${orderNumber}`,
      customer: { contact: phone },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(Date.now() / 1000) + 1800,
      callback_url: `${process.env.PAYMENT_SERVICE_URL}/api/payments/whatsapp-callback?orderId=${orderId}`,
    }),
  })
  const data = await res.json() as any
  return data.short_url ?? data.id
}
