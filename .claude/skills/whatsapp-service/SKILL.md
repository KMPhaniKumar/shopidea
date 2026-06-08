---
name: whatsapp-service
description: Deep context + dev guide for ReelMart's whatsapp-service — Gupshup WhatsApp broadcasts to a seller's customers and the inbound Gupshup webhook. Use for any WhatsApp broadcast/commerce or Gupshup webhook work.
---

# whatsapp-service — Gupshup WhatsApp commerce

**Dir:** `reelmart/services/whatsapp-service` · **Mount:** `/api/whatsapp/*` · port 3000 · `/health`
**Owns/uses tables:** `broadcasts` (reads `stores`, `products`, `orders`, `users`)
**Integrations:** **Gupshup** (WhatsApp). Razorpay refs appear (e.g. payment links in messages).

## Endpoints
- `POST /broadcast` — a seller broadcasts a WhatsApp message/catalog to their customers
- `POST /webhook` — inbound Gupshup webhook (delivery receipts / replies)

## Auth & ownership
- `POST /broadcast` `requireAuth` + verify the seller owns the store and only messages **their own** customers (consent/opt-in matters). Service-role bypasses RLS.
- `POST /webhook` — verify it's genuinely from Gupshup (signature/secret); never trust the payload blindly.

## Gotchas / risks
- Distinct from **notification-service** (transactional order alerts). This service is seller-driven **marketing/broadcast** WhatsApp.
- Use approved Gupshup **templates**; respect WhatsApp opt-in/anti-spam rules.
- Don't leak other stores' customers or PII.
- Rate-limit broadcasts.

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service whatsapp`. Env/secrets Terraform-managed (`reelmart/dev/gupshup`).

See `notification-service` skill, `reelmart/services/CLAUDE.md`, `FLOWS.md`.
