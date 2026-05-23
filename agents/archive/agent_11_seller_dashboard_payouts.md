# AGENT 11: Seller Dashboard + Profile + Settings + Payouts
### File: agents/agent_11_seller_dashboard_payouts.md

---

## What This Covers

- Seller home dashboard (summary of today)
- Seller profile editing
- Bank account setup for payouts
- Payout history and withdrawal
- Notification preferences
- Account settings

---

## Step 1: Database Migrations

Create `supabase/migrations/006_seller_payouts.sql`:

```sql
-- Seller bank details (for payouts)
CREATE TABLE public.seller_bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) UNIQUE NOT NULL,
  account_holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  ifsc_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  razorpay_fund_account_id TEXT,  -- stored after Razorpay verification
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seller_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own bank account"
ON public.seller_bank_accounts FOR ALL
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
);

-- Payouts table
CREATE TABLE public.payouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES public.stores(id) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  platform_fee DECIMAL(10,2) DEFAULT 0,
  net_amount DECIMAL(10,2) NOT NULL,
  order_ids UUID[] NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  razorpay_payout_id TEXT,
  failure_reason TEXT,
  initiated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers see own payouts"
ON public.payouts FOR SELECT
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
);

-- Seller notification preferences
CREATE TABLE public.seller_preferences (
  store_id UUID REFERENCES public.stores(id) PRIMARY KEY,
  notify_new_order_whatsapp BOOLEAN DEFAULT true,
  notify_new_order_push BOOLEAN DEFAULT true,
  notify_payment_whatsapp BOOLEAN DEFAULT true,
  notify_low_stock_push BOOLEAN DEFAULT true,
  notify_review_push BOOLEAN DEFAULT true,
  auto_accept_orders BOOLEAN DEFAULT false,
  store_open_time TIME DEFAULT '09:00',
  store_close_time TIME DEFAULT '21:00',
  is_accepting_orders BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.seller_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own preferences"
ON public.seller_preferences FOR ALL
USING (
  store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid())
);

-- Device tokens for push notifications
CREATE TABLE public.device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) NOT NULL,
  token TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own device tokens"
ON public.device_tokens FOR ALL
USING (user_id = auth.uid());
```

---

## Step 2: Seller Dashboard Home Screen

Create `apps/seller-app/src/screens/dashboard/HomeScreen.tsx`:

### What to show:

```typescript
// Fetch all dashboard data in parallel on screen load
const [summary, pendingOrders, lowStock, recentOrders] = await Promise.all([
  getTodaySummary(storeId),       // revenue + order count today
  getPendingOrders(storeId),      // orders needing action
  getLowStockProducts(storeId),   // stock below 3
  getRecentOrders(storeId, 5),    // last 5 orders
])
```

### Screen Layout:
```
┌─────────────────────────────┐
│ Good morning, [Name]! 👋    │
│ [Store Name]                │
│ ⭐ 4.8  •  Open ✅          │
├─────────────────────────────┤
│ TODAY                       │
│ ₹2,450 revenue  •  8 orders │
├─────────────────────────────┤
│ ⚠️ NEEDS ACTION (2)        │
│ [Order card] [Order card]   │
├─────────────────────────────┤
│ ⚠️ LOW STOCK (1)           │
│ Chocolate Cake — 2 left     │
├─────────────────────────────┤
│ RECENT ORDERS               │
│ [Order list...]             │
└─────────────────────────────┘
```

### Store Open/Close Toggle:
```typescript
// Seller can toggle store open/closed
async function toggleStoreOpen(storeId: string, isOpen: boolean) {
  await supabase
    .from('seller_preferences')
    .upsert({ store_id: storeId, is_accepting_orders: isOpen })

  await supabase
    .from('stores')
    .update({ is_active: isOpen })
    .eq('id', storeId)
}
```

---

## Step 3: Seller Profile Edit Screen

Create `apps/seller-app/src/screens/profile/EditProfileScreen.tsx`:

Fields to edit:
- Name
- City and area
- WhatsApp number (used for bot)
- Instagram handle
- Store description
- Store logo (re-upload)
- Store category

