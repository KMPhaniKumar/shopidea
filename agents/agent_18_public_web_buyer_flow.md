# Agent 18 — Public Web Buyer Flow

**Status:** ✅ DONE (2026-05-08)
**Goal:** Sellers share a single link from Instagram bio → buyers can browse + order **without installing the app** → after placing the order they're prompted to install the app for tracking → on install + login with same phone, all their orders + addresses are already there.

---

## What was built

### Routes

| Path | File | Type | Purpose |
|------|------|------|---------|
| `/store/[slug]` | `apps/web/app/store/[slug]/page.tsx` | RSC + ISR (`revalidate: 60`) | Public storefront — products, search, cart |
| `/store/[slug]` (client) | `apps/web/app/store/[slug]/StoreClient.tsx` | Client | Cart in localStorage, sticky footer |
| `/store/[slug]/checkout` | `apps/web/app/store/[slug]/checkout/page.tsx` | RSC | Fetches store, hands off to client |
| `/store/[slug]/checkout` (client) | `apps/web/app/store/[slug]/checkout/CheckoutClient.tsx` | Client | Multi-step state machine (cart → phone → otp → address → review) |
| `/order/[id]` | `apps/web/app/order/[id]/page.tsx` | RSC (force-dynamic) | Order confirmation |
| `/order/[id]` (client) | `apps/web/app/order/[id]/OrderConfirmedClient.tsx` | Client | Success UI + app download CTA |
| `/s/[slug]` | `apps/web/app/s/[slug]/page.tsx` | Server redirect | 308 → `/store/[slug]` (legacy URL) |

### Library code

| File | Purpose |
|------|---------|
| `apps/web/lib/cart.ts` | Cart persistence in localStorage, namespaced per store slug |
| `apps/buyer-app/src/lib/savedAddresses.ts` | Rewritten to use Supabase `addresses` table; falls back to AsyncStorage for guests; merges guest addresses into account on login |

### Mobile changes

| File | Change |
|------|--------|
| `apps/buyer-app/src/store/authStore.ts` | On `SIGNED_IN`, calls `mergeGuestAddressesIntoAccount()` so any addresses entered while guest sync into Supabase |
| `apps/buyer-app/src/screens/orders/OrderHistoryScreen.tsx` | Added `useFocusEffect` re-fetch + Supabase channel UPDATE subscription + pull-to-refresh — buyer sees seller status changes live |
| `apps/buyer-app/src/screens/orders/OrderTrackingScreen.tsx` | Added "Placed on …" date+time row in status banner |

---

## Architecture decisions

### Why localStorage for cart (not Supabase `cart_items`)
Anonymous browsing must work without auth. Once the buyer logs in at checkout, cart is replayed into the order insert. After successful order, cart is cleared. Supabase `cart_items` still exists for the **mobile app's cross-device cart**.

### Why ISR `revalidate: 60` on storefront
Sellers update products often, but a single store page handles many concurrent visitors when shared on Instagram. 60-second cache is the sweet spot — most visitors hit cached HTML, sellers see updates within 1 minute.

### Why phone OTP at checkout (not on storefront entry)
Browse-without-friction is the whole point of the public storefront. OTP only happens once they decide to buy. Same Supabase phone-auth flow as the mobile app — same `auth.users` row, same `user.id` everywhere.

### Why state machine in CheckoutClient (not separate routes per step)
- Single page = no full-page reloads = faster perceived flow
- Cart + phone + OTP + address all hydrate from one place
- Easy back button: `onClick={() => setStep('cart')}`
- Cleaner URL — buyer sees `/checkout` throughout, not `/checkout/phone`, `/checkout/otp`, etc.

