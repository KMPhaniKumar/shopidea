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
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    return { error: error?.message ?? null }
  },

  verifyOTP: async (phone, token) => {
    const formatted = formatPhone(phone)
    const { data, error } = await supabase.auth.verifyOtp({
      phone: formatted,
      token,
      type: 'sms',
    })
    if (error) return { error: error.message, isNewUser: false }
    const { data: profile } = await supabase
      .from('users')
      .select('name')
      .eq('id', data.user!.id)
      .single()
    return { error: null, isNewUser: !profile?.name }
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
