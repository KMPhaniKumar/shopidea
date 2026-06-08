---
name: return-service
description: Deep context + dev guide for ReelMart's return-service — buyer return requests and seller/admin approve/reject. Use for any returns/refund-request work.
---

# return-service — returns & refund requests

**Dir:** `reelmart/services/return-service` · **Mount:** `/api/returns/*` · port 3000 · `/health`
**Owns tables:** `returns` (reads `orders`, `users`)
**Integration:** none directly (refund money is issued via payment-service `/refund`)

## Endpoints
- `GET /` — list returns (scoped to caller: buyer's own, or seller's store)
- `GET /:id` — a single return
- `POST /` — buyer raises a return request
- `PUT /:id/approve` — seller/admin approves
- `PUT /:id/reject` — seller/admin rejects

## Auth & ownership
All `requireAuth`. **Ownership**: a buyer raises/views only returns on their own orders; approve/reject only by the order's seller (or admin). Verify the return ↔ order ↔ store/buyer chain (service-role bypasses RLS → audit IDOR risk).

## Gotchas / risks
- Approving a return should trigger the **refund via payment-service** and update order/return status consistently.
- Validate the order is in a returnable state/window.
- Status enum + allowed transitions (requested → approved/rejected → refunded).

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service return`. Env/secrets Terraform-managed.

See `agents/SECURITY_AUDIT.md` (returns ownership), `payment-service` skill, `FLOWS.md` (returns).
