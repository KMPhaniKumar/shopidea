// MSG91 OTP Widget integration — "Web SDK for custom UI" mode.
//
// We use the widget's programmatic methods (sendOtp/verifyOtp) rather than
// its built-in modal so our existing OTP screens (phone input + 6-digit
// code) stay visually consistent with the rest of the app.
//
// On a successful OTP verify, the widget hands us an `accessToken`. We
// POST that to our backend bridge (/api/admin/auth/msg91-exchange) which
// verifies it server-side, finds-or-creates the Supabase auth user, and
// returns a real Supabase session. The caller drops that session into
// supabase-js via auth.setSession() so RLS keeps working.

import { createClient } from '@/lib/supabase/client'

const WIDGET_SCRIPT = 'https://verify.msg91.com/otp-provider.js'
const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID ?? ''
const TOKEN_AUTH = process.env.NEXT_PUBLIC_MSG91_TOKEN_AUTH ?? ''
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

declare global {
  interface Window {
    initSendOTP?: (config: any) => void
    sendOtp?: (identifier: string, success: (data: any) => void, failure: (err: any) => void) => void
    verifyOtp?: (otp: string, success: (data: any) => void, failure: (err: any) => void) => void
    retryOtp?: (channel: string | null, success: (data: any) => void, failure: (err: any) => void) => void
  }
}

let scriptPromise: Promise<void> | null = null
let widgetReady = false

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('window not available'))
  if (widgetReady) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    if (!WIDGET_ID || !TOKEN_AUTH) {
      reject(new Error('MSG91 widget not configured (missing env vars)'))
      return
    }
    if (document.querySelector(`script[src="${WIDGET_SCRIPT}"]`)) {
      initWidget().then(resolve, reject)
      return
    }
    const s = document.createElement('script')
    s.src = WIDGET_SCRIPT
    s.async = true
    s.onload = () => initWidget().then(resolve, reject)
    s.onerror = () => reject(new Error('Failed to load MSG91 widget script'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

function initWidget(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window.initSendOTP !== 'function') {
      reject(new Error('MSG91 widget script loaded but initSendOTP missing'))
      return
    }
    // exposeMethods: true gives us window.sendOtp/verifyOtp/retryOtp
    // instead of (or alongside) MSG91's built-in modal. We rely on these.
    window.initSendOTP({
      widgetId: WIDGET_ID,
      tokenAuth: TOKEN_AUTH,
      exposeMethods: true,
      success: () => {}, // unused — we drive the flow manually
      failure: () => {},
    })
    // initSendOTP is synchronous in current SDK but methods may attach a
    // tick later. Defer to the next macrotask.
    setTimeout(() => {
      if (typeof window.sendOtp !== 'function' || typeof window.verifyOtp !== 'function') {
        reject(new Error('MSG91 widget methods not exposed — check widgetId / domain whitelist'))
        return
      }
      widgetReady = true
      resolve()
    }, 50)
  })
}

export async function sendOtp(phoneE164: string): Promise<void> {
  await loadScript()
  // MSG91 wants identifier without '+', e.g. "919876543210"
  const identifier = phoneE164.replace(/^\+/, '')
  return new Promise<void>((resolve, reject) => {
    window.sendOtp!(identifier, () => resolve(), (err) => reject(new Error(extractMsg(err))))
  })
}

export async function verifyOtp(otp: string): Promise<{ accessToken: string }> {
  await loadScript()
  return new Promise((resolve, reject) => {
    window.verifyOtp!(otp, (data: any) => {
      const accessToken = data?.message ?? data?.['access-token'] ?? data?.accessToken
      if (!accessToken) return reject(new Error('MSG91 returned no access token'))
      resolve({ accessToken })
    }, (err) => reject(new Error(extractMsg(err))))
  })
}

export async function resendOtp(): Promise<void> {
  await loadScript()
  return new Promise<void>((resolve, reject) => {
    window.retryOtp!(null, () => resolve(), (err) => reject(new Error(extractMsg(err))))
  })
}

// Bridge MSG91 access token → Supabase session via our backend.
// On success the supabase-js client is signed in and RLS-protected
// queries work immediately.
export async function exchangeForSupabaseSession(
  accessToken: string, role: 'buyer' | 'seller' = 'buyer',
): Promise<{ userId: string }> {
  if (!API_URL) throw new Error('NEXT_PUBLIC_API_URL not configured')
  const res = await fetch(`${API_URL}/api/admin/auth/msg91-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken, role }),
  })
  const json = await res.json()
  if (!json?.success) throw new Error(json?.error ?? 'Auth exchange failed')

  const supabase = createClient()
  const { error } = await supabase.auth.setSession({
    access_token: json.data.session.access_token,
    refresh_token: json.data.session.refresh_token,
  })
  if (error) throw new Error(`Could not set Supabase session: ${error.message}`)
  return { userId: json.data.userId }
}

function extractMsg(err: any): string {
  if (!err) return 'OTP error'
  if (typeof err === 'string') return err
  return err.message ?? err.error ?? JSON.stringify(err)
}
