---
name: analytics-service
description: Deep context + dev guide for ReelMart's analytics-service — platform-wide and per-store/seller analytics (sales, top products, reviews). Read-only aggregates. Use for any analytics/dashboard-metrics work.
---

# analytics-service — analytics & metrics

**Dir:** `reelmart/services/analytics-service` · **Mount:** `/api/analytics/*` · port 3000 · `/health`
**Reads tables:** `orders`, `products`, `reviews`, `stores`, `users` (read-only aggregates — owns no table)
**Integration:** none

## Endpoints
- `GET /platform` — platform-wide metrics (admin only)
- `GET /store` — a seller's own store analytics
- `GET /store/top-products` — a seller's best-selling products

## Auth & ownership
All `requireAuth`. **`/platform` is admin-only.** `/store*` must scope to the caller's own store (don't accept an arbitrary storeId without ownership check) — service-role bypasses RLS.

## Gotchas / risks
- Read-only — never mutates. Keep it that way.
- Heavy aggregate queries: prefer efficient queries / indexes; this is a hot read path that the `performance-test-engineer` may load-test.
- A seller must never see another seller's numbers (IDOR risk on store scoping).

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service analytics`. Env/secrets Terraform-managed.

See `agents/SECURITY_AUDIT.md`, `reelmart/services/CLAUDE.md`.
