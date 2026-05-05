# MS-05: Delivery Service

**Local Port:** 3004
**Docker Port:** 3000
**Purpose:** Shiprocket integration — get delivery rates, create shipments, track packages, and handle Shiprocket webhooks to update order status.

---

## Prerequisites

- Node.js 20+, TypeScript
- Supabase project with `orders` table
- Shiprocket account with API credentials
- Other services running (order-service on 3001)

---

## Directory Structure

```
delivery-service/
├── src/
│   ├── index.ts
│   ├── routes/
│   │   └── delivery.ts
│   ├── lib/
│   │   ├── shiprocket.ts
│   │   └── supabase.ts
│   ├── middleware/
│   │   └── auth.ts
│   └── types/
│       └── index.ts
├── .env.example
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## Step 1: Initialize Project

```bash
mkdir delivery-service && cd delivery-service
npm init -y
npm install express @supabase/supabase-js axios dotenv cors helmet
npm install -D typescript @types/express @types/node @types/cors ts-node nodemon
npx tsc --init
```

---

## Step 2: package.json

```json
{
  "name": "delivery-service",
  "version": "1.0.0",
  "scripts": {
    "dev": "nodemon --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.10.0",
    "nodemon": "^3.0.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.2"
  }
}
```

---

## Step 3: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 4: .env.example

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Shiprocket
SHIPROCKET_EMAIL=your@email.com
SHIPROCKET_PASSWORD=your-password

# Service
PORT=3004
NODE_ENV=development

# Internal service secret for webhook validation
WEBHOOK_SECRET=your-webhook-secret
```

---

## Step 5: src/types/index.ts

```typescript
export interface ShiprocketTokenCache {
  token: string;
  expiresAt: number; // Unix timestamp ms
}

export interface DeliveryRate {
  courier_company_id: number;
  courier_name: string;
  rate: number;
  estimated_delivery_days: number;
  cod_charges: number;
  freight_charge: number;
}

export interface CreateShipmentPayload {
  order_id: string;
  order_date: string;
  pickup_location: string;
  billing_customer_name: string;
  billing_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_pincode: string;
  billing_state: string;
  billing_country: string;
  billing_email: string;
  billing_phone: string;
  shipping_is_billing: boolean;
  order_items: Array<{
    name: string;
    sku: string;
    units: number;
    selling_price: number;
  }>;
  payment_method: string;
  sub_total: number;
  length: number;
  breadth: number;
  height: number;
  weight: number;
}

export interface ShiprocketWebhookPayload {
  awb: string;
  order_id: string;
  shipment_id: string;
  current_status: string;
  current_status_id: number;
  delivered_date?: string;
  etd?: string;
}

export interface AuthRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}
```

---

## Step 6: src/lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

---

## Step 7: src/lib/shiprocket.ts

This is the core Shiprocket integration with token caching (valid for 24h).

