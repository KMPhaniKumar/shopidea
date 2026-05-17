// Auth bridge for the MSG91 OTP Widget.
//
// MSG91's widget owns the phone/OTP UX end-to-end and hands the client an
// `accessToken`. This route verifies that token with MSG91 server-side,
// extracts the verified phone, finds-or-creates the corresponding Supabase
// auth user, and returns a real Supabase session the client can drop into
// its supabase-js client via `auth.setSession()`.
//
// Why synthetic email + deterministic password: Supabase Auth doesn't
// expose a "create session for arbitrary user without OTP" admin API.
// The standard workaround is to give each phone-only user a derived
// internal email/password and call `signInWithPassword` server-side. The
// password is HMAC(phone, AUTH_BRIDGE_SECRET) so it's never stored
// outside the auth.users table and is reproducible if a user re-logins.

import { Router } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabase'

export const authRouter = Router()

const MSG91_VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken'
const MSG91_AUTHKEY = process.env.MSG91_WIDGET_AUTHKEY ?? ''
const AUTH_BRIDGE_SECRET = process.env.AUTH_BRIDGE_SECRET ?? ''

function derivePassword(phone: string): string {
  if (!AUTH_BRIDGE_SECRET) throw new Error('AUTH_BRIDGE_SECRET not configured')
  return crypto.createHmac('sha256', AUTH_BRIDGE_SECRET).update(phone).digest('hex')
}

function syntheticEmail(phone: string): string {
  // Drop the '+' to keep email format clean. Domain is intentionally a
  // non-routable .local TLD so nothing tries to deliver mail.
  return `${phone.replace(/\D/g, '')}@reelmart.local`
}

interface Msg91VerifyResponse {
  type?: string
  message?: string
}

async function verifyWithMsg91(accessToken: string): Promise<string> {
  if (!MSG91_AUTHKEY) throw new Error('MSG91_WIDGET_AUTHKEY not configured')
  const res = await fetch(MSG91_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authkey: MSG91_AUTHKEY },
    body: JSON.stringify({ 'access-token': accessToken }),
  })
  const json = (await res.json()) as Msg91VerifyResponse
  if (json.type !== 'success' || !json.message) {
    throw new Error(json.message ?? 'MSG91 verification failed')
  }
  // MSG91 returns the verified identifier (phone with country code, e.g.
  // "919876543210") in `message` on success.
  const raw = json.message.toString()
  return raw.startsWith('+') ? raw : `+${raw}`
}

// POST /api/admin/auth/msg91-exchange — public.
// Body: { accessToken, role? }   role defaults to "buyer"
// Response: { success: true, data: { session: { access_token, refresh_token, expires_in }, userId } }
authRouter.post('/msg91-exchange', async (req, res) => {
  const schema = z.object({
    accessToken: z.string().min(20),
    role: z.enum(['buyer', 'seller', 'admin']).default('buyer'),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.message })
  }

  try {
    const phone = await verifyWithMsg91(parsed.data.accessToken)
    const password = derivePassword(phone)
    const email = syntheticEmail(phone)

    // Look up the user via our app's users table (indexed on phone).
    // If absent, create the auth user via admin API, then mirror into users.
    let { data: existing } = await supabaseAdmin
      .from('users').select('id').eq('phone', phone).maybeSingle()

    if (!existing) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        phone,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { role: parsed.data.role, signup_via: 'msg91-widget' },
      })
      if (error || !data.user) {
        return res.status(500).json({ success: false, error: error?.message ?? 'auth-create-failed' })
      }
      await supabaseAdmin.from('users').upsert({
        id: data.user.id, phone, role: parsed.data.role,
      }, { onConflict: 'id' })
      existing = { id: data.user.id }
    } else {
      // Returning user — re-set the password in case AUTH_BRIDGE_SECRET rotated.
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password })
    }

    // Exchange synthetic credentials for a real Supabase session.
    const { data: signin, error: signinErr } = await supabaseAdmin.auth
      .signInWithPassword({ email, password })

    if (signinErr || !signin.session) {
      return res.status(500).json({ success: false, error: signinErr?.message ?? 'session-mint-failed' })
    }

    res.json({
      success: true,
      data: {
        userId: existing.id,
        session: {
          access_token: signin.session.access_token,
          refresh_token: signin.session.refresh_token,
          expires_in: signin.session.expires_in,
          expires_at: signin.session.expires_at,
          token_type: signin.session.token_type,
        },
      },
    })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message ?? 'exchange-failed' })
  }
})
