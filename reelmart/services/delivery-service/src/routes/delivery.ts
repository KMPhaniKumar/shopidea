import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireInternalKey } from '../middleware/auth'
import {
  NP_TOKEN,
  npPost,
  registerPickupWarehouse,
  fetchPickupStatus,
  type StorePickupInput,
} from '../lib/nimbus'

export const deliveryRouter = Router()

const PICKUP_FIELDS = 'id, store_name, address, area, city, state, pincode, whatsapp_number, approval_status'

// Map NimbusPost's free-text status strings onto our 5-step canonical timeline.
const TIMELINE_STEPS = ['confirmed', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'] as const
type TimelineStep = typeof TIMELINE_STEPS[number]

function mapNimbusStatus(npStatus: string | undefined): TimelineStep {
  const s = (npStatus ?? '').toLowerCase()
  if (s.includes('delivered')) return 'delivered'
  if (s.includes('out for delivery') || s.includes('ofd')) return 'out_for_delivery'
  if (s.includes('in transit') || s.includes('in-transit') || s.includes('intransit')) return 'in_transit'
  if (s.includes('picked') || s.includes('pickup')) return 'picked_up'
  return 'confirmed'
}

// POST /api/delivery/rates — public; buyer checkout calls this to show
// estimated delivery date based on store pincode → buyer pincode.
deliveryRouter.post('/rates', async (req, res) => {
  const { pickupPincode, deliveryPincode, weight = 0.5, paymentType = 'prepaid', orderAmount = 100 } = req.body
  if (!NP_TOKEN) {
    return res.json({ success: true, data: { deliverable: true, fee: 60, estimatedDays: 3 } })
  }
  try {
    const data = await npPost('/courier/serviceability', {
      origin: String(pickupPincode),
      destination: String(deliveryPincode),
      payment_type: paymentType === 'cod' ? 'cod' : 'prepaid',
      order_amount: String(orderAmount),
      weight: String(weight),
    })
    const couriers = data?.data ?? []
    const cheapest = couriers.sort((a: any, b: any) => (a?.total_charges ?? 0) - (b?.total_charges ?? 0))[0]
    res.json({
      success: true,
      data: {
        deliverable: couriers.length > 0,
        fee: cheapest?.total_charges ?? 60,
        estimatedDays: cheapest?.estimated_delivery_days ?? 3,
      },
    })
  } catch {
    res.json({ success: true, data: { deliverable: true, fee: 60, estimatedDays: 3 } })
  }
})

// POST /api/delivery/create-shipment — seller marks order packed → we book NimbusPost
deliveryRouter.post('/create-shipment', requireAuth, async (req, res) => {
  const { orderId } = req.body
  if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' })
  if (!NP_TOKEN) return res.status(503).json({ success: false, error: 'Courier not configured' })

  const { data: order } = await supabaseAdmin
    .from('orders').select('*').eq('id', orderId).single()
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' })

  const addr = order.delivery_address as any
  const items = (order.items as any[]) ?? []

  // Use the seller's own NimbusPost pickup when it's been verified; otherwise
  // fall back to the platform's default warehouse so the order still ships.
  const { data: store } = await supabaseAdmin
    .from('stores').select('pickup_status, pickup_warehouse_name').eq('id', order.store_id).single()
  const sellerPickup = store?.pickup_status === 'verified' && store?.pickup_warehouse_name
  const warehouseName = sellerPickup
    ? store!.pickup_warehouse_name
    : (process.env.NIMBUS_WAREHOUSE_NAME ?? 'Primary')

  try {
    const shipment = await npPost('/shipments', {
      order_number: order.order_number,
      payment_type: order.payment_status === 'paid' ? 'prepaid' : 'cod',
      order_amount: order.total_amount,
      package_weight: 500, // grams; real per-product weight is future work
      package_length: 10, package_breadth: 10, package_height: 10,
      consignee: {
        name: addr?.name ?? '',
        address: [addr?.line1, addr?.line2, addr?.area].filter(Boolean).join(', '),
        city: addr?.city ?? '',
        state: addr?.state ?? '',
        pincode: addr?.pincode ?? '',
        phone: (addr?.phone ?? '').replace(/^\+91/, ''),
      },
      pickup: { warehouse_name: warehouseName },
      order_items: items.map((it: any) => ({
        name: it.name, qty: String(it.qty), price: String(it.price), sku: it.productId,
      })),
    })

    const awb = shipment?.data?.awb_number ?? shipment?.data?.awb ?? null
    if (!awb) {
      return res.status(502).json({ success: false, error: 'No AWB returned from courier', details: shipment })
    }

    const trackingUrl = `${process.env.SITE_URL ?? 'https://dev.reelmart.in'}/track/${awb}`
    await supabaseAdmin.from('orders').update({
      awb_code: awb,
      tracking_url: trackingUrl,
      status: 'shipped',
    }).eq('id', orderId)

    res.json({ success: true, data: { awb, trackingUrl } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

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

// POST /api/delivery/pickup/register — internal (server-to-server). Called when
// an admin approves a store, or after the seller edits their address. Registers
// the store's address as a NimbusPost pickup warehouse and records the result.
deliveryRouter.post('/pickup/register', requireInternalKey, async (req, res) => {
  const { storeId } = req.body
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const { data: store } = await supabaseAdmin
    .from('stores').select(PICKUP_FIELDS).eq('id', storeId).single()
  if (!store) return res.status(404).json({ success: false, error: 'Store not found' })

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
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/delivery/pickup/refresh — internal. Re-polls NimbusPost for a store
// whose pickup was left 'pending', flipping it to 'verified' once it clears.
deliveryRouter.post('/pickup/refresh', requireInternalKey, async (req, res) => {
  const { storeId } = req.body
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const { data: store } = await supabaseAdmin
    .from('stores').select('pickup_warehouse_name, pickup_status').eq('id', storeId).single()
  if (!store?.pickup_warehouse_name) {
    return res.status(404).json({ success: false, error: 'No pickup registered for this store' })
  }

  const status = await fetchPickupStatus(store.pickup_warehouse_name)
  if (status && status !== store.pickup_status) {
    await supabaseAdmin.from('stores').update({ pickup_status: status }).eq('id', storeId)
  }
  res.json({ success: true, data: { status: status ?? store.pickup_status } })
})

// GET /api/delivery/track/:awbCode — public; used by /track/[awb] page
// Returns: { current: TimelineStep, history: [{ step, label, at }], raw: any }
deliveryRouter.get('/track/:awbCode', async (req, res) => {
  const awb = req.params.awbCode
  if (!NP_TOKEN) {
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
    const data = await npPost('/shipments/track', { awb_code: awb })
    const events = data?.data?.history ?? data?.data?.tracking_history ?? []
    const current = mapNimbusStatus(data?.data?.status ?? data?.data?.current_status)

    // Build de-duped timeline history from events
    const seen = new Set<TimelineStep>()
    const history: { step: TimelineStep; label: string; at: string }[] = []
    for (const ev of events) {
      const step = mapNimbusStatus(ev?.status ?? ev?.message)
      if (seen.has(step)) continue
      seen.add(step)
      history.push({
        step,
        label: ev?.message ?? STEP_LABEL[step],
        at: ev?.event_time ?? ev?.timestamp ?? new Date().toISOString(),
      })
    }

    res.json({ success: true, data: { current, history, raw: null } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

const STEP_LABEL: Record<TimelineStep, string> = {
  confirmed: 'Order Confirmed',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
}
