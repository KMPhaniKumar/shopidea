import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireInternalKey } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'
import {
  isConfigured,
  NimbusError,
  rateServiceability,
  selectCourier,
  createShipment,
  trackShipment,
  bulkTrack,
  cancelShipment,
  ndrList,
  ndrAction,
  registerPickupWarehouse,
  fetchPickupStatus,
  warehouseNameForStore,
  hasCompletePickupAddress,
  type StorePickupInput,
  type NdrActionItem,
} from '../lib/nimbus'
import { estimateDeliveryDays } from '../lib/estimateDelivery'
import { recordOrderEvent, syncTrackingToEvents } from '../lib/orderEvents'

export const deliveryRouter = Router()

const PICKUP_FIELDS =
  'id, store_name, address, area, city, state, pincode, whatsapp_number, pickup_contact_name, pickup_phone, pickup_email, approval_status'

// ---- Status mapping ----------------------------------------------------

const TIMELINE_STEPS = ['confirmed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const
type TimelineStep = typeof TIMELINE_STEPS[number]

const STEP_LABEL: Record<TimelineStep, string> = {
  confirmed: 'Order Confirmed',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
}

/**
 * Map NimbusPost status codes + free-text strings onto our 5-step canonical
 * timeline. Status codes per spec: PP, IT, EX, OFD, DL, RT, RT-IT, RT-DL.
 */
function mapNimbusStatus(npStatus: string | undefined): TimelineStep {
  const s = (npStatus ?? '').toUpperCase()
  if (s === 'DL' || s.includes('DELIVERED')) return 'delivered'
  if (s === 'OFD' || s.includes('OUT FOR DELIVERY')) return 'out_for_delivery'
  if (s === 'IT' || s === 'RT-IT' || s.includes('IN TRANSIT') || s.includes('IN-TRANSIT') || s.includes('INTRANSIT')) return 'in_transit'
  if (s === 'PP' || s.includes('PICKED') || s.includes('PICKUP')) return 'picked_up'
  // EX, RT, RT-DL, and unknown → confirmed (earliest known step; caller can overlay exception/RTO)
  return 'confirmed'
}

// ---- Error helpers -----------------------------------------------------

function handleNimbusError(err: unknown, res: any): void {
  if (err instanceof NimbusError) {
    // Surface the NimbusPost message but never the token
    res.status(502).json({
      success: false,
      error: err.message,
      code: 'NIMBUS_ERROR',
    })
    return
  }
  // Distinguish timeout (already thrown as NimbusError) from other network issues
  const msg = err instanceof Error ? err.message : 'Internal error'
  if (msg.includes('timed out') || msg.includes('network')) {
    res.status(503).json({ success: false, error: 'Courier service unavailable', code: 'COURIER_UNAVAILABLE' })
    return
  }
  // Do not echo raw error messages — they may contain internal detail (table
  // names, Supabase errors, etc.) that should not be sent to callers.
  res.status(500).json({ success: false, error: 'Internal server error', code: 'INTERNAL_ERROR' })
}

// ---- Ownership helper --------------------------------------------------

/** Returns the store row if req.user owns it; null + sends 403 otherwise. */
async function requireOwnsStore(
  userId: string,
  storeId: string,
  res: any
): Promise<{ id: string; seller_id: string } | null> {
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id, seller_id')
    .eq('id', storeId)
    .single()
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found', code: 'STORE_NOT_FOUND' })
    return null
  }
  if (store.seller_id !== userId) {
    res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' })
    return null
  }
  return store
}

// ---- Zod schemas -------------------------------------------------------

const RatesSchema = z.object({
  pickupPincode: z.string().regex(/^\d{6}$/, 'pickupPincode must be 6 digits'),
  deliveryPincode: z.string().regex(/^\d{6}$/, 'deliveryPincode must be 6 digits'),
  weight: z.number().positive().optional().default(500),
  paymentType: z.enum(['cod', 'prepaid']).optional().default('prepaid'),
  orderAmount: z.number().positive().optional().default(100),
})