```typescript
import axios, { AxiosInstance } from 'axios';
import { ShiprocketTokenCache, DeliveryRate, CreateShipmentPayload } from '../types';

const SHIPROCKET_BASE_URL = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (Shiprocket tokens last 24h)

// In-memory token cache — single instance per process
let tokenCache: ShiprocketTokenCache | null = null;

/**
 * Authenticate with Shiprocket and return a valid bearer token.
 * Caches the token for 23 hours to avoid repeated logins.
 */
async function getShiprocketToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid
  if (tokenCache && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    throw new Error('SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD must be set');
  }

  const response = await axios.post(`${SHIPROCKET_BASE_URL}/auth/login`, {
    email,
    password,
  });

  const token: string = response.data.token;
  if (!token) {
    throw new Error('Shiprocket authentication failed — no token returned');
  }

  tokenCache = {
    token,
    expiresAt: now + TOKEN_TTL_MS,
  };

  return token;
}

/**
 * Create an authenticated Axios instance for Shiprocket API calls.
 */
async function getShiprocketClient(): Promise<AxiosInstance> {
  const token = await getShiprocketToken();
  return axios.create({
    baseURL: SHIPROCKET_BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Invalidate the cached token (call if API returns 401).
 */
export function invalidateToken(): void {
  tokenCache = null;
}

/**
 * Get delivery rates for a given pincode and weight.
 * Returns rates from all available couriers.
 */
export async function getDeliveryRates(
  pickupPostcode: string,
  deliveryPostcode: string,
  weightKg: number,
  codAmount?: number
): Promise<DeliveryRate[]> {
  const client = await getShiprocketClient();

  const params: Record<string, string | number> = {
    pickup_postcode: pickupPostcode,
    delivery_postcode: deliveryPostcode,
    weight: weightKg,
    cod: codAmount ? 1 : 0,
  };

  if (codAmount) {
    params.cod_amount = codAmount;
  }

  try {
    const response = await client.get('/courier/serviceability/', { params });
    const couriersData = response.data?.data?.available_courier_companies ?? [];

    return couriersData.map((courier: Record<string, unknown>) => ({
      courier_company_id: courier.courier_company_id as number,
      courier_name: courier.courier_name as string,
      rate: courier.rate as number,
      estimated_delivery_days: courier.estimated_delivery_days as number,
      cod_charges: (courier.cod_charges as number) ?? 0,
      freight_charge: courier.freight_charge as number,
    }));
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      invalidateToken();
      throw new Error('Shiprocket token expired — please retry');
    }
    throw error;
  }
}

/**
 * Create a shipment on Shiprocket.
 * Returns the AWB code and shipment_id on success.
 */
export async function createShipment(payload: CreateShipmentPayload): Promise<{
  shipment_id: string;
  awb_code: string;
  courier_name: string;
  label_url: string;
}> {
  const client = await getShiprocketClient();

  try {
    // Step 1: Create the order
    const orderResponse = await client.post('/orders/create/adhoc', payload);
    const { shipment_id, order_id: srOrderId } = orderResponse.data;

    if (!shipment_id) {
      throw new Error('Shiprocket order creation failed — no shipment_id returned');
    }

    // Step 2: Assign AWB (auto-assign best courier)
    const awbResponse = await client.post('/courier/assign/awb', {
      shipment_id: shipment_id.toString(),
    });

    const awbCode: string = awbResponse.data?.response?.data?.awb_code;
    const courierName: string = awbResponse.data?.response?.data?.courier_name ?? '';

    if (!awbCode) {
      throw new Error('AWB assignment failed');
    }

    // Step 3: Generate shipping label
    const labelResponse = await client.post('/courier/generate/label', {
      shipment_id: [shipment_id],
    });

    const labelUrl: string = labelResponse.data?.label_url ?? '';

    return {
      shipment_id: shipment_id.toString(),
      awb_code: awbCode,
      courier_name: courierName,
      label_url: labelUrl,
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      invalidateToken();
      throw new Error('Shiprocket token expired — please retry');
    }
    throw error;
  }
}

/**
 * Track a shipment by AWB code.
 */
export async function trackShipment(awbCode: string): Promise<{
  current_status: string;
  current_timestamp: string;
  delivered_date: string | null;
  etd: string | null;
  tracking_data: unknown[];
}> {
  const client = await getShiprocketClient();

  try {
    const response = await client.get(`/courier/track/awb/${awbCode}`);
    const trackingData = response.data?.tracking_data;

    return {
      current_status: trackingData?.shipment_status ?? 'Unknown',
      current_timestamp: trackingData?.timestamp ?? new Date().toISOString(),
      delivered_date: trackingData?.delivered_date ?? null,
      etd: trackingData?.etd ?? null,
      tracking_data: trackingData?.track_activities ?? [],
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      invalidateToken();
      throw new Error('Shiprocket token expired — please retry');
    }
    throw error;
  }
}
```

---

## Step 8: src/middleware/auth.ts

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
  };
}

/**
 * Validate Supabase JWT from Authorization header.
 * Attaches user to request on success.
 */
export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return;
  }

  req.user = {
    id: data.user.id,
    email: data.user.email ?? '',
    role: data.user.user_metadata?.role,
  };

  next();
}

/**
 * Require seller role.
 */
