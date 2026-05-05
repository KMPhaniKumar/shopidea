# MS-08: Payout Service
> Weekly seller payout calculation and processing. Manages bank accounts.

**Port (local):** 3007 | **Docker:** 3000  
**Prefix:** `/api/payouts`

---

## Step 1: src/lib/payoutCalculator.ts

```typescript
import { supabaseAdmin } from './supabase'

const PLATFORM_FEE_PCT = 0.05 // 5%

export async function calculateAndProcessPayouts() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Find all delivered+paid orders with no payout yet
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, store_id, total_amount, delivery_fee')
    .eq('status', 'delivered')
    .eq('payment_status', 'paid')
    .is('payout_id', null)
    .lte('delivered_at', sevenDaysAgo)

  if (!orders || orders.length === 0) return { processed: 0, totalAmount: 0 }

  // Group by store
  const byStore = new Map<string, { orderIds: string[]; gross: number }>()
  for (const order of orders) {
    const existing = byStore.get(order.store_id) ?? { orderIds: [], gross: 0 }
    existing.orderIds.push(order.id)
    existing.gross += order.total_amount - order.delivery_fee // exclude delivery fee
    byStore.set(order.store_id, existing)
  }

  let totalProcessed = 0
  let totalAmount = 0

  for (const [storeId, { orderIds, gross }] of byStore) {
    const netAmount = gross * (1 - PLATFORM_FEE_PCT)
    const periodStart = sevenDaysAgo
    const periodEnd = new Date().toISOString()

    // Create payout record
    const { data: payout } = await supabaseAdmin.from('payouts').insert({
      store_id: storeId,
      amount: netAmount,
      order_count: orderIds.length,
      status: 'pending',
      period_start: periodStart,
      period_end: periodEnd,
    }).select('id').single()

    if (!payout) continue

    // Link orders to payout
    await supabaseAdmin.from('orders').update({ payout_id: payout.id }).in('id', orderIds)

    totalProcessed++
    totalAmount += netAmount
  }

  return { processed: totalProcessed, totalAmount }
}
```

---

## Step 2: src/routes/payouts.ts

```typescript
import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth, requireAdmin } from '../middleware/auth'
import { calculateAndProcessPayouts } from '../lib/payoutCalculator'

export const payoutsRouter = Router()

// GET /api/payouts — seller lists own payouts
payoutsRouter.get('/', requireAuth, async (req, res) => {
  const { storeId } = req.query
  if (!storeId) return res.status(400).json({ success: false, error: 'storeId required' })

  const { data } = await supabaseAdmin
    .from('payouts')
    .select('*')
    .eq('store_id', storeId as string)
    .order('created_at', { ascending: false })
    .limit(20)
  res.json({ success: true, data: data ?? [] })
})

// GET /api/payouts/summary?storeId=&sellerId= — seller payout summary
payoutsRouter.get('/summary', requireAuth, async (req, res) => {
  const { storeId, sellerId } = req.query

  const [ordersRes, payoutsRes] = await Promise.all([
    supabaseAdmin.from('orders').select('total_amount, delivery_fee').eq('store_id', storeId as string).eq('payment_status', 'paid'),
    supabaseAdmin.from('payouts').select('amount, status').eq('store_id', storeId as string),
  ])

  const totalEarned = (ordersRes.data ?? []).reduce((s, o) => s + (o.total_amount - o.delivery_fee) * 0.95, 0)
  const totalPaid = (payoutsRes.data ?? []).filter(p => p.status === 'done').reduce((s, p) => s + p.amount, 0)
  const pending = totalEarned - totalPaid

  res.json({ success: true, data: { totalEarned, totalPaid, pending } })
})

// POST /api/payouts/process — admin triggers weekly payout
payoutsRouter.post('/process', requireAdmin, async (req, res) => {
  try {
    const result = await calculateAndProcessPayouts()
    res.json({ success: true, data: result })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message })
  }
})
```

---

## Step 3: src/routes/bankAccounts.ts

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { supabaseAdmin } from '../lib/supabase'
import { requireAuth } from '../middleware/auth'

export const bankAccountsRouter = Router()

// GET /api/payouts/bank-account?sellerId= — get bank account
bankAccountsRouter.get('/bank-account', requireAuth, async (req, res) => {
  const { sellerId } = req.query
  const { data } = await supabaseAdmin
    .from('bank_accounts')
    .select('*')
    .eq('seller_id', sellerId as string)
    .maybeSingle()
  res.json({ success: true, data })
})

// POST /api/payouts/bank-account — save/update bank account
bankAccountsRouter.post('/bank-account', requireAuth, async (req, res) => {
  const schema = z.object({
    seller_id: z.string().uuid(),
    account_number: z.string().min(8),
    account_holder: z.string().min(2),
    ifsc_code: z.string().length(11),
    bank_name: z.string(),
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.message })

  const { data, error } = await supabaseAdmin
    .from('bank_accounts')
    .upsert(parsed.data, { onConflict: 'seller_id' })
    .select('*').single()

  if (error) return res.status(400).json({ success: false, error: error.message })
  res.json({ success: true, data })
})
```

---

## Step 4: .env.example

```env
PORT=3000
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
```

---

## Done When

- [ ] `GET /api/payouts?storeId=` returns payout history
- [ ] `GET /api/payouts/summary?storeId=` returns `{ totalEarned, totalPaid, pending }`
- [ ] `POST /api/payouts/process` (admin) calculates payouts, creates payout records, links orders
- [ ] `GET /api/payouts/bank-account?sellerId=` returns bank account
- [ ] `POST /api/payouts/bank-account` upserts bank account
