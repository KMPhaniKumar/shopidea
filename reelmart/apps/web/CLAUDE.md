# Web app — context for this directory

**Next.js 14 (App Router)** on **Vercel** → `https://dev.reelmart.in` (Vercel project `shopidea`). Public storefront + marketplace home + seller dashboard + admin, one app.

## Surfaces
- `/` marketplace home (sellers by category + auto-scroll product carousels), `/store/[slug]`, `/store/[slug]/product/[id]`, `/store/[slug]/checkout`, `/order/[id]`, `/track/[awb]`
- `/seller/*` (register, login, dashboard, products, orders, settings, payouts …) — gated by `components/seller/SellerGate.tsx` (approval status)
- `/admin/*` (sellers + `/admin/sellers/[id]` KYC review, orders + `/admin/orders/[id]` tracking, payments, returns, payouts)
- `/api/*` Next route handlers (e.g. `api/admin/stores/[id]` — the **real** store-approval path; `api/seller/pickup/sync`)

## How it connects
- Talks to the **deployed backend** at `NEXT_PUBLIC_API_URL` / `API_URL` = `https://api-dev.reelmart.in` (ECS Fargate). Local `.env.local` is minimal — real env comes from Vercel.
- **Auth:** MSG91 OTP widget → `admin-service` bridge; client helper `lib/msg91-otp.ts` (`sendOtp`/`verifyOtp`/`exchangeForSupabaseSession`/`checkPhoneRegistered`). Login passes `createIfMissing:false`.
- Supabase clients in `lib/supabase/` (browser `client.ts`, server `server.ts`); admin pages use the service-role key.
- KYC docs in the private `seller-documents` bucket (signed URLs); Google Places via `lib/saved-addresses.ts` + `components/AddressSearch.tsx`.

## Conventions / gotchas
- `next.config` has `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` = true (pre-existing TS errors won't fail the build) — **run `npx tsc --noEmit` yourself** to verify your changes; filter out the known pre-existing errors (marketing/products resolver, buyer-app types path).
- Tailwind; Zustand for global state; `lib/site-url.ts` for URLs.
- Deploy: push to `main` → Vercel + `.github/workflows/deploy.yml`.
- Pending: Razorpay checkout still a TODO in `app/store/[slug]/checkout/CheckoutClient.tsx` (effectively COD-only).
