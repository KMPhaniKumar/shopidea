import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function request<T = any>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken()
  const baseHeaders: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) (baseHeaders as any)['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...baseHeaders, ...(options?.headers ?? {}) },
  })

  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? `Request failed: ${path}`)
  return json.data as T
}

export const api = {
  get:  <T = any>(path: string) =>
    request<T>(path, { method: 'GET' }),
  post: <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put:  <T = any>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del:  <T = any>(path: string) =>
    request<T>(path, { method: 'DELETE' }),
}

export async function registerFcmToken(userId: string, token: string, platform: 'ios' | 'android') {
  try {
    await fetch(`${API_URL}/api/notifications/register-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, token, platform }),
    })
  } catch {
    // fire-and-forget — non-critical
  }
}
