// SMS sender. Currently targets MSG91 (their Supabase-auth-hook integration
// is already configured at the Supabase side; this is the direct path for
// transactional sends that don't go through Supabase Auth).
//
// No-ops cleanly when no auth key is set so the rest of the flow still works
// in dev with placeholder secrets.

const MSG91_BASE = 'https://control.msg91.com/api/v5'
const MSG91_AUTH = process.env.MSG91_AUTH_KEY ?? ''
const MSG91_SENDER = process.env.MSG91_SENDER_ID ?? 'RLMART'
const MSG91_TEMPLATE = process.env.MSG91_TEMPLATE_ID ?? ''
const MSG91_DLT_ENTITY = process.env.MSG91_DLT_ENTITY_ID ?? ''

interface SendArgs {
  phone: string   // E.164, e.g. +919876543210
  message: string // already-rendered template body
  templateVars?: Record<string, string> // only used when a template_id is configured
}

export async function sendSMS({ phone, message, templateVars }: SendArgs): Promise<{ ok: boolean; reason?: string }> {
  if (!MSG91_AUTH) {
    console.log(`[sms:noop] no MSG91_AUTH_KEY; would send to ${phone}: ${message.slice(0, 80)}`)
    return { ok: false, reason: 'no-provider-key' }
  }

  const numericPhone = phone.replace(/\D/g, '')

  // Prefer the DLT flow API when a template_id is configured (required for
  // Indian regulatory compliance). Fall back to message-only mode otherwise.
  if (MSG91_TEMPLATE && templateVars) {
    try {
      const res = await fetch(`${MSG91_BASE}/flow/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: MSG91_AUTH },
        body: JSON.stringify({
          template_id: MSG91_TEMPLATE,
          sender: MSG91_SENDER,
          short_url: '0',
          recipients: [{ mobiles: numericPhone, ...templateVars }],
        }),
      })
      const json = await res.json() as any
      if (json?.type === 'success') return { ok: true }
      return { ok: false, reason: json?.message ?? 'msg91-flow-failed' }
    } catch (err: any) {
      return { ok: false, reason: err?.message ?? 'msg91-flow-error' }
    }
  }

  // Plain transactional send (works for non-DLT countries / dev sandbox).
  try {
    const url = `${MSG91_BASE}/sendsms`
      + `?authkey=${MSG91_AUTH}`
      + `&mobile=${numericPhone}`
      + `&sender=${MSG91_SENDER}`
      + `&message=${encodeURIComponent(message)}`
      + (MSG91_DLT_ENTITY ? `&DLT_TE_ID=${MSG91_DLT_ENTITY}` : '')
    const res = await fetch(url)
    if (res.ok) return { ok: true }
    return { ok: false, reason: `msg91-http-${res.status}` }
  } catch (err: any) {
    return { ok: false, reason: err?.message ?? 'msg91-error' }
  }
}
