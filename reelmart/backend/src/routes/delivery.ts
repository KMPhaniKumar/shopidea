import { Router } from 'express'
import axios from 'axios'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { requireAuth, AuthRequest } from '../middleware/auth'

export const deliveryRouter = Router()

let shiprocketToken: string | null = null
let tokenExpiry: Date | null = null

async function getShiprocketToken(): Promise<string> {
  if (shiprocketToken && tokenExpiry && tokenExpiry > new Date()) {
    return shiprocketToken
  }
  const res = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
    email: process.env.SHIPROCKET_EMAIL,
    password: process.env.SHIPROCKET_PASSWORD,
  })
  shiprocketToken = res.data.token
  tokenExpiry = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000) // 9 days
  return shiprocketToken!
}

// Get delivery rate for a pincode
deliveryRouter.post('/rates', requireAuth, async (req: AuthRequest, res) => {
  const { pickupPincode, deliveryPincode, weight = 0.5 } = req.body
  try {
    const token = await getShiprocketToken()
    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=0`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const available = response.data.data?.available_courier_companies || []
    const cheapest = available.sort((a: any, b: any) => a.rate - b.rate)[0]
    res.json({
      success: true,
      data: {
        deliverable: available.length > 0,
        fee: cheapest?.rate || 60,
        estimatedDays: cheapest?.estimated_delivery_days || 3,
      },
    })
  } catch {
    res.json({ success: true, data: { deliverable: true, fee: 60, estimatedDays: 3 } })
  }
})

// Create shipment after seller accepts order
deliveryRouter.post('/create-shipment', requireAuth, async (req: AuthRequest, res) => {
  const { orderId } = req.body
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*, stores(store_name, city, pincode), users(name, phone)')
      .eq('id', orderId)
      .single()

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' })
    }

    const token = await getShiprocketToken()
    const deliveryAddr = order.delivery_address as any

    const shipment = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      {
        order_id: order.order_number,
        order_date: new Date(order.created_at).toISOString().split('T')[0],
        pickup_location: 'Primary',
        billing_customer_name: deliveryAddr.name,
        billing_address: deliveryAddr.line1,
        billing_city: deliveryAddr.city,
        billing_pincode: deliveryAddr.pincode,
        billing_state: deliveryAddr.state,
        billing_country: 'India',
        billing_email: '',
        billing_phone: deliveryAddr.phone,
        shipping_is_billing: true,
        order_items: (order.items as any[]).map((item: any) => ({
          name: item.name,
          sku: item.productId,
          units: item.quantity,
          selling_price: item.price,
        })),
        payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        sub_total: order.total_amount,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5,
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const { shipment_id, awb_code } = shipment.data

    await supabaseAdmin
      .from('orders')
      .update({
        shiprocket_order_id: String(shipment_id),
        awb_code,
        tracking_url: `https://shiprocket.co/tracking/${awb_code}`,
        shipped_at: new Date().toISOString(),
        status: 'shipped',
      })
      .eq('id', orderId)

    res.json({ success: true, data: { shipmentId: shipment_id, awbCode: awb_code } })
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create shipment' })
  }
})
