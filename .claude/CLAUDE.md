# CLAUDE.md — Master Instructions for Claude Code
### Place this file at: platform/.claude/CLAUDE.md

---

## Project Overview

You are building a unified social commerce platform for Indian micro-sellers
who sell via WhatsApp and Instagram. The platform gives sellers a storefront,
order management, and catalogue via a shareable link.

**Code lives in `reelmart/`; infra-as-code in `infra/terraform/`. Read these before starting work:**
- [`agents_reports/AUDIT_gaps.md`](../agents_reports/AUDIT_gaps.md) — **START HERE.** Canonical current status: real architecture, what's built, what's pending, test accounts.
- [`README.md`](../README.md) — project orientation
- [`MAINTENANCE.md`](../MAINTENANCE.md) — AI-maintenance setup: skills (`/deploy-service`, `/health-check`, `/db-migrate`, `/tf-drift`, `/triage`, `/aws-session`, `/refresh-status`), agents (team-organized: architects / development / ops / security), guardrails, CI
- [`TRACKER.md`](../TRACKER.md) — daily log
- [`FLOWS.md`](../FLOWS.md) — every screen's data flow

Nested `CLAUDE.md` files add local context automatically in `reelmart/services/`, `infra/terraform/`, and `reelmart/apps/web/`.

## Tech Stack (current — 2026-05)

- **Database + Auth + Storage + Realtime**: Supabase (project `nysgwdpmpxqmfwelfaxo`)
- **Auth (login)**: MSG91 OTP **widget** → auth-bridge in `admin-service` → Supabase session. (NOT Supabase Phone/Twilio.)
- **Backend**: **10 Node/Express/TS microservices** in `reelmart/services/*` (admin, analytics, catalog, delivery, notification, order, payment, payout, return, whatsapp). The old `reelmart/backend` monolith is GONE.
- **Backend hosting**: **AWS ECS Fargate** (cluster `reelmart-dev`, ap-south-1), images in ECR, behind ALB `api-dev.reelmart.in`. Infra in **Terraform** (`infra/terraform/`) — change infra there, not via raw AWS CLI.
- **Web**: Next.js 14 (App Router) on **Vercel** (`dev.reelmart.in`) — public storefront + marketplace home + seller dashboard + admin
- **Mobile**: React Native / **Expo** — `buyer-app` is the active app (seller-app parked)
- **Payments**: Razorpay (web checkout wiring + RazorpayX payouts still PENDING — see AUDIT)
- **Delivery / courier**: **NimbusPost** (NOT Shiprocket). Per-seller pickup registration in `delivery-service`.
- **WhatsApp**: Gupshup · **Push**: Firebase FCM · **SMS**: MSG91 (DLT pending)

## Coding Standards

- Use TypeScript everywhere
- Use async/await not .then()
- Handle all errors explicitly — never silent failures
- Every API endpoint must have input validation
- Use Supabase Row Level Security for all tables
- Mobile: use React Navigation for routing
- Web: use Next.js App Router
- Styling: Tailwind CSS on web, StyleSheet on mobile
- State: Zustand for global state
- No console.log in production code — use proper logging

## Supabase Conventions

- Always use typed Supabase client with generated types
- Never expose service role key on client side
- Use RLS policies for all tables
- Use Edge Functions for server-side logic that needs service key
- Storage bucket names: product-images, store-logos, review-photos

## File Naming

- Components: PascalCase → OrderCard.tsx
- Hooks: camelCase with use prefix → useOrders.ts
- Utils: camelCase → formatPrice.ts
- Constants: UPPER_SNAKE → ORDER_STATUS.ts
- Types: PascalCase with Type suffix → OrderType.ts

## API Response Format

Always return consistent response shape:
```typescript
// Success
{ success: true, data: {...}, message: "Order created" }

// Error
{ success: false, error: "Error message", code: "ORDER_NOT_FOUND" }
```

## Indian Market Specifics

- All prices in Indian Rupees (₹)
- Phone numbers in +91XXXXXXXXXX format
- Support Hindi text in all text fields
- Pincode validation for Indian pincodes (6 digits)
- GST calculation where applicable
- Date format: DD/MM/YYYY for display

## When Building Any Feature

1. Read the SKILL.md file for that feature first
2. Read the AGENT.md file for step-by-step instructions
3. Create database migration first
4. Add RLS policies
5. Build backend API/Edge Function
6. Build UI components
7. Connect UI to Supabase
8. Write basic tests
9. Update types

## Security Rules

- Never hardcode API keys
- Always validate user owns the resource before update/delete
- Sanitize all user inputs
- Never return sensitive data (passwords, keys) in API responses
- Use HTTPS only in production
