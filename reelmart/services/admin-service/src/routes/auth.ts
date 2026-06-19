// Auth bridge for the MSG91 OTP Widget AND the MSG91 OTP REST API.
//
// MSG91's widget owns the phone/OTP UX end-to-end and hands the client an
// `accessToken`. This route verifies that token with MSG91 server-side,
// extracts the verified phone, finds-or-creates the corresponding Supabase
// auth user, and returns a real Supabase session the client can drop into
// its supabase-js client via `auth.setSession()`.
//
// For mobile (buyer-app) that cannot run the browser widget, two additional
// REST endpoints are exposed: POST /otp/send and POST /otp/verify. These
// call MSG91's v5 OTP API directly and then delegate to the same shared
// mintSessionForPhone() helper used by /msg91-exchange, so all session and
// user-creation logic stays in one place.
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

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const MSG91_VERIFY_URL = 'https://control.msg91.com/api/v5/widget/verifyAccessToken'
const MSG91_OTP_SEND_URL = 'https://control.msg91.com/api/v5/otp'
const MSG91_OTP_VERIFY_URL = 'https://control.msg91.com/api/v5/otp/verify'

// MSG91_WIDGET_AUTHKEY is the account-level authkey shared by the widget
// verification call AND the v5 OTP REST API.
const MSG91_AUTHKEY = process.env.MSG91_WIDGET_AUTHKEY ?? ''
const MSG91_OTP_TEMPLATE_ID = process.env.MSG91_OTP_TEMPLATE_ID ?? ''
const AUTH_BRIDGE_SECRET = process.env.AUTH_BRIDGE_SECRET ?? ''

// Server-side origin allow-list — defence in depth on top of the Express
// cors() middleware (which the browser enforces, but curl/Postman bypass).
// MSG91 themselves don't whitelist by domain on this account, so this is
// our gate against random servers calling the bridge with stolen tokens.
//
// The REST OTP endpoints (/otp/send, /otp/verify) are NOT origin-gated
// because mobile React Native fetches do not send an Origin header. They
// are protected by rate limiting instead.
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

// ---------------------------------------------------------------------------
// Crypto helpers (shared between widget and REST OTP flows)
// ---------------------------------------------------------------------------

function derivePassword(phone: string): string {
  if (!AUTH_BRIDGE_SECRET) throw new Error('AUTH_BRIDGE_SECRET not configured')
  return crypto.createHmac('sha256', AUTH_BRIDGE_SECRET).update(phone).digest('hex')
}

function syntheticEmail(phone: string): string {
  // Drop the '+' to keep email format clean. Domain is intentionally a
  // non-routable .local TLD so nothing tries to deliver mail.
  return `${phone.replace(/\D/g, '')}@reelmart.local`
}

// Normalise any phone representation to "+91XXXXXXXXXX" (the form stored in
// public.users.phone). Accepts "+91XXXXXXXXXX", "91XXXXXXXXXX", "XXXXXXXXXX".
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  const last10 = digits.slice(-10)
  return `+91${last10}`
}

// MSG91 v5 OTP API expects the mobile field as "91XXXXXXXXXX" (no '+').
function msg91Mobile(phone: string): string {
  // phone is already in "+91XXXXXXXXXX" form from normalisePhone().
  return phone.replace(/^\+/, '')
}

// ---------------------------------------------------------------------------
// MSG91 widget verification (used by /msg91-exchange)
// ---------------------------------------------------------------------------

interface Msg91VerifyResponse {
  type?: string
  message?: string
}