export function requireSeller(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    res.status(403).json({ success: false, error: 'Seller access required' });
    return;
  }

  next();
}
```

---

## Step 9: src/routes/delivery.ts

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware, requireSeller, AuthenticatedRequest } from '../middleware/auth';
import { supabaseAdmin } from '../lib/supabase';
import {
  getDeliveryRates,
  createShipment,
  trackShipment,
} from '../lib/shiprocket';
import { ShiprocketWebhookPayload } from '../types';

const router = Router();

// ─── GET /api/delivery/rates ────────────────────────────────────────────────
// Query params: pincode (buyer), weight (kg)
// Returns list of available couriers with rates.
router.get(
  '/rates',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { pincode, weight } = req.query;

    if (!pincode || !weight) {
      res.status(400).json({
        success: false,
        error: 'pincode and weight are required query parameters',
      });
      return;
    }

    // Validate Indian pincode (6 digits)
    if (!/^\d{6}$/.test(pincode as string)) {
      res.status(400).json({ success: false, error: 'Invalid pincode — must be 6 digits' });
      return;
    }

    const weightKg = parseFloat(weight as string);
    if (isNaN(weightKg) || weightKg <= 0) {
      res.status(400).json({ success: false, error: 'Weight must be a positive number (in kg)' });
      return;
    }

    // Use a default pickup pincode from env (seller warehouse)
    const pickupPincode = process.env.WAREHOUSE_PINCODE ?? '400001';

    const rates = await getDeliveryRates(
      pickupPincode,
      pincode as string,
      weightKg
    );

    res.json({
      success: true,
      data: {
        rates,
        buyer_pincode: pincode,
        pickup_pincode: pickupPincode,
        weight_kg: weightKg,
      },
    });
  }
);

// ─── POST /api/delivery/shipments ───────────────────────────────────────────
// Body: { order_id }
// Fetches order details from DB, creates shipment in Shiprocket.
router.post(
  '/shipments',
  authMiddleware,
  requireSeller,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { order_id } = req.body;

    if (!order_id) {
      res.status(400).json({ success: false, error: 'order_id is required' });
      return;
    }

    // Fetch order with items and buyer info
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          id,
          product_id,
          quantity,
          price,
          products ( name, sku )
        ),
        stores!inner ( seller_id, name, pincode )
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    // Verify seller owns this order's store
    if (order.stores.seller_id !== req.user!.id) {
      res.status(403).json({ success: false, error: 'Access denied — not your order' });
      return;
    }

    if (order.status !== 'packed') {
      res.status(400).json({
        success: false,
        error: `Cannot ship order with status "${order.status}" — must be "packed"`,
      });
      return;
    }

    if (order.awb_code) {
      res.status(409).json({ success: false, error: 'Shipment already created for this order' });
      return;
    }

    // Build Shiprocket payload
    const buyerNameParts = (order.buyer_name as string).split(' ');
    const shipmentPayload = {
      order_id: order.id,
      order_date: new Date(order.created_at).toISOString().split('T')[0],
      pickup_location: 'Primary',
      billing_customer_name: buyerNameParts[0] ?? 'Customer',
      billing_last_name: buyerNameParts.slice(1).join(' ') ?? '',
      billing_address: order.delivery_address?.street ?? '',
      billing_city: order.delivery_address?.city ?? '',
      billing_pincode: order.delivery_address?.pincode ?? '',
      billing_state: order.delivery_address?.state ?? '',
      billing_country: 'India',
      billing_email: order.buyer_email ?? '',
      billing_phone: (order.buyer_phone as string).replace('+91', ''),
      shipping_is_billing: true,
      order_items: order.order_items.map((item: Record<string, unknown>) => ({
        name: (item.products as Record<string, unknown>)?.name ?? 'Product',
        sku: (item.products as Record<string, unknown>)?.sku ?? item.product_id,
        units: item.quantity,
        selling_price: item.price,
      })),
      payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
      sub_total: order.total_amount,
      length: 15,
      breadth: 10,
      height: 5,
      weight: order.total_weight_kg ?? 0.5,
    };

    const shipmentResult = await createShipment(shipmentPayload);

    // Update order with AWB and shipment details
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'shipped',
        awb_code: shipmentResult.awb_code,
        shiprocket_shipment_id: shipmentResult.shipment_id,
        courier_name: shipmentResult.courier_name,
        label_url: shipmentResult.label_url,
        shipped_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    if (updateError) {
      throw new Error(`Order update failed: ${updateError.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        order_id,
        shipment_id: shipmentResult.shipment_id,
        awb_code: shipmentResult.awb_code,
        courier_name: shipmentResult.courier_name,
        label_url: shipmentResult.label_url,
      },
      message: 'Shipment created successfully',
    });
  }
);

// ─── GET /api/delivery/track/:awbCode ───────────────────────────────────────
router.get(
  '/track/:awbCode',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { awbCode } = req.params;

    if (!awbCode || awbCode.trim() === '') {
      res.status(400).json({ success: false, error: 'AWB code is required' });
      return;
    }

    // Verify the order with this AWB belongs to the requesting user
    // (either buyer or seller of that order)
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, buyer_id, stores!inner(seller_id)')
      .eq('awb_code', awbCode)
      .single();

    if (order) {
      const userId = req.user!.id;
      const isBuyer = order.buyer_id === userId;
      const isSeller = (order.stores as Record<string, unknown>).seller_id === userId;

      if (!isBuyer && !isSeller) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
    }

    const trackingInfo = await trackShipment(awbCode);

    res.json({
      success: true,
      data: {
        awb_code: awbCode,
        ...trackingInfo,
      },
    });
  }
);

