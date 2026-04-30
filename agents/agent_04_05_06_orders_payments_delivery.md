# AGENT: Order Management
### File: agents/agent_04_orders.md

---

## What This Feature Does

Complete order lifecycle — buyer places order, seller accepts,
order is tracked to delivery. Realtime updates for both sides.

## Step 1: Database Migration

Create `supabase/migrations/004_orders.sql`:

```sql
CREATE TYPE order_status AS ENUM (
  'pending', 'accepted', 'rejected', 'preparing',
  'ready', 'shipped', 'delivered', 'cancelled', 'refunded'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'paid', 'failed', 'refunded'
);

CREATE TABLE public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,  -- human readable: ORD-2024-001234
  buyer_id UUID REFERENCES public.users(id) NOT NULL,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  items JSONB NOT NULL,
  -- items format: [{"product_id":"uuid","name":"Cake","variant":"1kg","qty":1,"price":800,"image":"url"}]
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  status order_status DEFAULT 'pending',
  delivery_address JSONB NOT NULL,
  -- address format: {"name":"Rahul","phone":"9876543210","line1":"12 MG Road","city":"Hyderabad","state":"Telangana","pincode":"500001"}
  payment_status payment_status DEFAULT 'pending',
  payment_id TEXT,               -- Razorpay payment ID
  payment_method TEXT,           -- upi, card, cod
  tracking_id TEXT,              -- Shiprocket tracking ID
  tracking_url TEXT,
  courier_name TEXT,
  notes TEXT,                    -- buyer special instructions
  rejection_reason TEXT,
  estimated_delivery DATE,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Buyers see their own orders
CREATE POLICY "Buyers see own orders"
ON public.orders FOR SELECT
USING (buyer_id = auth.uid());

-- Sellers see orders for their stores
CREATE POLICY "Sellers see store orders"
ON public.orders FOR SELECT
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE seller_id = auth.uid()
  )
);

-- Sellers can update order status
CREATE POLICY "Sellers update order status"
ON public.orders FOR UPDATE
USING (
  store_id IN (
    SELECT id FROM public.stores WHERE seller_id = auth.uid()
  )
);

-- Generate order number function
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.order_number = 'ORD-' ||
    TO_CHAR(NOW(), 'YYYY') || '-' ||
    LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE order_number_seq START 1000;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for performance
CREATE INDEX orders_buyer_id ON public.orders(buyer_id);
CREATE INDEX orders_store_id ON public.orders(store_id);
CREATE INDEX orders_status ON public.orders(status);
```

## Step 2: Order Service (Buyer Side)

Create `apps/buyer-app/src/services/orderService.ts`:

```typescript
import { supabase } from '../lib/supabase'

export async function createOrder(data: {
  buyerId: string
  storeId: string
  items: any[]
  subtotal: number
  deliveryFee: number
  totalAmount: number
  deliveryAddress: any
  notes?: string
}): Promise<{ orderId: string; orderNumber: string }> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      buyer_id: data.buyerId,
      store_id: data.storeId,
      items: data.items,
      subtotal: data.subtotal,
      delivery_fee: data.deliveryFee,
      total_amount: data.totalAmount,
      delivery_address: data.deliveryAddress,
      notes: data.notes,
    })
    .select('id, order_number')
    .single()
  if (error) throw error
  return { orderId: order.id, orderNumber: order.order_number }
}

export async function getBuyerOrders(buyerId: string) {
  const { data } = await supabase
    .from('orders')
    .select(`
      *,
      stores (store_name, logo_url, store_slug)
    `)
    .eq('buyer_id', buyerId)
    .order('created_at', { ascending: false })
  return data ?? []
}
```

## Step 3: Order Service (Seller Side)

Create `apps/seller-app/src/services/orderService.ts`:

```typescript
import { supabase } from '../lib/supabase'

export async function getStoreOrders(storeId: string, status?: string) {
  let query = supabase
    .from('orders')
    .select(`*, users!buyer_id(name, phone)`)
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

export async function acceptOrder(orderId: string): Promise<void> {
  await supabase
    .from('orders')
    .update({ status: 'accepted' })
    .eq('id', orderId)
}

export async function rejectOrder(orderId: string, reason: string): Promise<void> {
  await supabase
    .from('orders')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', orderId)
}

export async function updateOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  await supabase
    .from('orders')
    .update({ status })
    .eq('id', orderId)
}
```

## Step 4: Realtime Order Updates

```typescript
// In seller app — listen for new orders
export function subscribeToNewOrders(storeId: string, onNewOrder: (order: any) => void) {
  return supabase
    .channel(`store-orders-${storeId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders',
      filter: `store_id=eq.${storeId}`
    }, payload => onNewOrder(payload.new))
    .subscribe()
}