async function verifyWithMsg91(accessToken: string): Promise<string> {
  if (!MSG91_AUTHKEY) throw new Error('MSG91_WIDGET_AUTHKEY not configured')
  // MSG91's verifyAccessToken expects the authkey in the BODY (not a header),
  // per their docs. We also keep it in the header as a harmless fallback.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(MSG91_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', authkey: MSG91_AUTHKEY },
      body: JSON.stringify({ authkey: MSG91_AUTHKEY, 'access-token': accessToken }),
      signal: controller.signal,
    })
    const json = (await res.json()) as Msg91VerifyResponse
    if (json.type !== 'success' || !json.message) {
      throw new Error(json.message ?? 'MSG91 verification failed')
    }
    // MSG91 returns the verified identifier (phone with country code, e.g.
    // "919876543210") in `message` on success.
    const raw = json.message.toString()
    return raw.startsWith('+') ? raw : `+${raw}`
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// MSG91 v5 OTP REST helpers (used by /otp/send and /otp/verify)
// ---------------------------------------------------------------------------

/** Returns true only when both required env vars are present. */
function isOtpConfigured(): boolean {
  return Boolean(MSG91_AUTHKEY && MSG91_OTP_TEMPLATE_ID)
}

interface Msg91OtpSendResponse {
  type?: string
  request_id?: string
  message?: string
}

/** Sends an OTP to the given normalised phone via MSG91 v5. Throws on network/API error. */
async function sendOtpViaMsg91(phone: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(MSG91_OTP_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // authkey goes in the header per MSG91 v5 OTP docs.
        authkey: MSG91_AUTHKEY,
      },
      body: JSON.stringify({
        template_id: MSG91_OTP_TEMPLATE_ID,
        mobile: msg91Mobile(phone),
        otp_length: 6,
        otp_expiry: 10,
      }),
      signal: controller.signal,
    })
    const json = (await res.json()) as Msg91OtpSendResponse
    if (json.type !== 'success') {
      // Expose a safe message — never surface the authkey.
      throw new Error(json.message ?? 'OTP send failed')
    }
  } finally {
    clearTimeout(timer)
  }
}

interface Msg91OtpVerifyResponse {
  type?: string
  message?: string
}

/**
 * Verifies an OTP via MSG91 v5.
 * Returns true on success, false when the OTP is wrong/expired.
 * Throws on network errors (caller should return 502).
 */
