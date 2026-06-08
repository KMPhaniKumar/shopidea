---
name: admin-service
description: Deep context + dev guide for ReelMart's admin-service — the MSG91→Supabase auth bridge plus platform admin (users, stores, coupons, settings). Use when implementing/modifying/debugging login, admin, or store-approval endpoints.
---

# admin-service — auth bridge + platform admin

**Dir:** `reelmart/services/admin-service` · **Mount:** `/api/admin/*` · port 3000 · `/health`
**Owns tables:** `users`, `stores`, `coupons`, `platform_settings`
**Integration:** MSG91 (OTP widget verification) → Supabase session

## Endpoints
- **auth** (`/api/admin/auth`): `POST /msg91-exchange` (verify MSG91 widget token → mint Supabase session, set role), `POST /check-phone`, `POST /validate`, `POST /test-login` **(DEV-ONLY — gated by `ALLOW_TEST_LOGIN` / dev host; never enable in prod)**
- **users** (`/api/admin/users`): `GET /`, `PUT /:id`, `PUT /:id/ban`, `PUT /:id/suspend`
- **stores** (`/api/admin/stores`): `GET /`, `PUT /:id/approve`
- **coupons** (`/api/admin/coupons`): `GET / · POST / · PUT /:id · DELETE /:id`
- **settings** (`/api/admin/settings`): `GET / · PUT /`

## Auth & ownership
Admin endpoints MUST enforce admin role (`requireAdmin`). The auth bridge uses `MSG91_WIDGET_AUTHKEY` + `AUTH_BRIDGE_SECRET` (Secrets Manager `reelmart/dev/msg91`). The Supabase **service-role client bypasses RLS** → authorization must be in code.

## Gotchas / risks
- **Store approval real path is the Next.js admin route — `admin-service/stores.ts` approval is STALE/secondary** (see project memory `project_store_approval_path`). Don't assume this service is the source of truth for approval.
- `test-login` is the dev skip-login backdoor (accounts `+919999900001/2/3`); keep dev-gated.
- Login is MSG91 **widget**, NOT Supabase Phone/Twilio.
- Approve/ban/suspend must verify the actor is an admin before mutating.

## Dev workflow
`cd reelmart/services/admin-service && npm install && npm run build` (tsc) before shipping. Deploy: `/deploy-service admin` (or CI on push to main). Env/secrets are Terraform-managed (`infra/terraform/environments/dev/services`).

See `agents/SECURITY_AUDIT.md` (auth/test-login findings), `reelmart/services/CLAUDE.md`.