// In buyer app — track order status changes
export function subscribeToOrderStatus(orderId: string, onStatusChange: (order: any) => void) {
  return supabase
    .channel(`order-${orderId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${orderId}`
    }, payload => onStatusChange(payload.new))
    .subscribe()
}
```

## Step 5: Order Screens

**Seller App:**
- `OrdersScreen.tsx` — tabs: New / Active / Completed with counts
- `OrderDetailScreen.tsx` — full order details, accept/reject buttons, status updater
- `OrderCard.tsx` — order summary card for list

**Buyer App:**
- `CheckoutScreen.tsx` — review cart, enter address, select payment
- `OrderTrackingScreen.tsx` — live status timeline
- `OrderHistoryScreen.tsx` — all past orders with reorder button

## Done When

- Buyer places order → seller gets instant realtime notification
- Seller accepts/rejects → buyer sees update in realtime
- Order status timeline shows correctly on both sides
- Order history works for both seller and buyer

---

# AGENT: Payments (Razorpay)
### File: agents/agent_05_payments.md

---

## Step 1: Backend Payment Routes

Create `backend/src/payments/razorpay.ts`:

```typescript
import Razorpay from 'razorpay'
import crypto from 'crypto'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

// Create payment order
export async function createPaymentOrder(amount: number, orderId: string) {
  return await razorpay.orders.create({
    amount: amount * 100,        // Razorpay needs paise
    currency: 'INR',
    receipt: orderId,
    notes: { order_id: orderId }
  })
}

// Verify payment signature (CRITICAL — prevents fraud)
export function verifyPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string
): boolean {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(body)
    .digest('hex')
  return expectedSignature === signature
}

// Process payout to seller (weekly)
export async function payoutToSeller(data: {
  amount: number
  accountNumber: string
  ifscCode: string
  sellerName: string
  payoutId: string
}) {
  return await razorpay.payouts.create({
    account_number: process.env.RAZORPAY_X_ACCOUNT!,
    fund_account: {
      account_type: 'bank_account',
      bank_account: {
        name: data.sellerName,
        ifsc: data.ifscCode,
        account_number: data.accountNumber,
      },
      contact: { name: data.sellerName, type: 'vendor' }
    },
    amount: data.amount * 100,
    currency: 'INR',
    mode: 'NEFT',
    purpose: 'payout',
    reference_id: data.payoutId,
  })
}
```

## Step 2: Payment API Routes

Create `backend/src/payments/routes.ts`:

```typescript
import express from 'express'
import { createPaymentOrder, verifyPaymentSignature } from './razorpay'
import { supabaseAdmin } from '../lib/supabaseAdmin'

const router = express.Router()

// POST /payments/create-order
router.post('/create-order', async (req, res) => {
  const { orderId, amount } = req.body
  const razorpayOrder = await createPaymentOrder(amount, orderId)
  res.json({ success: true, data: razorpayOrder })
})

// POST /payments/verify
router.post('/verify', async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, signature } = req.body

  const isValid = verifyPaymentSignature(
    razorpayOrderId, razorpayPaymentId, signature
  )

  if (!isValid) {
    return res.json({ success: false, error: 'Invalid payment signature' })
  }

  // Update order as paid in Supabase
  await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_id: razorpayPaymentId,
      payment_method: 'razorpay',
    })
    .eq('id', orderId)

  res.json({ success: true, message: 'Payment verified' })
})

export default router
```

## Step 3: Payment Flow in Buyer App

```typescript
import RazorpayCheckout from 'react-native-razorpay'

export async function initiatePayment(data: {
  orderId: string
  amount: number
  buyerName: string
  buyerPhone: string
  buyerEmail?: string
}): Promise<boolean> {
  // 1. Create Razorpay order via your backend
  const response = await fetch(`${API_URL}/payments/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: data.orderId, amount: data.amount })
  })
  const { data: razorpayOrder } = await response.json()

  // 2. Open Razorpay checkout
  return new Promise((resolve) => {
    RazorpayCheckout.open({
      description: 'Order Payment',
      image: 'https://platform.com/logo.png',
      currency: 'INR',
      key: process.env.EXPO_PUBLIC_RAZORPAY_KEY!,
      amount: data.amount * 100,
      name: 'Platform Name',
      order_id: razorpayOrder.id,
      prefill: {
        name: data.buyerName,
        contact: data.buyerPhone,
        email: data.buyerEmail ?? '',
      },
      theme: { color: '#4A90D9' },
    })
    .then(async (paymentData: any) => {
      // 3. Verify payment on backend
      const verifyResponse = await fetch(`${API_URL}/payments/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: data.orderId,
          razorpayOrderId: razorpayOrder.id,
          razorpayPaymentId: paymentData.razorpay_payment_id,
          signature: paymentData.razorpay_signature,
        })
      })
      const result = await verifyResponse.json()
      resolve(result.success)
    })
    .catch(() => resolve(false))
  })
}
```

---

# AGENT: Delivery (Shiprocket)
### File: agents/agent_06_delivery.md

---

## Step 1: Shiprocket Service

Create `backend/src/delivery/shiprocket.ts`:

```typescript
import axios from 'axios'

