export interface BotSession {
  storeSlug: string
  storeId: string
  storeName: string
  step: 'menu' | 'qty' | 'address' | 'done'
  products?: any[]
  selectedProduct?: any
  quantity?: number
}

const sessions = new Map<string, { session: BotSession; expiresAt: number }>()
const TTL_MS = 30 * 60 * 1000

export function getSession(phone: string): BotSession | null {
  const entry = sessions.get(phone)
  if (!entry || Date.now() > entry.expiresAt) { sessions.delete(phone); return null }
  return entry.session
}

export function setSession(phone: string, session: BotSession) {
  sessions.set(phone, { session, expiresAt: Date.now() + TTL_MS })
}

export function clearSession(phone: string) {
  sessions.delete(phone)
}
