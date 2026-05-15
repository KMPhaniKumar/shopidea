import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const deliveryRouter = Router()

const NP_BASE = 'https://api.nimbuspost.com/v1'
const NP_TOKEN = process.env.NIMBUS_AUTH_TOKEN ?? ''

function npHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'NP-AUTH-TOKEN': NP_TOKEN,
  }
}

async function npPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${NP_BASE}${path}`, {
    method: 'POST',
    headers: npHeaders(),
    body: JSON.stringify(body),
  })
  return res.json() as Promise<any>
}

async function npGet(path: string): Promise<any> {
  const res = await fetch(`${NP_BASE}${path}`, { headers: npHeaders() })
  return res.json() as Promise<any>
}

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
      pickup: { warehouse_name: process.env.NIMBUS_WAREHOUSE_NAME ?? 'Primary' },
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
