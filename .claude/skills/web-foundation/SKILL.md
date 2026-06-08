---
name: web-foundation
description: Shared foundation for ReelMart's Next.js web app — design tokens, Supabase SSR clients, auth/session, env vars, lib helpers, and Vercel deploy. Read this first for ANY web (dev.reelmart.in) work, then the surface-specific skill (web-storefront / web-seller-dashboard / web-admin-dashboard).
---

# web-foundation — ReelMart web (Next.js 14) common context

**Dir:** `reelmart/apps/web` · **Next.js 14 App Router** · **Vercel** project `shopidea` → `dev.reelmart.in`
Surfaces (each has its own skill): **web-storefront** (public buyer), **web-seller-dashboard**, **web-admin-dashboard**. Mobile is separate → **buyer-app**.

## Design tokens (Tailwind, `tailwind.config`)
`primary #FF6B2B` · `surface #F9F9F9` · `border #EEEEEE` · `secondary #666` · `muted #AAA` · font **Outfit** (`font-sans`) · `rounded-card` / `rounded-btn`. **No "free"/"free forever"/"no card needed" copy** — ReelMart is commercial (see memory `feedback_no_free_positioning`).

## Data access (hybrid)
- **Supabase directly** for most reads/writes via `@supabase/ssr`: browser client `lib/supabase/client.ts` (cookies), server client `lib/supabase/server.ts` (RSC/route handlers). RLS applies to these.
- **Backend microservices** via `NEXT_PUBLIC_API_URL` (the ALB `api-dev.reelmart.in`) for service logic (payments, delivery, etc.).
- **A few Next route handlers** (`app/api/*`) act as server-side proxies (e.g. `app/api/admin/stores/[id]`, `app/api/seller/pickup/sync`).

## Auth / session
Login = **MSG91 OTP widget** (`lib/msg91-otp.ts`) → admin-service auth bridge → Supabase session (cookies). Roles buyer/seller/admin. Dev **test-login** via `NEXT_PUBLIC_ALLOW_TEST_LOGIN` (`components/TestLoginButtons.tsx`). State: **Zustand** (`store/*`).

## Env (`NEXT_PUBLIC_*`)
`API_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SITE_URL`, `ALLOW_TEST_LOGIN`, `GOOGLE_MAPS_KEY`, `MSG91…`. Never put the service-role or Razorpay secret client-side — only publishable keys.

## Useful lib helpers
`lib/cart.ts`, `lib/categories.ts`, `lib/kyc.ts`, `lib/msg91-otp.ts`, `lib/site-url.ts`, `lib/saved-addresses.ts`, `lib/pickup.ts`, `lib/admin-api.ts`.

## Conventions & deploy
TypeScript, App Router, Tailwind, Zustand, mobile-first (most buyers on Android). Ship by **git push to `main` → Vercel auto-deploys** (NOT ECS). Keep changes backward-compatible with the deployed backend.

See `reelmart/apps/web/CLAUDE.md`, `agents_reports/SECURITY_AUDIT.md` (client secret leakage).
