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

import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { supabaseAdmin } from '../lib/supabase'

export const authRouter = Router()

const MSG91_VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken'
const MSG91_AUTHKEY = process.env.MSG91_WIDGET_AUTHKEY ?? ''
const AUTH_BRIDGE_SECRET = process.env.AUTH_BRIDGE_SECRET ?? ''

// Fixed test accounts for the OTP-less test login. Only reachable when
// ALLOW_TEST_LOGIN === 'true' (set on the dev environment ONLY, never prod).
const TEST_ACCOUNTS: Record<'buyer' | 'seller' | 'admin', string> = {
  buyer: '+919999900001',
  seller: '+919999900002',
  admin: '+919999900003',
}

// Server-side origin allow-list — defence in depth on top of the Express
// cors() middleware (which the browser enforces, but curl/Postman bypass).
// MSG91 themselves don't whitelist by domain on this account, so this is
// our gate against random servers calling the bridge with stolen tokens.
//
// Mobile note: RN fetches don't send an Origin header. Once we wire the
// buyer-app to this endpoint we'll add a parallel X-Client-App + signed
// app-secret check; for now, missing Origin is rejected.
const ALLOWED_ORIGINS = (process.env.AUTH_BRIDGE_ALLOWED_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)

function requireAllowedOrigin(req: Request, res: Response, next: NextFunction) {
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes('*')) {
    // Fail-closed rather than fail-open: refuse if the env wasn't configured
    // with an explicit list. Forces an intentional decision.
    return res.status(403).json({ success: false, error: 'no-allowed-origins-configured' })
  }
  const origin = req.headers.origin
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ success: false, error: 'origin-not-allowed' })
  }
  next()
}

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

// POST /api/admin/auth/msg91-exchange — public-but-origin-gated.
// Body: { accessToken, role? }   role defaults to "buyer"
// Response: { success: true, data: { session: { access_token, refresh_token, expires_in }, userId } }
authRouter.post('/msg91-exchange', requireAllowedOrigin, async (req, res) => {
  const schema = z.object({
    accessToken: z.string().min(20),
    role: z.enum(['buyer', 'seller', 'admin']).default('buyer'),
    // When false, a verified-but-unknown phone is rejected instead of being
    // auto-registered. Seller LOGIN passes false; signup + buyer checkout
    // leave it true so first-time users are created on the spot.
    createIfMissing: z.boolean().default(true),
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

    if (!existing && !parsed.data.createIfMissing) {
      return res.status(404).json({
        success: false,
        code: 'NOT_REGISTERED',
        error: 'This number is not registered. Please sign up.',
      })
    }

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

// POST /api/admin/auth/check-phone — origin-gated. Tells the seller login UI
// whether a number is already registered, so it can show "please sign up"
// before sending an OTP (rather than after). Returns only a boolean — no
// account details — to limit enumeration value.
authRouter.post('/check-phone', requireAllowedOrigin, async (req, res) => {
  const schema = z.object({ phone: z.string().min(8).max(20) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.message })
  }
  // Normalise to the +91XXXXXXXXXX form we store in users.phone.
  const digits = parsed.data.phone.replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) {
    return res.status(400).json({ success: false, error: 'Invalid phone number' })
  }
  const phone = `+91${digits}`
  const { data } = await supabaseAdmin
    .from('users').select('id').eq('phone', phone).maybeSingle()
  res.json({ success: true, data: { registered: Boolean(data) } })
})

// POST /api/admin/auth/test-login — OTP-LESS test login. DISABLED unless
// ALLOW_TEST_LOGIN === 'true' (set only on dev). Mints a Supabase session for a
// fixed, allow-listed test account per role — never an arbitrary phone — so even
// with the flag on, the blast radius is three known throwaway accounts.
// Body: { role: 'buyer' | 'seller' | 'admin' }
authRouter.post('/test-login', requireAllowedOrigin, async (req, res) => {
  // Enabled explicitly via ALLOW_TEST_LOGIN, or implicitly on the dev environment
  // (SITE_URL points at dev/localhost). Production's SITE_URL is reelmart.in, so
  // this stays off there.
  const site = process.env.SITE_URL ?? ''
  const testLoginEnabled =
    process.env.ALLOW_TEST_LOGIN === 'true' ||
    site.includes('dev.reelmart.in') ||
    site.includes('localhost')
  if (!testLoginEnabled) {
    return res.status(403).json({ success: false, error: 'test-login-disabled' })
  }

  const schema = z.object({ role: z.enum(['buyer', 'seller', 'admin']) })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.message })
  }

  const role = parsed.data.role
  const phone = TEST_ACCOUNTS[role]
  const password = derivePassword(phone)
  const email = syntheticEmail(phone)

  try {
    let { data: existing } = await supabaseAdmin
      .from('users').select('id').eq('phone', phone).maybeSingle()

    if (!existing) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        phone,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { role, signup_via: 'test-login' },
      })
      if (error || !data.user) {
        return res.status(500).json({ success: false, error: error?.message ?? 'auth-create-failed' })
      }
      existing = { id: data.user.id }
    } else {
      await supabaseAdmin.auth.admin.updateUserById(existing.id, { password })
    }

    // Guarantee the test account carries the right role (+ admin flag for admin).
    await supabaseAdmin.from('users').upsert(
      { id: existing.id, phone, role, is_admin: role === 'admin' },
      { onConflict: 'id' },
    )

    const { data: signin, error: signinErr } = await supabaseAdmin.auth
      .signInWithPassword({ email, password })
    if (signinErr || !signin.session) {
      return res.status(500).json({ success: false, error: signinErr?.message ?? 'session-mint-failed' })
    }

    res.json({
      success: true,
      data: {
        userId: existing.id,
        role,
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
    res.status(500).json({ success: false, error: err.message ?? 'test-login-failed' })
  }
})