let authToken: string | null = null
let tokenExpiry: Date | null = null

// Get auth token (expires every 24 hours)
async function getToken(): Promise<string> {
  if (authToken && tokenExpiry && new Date() < tokenExpiry) {
    return authToken
  }
  const response = await axios.post(
    'https://apiv2.shiprocket.in/v1/external/auth/login',
    {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }
  )
  authToken = response.data.token
  tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000) // 23 hours
  return authToken!
}

// Create shipment
export async function createShipment(data: {
  orderId: string
  orderNumber: string
  sellerName: string
  sellerAddress: string
  sellerCity: string
  sellerPincode: string
  sellerPhone: string
  buyerName: string
  buyerAddress: string
  buyerCity: string
  buyerPincode: string
  buyerPhone: string
  items: { name: string; qty: number; price: number; weight: number }[]
  paymentMethod: 'prepaid' | 'COD'
  totalAmount: number
}) {
  const token = await getToken()
  const response = await axios.post(
    'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
    {
      order_id: data.orderNumber,
      order_date: new Date().toISOString(),
      pickup_location: 'Primary',
      channel_id: '',
      billing_customer_name: data.buyerName,
      billing_address: data.buyerAddress,
      billing_city: data.buyerCity,
      billing_pincode: data.buyerPincode,
      billing_state: 'Telangana',
      billing_country: 'India',
      billing_email: 'buyer@platform.com',
      billing_phone: data.buyerPhone,
      shipping_is_billing: true,
      order_items: data.items.map(item => ({
        name: item.name,
        sku: item.name.toLowerCase().replace(/\s/g, '-'),
        units: item.qty,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: 0,
      })),
      payment_method: data.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
      sub_total: data.totalAmount,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return response.data
}

// Track shipment
export async function trackShipment(trackingId: string) {
  const token = await getToken()
  const response = await axios.get(
    `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${trackingId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  return response.data
}

// Get delivery rates
export async function getDeliveryRates(data: {
  pickupPincode: string
  deliveryPincode: string
  weight: number
  cod: boolean
}) {
  const token = await getToken()
  const response = await axios.get(
    'https://apiv2.shiprocket.in/v1/external/courier/serviceability/',
    {
      params: {
        pickup_postcode: data.pickupPincode,
        delivery_postcode: data.deliveryPincode,
        weight: data.weight,
        cod: data.cod ? 1 : 0,
      },
      headers: { Authorization: `Bearer ${token}` }
    }
  )
  // Return cheapest available option
  const couriers = response.data.data?.available_courier_companies ?? []
  return couriers.sort((a: any, b: any) => a.rate - b.rate)[0]
}
```

## Step 2: Delivery Routes

Create `backend/src/delivery/routes.ts`:

```typescript
import express from 'express'
import { createShipment, trackShipment, getDeliveryRates } from './shiprocket'
import { supabaseAdmin } from '../lib/supabaseAdmin'

const router = express.Router()

// POST /delivery/rates — get delivery fee before checkout
router.post('/rates', async (req, res) => {
  const { pickupPincode, deliveryPincode, weight, cod } = req.body
  const rate = await getDeliveryRates({ pickupPincode, deliveryPincode, weight, cod })
  res.json({ success: true, data: { rate: rate?.rate ?? 60, courier: rate?.courier_name } })
})

// POST /delivery/create — seller books shipment
router.post('/create', async (req, res) => {
  const { orderId } = req.body

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('*, stores(*), users!buyer_id(*)')
    .eq('id', orderId)
    .single()

  const shipment = await createShipment({
    orderId: order.id,
    orderNumber: order.order_number,
    sellerName: order.stores.store_name,
    sellerAddress: order.stores.area,
    sellerCity: order.stores.city,
    sellerPincode: '500001',
    sellerPhone: order.stores.whatsapp_number,
    buyerName: order.delivery_address.name,
    buyerAddress: order.delivery_address.line1,
    buyerCity: order.delivery_address.city,
    buyerPincode: order.delivery_address.pincode,
    buyerPhone: order.delivery_address.phone,
    items: order.items.map((i: any) => ({
      name: i.name, qty: i.qty, price: i.price, weight: 0.5
    })),
    paymentMethod: order.payment_method === 'cod' ? 'COD' : 'prepaid',
    totalAmount: order.total_amount,
  })

  await supabaseAdmin
    .from('orders')
    .update({
      status: 'shipped',
      tracking_id: shipment.awb_code,
      tracking_url: `https://shiprocket.co/tracking/${shipment.awb_code}`,
      courier_name: shipment.courier_name,
    })
    .eq('id', orderId)

  res.json({ success: true, data: shipment })
})

export default router
```

## Done When

- Delivery fee calculated at checkout
- Seller can book shipment in one click
- Tracking ID and URL saved to order
- Buyer receives tracking link via WhatsApp
