/**
 * notification-service — Vitest + Supertest suite
 *
 * Provider contracts mocked:
 *   - lib/supabase   → mock supabaseAdmin (DB queries + auth.getUser)
 *   - lib/gupshup    → mock sendWhatsApp  (captured in waCallLog)
 *   - lib/fcm        → mock sendPush      (captured in pushCallLog)
 *   - lib/sms        → mock sendSMS       (captured in smsCallLog)
 *
 * No real network calls are made.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { notificationsRouter } from '../src/routes/notifications'

// ---------------------------------------------------------------------------
// Capture arrays — reset before each test
// ---------------------------------------------------------------------------
type WaCall  = { phone: string; message: string }
type PushCall = { token: string; title: string; body: string; data?: Record<string, string> }
type SmsCall  = { phone: string; message: string }

const waCallLog:   WaCall[]   = []
const pushCallLog: PushCall[] = []
const smsCallLog:  SmsCall[]  = []

// ---------------------------------------------------------------------------
// Mock lib/gupshup
// ---------------------------------------------------------------------------
vi.mock('../src/lib/gupshup', () => ({
  sendWhatsApp: vi.fn(async (phone: string, message: string) => {
    waCallLog.push({ phone, message })
  }),
}))

// ---------------------------------------------------------------------------
// Mock lib/fcm
// ---------------------------------------------------------------------------
vi.mock('../src/lib/fcm', () => ({
  sendPush: vi.fn(async (token: string, title: string, body: string, data?: Record<string, string>) => {
    pushCallLog.push({ token, title, body, data })
  }),
}))

// ---------------------------------------------------------------------------
// Mock lib/sms
// ---------------------------------------------------------------------------
vi.mock('../src/lib/sms', () => ({
  sendSMS: vi.fn(async ({ phone, message }: { phone: string; message: string }) => {
    smsCallLog.push({ phone, message })
    return { ok: true }
  }),
}))

// ---------------------------------------------------------------------------
// Supabase mock state — tests mutate this to shape the DB response
// ---------------------------------------------------------------------------
interface MockState {
  authUser: { id: string } | null
  authError: boolean
  order: Record<string, any> | null
  orderError: boolean
  fcmTokens: Array<{ token: string }>
  store: Record<string, any> | null
  storeError: boolean
}

const mockState: MockState = {
  authUser: null,
  authError: false,
  order: null,
  orderError: false,
  fcmTokens: [],
  store: null,
  storeError: false,
}

// Minimal supabaseAdmin builder — implements the chained API that routes/notifications.ts uses.
function buildSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn(async () => {
        if (mockState.authError) return { data: { user: null }, error: new Error('invalid') }
        return { data: { user: mockState.authUser }, error: mockState.authUser ? null : new Error('no user') }
      }),
    },
    from: vi.fn((table: string) => {
      // fcm_tokens table
      if (table === 'fcm_tokens') {
        return {
          upsert: vi.fn(async () => ({ error: null })),
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: mockState.fcmTokens, error: null })),
          })),
        }
      }

      // orders table
      if (table === 'orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: mockState.orderError ? null : mockState.order,
                error: mockState.orderError ? new Error('db error') : null,
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: null })),
          })),
        }
      }

      // stores table
      if (table === 'stores') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: mockState.storeError ? null : mockState.store,
                error: mockState.storeError ? new Error('db error') : null,
              })),
            })),
          })),
        }
      }

      throw new Error(`unexpected table: ${table}`)
    }),
  }
}

let supabaseMock: ReturnType<typeof buildSupabaseMock>

vi.mock('../src/lib/supabase', () => ({
  get supabaseAdmin() { return supabaseMock },
}))

// ---------------------------------------------------------------------------
// Build the Express app under test (real router, mocked dependencies)
// ---------------------------------------------------------------------------
function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', notificationsRouter)
  return app
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const INTERNAL_KEY = 'test-internal-secret'
const SELLER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const BUYER_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const STORE_ID  = 'cccccccc-cccc-4ccc-cccc-cccccccccccc'
const ORDER_ID  = 'dddddddd-dddd-4ddd-dddd-dddddddddddd'
const SELLER_PHONE = '+919876543210'
const BUYER_PHONE  = '+919000000001'
const FCM_TOKEN    = 'fcm-test-token-abc123'

function freshOrder(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: ORDER_ID,
    order_number: 'RM-0001',
    total_amount: 599,
    delivery_address: { phone: BUYER_PHONE },
    notification_sent: false,
    created_at: new Date().toISOString(), // fresh — within 30-min window
    awb_code: null,
    store_id: STORE_ID,
    stores: { store_name: 'Test Store' },
    ...overrides,
  }
}

function freshStore(overrides: Partial<Record<string, any>> = {}) {
  return {
    seller_id: SELLER_ID,
    store_name: 'Test Store',
    users: { phone: SELLER_PHONE },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reset state + logs before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  supabaseMock = buildSupabaseMock()
  waCallLog.length   = 0
  pushCallLog.length = 0
  smsCallLog.length  = 0
  mockState.authUser   = null
  mockState.authError  = false
  mockState.order      = null
  mockState.orderError = false
  mockState.fcmTokens  = []
  mockState.store      = null
  mockState.storeError = false
})

// ---------------------------------------------------------------------------
// 1. HIGH-9 — POST /register-token
// ---------------------------------------------------------------------------
describe('HIGH-9: POST /api/notifications/register-token', () => {
  it('401 with no Authorization header', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/register-token')
      .send({ userId: SELLER_ID, token: FCM_TOKEN, platform: 'android' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('401 with an invalid/expired bearer token', async () => {
    mockState.authError = true
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', 'Bearer invalid-token')
      .send({ userId: SELLER_ID, token: FCM_TOKEN, platform: 'android' })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('403 when userId in body differs from authenticated user (HIGH-9)', async () => {
    // Authenticated as BUYER_ID but trying to register for SELLER_ID
    mockState.authUser = { id: BUYER_ID }
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', 'Bearer valid-buyer-token')
      .send({ userId: SELLER_ID, token: FCM_TOKEN, platform: 'android' })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.code).toBe('USER_ID_MISMATCH')
    // Must NOT have written any token to the DB — upsert should not have been called
    // (the route returns 403 before hitting supabaseAdmin.from)
    expect(pushCallLog).toHaveLength(0)
    expect(waCallLog).toHaveLength(0)
  })

  it('200 when authenticated user registers a token for themselves', async () => {
    mockState.authUser = { id: SELLER_ID }
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ userId: SELLER_ID, token: FCM_TOKEN, platform: 'ios' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('400 on missing/invalid body fields', async () => {
    mockState.authUser = { id: SELLER_ID }
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/register-token')
      .set('Authorization', 'Bearer valid-seller-token')
      .send({ userId: SELLER_ID, platform: 'android' }) // missing token
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2a. POST /address-change-approved
// ---------------------------------------------------------------------------
describe('POST /api/notifications/address-change-approved', () => {
  it('401 without internal key', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-approved')
      .send({ storeId: STORE_ID })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('400 on invalid storeId', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-approved')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })

  it('404 when store not found', async () => {
    mockState.storeError = true
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-approved')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID })
    expect(res.status).toBe(404)
  })

  it('sends WhatsApp to seller phone resolved from seller_id (not owner_id)', async () => {
    mockState.store = freshStore()
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-approved')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.whatsappSent).toBe(true)

    // Assert the WA mock was called with the seller's phone
    expect(waCallLog).toHaveLength(1)
    expect(waCallLog[0].phone).toBe(SELLER_PHONE)
    expect(waCallLog[0].message).toContain('approved')
  })

  it('sends FCM push when FCM token exists for seller', async () => {
    mockState.store      = freshStore()
    mockState.fcmTokens  = [{ token: FCM_TOKEN }]
    const app = buildApp()
    await request(app)
      .post('/api/notifications/address-change-approved')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID })

    expect(pushCallLog.length).toBeGreaterThan(0)
    expect(pushCallLog[0].token).toBe(FCM_TOKEN)
    expect(pushCallLog[0].title.toLowerCase()).toContain('approved')
    // data type tag
    expect(pushCallLog[0].data?.type).toBe('address_change_approved')
  })

  it('does not throw when seller has no phone or FCM tokens (graceful no-op)', async () => {
    // Store with no phone and no FCM tokens
    mockState.store     = freshStore({ users: { phone: undefined } })
    mockState.fcmTokens = []
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-approved')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(0)
    expect(pushCallLog).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2b. POST /address-change-rejected
// ---------------------------------------------------------------------------
describe('POST /api/notifications/address-change-rejected', () => {
  it('401 without internal key', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-rejected')
      .send({ storeId: STORE_ID })
    expect(res.status).toBe(401)
  })

  it('sends WhatsApp and push to seller with rejection reason', async () => {
    mockState.store     = freshStore()
    mockState.fcmTokens = [{ token: FCM_TOKEN }]
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-rejected')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID, rejectReason: 'Incomplete pincode' })

    expect(res.status).toBe(200)
    expect(res.body.data.whatsappSent).toBe(true)
    expect(res.body.data.pushSent).toBe(true)

    // WA mock: recipient is seller, message contains reason
    expect(waCallLog).toHaveLength(1)
    expect(waCallLog[0].phone).toBe(SELLER_PHONE)
    expect(waCallLog[0].message).toContain('Incomplete pincode')
    expect(waCallLog[0].message.toLowerCase()).toContain('not approved')

    // Push mock: token is correct, body contains reason
    expect(pushCallLog[0].token).toBe(FCM_TOKEN)
    expect(pushCallLog[0].body).toContain('Incomplete pincode')
    expect(pushCallLog[0].data?.type).toBe('address_change_rejected')
    expect(pushCallLog[0].data?.rejectReason).toBe('Incomplete pincode')
  })

  it('sends WhatsApp without reason when rejectReason is absent', async () => {
    mockState.store = freshStore()
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-rejected')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(1)
    // message must not include "undefined" or empty reason clause
    expect(waCallLog[0].message).not.toContain('undefined')
    expect(waCallLog[0].message.toLowerCase()).toContain('not approved')
  })

  it('does not throw when seller has no phone', async () => {
    mockState.store     = freshStore({ users: null })
    mockState.fcmTokens = []
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/address-change-rejected')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ storeId: STORE_ID, rejectReason: 'Bad address' })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(0)
    expect(pushCallLog).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 3a. POST /order-placed
// ---------------------------------------------------------------------------
describe('POST /api/notifications/order-placed', () => {
  it('404 when order not found', async () => {
    mockState.orderError = true
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-placed')
      .send({ orderId: ORDER_ID })
    expect(res.status).toBe(404)
  })

  it('skips (idempotency) when notification_sent=true', async () => {
    mockState.order = freshOrder({ notification_sent: true })
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-placed')
      .send({ orderId: ORDER_ID })
    expect(res.status).toBe(200)
    expect(res.body.data.skipped).toBe('already-sent')
    expect(waCallLog).toHaveLength(0)
    expect(smsCallLog).toHaveLength(0)
  })

  it('skips when order is older than 30 minutes', async () => {
    const oldDate = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    mockState.order = freshOrder({ created_at: oldDate, notification_sent: false })
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-placed')
      .send({ orderId: ORDER_ID })
    expect(res.status).toBe(200)
    expect(res.body.data.skipped).toBe('too-old')
    expect(waCallLog).toHaveLength(0)
  })

  it('sends WhatsApp and SMS to buyer phone on fresh order', async () => {
    mockState.order = freshOrder()
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-placed')
      .send({ orderId: ORDER_ID })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // WhatsApp to buyer
    expect(waCallLog).toHaveLength(1)
    expect(waCallLog[0].phone).toBe(BUYER_PHONE)
    expect(waCallLog[0].message).toContain('RM-0001')       // order number
    expect(waCallLog[0].message).toContain('Test Store')     // store name
    expect(waCallLog[0].message).toContain('599')            // total amount
    expect(waCallLog[0].message).toContain(ORDER_ID)        // order tracking link

    // SMS to buyer
    expect(smsCallLog).toHaveLength(1)
    expect(smsCallLog[0].phone).toBe(BUYER_PHONE)
    expect(smsCallLog[0].message).toContain('RM-0001')
  })

  it('does not send when order has no phone in delivery_address', async () => {
    mockState.order = freshOrder({ delivery_address: {} })
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-placed')
      .send({ orderId: ORDER_ID })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(0)
    expect(smsCallLog).toHaveLength(0)
  })

  it('does not double-send if called twice for same order (idempotency)', async () => {
    mockState.order = freshOrder()
    const app = buildApp()

    // First call — succeeds and sends
    await request(app).post('/api/notifications/order-placed').send({ orderId: ORDER_ID })
    expect(waCallLog).toHaveLength(1)

    // Simulate DB reflects notification_sent=true after first call
    mockState.order = freshOrder({ notification_sent: true })

    // Second call — must skip
    const res2 = await request(app).post('/api/notifications/order-placed').send({ orderId: ORDER_ID })
    expect(res2.body.data.skipped).toBe('already-sent')
    expect(waCallLog).toHaveLength(1) // still only 1
  })

  it('includes AWB tracking URL in message when awb_code is present', async () => {
    mockState.order = freshOrder({ awb_code: 'AWB123456' })
    const app = buildApp()
    await request(app).post('/api/notifications/order-placed').send({ orderId: ORDER_ID })

    expect(waCallLog[0].message).toContain('/track/AWB123456')
  })

  it('falls back to /order/:id URL when no awb_code', async () => {
    mockState.order = freshOrder({ awb_code: null })
    const app = buildApp()
    await request(app).post('/api/notifications/order-placed').send({ orderId: ORDER_ID })

    expect(waCallLog[0].message).toContain(`/order/${ORDER_ID}`)
  })
})

// ---------------------------------------------------------------------------
// 3b. POST /order-update (shipped / delivered / etc.)
// ---------------------------------------------------------------------------
describe('POST /api/notifications/order-update', () => {
  it('401 without internal key', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-update')
      .send({ orderId: ORDER_ID, status: 'shipped', buyerPhone: BUYER_PHONE, storeName: 'Test Store' })
    expect(res.status).toBe(401)
  })

  it('no-op for unknown status without error', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-update')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ orderId: ORDER_ID, status: 'unknown_status', buyerPhone: BUYER_PHONE, storeName: 'Test Store' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(waCallLog).toHaveLength(0)
    expect(pushCallLog).toHaveLength(0)
  })

  const deliveryStatuses = ['shipped', 'delivered', 'accepted', 'packed', 'rejected', 'cancelled']

  for (const status of deliveryStatuses) {
    it(`sends WhatsApp + push for status="${status}"`, async () => {
      mockState.fcmTokens = [{ token: FCM_TOKEN }]
      const app = buildApp()
      const res = await request(app)
        .post('/api/notifications/order-update')
        .set('x-internal-key', INTERNAL_KEY)
        .send({ orderId: ORDER_ID, status, buyerPhone: BUYER_PHONE, storeName: 'Test Store', buyerId: BUYER_ID })

      expect(res.status).toBe(200)

      // WhatsApp to buyer phone
      expect(waCallLog).toHaveLength(1)
      expect(waCallLog[0].phone).toBe(BUYER_PHONE)
      expect(waCallLog[0].message).toContain('Test Store')

      // FCM push to buyer token
      expect(pushCallLog).toHaveLength(1)
      expect(pushCallLog[0].token).toBe(FCM_TOKEN)
      // Clear the logs for the next iteration
      waCallLog.length   = 0
      pushCallLog.length = 0
    })
  }

  it('skips push silently when buyerId absent', async () => {
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-update')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ orderId: ORDER_ID, status: 'shipped', buyerPhone: BUYER_PHONE, storeName: 'Test Store' })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(1)
    expect(pushCallLog).toHaveLength(0)
  })

  it('skips WhatsApp silently when buyerPhone absent', async () => {
    mockState.fcmTokens = [{ token: FCM_TOKEN }]
    const app = buildApp()
    const res = await request(app)
      .post('/api/notifications/order-update')
      .set('x-internal-key', INTERNAL_KEY)
      .send({ orderId: ORDER_ID, status: 'delivered', storeName: 'Test Store', buyerId: BUYER_ID })

    expect(res.status).toBe(200)
    expect(waCallLog).toHaveLength(0)
    expect(pushCallLog).toHaveLength(1)
  })
})