### Why the same `addresses` table for web + mobile
Originally mobile used AsyncStorage. Switched to Supabase so:
- Address typed on web shows up in mobile app on first login (same phone → same `auth.uid()` → RLS shows their rows)
- One source of truth, one form of validation
- Default-address logic unified (was previously buggy — two addresses sharing a city couldn't both be set as default)

### Why "Track in app" CTA is the dominant element on confirmation page
Conversion goal of the entire web flow is **install the app**. Once a buyer has placed one order, they're a much higher-value app install candidate than a cold install. The CTA is in a black hero card with both store badges — visually dominates over the order summary.

---

## Data flow on a fresh buyer's first order

```
1. Buyer opens reelmart.in/store/suryaboutiques (Instagram link)
   → SSR fetches store + products → ships HTML

2. Buyer adds 2 items to cart
   → cart saved to localStorage[reelmart_cart_suryaboutiques]

3. Buyer taps "Proceed to Checkout"
   → /store/suryaboutiques/checkout

4. CheckoutClient mounts
   → loadCart(slug) hydrates cart
   → supabase.auth.getUser() returns null (not logged in)
   → step state stays 'cart'

5. Buyer reviews → "Continue" → step = 'phone'
6. Phone entered → "Send OTP" → supabase.auth.signInWithOtp({ phone: "+91..." })
7. OTP entered → step = 'otp' → supabase.auth.verifyOtp(...)
   → Session created, user.id assigned
   → upsert into users table (role='buyer')
   → loadAddresses(user.id) → empty list, step = 'address'

8. Buyer fills new address form → saveNewAddress()
   → INSERT into addresses (user_id, label, name, phone, line1, ..., is_default=true)
   → step = 'review'

9. Buyer picks COD → "Place Order"
   → INSERT into orders (buyer_id, store_id, items[], delivery_address{}, status='pending', payment_status='pending')
   → clearCart(slug) → localStorage cleared
   → router.push(`/order/${data.id}`)

10. Order confirmation page renders
    → SSR fetches order via RLS (auth cookie has session)
    → Big black "Track in ReelMart app" card → links to Play / App Store

11. Buyer installs app → opens it → enters same phone → OTP
    → supabase.auth.verifyOtp returns same user.id
    → OrderHistoryScreen calls fetchOrders(user.id) → sees their order
    → AddressesScreen loads → sees the address from step 8
```

---

## Files touched

```
apps/web/app/store/[slug]/page.tsx                        NEW
apps/web/app/store/[slug]/StoreClient.tsx                 NEW
apps/web/app/store/[slug]/checkout/page.tsx               NEW
apps/web/app/store/[slug]/checkout/CheckoutClient.tsx     NEW
apps/web/app/order/[id]/page.tsx                          NEW
apps/web/app/order/[id]/OrderConfirmedClient.tsx          NEW
apps/web/app/s/[slug]/page.tsx                            REWRITTEN (now redirect)
apps/web/app/s/[slug]/StorefrontClient.tsx                DELETED
apps/web/lib/cart.ts                                      NEW
apps/buyer-app/src/lib/savedAddresses.ts                  REWRITTEN (Supabase-backed)
apps/buyer-app/src/store/authStore.ts                     EDIT (calls merge on SIGNED_IN)
apps/buyer-app/src/screens/orders/OrderHistoryScreen.tsx  EDIT (realtime + refresh)
apps/buyer-app/src/screens/orders/OrderTrackingScreen.tsx EDIT (date/time)
```

---

## What's still pending

- **Razorpay web checkout SDK** — `placeOrder()` currently inserts the order with `payment_status: 'pending'` regardless of online/COD selection. Need to:
  1. POST to `/api/payments/create-order` with order amount → returns `razorpay_order_id`
  2. Open Razorpay checkout JS (`new (window as any).Razorpay({ key, order_id, ... }).open()`)
  3. On success handler → POST `/api/payments/verify` with signature → backend updates `payment_status: 'paid'`
  4. Then redirect to `/order/${id}`
- **Real Play Store / App Store URLs** in `OrderConfirmedClient.tsx` (`PLAY_STORE`, `APP_STORE` constants are placeholders)
- **Deep linking** — `reelmart.in/store/[slug]` should attempt to open the buyer mobile app if installed (Universal Links on iOS, App Links on Android)
- **Mobile-side cart sync** — when an authenticated user logs in, replay their localStorage cart from web (low priority, not a critical path)

---

## Testing checklist

- [ ] Browse `/store/<existing-slug>` without login — cart persists across reload
- [ ] Add to cart → checkout → enter test phone (`9999999999`) → OTP `123456` → address form → COD → order confirmation
- [ ] Re-visit cart on storefront after order placed — should be empty
- [ ] Open buyer mobile app → log in with `9999999999` → Orders tab → web order appears
- [ ] Mobile app → Profile → Saved Addresses → web-entered address appears
- [ ] Seller dashboard → Orders → seller sees the order in real time, accepts it
- [ ] Buyer mobile app on Orders tab — status auto-updates from "Order Placed" → "Confirmed" without refresh
