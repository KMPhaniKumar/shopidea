/**
 * delivery-service — authorization, IDOR, and stub-mode tests
 *
 * Tests verify:
 *  - Stub mode: POST /rates and GET /track/:awb return safe defaults when
 *    NimbusPost is unconfigured (no NIMBUS_AUTH_TOKEN / NIMBUS_EMAIL).
 *  - POST /create-shipment: requires auth (401) and order/store ownership (403).
 *  - POST /cancel-shipment: requires auth (401) and store ownership (403).
 *  - POST /ndr/list: requires auth (401) and verifies AWB belongs to caller's store.
 *  - POST /track/bulk: requires x-internal-key (401 without it).
 *
 * Mock strategy: mock lib/supabase.ts + lib/nimbus.ts by absolute path.
 * No real NimbusPost or Supabase traffic.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import {
  SELLER, OTHER_SELLER, ORDER, STORE, makeSupabaseUser, bearerToken,
} from '../../fixtures/users'

// ── 1. Mock supabaseAdmin ─────────────────────────────────────────────────────
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

const supabaseAdminMock = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/delivery-service/src/lib/supabase',
  () => ({ supabaseAdmin: supabaseAdminMock }),
)

// ── 2. Mock NimbusPost lib ────────────────────────────────────────────────────
const mockIsConfigured = vi.fn()
const mockRateServiceability = vi.fn()
const mockCreateShipment = vi.fn()
const mockTrackShipment = vi.fn()
const mockBulkTrack = vi.fn()
const mockCancelShipment = vi.fn()
const mockNdrList = vi.fn()
const mockNdrAction = vi.fn()

vi.mock(
  '/Users/murali/Documents/GitHub/shopidea/reelmart/services/delivery-service/src/lib/nimbus',
  () => ({
    isConfigured: mockIsConfigured,
    NimbusError: class NimbusError extends Error {
      constructor(message: string) { super(message); this.name = 'NimbusError' }
    },
    rateServiceability: mockRateServiceability,
    createShipment: mockCreateShipment,
    trackShipment: mockTrackShipment,
    bulkTrack: mockBulkTrack,
    cancelShipment: mockCancelShipment,
    ndrList: mockNdrList,
    ndrAction: mockNdrAction,
    registerPickupWarehouse: vi.fn(),
    fetchPickupStatus: vi.fn(),
  }),
)

// ── 3. Test app ───────────────────────────────────────────────────────────────
let app: express.Application

beforeAll(async () => {
  const { deliveryRouter } = await import(
    '/Users/murali/Documents/GitHub/shopidea/reelmart/services/delivery-service/src/routes/delivery'
  )
  app = express()
  app.use(express.json())
  app.use('/api/delivery', deliveryRouter)
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function authAs(identity: { id: string }) {
  mockGetUser.mockResolvedValue({
    data: { user: makeSupabaseUser(identity) },
    error: null,
  })
}

function authFail() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
}

function makeQueryBuilder(tableResults: Record<string, { data: any; error: any }>) {
  return (table: string) => {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: (_cols?: string) => builder,
      insert: (_d: any) => builder,
      update: (_d: any) => builder,
      eq: () => builder,
      single: () => result,
      maybeSingle: () => result,
      then: (fn: any) => Promise.resolve(result).then(fn),
    }
    return builder
  }
}

const TEST_AWB = 'NIMBTEST001'

/** Order row that belongs to STORE (owned by SELLER) */
const ORDER_ROW = {
  id: ORDER.id,
  store_id: STORE.id,
  order_number: ORDER.order_number,
  status: 'packed',
  payment_status: 'paid',
  total_amount: ORDER.total_amount,
  awb_code: null, // not yet booked
  delivery_address: {
    name: 'Test Buyer',
    phone: '9999900001',
    line1: '123 Test St',
    area: 'Andheri',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400053',
  },
  items: ORDER.items,
  shipping_charges: 0,
  cod_charges: 0,
  discount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  authFail()
  // Default: NimbusPost not configured (stub mode)
  mockIsConfigured.mockReturnValue(false)
})

// ── POST /api/delivery/rates — stub mode ──────────────────────────────────────