const CreateShipmentSchema = z.object({
  orderId: z.string().uuid('orderId must be a UUID'),
})

const CancelShipmentSchema = z.object({
  orderId: z.string().uuid('orderId must be a UUID'),
})

// AWB format: NimbusPost AWBs are alphanumeric, 8-20 characters.
// Used on every schema that accepts a caller-supplied AWB.
const AwbString = z.string().regex(/^[A-Z0-9]{8,20}$/i, 'Invalid AWB format')

const TrackBulkSchema = z.object({
  awbs: z.array(AwbString).min(1).max(100, 'Max 100 AWBs per request'),
})

const NdrListSchema = z.object({
  // awb_number is required: without it NimbusPost returns all-account NDRs
  // (every seller's failed deliveries). Sellers must query one AWB at a time.
  awb_number: AwbString,
  page_no: z.number().int().positive().optional(),
  per_page: z.number().int().min(1).max(250).optional(),
})

const NdrActionItemSchema = z.discriminatedUnion('action', [
  z.object({
    awb: AwbString,
    action: z.literal('re-attempt'),
    action_data: z.object({ re_attempt_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD') }),
  }),
  z.object({
    awb: AwbString,
    action: z.literal('change_address'),
    action_data: z.object({
      name: z.string().min(1),
      address_1: z.string().min(1),
      address_2: z.string().optional(),
    }),
  }),
  z.object({
    awb: AwbString,
    action: z.literal('change_phone'),
    action_data: z.object({ phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits') }),
  }),
])

const NdrActionSchema = z.array(NdrActionItemSchema).min(1).max(100, 'Max 100 NDR actions per request')

const ShippingLabelSchema = z.object({
  orderId: z.string().uuid('orderId must be a UUID'),
})

// ---- Routes ------------------------------------------------------------

// POST /api/delivery/rates — public; buyer checkout calls this to show
// shipping fee for store pincode → buyer pincode.
// NOTE: NimbusPost rateServiceability has NO estimated_delivery_days field.
deliveryRouter.post('/rates', async (req, res) => {
  const parse = RatesSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }
  const { pickupPincode, deliveryPincode, weight, paymentType, orderAmount } = parse.data

  // Compute the heuristic EDD once — used in all response branches below.
  const estimatedDays = estimateDeliveryDays(pickupPincode, deliveryPincode)

  if (!isConfigured()) {
    // Stub mode: NimbusPost token not set. Return a safe default with the
    // heuristic EDD so the UI shows a real estimate rather than a constant.
    return res.json({
      success: true,
      data: { deliverable: true, fee: 60, estimatedDays, couriers: [] },
    })
  }

  try {
    const couriers = await rateServiceability({
      origin: pickupPincode,
      destination: deliveryPincode,
      payment_type: paymentType,
      order_amount: orderAmount,
      weight,
    })
    const sorted = couriers.slice().sort((a, b) => (a.total_charges ?? 0) - (b.total_charges ?? 0))
    const cheapest = sorted[0]
    res.json({
      success: true,
      data: {
        deliverable: couriers.length > 0,
        fee: cheapest?.total_charges ?? 60,
        estimatedDays,
        couriers: sorted.map(c => ({
          id: c.id,
          name: c.name,
          total_charges: c.total_charges,
          cod_charges: c.cod_charges,
        })),
      },
    })
  } catch {
    // Degrade gracefully — buyer checkout must not break if courier is down.
    // Include estimatedDays so the UI still shows a sensible EDD even when
    // the NimbusPost call fails.
    res.json({
      success: true,
      data: { deliverable: true, fee: 60, estimatedDays, couriers: [] },
    })
  }
})

// POST /api/delivery/create-shipment — seller marks order packed → books NimbusPost
// Ownership check: req.user must own order.store_id (guards against IDOR).
// Idempotency: if order.awb_code already set, return it without re-booking.
deliveryRouter.post('/create-shipment', requireAuth, async (req: AuthRequest, res) => {
  const parse = CreateShipmentSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }
  const { orderId } = parse.data
  const userId = req.user!.id

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Courier not configured', code: 'COURIER_NOT_CONFIGURED' })
  }

  // Fetch order (all fields for shipment payload)
  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
  if (orderErr || !order) {
    return res.status(404).json({ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' })
  }

  // Ownership check — verify caller owns the order's store (IDOR guard)
  const store = await requireOwnsStore(userId, order.store_id, res)
  if (!store) return // 403/404 already sent

  // Idempotency — don't double-book
  if (order.awb_code) {
    return res.json({
      success: true,
      data: {
        awb: order.awb_code,
        trackingUrl: order.tracking_url ?? null,
        label: order.label_url ?? null,
        courierName: order.courier_name ?? null,
        idempotent: true,
      },
    })
  }

  // Fetch store pickup info
  const { data: storeDetail } = await supabaseAdmin
    .from('stores')
    .select('id, pickup_status, address, area, city, state, pincode, whatsapp_number, pickup_contact_name, pickup_phone, store_name')
    .eq('id', order.store_id)
    .single()

  // NimbusPost v1 has no pre-registered warehouses: the pickup address is sent
  // INLINE with the shipment. If the seller's pickup address is complete we ship
  // from there; otherwise fall back to the platform's default warehouse (a
  // dashboard-created warehouse referenced by name only).
  const pickupPhone = String(storeDetail?.pickup_phone ?? storeDetail?.whatsapp_number ?? '')
    .replace(/^\+?91/, '')
    .replace(/\D/g, '')
    .slice(-10)
  const sellerPickupReady =
    !!storeDetail && hasCompletePickupAddress(storeDetail as StorePickupInput) && pickupPhone.length === 10
  const pickup = sellerPickupReady
    ? {
        warehouse_name: warehouseNameForStore(storeDetail!.id),
        name: storeDetail!.pickup_contact_name || storeDetail!.store_name || '',
        address: storeDetail!.address ?? '',
        address_2: storeDetail!.area ?? '',
        city: storeDetail!.city ?? '',
        state: storeDetail!.state ?? '',
        pincode: String(storeDetail!.pincode ?? ''),
        phone: pickupPhone,
      }
    : { warehouse_name: process.env.NIMBUS_WAREHOUSE_NAME ?? 'Primary' }

  const addr = order.delivery_address as any
  const items = (order.items as any[]) ?? []
  const paymentType = order.payment_status === 'paid' ? 'prepaid' : 'cod'
  const orderAmount = order.total_amount as number

  // Shipping + COD charges: use order values; defaults are zero (platform may enrich later)
  const shippingCharges = (order.shipping_charges as number | null) ?? 0
  const codCharges = paymentType === 'cod' ? ((order.cod_charges as number | null) ?? 30) : 0
  const discount = (order.discount as number | null) ?? 0

  const consigneePhone = String(addr?.phone ?? '')
    .replace(/^\+91/, '')
    .replace(/\D/g, '')
    .slice(0, 10)

  // ---- Real package weight from products ---------------------------------
  // items JSONB: [{ productId, name, price, qty, ... }]
  // Per-product weight from products.weight_grams (INTEGER grams, nullable).
  // Fallback: 500g per unit when weight_grams is null or productId missing.
  let packageWeightGrams = 500
  if (items.length > 0) {
    const productIds = [...new Set(
      items.map((it: any) => it.productId).filter(Boolean) as string[]
    )]

    const weightMap: Record<string, number> = {}
    if (productIds.length > 0) {
      const { data: productRows } = await supabaseAdmin
        .from('products')
        .select('id, weight_grams')
        .in('id', productIds)
      for (const row of productRows ?? []) {
        if (row.id && row.weight_grams != null) {
          weightMap[row.id] = row.weight_grams as number
        }
      }
    }

    const totalGrams = items.reduce((sum: number, it: any) => {
      const perUnit = (it.productId && weightMap[it.productId] != null)
        ? weightMap[it.productId]
        : 500 // fallback when weight_grams is null or productId missing
      return sum + (Number(it.qty) || 1) * perUnit
    }, 0)

    packageWeightGrams = Math.max(50, totalGrams)
  }

  // ---- Courier selection via serviceability ------------------------------
  // Guard: origin pincode must be known before calling serviceability.
  const originPincode = String(storeDetail?.pincode ?? '').trim()
  if (!originPincode || !/^\d{6}$/.test(originPincode)) {
    return res.status(422).json({
      success: false,
      code: 'PICKUP_INCOMPLETE',
      error: 'Seller pickup pincode missing — complete pickup address',
    })
  }
  const destPincode = String(addr?.pincode ?? '').trim()

  // Initialized in the try block below; the catch always returns, so this is
  // always set before the booking try block runs.
  let courierId = ''
  try {
    const rates = await rateServiceability({
      origin: originPincode,
      destination: destPincode,
      payment_type: paymentType,
      order_amount: orderAmount,
      weight: packageWeightGrams,
    })

    const prefer = (process.env.NIMBUS_PREFERRED_COURIERS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)
    const block = (process.env.NIMBUS_BLOCKED_COURIERS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean)

    const chosen = selectCourier(rates, { prefer, block })
    if (!chosen) {
      console.error('[delivery] create-shipment: no serviceable courier', { orderId, originPincode, destPincode, packageWeightGrams })
      return res.status(422).json({
        success: false,
        code: 'NOT_SERVICEABLE',
        error: 'No courier available for this route/weight',
      })
    }

    courierId = String(chosen.id)
  } catch (rateErr) {
    // Network or courier-service failure — don't book blindly
    const msg = rateErr instanceof Error ? rateErr.message : 'unknown'
    console.error('[delivery] create-shipment: serviceability failed', { orderId, error: msg })
    return res.status(502).json({
      success: false,
      code: 'RATE_FAILED',
      error: 'Could not retrieve courier rates — please retry',
    })
  }

  try {
    const shipmentData = await createShipment({
      order_number: order.order_number ?? orderId,
      shipping_charges: shippingCharges,
      discount,
      cod_charges: codCharges,
      payment_type: paymentType,
      order_amount: orderAmount,
      package_weight: packageWeightGrams,
      package_length: 10,
      package_breadth: 10,
      package_height: 10,
      request_auto_pickup: 'yes',
      courier_id: courierId,
      consignee: {
        name: addr?.name ?? '',
        address: [addr?.line1, addr?.area].filter(Boolean).join(', ') || (addr?.address ?? ''),
        address_2: addr?.line2 ?? addr?.address_2 ?? '',
        city: addr?.city ?? '',
        state: addr?.state ?? '',
        pincode: String(addr?.pincode ?? ''),
        phone: consigneePhone,
      },
      pickup,
      order_items: items.map((it: any) => ({
        name: it.name ?? '',
        qty: String(it.qty ?? 1),
        price: String(it.price ?? 0),
        sku: it.productId ?? it.sku ?? '',
      })),
    })

    const awb = shipmentData?.awb_number ?? null
    if (!awb) {
      // Never include the token in the error; include safe identifiers only
      console.error('[delivery] create-shipment: no AWB returned', { orderId, shipmentId: shipmentData?.shipment_id })
      return res.status(502).json({
        success: false,
        error: 'Courier did not return a tracking number',
        code: 'NO_AWB',
        details: { shipment_id: shipmentData?.shipment_id ?? null },
      })
    }

    const trackingUrl = `${process.env.SITE_URL ?? 'https://dev.reelmart.in'}/track/${awb}`
    const labelUrl = shipmentData?.label ?? null
    const courierName = shipmentData?.courier_name ?? null

    await supabaseAdmin.from('orders').update({
      awb_code: awb,
      tracking_url: trackingUrl,
      label_url: labelUrl,
      courier_name: courierName,
      nimbus_shipment_id: shipmentData?.shipment_id ? String(shipmentData.shipment_id) : null,
      status: 'shipped',
      shipped_at: new Date().toISOString(),
    }).eq('id', orderId)

    // Authoritative shipment_booked event. Dedup key matches the key used in
    // order-service PUT /status so a manual seller status flip can't double it.
    recordOrderEvent({
      orderId,
      code: 'shipment_booked',
      source: 'courier',
      description: courierName ?? null,
      occurredAt: new Date().toISOString(),
      meta: { awb },
      dedupKey: `order:${orderId}:shipment_booked`,
    })

    res.json({
      success: true,
      data: { awb, trackingUrl, label: labelUrl, courierName },
      message: 'Shipment created',
    })
  } catch (err) {
    console.error('[delivery] create-shipment error', { orderId })
    handleNimbusError(err, res)
  }
})

// GET /api/delivery/track/:awbCode — public; used by /track/[awb] page.
// Returns ReelMart-branded timeline. Buyers only see their own orders' AWBs;
// this endpoint is open by AWB (AWB is non-guessable), matching current design.
// No NimbusPost branding exposed to buyers.
deliveryRouter.get('/track/:awbCode', async (req, res) => {
  const awb = req.params.awbCode?.trim()
  if (!awb || !/^[A-Z0-9]{8,20}$/i.test(awb)) {
    return res.status(400).json({ success: false, error: 'Invalid AWB code', code: 'VALIDATION_ERROR' })
  }

  if (!isConfigured()) {
    return res.json({
      success: true,
      data: {
        current: 'confirmed' as TimelineStep,
        history: [{ step: 'confirmed', label: 'Order Confirmed', at: new Date().toISOString() }],
        raw: null,
        note: 'Tracking provider not configured',
      },
    })
  }

  try {
    // Spec: GET /shipments/track/{awb} — AWB in PATH (not POST body)
    const tracking = await trackShipment(awb)
    const events = tracking?.history ?? []
    const current = mapNimbusStatus(tracking?.status)

    // Persist courier scans to the unified timeline. Look up the order_id by
    // awb_code. Fire-and-forget — never delay the response.
    ;(async () => {
      try {
        const { data: orderRow } = await supabaseAdmin
          .from('orders')
          .select('id')
          .eq('awb_code', awb)
          .maybeSingle()
        if (orderRow?.id) {
          await syncTrackingToEvents(orderRow.id, awb, tracking)
        }
      } catch (syncErr: unknown) {
        const msg = syncErr instanceof Error ? syncErr.message : String(syncErr)
        console.error('[delivery] track sync error', { awb, error: msg })
      }
    })()

    const seen = new Set<TimelineStep>()
    const history: { step: TimelineStep; label: string; at: string }[] = []
    for (const ev of events) {
      const step = mapNimbusStatus(ev?.status_code ?? ev?.message)
      if (seen.has(step)) continue
      seen.add(step)
      history.push({
        step,
        label: ev?.message ?? STEP_LABEL[step],
        at: ev?.event_time ?? new Date().toISOString(),
      })
    }

    res.json({ success: true, data: { current, history, raw: null } })
  } catch (err) {
    console.error('[delivery] track error', { awb })
    handleNimbusError(err, res)
  }
})

// POST /api/delivery/cancel-shipment — seller cancels a booked shipment.
// Ownership check enforced. Updates order status to cancelled.
deliveryRouter.post('/cancel-shipment', requireAuth, async (req: AuthRequest, res) => {
  const parse = CancelShipmentSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }
  const { orderId } = parse.data
  const userId = req.user!.id

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Courier not configured', code: 'COURIER_NOT_CONFIGURED' })
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, store_id, awb_code, status')
    .eq('id', orderId)
    .single()
  if (orderErr || !order) {
    return res.status(404).json({ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' })
  }

  // Ownership check
  const store = await requireOwnsStore(userId, order.store_id, res)
  if (!store) return

  if (!order.awb_code) {
    return res.status(400).json({ success: false, error: 'No AWB found for this order', code: 'NO_AWB' })
  }

  try {
    const result = await cancelShipment(order.awb_code)
    await supabaseAdmin.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    res.json({ success: true, data: { awb: order.awb_code, message: result.message } })
  } catch (err) {
    console.error('[delivery] cancel-shipment error', { orderId, awb: order.awb_code })
    handleNimbusError(err, res)
  }
})

// POST /api/delivery/shipping-label — seller fetches the official NimbusPost
// label PDF for a shipped order. The label URL is captured at booking time from
// NimbusPost's v1 create-shipment response. Decision flow:
//   1. No awb_code yet  → 409 NOT_SHIPPED.
//   2. label_url present → return it (source:'booking').
//   3. Otherwise         → 409 LABEL_UNAVAILABLE.
deliveryRouter.post('/shipping-label', requireAuth, async (req: AuthRequest, res) => {
  const parse = ShippingLabelSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }
  const { orderId } = parse.data
  const userId = req.user!.id

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('orders')
    .select('id, store_id, awb_code, label_url, nimbus_shipment_id, order_number')
    .eq('id', orderId)
    .single()
  if (orderErr || !order) {
    return res.status(404).json({ success: false, error: 'Order not found', code: 'ORDER_NOT_FOUND' })
  }

  // Ownership check — seller must own the order's store
  const store = await requireOwnsStore(userId, order.store_id, res)
  if (!store) return

  // Guard: must have a booked shipment before a label is meaningful
  if (!order.awb_code) {
    return res.status(409).json({
      success: false,
      code: 'NOT_SHIPPED',
      error: 'Order has no shipment yet — book it first',
    })
  }

  // Label URL was captured at booking time (NimbusPost v1 create-shipment response)
  if (order.label_url) {
    return res.json({ success: true, data: { url: order.label_url, source: 'booking' } })
  }

  // Shipped, but NimbusPost hasn't returned a label URL for this order yet
  return res.status(409).json({
    success: false,
    code: 'LABEL_UNAVAILABLE',
    error: 'Shipping label not available yet',
  })
})

// POST /api/delivery/ndr/list — seller fetches NDR (failed delivery) records
// scoped to AWBs belonging to their stores only.
deliveryRouter.post('/ndr/list', requireAuth, async (req: AuthRequest, res) => {
  const parse = NdrListSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Courier not configured', code: 'COURIER_NOT_CONFIGURED' })
  }

  const userId = req.user!.id
  const { awb_number } = parse.data

  // awb_number is required by schema (guards against all-account NDR leak).
  // Verify seller owns the order that this AWB belongs to.
  const { data: orderRow } = await supabaseAdmin
    .from('orders')
    .select('store_id')
    .eq('awb_code', awb_number)
    .single()
  if (!orderRow) {
    return res.status(404).json({ success: false, error: 'AWB not found', code: 'NOT_FOUND' })
  }
  const owned = await requireOwnsStore(userId, orderRow.store_id, res)
  if (!owned) return

  try {
    const items = await ndrList(parse.data)
    res.json({ success: true, data: items })
  } catch (err) {
    console.error('[delivery] ndr/list error', { awb_number })
    handleNimbusError(err, res)
  }
})

// POST /api/delivery/ndr/action — seller submits NDR resolution actions.
// Only allows actions for AWBs belonging to the seller's stores.
deliveryRouter.post('/ndr/action', requireAuth, async (req: AuthRequest, res) => {
  const parse = NdrActionSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Courier not configured', code: 'COURIER_NOT_CONFIGURED' })
  }

  const userId = req.user!.id
  const actions = parse.data as NdrActionItem[]
  const awbs = [...new Set(actions.map(a => a.awb))]

  // Verify seller owns every AWB in the batch
  for (const awb of awbs) {
    const { data: orderRow } = await supabaseAdmin
      .from('orders')
      .select('store_id')
      .eq('awb_code', awb)
      .single()
    if (!orderRow) {
      return res.status(404).json({ success: false, error: `AWB not found: ${awb}`, code: 'NOT_FOUND' })
    }
    const owned = await requireOwnsStore(userId, orderRow.store_id, res)
    if (!owned) return
  }

  try {
    const results = await ndrAction(actions)
    res.json({ success: true, data: results })
  } catch (err) {
    console.error('[delivery] ndr/action error')
    handleNimbusError(err, res)
  }
})

// POST /api/delivery/track/bulk — internal cron endpoint; bulk-refresh tracking.
// Accepts up to 100 AWBs. Protected by requireInternalKey.
deliveryRouter.post('/track/bulk', requireInternalKey, async (req, res) => {
  const parse = TrackBulkSchema.safeParse(req.body)
  if (!parse.success) {
    return res.status(400).json({ success: false, error: parse.error.errors[0]?.message ?? 'Validation error', code: 'VALIDATION_ERROR' })
  }

  if (!isConfigured()) {
    return res.status(503).json({ success: false, error: 'Courier not configured', code: 'COURIER_NOT_CONFIGURED' })
  }

  try {
    const results = await bulkTrack(parse.data.awbs)

    // Persist courier scans for each AWB. Resolve order_id by awb_code then
    // sync. Errors per AWB are isolated — one bad AWB must not abort the rest.
    ;(async () => {
      for (const trackingResult of results) {
        const awb = trackingResult.awb_number
        if (!awb) continue
        try {
          const { data: orderRow } = await supabaseAdmin
            .from('orders')
            .select('id')
            .eq('awb_code', awb)
            .maybeSingle()
          if (orderRow?.id) {
            await syncTrackingToEvents(orderRow.id, awb, trackingResult)
          }
        } catch (perAwbErr: unknown) {
          const msg = perAwbErr instanceof Error ? perAwbErr.message : String(perAwbErr)
          console.error('[delivery] bulk-track sync error', { awb, error: msg })
        }
      }
    })()

    res.json({ success: true, data: results })
  } catch (err) {
    console.error('[delivery] bulk-track error')
    handleNimbusError(err, res)
  }
})

// ---- Pickup warehouse routes (unchanged logic, moved to new auth model) ----

// Persist a pickup-registration result onto the store row.
async function savePickup(storeId: string, reg: Awaited<ReturnType<typeof registerPickupWarehouse>>) {
  await supabaseAdmin.from('stores').update({
    pickup_id: reg.pickupId,
    pickup_warehouse_name: reg.warehouseName,
    pickup_status: reg.status,
    pickup_error: reg.status === 'failed' ? (reg.error ?? null) : null,
    pickup_registered_at: new Date().toISOString(),
  }).eq('id', storeId)
}

// POST /api/delivery/pickup/register — internal (server-to-server).
deliveryRouter.post('/pickup/register', requireInternalKey, async (req, res) => {
  const { storeId } = req.body
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required', code: 'VALIDATION_ERROR' })

  const { data: store } = await supabaseAdmin
    .from('stores').select(PICKUP_FIELDS).eq('id', storeId).single()
  if (!store) return res.status(404).json({ success: false, error: 'Store not found', code: 'STORE_NOT_FOUND' })

  try {
    const reg = await registerPickupWarehouse(store as StorePickupInput)
    await savePickup(storeId, reg)
    res.json({ success: true, data: { pickupId: reg.pickupId, status: reg.status, error: reg.error } })
  } catch (err: any) {
    await savePickup(storeId, {
      pickupId: null,
      warehouseName: (store as any).pickup_warehouse_name ?? '',
      status: 'failed',
      error: err.message,
    })
    res.status(500).json({ success: false, error: 'Pickup registration failed', code: 'PICKUP_REGISTRATION_FAILED' })
  }
})

// POST /api/delivery/pickup/refresh — internal. Re-checks NimbusPost pincode
// serviceability for a store whose pickup was left pending/failed.
deliveryRouter.post('/pickup/refresh', requireInternalKey, async (req, res) => {
  const { storeId } = req.body
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required', code: 'VALIDATION_ERROR' })

  const { data: store } = await supabaseAdmin
    .from('stores').select('pincode, pickup_status').eq('id', storeId).single()
  if (!store?.pincode) {
    return res.status(404).json({ success: false, error: 'Store has no pickup pincode', code: 'NOT_FOUND' })
  }

  const status = await fetchPickupStatus(store.pincode)
  if (status && status !== store.pickup_status) {
    await supabaseAdmin.from('stores').update({ pickup_status: status }).eq('id', storeId)
  }
  res.json({ success: true, data: { status: status ?? store.pickup_status } })
})
