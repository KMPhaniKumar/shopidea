// Supabase Send SMS Hook → MSG91 OTP API
// Configured at: Supabase Dashboard → Auth → Hooks → "Send SMS Hook"

const MSG91_AUTH_KEY    = Deno.env.get('MSG91_AUTH_KEY')!
const MSG91_TEMPLATE_ID = Deno.env.get('MSG91_TEMPLATE_ID')!
const MSG91_SENDER_ID   = Deno.env.get('MSG91_SENDER_ID') ?? 'MSGIND'
const HOOK_SECRET       = Deno.env.get('SMS_HOOK_SECRET') ?? ''

interface HookPayload {
  user: { id: string; phone?: string }
  sms: { otp: string; phone: string }
}

Deno.serve(async (req) => {
  // Verify Supabase signed the request
  if (HOOK_SECRET) {
    const sig = req.headers.get('webhook-signature') ?? ''
    if (!sig.includes(HOOK_SECRET)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
    }
  }

  let payload: HookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 })
  }

  const { sms } = payload
  if (!sms?.phone || !sms?.otp) {
    return new Response(JSON.stringify({ error: 'missing phone/otp' }), { status: 400 })
  }

  // MSG91 expects mobile in 91XXXXXXXXXX (no '+')
  const mobile = sms.phone.replace(/^\+/, '')

  // MSG91 OTP API: https://control.msg91.com/api/v5/otp
  const url = new URL('https://control.msg91.com/api/v5/otp')
  url.searchParams.set('template_id', MSG91_TEMPLATE_ID)
  url.searchParams.set('mobile', mobile)
  url.searchParams.set('authkey', MSG91_AUTH_KEY)
  url.searchParams.set('otp', sms.otp)
  url.searchParams.set('sender', MSG91_SENDER_ID)
  url.searchParams.set('otp_expiry', '10') // minutes

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'authkey': MSG91_AUTH_KEY },
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok || body?.type === 'error') {
    console.error('MSG91 send failed', { status: res.status, body, mobile })
    return new Response(JSON.stringify({ error: body?.message ?? 'msg91 failed' }), { status: 502 })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
