---
name: web-storefront
description: Deep context + dev guide for ReelMart's public buyer web — marketplace home, store/product pages, cart, checkout (OTP + Razorpay), orders and tracking. Use for any public storefront / buyer-facing web work. Read web-foundation first.
---

# web-storefront — public buyer web (dev.reelmart.in)

**Dir:** `reelmart/apps/web` · read **web-foundation** first (tokens, supabase, auth, deploy).

## Routes
- `/` — marketplace home (`components/home/MarketplaceClient.tsx`: search, category widgets, seller widgets; `Scroller` auto+manual, `ProductCarousel`, `SellerCarousel`, `BrowseMenu`). Full-width header (logo+Browse left, auth + "Sell on ReelMart" far right; logo click → home, no logout).
- `/stores`, `/stores/[category]` — browse.
- `/store/[slug]` — storefront. `/store/[slug]/product/[productId]` — product page (image left / details right).
- `/store/[slug]/checkout` — **checkout** (`CheckoutClient.tsx`). `/s/[slug]` — short share link.
- `/order/[id]`, `/orders` — buyer order(s). `/track/[awb]` — tracking (ReelMart-branded, no courier branding).

## Buyer auth & cart
- `components/BuyerLoginModal.tsx` (portaled to `document.body` to escape header backdrop-blur; login/signup modes), `BuyerAuthNav.tsx` (Log in / Sign up / account menu), `TestLoginButtons.tsx` (dev). OTP via `lib/msg91-otp.ts`.
- Cart in `lib/cart.ts`; checkout supports cart edit/remove. Address via `AddressSearch.tsx` + `lib/saved-addresses.ts` (Google Maps key).

## Checkout flow (critical)
- **COD:** order inserted on placement.
- **Online:** `payment-service /create-order` (amount only) → Razorpay modal (`NEXT_PUBLIC` key id only) → **`payment-service /confirm`** creates the order ONLY after the signature verifies. A cancelled/failed payment must create **no** order (this fixed the ghost/duplicate-order bug). Never put the Razorpay secret client-side.

## Gotchas / risks
- Mobile-first: everything must work on small viewports.
- Login is required at checkout for buyers; don't reintroduce pre-payment online-order creation.
- Don't leak seller KYC/PII on public pages.

## Dev / deploy
`cd reelmart/apps/web && npm run dev` to test; `npm run build` to catch type errors. Ship via git push → Vercel. Test-login on dev hosts; Razorpay test mode (`success@razorpay`).

See **web-foundation**, `FLOWS.md`, `payment-service` & `order-service` skills.
