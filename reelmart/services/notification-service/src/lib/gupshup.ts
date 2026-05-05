export async function sendWhatsApp(phone: string, message: string) {
  const params = new URLSearchParams({
    channel: 'whatsapp',
    source: process.env.GUPSHUP_SENDER_NUMBER!,
    destination: phone,
    message: JSON.stringify({ type: 'text', text: message }),
    'src.name': process.env.GUPSHUP_APP_NAME!,
  })
  const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
    method: 'POST',
    headers: { apikey: process.env.GUPSHUP_API_KEY!, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) console.error('Gupshup error:', await res.text())
}
