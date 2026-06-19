import { create } from 'zustand'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { registerFcmToken } from '../lib/api'
import { mergeGuestAddressesIntoAccount } from '../lib/savedAddresses'
import type { Database } from '../types/supabase'

type UserProfile = Database['public']['Tables']['users']['Row']

interface AuthState {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  sendOTP: (phone: string) => Promise<{ error: string | null }>
  verifyOTP: (phone: string, token: string) => Promise<{ error: string | null; isNewUser: boolean }>
  updateProfile: (data: Partial<Pick<UserProfile, 'name' | 'role'>>) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  initialize: () => () => void
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('91') ? `+${digits}` : `+91${digits}`
}

const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

const OTP_SEND_URL = `${API_BASE}/api/admin/auth/otp/send`
const OTP_VERIFY_URL = `${API_BASE}/api/admin/auth/otp/verify`

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  loading: true,

  initialize: () => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      set({ session, loading: false })
      if (session?.user) await fetchProfile(session.user.id, set)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session })
      if (session?.user) {
        await fetchProfile(session.user.id, set)
        if (event === 'SIGNED_IN') {
          tryRegisterFcmToken(session.user.id)
          mergeGuestAddressesIntoAccount().catch(() => {})
        }
      } else {
        set({ profile: null })
      }
    })

    return () => subscription.unsubscribe()
  },

  sendOTP: async (phone) => {
    const formatted = formatPhone(phone)
    try {
      const res = await fetch(OTP_SEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted }),
      })
      const json = await res.json()
      if (json.success) return { error: null }
      const code: string = json.code ?? ''
      if (code === 'OTP_NOT_CONFIGURED') return { error: 'OTP service is not available right now' }
      if (code === 'RATE_LIMITED') return { error: 'Too many attempts — please wait a minute' }
      return { error: json.error ?? "Couldn't send OTP" }
    } catch {
      return { error: "Couldn't send OTP" }
    }
  },

  verifyOTP: async (phone, token) => {
    const formatted = formatPhone(phone)
    try {
      const res = await fetch(OTP_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formatted, otp: token, role: 'buyer' }),
      })
      const json = await res.json()
      if (!json.success) {
        const code: string = json.code ?? ''
        if (code === 'OTP_INVALID') return { error: 'Incorrect or expired OTP', isNewUser: false }
        return { error: json.error ?? 'OTP verification failed', isNewUser: false }
      }
      const session: { access_token: string; refresh_token: string } = json.data.session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      })
      if (sessionError) return { error: 'Could not start session', isNewUser: false }
      const { data: profile } = await supabase
        .from('users')
        .select('name')
        .eq('id', json.data.userId)
        .maybeSingle()
      return { error: null, isNewUser: !profile?.name }
    } catch {
      return { error: 'OTP verification failed', isNewUser: false }
    }
  },

  updateProfile: async (data) => {
    const { session } = get()
    if (!session?.user) return { error: 'Not logged in' }
    const { error } = await supabase
      .from('users')
      .update(data)
      .eq('id', session.user.id)
    if (!error) {
      set(state => ({ profile: state.profile ? { ...state.profile, ...data } : null }))
    }
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },
}))

async function fetchProfile(userId: string, set: (partial: Partial<AuthState>) => void) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  set({ profile: data ?? null })
}

async function tryRegisterFcmToken(userId: string) {
  try {
    // expo-notifications must be installed for push to work
    const Notifications = require('expo-notifications')
    const { Platform } = require('react-native')
    const { status } = await Notifications.requestPermissionsAsync()
    if (status !== 'granted') return
    const { data: token } = await Notifications.getExpoPushTokenAsync()
    if (token) {
      await registerFcmToken(userId, token, Platform.OS === 'ios' ? 'ios' : 'android')
    }
  } catch {
    // expo-notifications not installed or permissions denied — skip silently
  }
}