// ─── POST /api/delivery/webhook ─────────────────────────────────────────────
// PUBLIC endpoint — called by Shiprocket when delivery status changes.
// Map Shiprocket status codes to internal order statuses.
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  const payload = req.body as ShiprocketWebhookPayload;

  // Shiprocket sends different payload shapes — normalise
  const awbCode = payload.awb ?? req.body.AWB;
  const currentStatus = payload.current_status ?? req.body.Status;

  if (!awbCode) {
    // Acknowledge but skip — not a tracking update
    res.json({ success: true, message: 'Ignored — no AWB' });
    return;
  }

  // Map Shiprocket statuses to internal statuses
  const statusMap: Record<string, string> = {
    'Picked Up': 'shipped',
    'In Transit': 'shipped',
    'Out For Delivery': 'out_for_delivery',
    Delivered: 'delivered',
    'RTO Initiated': 'return_initiated',
    'RTO Delivered': 'returned',
    Cancelled: 'cancelled',
  };

  const internalStatus = statusMap[currentStatus];

  if (!internalStatus) {
    // Acknowledge unknown status — don't fail the webhook
    res.json({ success: true, message: `Status "${currentStatus}" not mapped — skipped` });
    return;
  }

  // Find the order by AWB code
  const { data: order, error: findError } = await supabaseAdmin
    .from('orders')
    .select('id, status')
    .eq('awb_code', awbCode)
    .single();

  if (findError || !order) {
    // Acknowledge so Shiprocket doesn't retry endlessly
    res.json({ success: true, message: 'Order not found — webhook acknowledged' });
    return;
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    status: internalStatus,
    updated_at: new Date().toISOString(),
  };

  if (internalStatus === 'delivered' && payload.delivered_date) {
    updatePayload.delivered_at = payload.delivered_date;
  }

  const { error: updateError } = await supabaseAdmin
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id);

  if (updateError) {
    // Log but still acknowledge — don't cause Shiprocket to retry
    console.error(`[Delivery Webhook] DB update failed for AWB ${awbCode}:`, updateError.message);
    res.json({ success: true, message: 'Webhook received — DB update failed (logged)' });
    return;
  }

  res.json({
    success: true,
    message: `Order ${order.id} status updated to "${internalStatus}"`,
  });
});

export default router;
```

---

## Step 10: src/index.ts

```typescript
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import deliveryRoutes from './routes/delivery';

const app = express();
const PORT = process.env.PORT ?? 3004;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));
app.use(express.json());

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({ success: true, service: 'delivery-service', status: 'healthy' });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/delivery', deliveryRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Delivery Service Error]', err.message, err.stack);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[Delivery Service] Running on port ${PORT}`);
});

export default app;
```

---

## Step 11: Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
```

---

## Step 12: Supabase — Columns Needed on `orders` Table

Run this migration if these columns don't exist:

```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS awb_code TEXT,
  ADD COLUMN IF NOT EXISTS shiprocket_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS courier_name TEXT,
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_weight_kg NUMERIC DEFAULT 0.5;

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_orders_awb_code ON orders(awb_code);
```

---

## Done When Checklist

- [ ] `npm run dev` starts without errors on port 3004
- [ ] `GET /health` returns `{ success: true, status: "healthy" }`
- [ ] `GET /api/delivery/rates?pincode=400001&weight=0.5` returns courier list
- [ ] Invalid pincode (< 6 digits) returns 400 with clear error
- [ ] `POST /api/delivery/shipments` with valid `order_id` creates shipment and sets `status = "shipped"` with AWB in DB
- [ ] Seller cannot create shipment for another seller's order (403)
- [ ] Shipment creation fails with 400 if order is not in `"packed"` status
- [ ] `GET /api/delivery/track/:awbCode` returns tracking events
- [ ] `POST /api/delivery/webhook` with `{ awb, current_status: "Delivered" }` sets `status = "delivered"` in DB
- [ ] Webhook returns 200 even when AWB is not found (no retries from Shiprocket)
- [ ] Shiprocket token is cached and reused across requests — only one login call per 23h
- [ ] Token cache is invalidated on 401 response from Shiprocket
- [ ] No API keys in source code — all from env
- [ ] Docker build succeeds and service runs on port 3000 inside container
