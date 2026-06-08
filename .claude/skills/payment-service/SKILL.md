---
name: payment-service
description: Deep context + dev guide for ReelMart's payment-service — Razorpay order creation, signature verification, the create-after-payment /confirm flow, webhooks and refunds. Use for any payment, checkout-payment, or Razorpay work. HIGH blast radius (money).
---

# payment-service — Razorpay payments

**Dir:** `reelmart/services/payment-service` · **Mount:** `/api/payments/*` · port 3000 · `/health`
**Owns/uses tables:** `orders` (writes paid orders / `razorpay_payment_id`), `returns`, `users`
**Integration:** **Razorpay** (test mode in dev). Secrets `reelmart/dev/razorpay`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (server-only), `RAZORPAY_WEBHOOK_SECRET`.

## Endpoints
- `POST /create-order` — create a Razorpay order (amount-only; `orderId` optional). Returns order_id + key_id (publishable) to the client.
- `POST /confirm` — **the correct online flow**: `requireAuth` → verify HMAC signature → **insert the paid order with `buyer_id = req.user.id`** (order created ONLY after payment verified).
- `POST /verify` — legacy signature verify (audit-flagged; prefer `/confirm`).
- `POST /webhook` — Razorpay webhook (`payment.captured`/`failed`); **must verify `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET`**; idempotent on duplicate events.
- `POST /refund` — issue a refund (ties to returns).

## Money-safety rules (non-negotiable)
- **Never trust client-sent amounts** — derive amount server-side from the cart/order.
- **KEY_SECRET / webhook secret never reach the client** — only `RAZORPAY_KEY_ID` is publishable.
- Verify signatures on `/confirm`, `/verify`, and `/webhook`. Reject on mismatch.
- Idempotency: a repeated webhook / confirm must not double-create or double-mark.
- Dev uses Razorpay **test mode** (test UPI `success@razorpay`).

## Gotchas / risks
- Column is `razorpay_payment_id` (not `payment_id`).
- Legacy `/create-order` + `/verify` are the audit's payment-integrity hot spot — see `agents/SECURITY_AUDIT.md`.
- RazorpayX payouts live in **payout-service**, not here.

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service payment`. Env/secrets Terraform-managed.

See `agents/SECURITY_AUDIT.md`, `order-service` & `payout-service` skills, `FLOWS.md` (checkout).