async function verifyOtpViaMsg91(phone: string, otp: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const params = new URLSearchParams({ otp, mobile: msg91Mobile(phone) })
    const res = await fetch(`${MSG91_OTP_VERIFY_URL}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        authkey: MSG91_AUTHKEY,
      },
      signal: controller.signal,
    })
    const json = (await res.json()) as Msg91OtpVerifyResponse
    // MSG91 returns type:"success" + message:"OTP verified success" on a good OTP.
    // Any other response (wrong OTP, expired, already verified) is a verification
    // failure — return false so the caller can send a 401.
    return json.type === 'success'
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// In-memory OTP send rate limiter
// ---------------------------------------------------------------------------
// Keyed by normalised phone (+91XXXXXXXXXX).
// State resets on redeploy, which is acceptable for a single-task container.

interface RateLimitEntry {
  count: number          // sends in the current 15-min window
  windowStart: number    // epoch ms when the window opened
  lastSent: number       // epoch ms of the most recent send
}

const otpRateMap = new Map<string, RateLimitEntry>()

const OTP_WINDOW_MS = 15 * 60 * 1_000   // 15 minutes
const OTP_MAX_PER_WINDOW = 5
const OTP_MIN_GAP_MS = 30 * 1_000       // 30 seconds between sends

/**
 * Returns false if the phone is within rate limits and the send should proceed,
 * or true if the phone is rate-limited (caller should return 429).
 * Side-effect: updates the rate-limit entry on a permitted send.
 */
function isRateLimited(phone: string): boolean {
  const now = Date.now()
  const entry = otpRateMap.get(phone)

  if (!entry) {
    // First send ever for this phone.
    otpRateMap.set(phone, { count: 1, windowStart: now, lastSent: now })
    return false
  }

  // Reset window if it has expired.
  if (now - entry.windowStart >= OTP_WINDOW_MS) {
    otpRateMap.set(phone, { count: 1, windowStart: now, lastSent: now })
    return false
  }

  // Enforce minimum gap between sends.
  if (now - entry.lastSent < OTP_MIN_GAP_MS) {
    return true
  }

  // Enforce max sends per window.
  if (entry.count >= OTP_MAX_PER_WINDOW) {
    return true
  }

  // Permitted — increment counter.
  entry.count += 1
  entry.lastSent = now
  return false
}

// ---------------------------------------------------------------------------
// Shared session-minting helper — reused by both /msg91-exchange and /otp/verify
// ---------------------------------------------------------------------------

interface MintedSession {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number | undefined
  token_type: string
}

interface MintSessionResult {
  userId: string
  session: MintedSession
}

/**
 * Finds-or-creates a Supabase auth user for `phone`, mirrors into public.users,
 * and returns a signed Supabase session. This is the canonical post-verification
 * path shared between the MSG91 widget exchange and the REST OTP verify flows.
 *
 * @param phone          Normalised phone in "+91XXXXXXXXXX" form.
 * @param role           User role to assign on creation.
 * @param createIfMissing When false, an unknown phone returns NOT_REGISTERED.
 */
async function mintSessionForPhone(
  phone: string,
  role: string,
  createIfMissing: boolean,
): Promise<MintSessionResult> {
  const password = derivePassword(phone)
  const email = syntheticEmail(phone)

  // Look up the user via our app's users table (indexed on phone).
  // If absent, create the auth user via admin API, then mirror into users.
  let { data: existing } = await supabaseAdmin
    .from('users').select('id').eq('phone', phone).maybeSingle()

  if (!existing && !createIfMissing) {
    const err = new Error('NOT_REGISTERED') as Error & { code: string }
    err.code = 'NOT_REGISTERED'
    throw err
  }

  if (!existing) {
    // Attempt to create a new auth.users record.
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { role, signup_via: 'msg91-otp' },
    })

    if (createError || !created.user) {
      // Detect the split-brain case: public.users is empty but auth.users
      // already has a row for this phone (e.g. after a public.users truncation).
      // Supabase returns HTTP 422 with a message containing one of these strings.
      const msg = (createError?.message ?? '').toLowerCase()
      const isAlreadyExists =
        msg.includes('phone_exists') ||
        msg.includes('email_exists') ||
        msg.includes('already been registered') ||
        msg.includes('already registered') ||
        msg.includes('already exists')

      if (!isAlreadyExists) {
        // Genuine creation failure — don't swallow it.
        const err = new Error(createError?.message ?? 'auth-create-failed') as Error & { code: string }
        err.code = 'AUTH_CREATE_FAILED'
        throw err
      }

      // --- Self-heal: find the orphan auth.users record by phone ---
      // Supabase has no get-by-phone admin API, so we page through listUsers.
      // Normalize to digits-only for a robust match (stored phone may be
      // "+91XXXXXXXXXX", "91XXXXXXXXXX", or "XXXXXXXXXX").
      const phoneDigits = phone.replace(/\D/g, '')

      let orphanId: string | null = null
      let page = 1
      const perPage = 1000
      while (orphanId === null) {
        const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        })
        if (listError) {
          const err = new Error('auth-relink-list-failed') as Error & { code: string }
          err.code = 'AUTH_RELINK_FAILED'
          throw err
        }
        for (const u of listData.users) {
          const storedDigits = (u.phone ?? '').replace(/\D/g, '')
          // Match by phone digits (last-10 suffix covers +91 vs bare 10-digit).
          if (
            storedDigits === phoneDigits ||
            storedDigits.endsWith(phoneDigits.slice(-10))
          ) {
            orphanId = u.id
            break
          }
        }
        // Stop if we've seen all users or found a match.
        if (orphanId !== null || listData.users.length < perPage) break
        page++
      }

      if (!orphanId) {
        // Truly unresolvable — the error wasn't a simple phone collision.
        const err = new Error('auth-create-failed') as Error & { code: string }
        err.code = 'AUTH_CONFLICT_UNRESOLVABLE'
        throw err
      }

      // Re-link: normalize the orphan's email + password so signInWithPassword
      // will succeed. Also re-confirm both identifiers.
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(orphanId, {
        email,
        password,
        email_confirm: true,
        phone_confirm: true,
      })
      if (updateError) {
        const err = new Error('auth-relink-update-failed') as Error & { code: string }
        err.code = 'AUTH_RELINK_FAILED'
        throw err
      }

      // Re-mirror into public.users so it's no longer orphaned.
      // phone_verified=true: MSG91 has already verified the phone before we
      // reach this point; the service role bypasses the column-grant restriction.
      await supabaseAdmin.from('users').upsert({
        id: orphanId, phone, role, phone_verified: true,
      }, { onConflict: 'id' })

      existing = { id: orphanId }
    } else {
      // Happy path: new user created successfully.
      // phone_verified=true: MSG91 has already verified the phone before we
      // reach this point; the service role bypasses the column-grant restriction.
      await supabaseAdmin.from('users').upsert({
        id: created.user.id, phone, role, phone_verified: true,
      }, { onConflict: 'id' })
      existing = { id: created.user.id }
    }
  } else {
    // Returning user — re-set the password in case AUTH_BRIDGE_SECRET rotated.
    await supabaseAdmin.auth.admin.updateUserById(existing.id, { password })
  }

  // Exchange synthetic credentials for a real Supabase session.
  const { data: signin, error: signinErr } = await supabaseAdmin.auth
    .signInWithPassword({ email, password })

  if (signinErr || !signin.session) {
    const err = new Error(signinErr?.message ?? 'session-mint-failed') as Error & { code: string }
    err.code = 'SESSION_MINT_FAILED'
    throw err
  }

  return {
    userId: (existing as { id: string }).id,
    session: {
      access_token: signin.session.access_token,
      refresh_token: signin.session.refresh_token,
      expires_in: signin.session.expires_in,
      expires_at: signin.session.expires_at,
      token_type: signin.session.token_type,
    },
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/auth/msg91-exchange — public-but-origin-gated.
// Body: { accessToken, role? }   role defaults to "buyer"
// Response: { success: true, data: { session: { access_token, refresh_token, expires_in }, userId } }
// ---------------------------------------------------------------------------
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

    if (!parsed.data.createIfMissing) {
      // Check registration before calling mintSessionForPhone so we can
      // return the correct HTTP status without relying on thrown error codes.
      const { data: existing } = await supabaseAdmin
        .from('users').select('id').eq('phone', phone).maybeSingle()
      if (!existing) {
        return res.status(404).json({
          success: false,
          code: 'NOT_REGISTERED',
          error: 'This number is not registered. Please sign up.',
        })
      }
    }

    const r = await mintSessionForPhone(phone, parsed.data.role, parsed.data.createIfMissing)

    res.json({ success: true, data: { userId: r.userId, session: r.session } })
  } catch (err: unknown) {
    const e = err as Error & { code?: string }
    if (e.code === 'NOT_REGISTERED') {
      return res.status(404).json({ success: false, code: 'NOT_REGISTERED', error: e.message })
    }
    if (e.code === 'AUTH_CONFLICT_UNRESOLVABLE') {
      return res.status(500).json({ success: false, error: 'auth-create-failed', code: 'AUTH_CONFLICT_UNRESOLVABLE' })
    }
    res.status(500).json({ success: false, error: e.message ?? 'exchange-failed' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/admin/auth/check-phone — origin-gated. Tells the seller login UI
// whether a number is already registered, so it can show "please sign up"
// before sending an OTP (rather than after). Returns only a boolean — no
// account details — to limit enumeration value.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /api/admin/auth/otp/send — NOT origin-gated (mobile has no Origin).
// Rate-limited: max 5 sends / 15 min, 30 s minimum gap between sends.
// Body: { phone: string }
// Response: { success: true } | { success: false, code, error? }
// ---------------------------------------------------------------------------

const phoneSchema = z.object({
  phone: z.string().min(10).max(15).refine(
    v => /^\+?91\d{10}$|^\d{10}$/.test(v.replace(/\s/g, '')),
    { message: 'phone must be +91XXXXXXXXXX or a 10-digit number' },
  ),
})

authRouter.post('/otp/send', async (req, res) => {
  const parsed = phoneSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid phone' })
  }

  if (!isOtpConfigured()) {
    return res.status(503).json({ success: false, code: 'OTP_NOT_CONFIGURED', error: 'OTP service is not configured' })
  }

  const phone = normalisePhone(parsed.data.phone)

  if (isRateLimited(phone)) {
    return res.status(429).json({ success: false, code: 'RATE_LIMITED', error: 'Too many OTP requests. Please wait before trying again.' })
  }

  try {
    await sendOtpViaMsg91(phone)
    return res.json({ success: true })
  } catch (err: unknown) {
    const e = err as Error
    // Never surface the authkey or internal details in the error message.
    return res.status(502).json({ success: false, code: 'OTP_SEND_FAILED', error: e.message ?? 'Failed to send OTP' })
  }
})

// ---------------------------------------------------------------------------
// POST /api/admin/auth/otp/verify — NOT origin-gated (mobile has no Origin).
// Body: { phone: string, otp: string, role?: 'buyer'|'seller'|'admin' }
// Response: { success: true, data: { userId, session } } | { success: false, code, error }
// ---------------------------------------------------------------------------

authRouter.post('/otp/verify', async (req, res) => {
  const schema = z.object({
    phone: z.string().min(10).max(15).refine(
      v => /^\+?91\d{10}$|^\d{10}$/.test(v.replace(/\s/g, '')),
      { message: 'phone must be +91XXXXXXXXXX or a 10-digit number' },
    ),
    otp: z.string().regex(/^\d{6}$/, { message: 'otp must be exactly 6 digits' }),
    role: z.enum(['buyer', 'seller', 'admin']).default('buyer'),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message ?? 'Invalid input' })
  }

  if (!isOtpConfigured()) {
    return res.status(503).json({ success: false, code: 'OTP_NOT_CONFIGURED', error: 'OTP service is not configured' })
  }

  const phone = normalisePhone(parsed.data.phone)
  const { otp, role } = parsed.data

  try {
    const valid = await verifyOtpViaMsg91(phone, otp)
    if (!valid) {
      return res.status(401).json({
        success: false,
        code: 'OTP_INVALID',
        error: 'Incorrect or expired OTP',
      })
    }
  } catch (err: unknown) {
    const e = err as Error
    return res.status(502).json({ success: false, code: 'OTP_VERIFY_FAILED', error: e.message ?? 'Failed to verify OTP' })
  }

  // OTP is valid — mint a Supabase session. createIfMissing=true so mobile
  // buyers are auto-registered on their first login, matching the prior
  // Supabase signInWithOtp behavior.
  try {
    const r = await mintSessionForPhone(phone, role, true)
    return res.json({
      success: true,
      data: {
        userId: r.userId,
        session: r.session,
      },
    })
  } catch (err: unknown) {
    const e = err as Error & { code?: string }
    if (e.code === 'AUTH_CONFLICT_UNRESOLVABLE') {
      return res.status(500).json({ success: false, code: 'AUTH_CONFLICT_UNRESOLVABLE', error: 'auth-create-failed' })
    }
    if (e.code === 'AUTH_RELINK_FAILED') {
      return res.status(500).json({ success: false, code: 'AUTH_RELINK_FAILED', error: e.message })
    }
    return res.status(500).json({ success: false, error: e.message ?? 'session-mint-failed' })
  }
})

// NOTE: the OTP-less /test-login route was removed (security: it could mint an
// admin session to anyone reaching the dev API). Use real MSG91 OTP login.
