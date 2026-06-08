---
name: delivery-service
description: Deep context + dev guide for ReelMart's delivery-service — NimbusPost courier integration (rates, shipment creation, per-seller pickup registration, tracking). Use for any shipping/courier/tracking work.
---

# delivery-service — NimbusPost courier

**Dir:** `reelmart/services/delivery-service` · **Mount:** `/api/delivery/*` · port 3000 · `/health`
**Owns/uses tables:** `orders` (writes AWB/shipment status), `stores` (pickup), `users`
**Integration:** **NimbusPost** (NOT Shiprocket). Auth via `NIMBUS_AUTH_TOKEN`.

## Endpoints
- `POST /rates` — serviceability + shipping rate for a pincode/weight
- `POST /create-shipment` — create a NimbusPost shipment for an order → AWB
- `POST /pickup/register` — register a **per-seller** pickup address with NimbusPost
- `POST /pickup/refresh` — refresh/re-sync a seller's pickup
- `GET /track/:awbCode` — tracking (surface ReelMart-branded status, NOT courier branding)

## Auth & ownership
Mutations `requireAuth` + verify the caller owns the store/order. Tracking can be buyer-accessible by order/AWB. Service-role bypasses RLS → enforce in code.

## Gotchas / risks
- **KNOWN GAP: `NIMBUS_AUTH_TOKEN` is missing from the delivery task def** — NimbusPost calls fail until it's added (Terraform `reelmart-infra/infra/terraform/environments/dev/services` + Secrets Manager). See `reelmart/services/CLAUDE.md`.
- Per-seller pickup registration is required before a seller's first shipment.
- Tracking page is ReelMart-branded — don't leak NimbusPost branding to buyers.
- NimbusPost webhook (status updates) → update `orders` (verify source).

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service delivery`. Env/secrets Terraform-managed.

See `reelmart/services/CLAUDE.md`, `FLOWS.md` (tracking/fulfillment), `order-service` skill.