```typescript
async function updateSellerProfile(userId: string, storeId: string, data: {
  name?: string
  city?: string
  area?: string
  description?: string
  whatsappNumber?: string
  instagramHandle?: string
}) {
  await Promise.all([
    supabase.from('users').update({ name: data.name, city: data.city }).eq('id', userId),
    supabase.from('stores').update({
      city: data.city,
      area: data.area,
      description: data.description,
      whatsapp_number: data.whatsappNumber,
      instagram_handle: data.instagramHandle,
    }).eq('id', storeId),
  ])
}
```

---

## Step 4: Bank Account Setup

Create `apps/seller-app/src/screens/payouts/BankAccountScreen.tsx`:

```typescript
// Save bank details
async function saveBankAccount(storeId: string, data: {
  accountHolderName: string
  accountNumber: string
  ifscCode: string
  bankName: string
}) {
  // Validate IFSC format (11 chars, first 4 alpha)
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/
  if (!ifscRegex.test(data.ifscCode)) throw new Error('Invalid IFSC code')

  const { error } = await supabase
    .from('seller_bank_accounts')
    .upsert({
      store_id: storeId,
      account_holder_name: data.accountHolderName,
      account_number: data.accountNumber,
      ifsc_code: data.ifscCode,
      bank_name: data.bankName,
    })
  if (error) throw error
}
```

Screen fields:
- Account holder name
- Account number (masked display after save)
- Confirm account number
- IFSC code with bank name auto-fetch
- Bank name (auto-filled from IFSC lookup)

---

## Step 5: Payout History Screen

Create `apps/seller-app/src/screens/payouts/PayoutHistoryScreen.tsx`:

```typescript
// Get payout summary
async function getPayoutSummary(storeId: string) {
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, payment_status, status')
    .eq('store_id', storeId)
    .eq('payment_status', 'paid')
    .eq('status', 'delivered')

  const { data: payouts } = await supabase
    .from('payouts')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })

  const totalEarned = orders?.reduce((s, o) => s + o.total_amount, 0) ?? 0
  const totalPaid = payouts
    ?.filter(p => p.status === 'completed')
    .reduce((s, p) => s + p.net_amount, 0) ?? 0

  return {
    totalEarned,
    totalPaid,
    pendingAmount: totalEarned - totalPaid,
    payouts: payouts ?? [],
  }
}
```

Screen layout:
- Pending balance card (with "Next payout: Monday" info)
- Total earned vs total paid out
- Payout history list — date, amount, status
- Each payout shows which orders it covers

---

## Step 6: Seller Settings Screen

Create `apps/seller-app/src/screens/settings/SettingsScreen.tsx`:

Settings sections:
```
STORE SETTINGS
├── Store open/close toggle
├── Store hours (from/to)
├── Auto-accept orders toggle

NOTIFICATIONS
├── New order — WhatsApp toggle
├── New order — Push toggle
├── Payment received — WhatsApp toggle
├── Low stock alerts — Push toggle
├── New review — Push toggle

ACCOUNT
├── Edit profile
├── Bank account / Payouts
├── Privacy Policy
├── Terms of Service
├── Contact Support
├── Log out
├── Delete account
```

```typescript
async function savePreferences(storeId: string, prefs: Partial<SellerPreferences>) {
  await supabase
    .from('seller_preferences')
    .upsert({ store_id: storeId, ...prefs })
}
```

---

## Step 7: Device Token Registration

Register push token when app opens:

```typescript
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'

async function registerPushToken(userId: string) {
  if (!Device.isDevice) return  // skip simulator

  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const token = (await Notifications.getExpoPushTokenAsync()).data

  await supabase
    .from('device_tokens')
    .upsert({ user_id: userId, token, platform: Platform.OS })
}

// Call this in App.tsx after login
useEffect(() => {
  if (user) registerPushToken(user.id)
}, [user])
```

---

## Done When

- [ ] Seller home shows today's revenue and pending orders
- [ ] Store open/close toggle works instantly
- [ ] Seller can edit all profile fields
- [ ] Bank account saved and validated
- [ ] Payout history shows correctly
- [ ] All notification preferences save and apply
- [ ] Push token registered on app open
