import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const deliveryRouter = Router()

let shiprocketToken: string | null = null
let tokenExpiry: Date | null = null

async function getShiprocketToken(): Promise<string> {
  if (shiprocketToken && tokenExpiry && tokenExpiry > new Date()) return shiprocketToken

  const res = await fetch('https://apiv2.shiprocket.in/v1/external/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD }),
  })
  const data = await res.json() as any
  shiprocketToken = data.token
  tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000)
  return shiprocketToken!
}

async function shiprocketGet(path: string): Promise<any> {
  const token = await getShiprocketToken()
  const res = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.json() as Promise<any>
}

async function shiprocketPost(path: string, body: any): Promise<any> {
  const token = await getShiprocketToken()
  const res = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json() as Promise<any>
}

// POST /api/delivery/rates
deliveryRouter.post('/rates', requireAuth, async (req, res) => {
  const { pickupPincode, deliveryPincode, weight = 0.5 } = req.body
  try {
    const data = await shiprocketGet(
      `/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=0`
    )
    const available = data.data?.available_courier_companies ?? []
    const cheapest = available.sort((a: any, b: any) => a.rate - b.rate)[0]
    res.json({
      success: true,
      data: {
        deliverable: available.length > 0,
        fee: cheapest?.rate ?? 60,
        estimatedDays: cheapest?.estimated_delivery_days ?? 3,
      },
    })
  } catch {
    res.json({ success: true, data: { deliverable: true, fee: 60, estimatedDays: 3 } })
  }
})

// POST /api/delivery/create-shipment
deliveryRouter.post('/create-shipment', requireAuth, async (req, res) => {
  const { orderId } = req.body
  if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' })

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single()

  if (!order) return res.status(404).json({ success: false, error: 'Order not found' })

  try {
    const addr = order.delivery_address as any
    const shipment = await shiprocketPost('/orders/create/adhoc', {
      order_id: order.order_number,
      order_date: new Date(order.created_at).toISOString().split('T')[0],
      pickup_location: 'Primary',
      billing_customer_name: addr.name,
      billing_address: addr.address,
      billing_city: addr.city,
      billing_pincode: addr.pincode,
      billing_state: addr.state ?? '',
      billing_country: 'India',
      billing_email: '',
      billing_phone: addr.phone,
      shipping_is_billing: true,
      order_items: (order.items as any[]).map((item: any) => ({
        name: item.name,
        sku: item.productId,
        units: item.qty,
        selling_price: item.price,
      })),
      payment_method: order.payment_status === 'paid' ? 'Prepaid' : 'COD',
      sub_total: order.total_amount,
      length: 10, breadth: 10, height: 10, weight: 0.5,
    })

    const { shipment_id, awb_code } = shipment
    await supabaseAdmin.from('orders').update({
      shiprocket_order_id: String(shipment_id),
      awb_code,
      tracking_url: `https://shiprocket.co/tracking/${awb_code}`,
      status: 'shipped',
    }).eq('id', orderId)

    res.json({ success: true, data: { shipmentId: shipment_id, awbCode: awb_code } })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// GET /api/delivery/track/:awbCode
deliveryRouter.get('/track/:awbCode', async (req, res) => {
  try {
    const data = await shiprocketGet(`/courier/track/awb/${req.params.awbCode}`)
    res.json({ success: true, data })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