describe('POST /api/delivery/rates — stub mode when NimbusPost unconfigured', () => {
  it('returns 200 with safe default fee when NimbusPost unconfigured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app)
      .post('/api/delivery/rates')
      .send({ pickupPincode: '400053', deliveryPincode: '110001' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.deliverable).toBe(true)
    expect(res.body.data.fee).toBe(60)
    expect(typeof res.body.data.estimatedDays).toBe('number')
    expect(Array.isArray(res.body.data.couriers)).toBe(true)
    expect(res.body.data.couriers).toHaveLength(0)
  })

  it('returns 400 for invalid pincode format', async () => {
    const res = await request(app)
      .post('/api/delivery/rates')
      .send({ pickupPincode: '12345', deliveryPincode: '110001' }) // 5 digits — invalid
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ── GET /api/delivery/track/:awb — stub mode ──────────────────────────────────

describe('GET /api/delivery/track/:awb — stub mode when NimbusPost unconfigured', () => {
  it('returns safe "confirmed" default when NimbusPost unconfigured', async () => {
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app).get(`/api/delivery/track/${TEST_AWB}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.current).toBe('confirmed')
    expect(Array.isArray(res.body.data.history)).toBe(true)
    expect(res.body.data.note).toMatch(/not configured/i)
  })

  it('returns 400 for invalid AWB format', async () => {
    const res = await request(app).get('/api/delivery/track/BAD AWB!')
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

// ── POST /api/delivery/create-shipment — auth + ownership ─────────────────────

describe('POST /api/delivery/create-shipment — auth + IDOR', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .post('/api/delivery/create-shipment')
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(401)
  })

  it('returns 503 when NimbusPost not configured', async () => {
    authAs(SELLER)
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app)
      .post('/api/delivery/create-shipment')
      .set('Authorization', bearerToken(SELLER))
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('COURIER_NOT_CONFIGURED')
  })

  it('returns 403 when caller does not own the order store — IDOR fix', async () => {
    authAs(OTHER_SELLER)
    mockIsConfigured.mockReturnValue(true)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return makeQueryBuilder({
          orders: { data: ORDER_ROW, error: null },
        })(table)
      }
      if (table === 'stores') {
        // Ownership check: store is owned by SELLER, not OTHER_SELLER
        return makeQueryBuilder({
          stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null },
        })(table)
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .post('/api/delivery/create-shipment')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })

  it('returns 400 when orderId is not a valid UUID', async () => {
    authAs(SELLER)
    const res = await request(app)
      .post('/api/delivery/create-shipment')
      .set('Authorization', bearerToken(SELLER))
      .send({ orderId: 'not-a-uuid' })
    expect(res.status).toBe(400)
  })
})

// ── POST /api/delivery/cancel-shipment — auth + ownership ────────────────────

describe('POST /api/delivery/cancel-shipment — auth + IDOR', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .post('/api/delivery/cancel-shipment')
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(401)
  })

  it('returns 503 when NimbusPost not configured', async () => {
    authAs(SELLER)
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app)
      .post('/api/delivery/cancel-shipment')
      .set('Authorization', bearerToken(SELLER))
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('COURIER_NOT_CONFIGURED')
  })

  it('returns 403 when caller does not own the order store — IDOR fix', async () => {
    authAs(OTHER_SELLER)
    mockIsConfigured.mockReturnValue(true)

    const ORDER_WITH_AWB = { ...ORDER_ROW, awb_code: TEST_AWB }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return makeQueryBuilder({ orders: { data: ORDER_WITH_AWB, error: null } })(table)
      }
      if (table === 'stores') {
        return makeQueryBuilder({
          stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null },
        })(table)
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .post('/api/delivery/cancel-shipment')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ orderId: ORDER.id })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })
})

// ── POST /api/delivery/ndr/list — auth + AWB ownership ───────────────────────

describe('POST /api/delivery/ndr/list — auth + AWB ownership', () => {
  it('returns 401 with no auth token', async () => {
    const res = await request(app)
      .post('/api/delivery/ndr/list')
      .send({ awb_number: TEST_AWB })
    expect(res.status).toBe(401)
  })

  it('returns 503 when NimbusPost not configured', async () => {
    authAs(SELLER)
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app)
      .post('/api/delivery/ndr/list')
      .set('Authorization', bearerToken(SELLER))
      .send({ awb_number: TEST_AWB })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('COURIER_NOT_CONFIGURED')
  })

  it('returns 404 when AWB is not found in orders table', async () => {
    authAs(SELLER)
    mockIsConfigured.mockReturnValue(true)
    mockFrom.mockImplementation(makeQueryBuilder({
      orders: { data: null, error: { message: 'not found' } },
    }))
    const res = await request(app)
      .post('/api/delivery/ndr/list')
      .set('Authorization', bearerToken(SELLER))
      .send({ awb_number: TEST_AWB })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the AWB belongs to a store the caller does not own — IDOR fix', async () => {
    authAs(OTHER_SELLER)
    mockIsConfigured.mockReturnValue(true)

    mockFrom.mockImplementation((table: string) => {
      if (table === 'orders') {
        return makeQueryBuilder({
          orders: { data: { store_id: STORE.id }, error: null },
        })(table)
      }
      if (table === 'stores') {
        // Ownership check: store owned by SELLER, not OTHER_SELLER
        return makeQueryBuilder({
          stores: { data: { id: STORE.id, seller_id: SELLER.id }, error: null },
        })(table)
      }
      return makeQueryBuilder({})(table)
    })

    const res = await request(app)
      .post('/api/delivery/ndr/list')
      .set('Authorization', bearerToken(OTHER_SELLER))
      .send({ awb_number: TEST_AWB })
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/Forbidden/i)
  })
})

// ── POST /api/delivery/track/bulk — internal key ─────────────────────────────

describe('POST /api/delivery/track/bulk — x-internal-key required', () => {
  it('returns 401 without internal key', async () => {
    const res = await request(app)
      .post('/api/delivery/track/bulk')
      .send({ awbs: [TEST_AWB] })
    expect(res.status).toBe(401)
  })

  it('returns 503 when NimbusPost not configured (even with internal key)', async () => {
    mockIsConfigured.mockReturnValue(false)
    const res = await request(app)
      .post('/api/delivery/track/bulk')
      .set('x-internal-key', process.env.INTERNAL_API_KEY ?? 'test-internal-key')
      .send({ awbs: [TEST_AWB] })
    expect(res.status).toBe(503)
    expect(res.body.code).toBe('COURIER_NOT_CONFIGURED')
  })
})
