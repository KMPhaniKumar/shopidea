---
name: catalog-service
description: Deep context + dev guide for ReelMart's catalog-service — products, stores/storefront, reviews, store-follow. Use when implementing/modifying/debugging product or store endpoints, or the public storefront API.
---

# catalog-service — products, stores, reviews

**Dir:** `reelmart/services/catalog-service` · **Mount:** `/api/catalog/*` · port 3000 · `/health`
**Owns tables:** `products`, `stores`, `reviews`, `followed_stores` (reads `orders`, `users`)
**Integration:** none (pure Supabase)

## Endpoints
- **products**: `GET /products` (list/search, public), `GET /products/:id`, `POST /products`, `PUT /products/:id`, `PUT /products/:id/availability`, `DELETE /products/:id`
- **stores**: `GET /stores` (marketplace list), `GET /stores/:slug` (public storefront by slug), `GET /stores/:id/products`, `GET /stores/:id/reviews`, `GET /my-store`, `POST /stores`, `PUT /stores/:id`, `POST /stores/:id/follow`
- **reviews**: `POST /reviews`

## Auth & ownership
Public reads: marketplace/storefront `GET` endpoints (no auth). Mutations (`POST/PUT/DELETE /products`, `PUT /stores/:id`) MUST `requireAuth` **and verify the caller owns the store/product** — service-role bypasses RLS.

## Gotchas / risks
- **IDOR risk** on product/store mutations — confirm ownership (`store.user_id === req.user.id`); see `agents/SECURITY_AUDIT.md`.
- **Public store endpoints must NOT leak KYC/PII columns** (no `select('*')` on stores/users — pick explicit public columns). HIGH finding in the audit.
- `:slug` (public) vs `:id` (internal) — keep them distinct.
- Reviews should be tied to a real purchase where required.

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service catalog`. Env/secrets Terraform-managed.

See `agents/SECURITY_AUDIT.md`, `FLOWS.md` (storefront/product), `reelmart/services/CLAUDE.md`.
