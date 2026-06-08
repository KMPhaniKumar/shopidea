---
name: order-service
description: Deep context + dev guide for ReelMart's order-service — cart and order lifecycle (create, list, status, cancel). Use when implementing/modifying/debugging cart or order endpoints.
---

# order-service — cart + orders

**Dir:** `reelmart/services/order-service` · **Mount:** `/api/orders/*` · port 3000 · `/health`
**Owns tables:** `cart_items`, `orders` (reads `users`)
**Integration:** none directly (payment-service confirms paid orders; notification-service alerts)

## Endpoints
- **orders**: `GET /` (list — filter to caller/seller), `GET /:id`, `POST /` (create — COD path), `PUT /:id/status`, `POST /:id/cancel`
- **cart**: `GET /cart/:userId`, `POST /cart`, `PUT /cart/:itemId`, `DELETE /cart/:itemId`, `DELETE /cart/user/:userId`

## Auth & ownership
All endpoints `requireAuth`. **Ownership is critical**: a buyer sees only their orders; a seller sees only orders for their store; `GET /:id`, `PUT /:id/status`, `cancel` must verify the caller owns/handles that order (service-role bypasses RLS).

## Gotchas / risks
- **Online (Razorpay) orders are created by payment-service `/confirm` only after the signature is verified — NOT here.** `POST /` here is for COD / verified flows. Don't recreate online orders pre-payment (that caused the duplicate/ghost-order bug).
- **IDOR risk** on `GET/PUT/cancel /:id` and `cart/:userId` (don't trust `:userId` from the path — bind to `req.user.id`). See `agents_reports/SECURITY_AUDIT.md`.
- Status transitions should be validated (enum + allowed transitions).
- Cancel should respect payment/refund + stock implications.

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service order`. Env/secrets Terraform-managed.

See `agents_reports/SECURITY_AUDIT.md`, `FLOWS.md` (checkout/orders), `payment-service` skill.
