---
name: notification-service
description: Deep context + dev guide for ReelMart's notification-service — order/delivery notifications across WhatsApp (Gupshup), push (FCM) and SMS (MSG91), plus device-token registration. Use for any notification/alert work.
---

# notification-service — WhatsApp / push / SMS

**Dir:** `reelmart/services/notification-service` · **Mount:** `/api/notifications/*` · port 3000 · `/health`
**Owns/uses tables:** `fcm_tokens` (device tokens), reads `orders`, `users`
**Integrations:** **Gupshup** (WhatsApp, NOT Interakt) · Firebase **FCM** (push) · **MSG91** (SMS)

## Endpoints
- `POST /order-placed` — fan out buyer confirmation + seller new-order alert
- `POST /order-update` — status change (shipped/out-for-delivery/delivered) notifications
- `POST /push` — send an FCM push
- `POST /whatsapp` — send a Gupshup WhatsApp template message
- `POST /register-token` — register a device FCM token

## Auth & ownership
- `POST /register-token` **must `requireAuth` and bind the token to `req.user.id`** — do NOT trust a client-sent userId (audit HIGH-9). 
- Internal trigger endpoints (`order-placed`/`order-update`) are called service-to-service — authenticate with `x-internal-key` (`INTERNAL_API_KEY`), don't expose them unauthenticated.

## Gotchas / risks
- Notifications are **fire-and-forget** from checkout/order/delivery flows — a failure must not break the order.
- Use the correct Gupshup **template names**; WhatsApp templates must be pre-approved.
- MSG91 DLT registration is pending (SMS may not deliver) — see CLAUDE.md.
- Don't over-share PII in message payloads.
- Idempotency: the same event shouldn't double-send.

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service notification`. Env/secrets Terraform-managed.

See `agents/SECURITY_AUDIT.md` (HIGH-9), `reelmart/services/CLAUDE.md`, `whatsapp-service` skill.
