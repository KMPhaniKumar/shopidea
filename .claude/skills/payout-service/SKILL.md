---
name: payout-service
description: Deep context + dev guide for ReelMart's payout-service — seller settlements/payouts, bank-account management, and payout summaries (TCS/commission deductions). Use for any payout/settlement/bank-account work. Money — handle with care.
---

# payout-service — seller settlements

**Dir:** `reelmart/services/payout-service` · **Mount:** `/api/payouts/*` · port 3000 · `/health`
**Owns tables:** `payouts`, `bank_accounts` (reads `orders`, `users`)
**Integration:** Razorpay/**RazorpayX** secrets present; actual RazorpayX payout wiring is **PENDING** (see AUDIT).

## Endpoints
- `GET /` — list the seller's payouts
- `GET /summary` — settlement summary (earnings minus deductions)
- `GET /bank-account` — the seller's bank account
- `POST /bank-account` — add/update bank account
- `POST /process` — process/initiate a payout

## Auth & ownership
All `requireAuth`. **Strict ownership**: a seller may only read/modify their OWN payouts and bank account. `POST /process` likely admin-or-system only — verify the actor. Service-role bypasses RLS → enforce in code.

## Money-safety rules
- **Settlement math:** payout = order total − shipping − TCS (e.g. 1%) − commission. Get the calculation right and test it (see `db-integrity-test-engineer`).
- Never expose another seller's bank details (audit IDOR finding on `bank-account`).
- Idempotency on `/process` — never double-pay.

## Gotchas / risks
- **RazorpayX payout execution is not fully wired yet** — confirm current state in `agents/AUDIT_gaps.md` before assuming payouts actually disburse.
- Razorpay secrets shared with payment-service (`reelmart/dev/razorpay`).

## Dev workflow
`npm run build` (tsc) before shipping. Deploy: `/deploy-service payout`. Env/secrets Terraform-managed. (Runs 1 task, max_capacity 1.)

See `agents/SECURITY_AUDIT.md` (bank-account IDOR), `agents/AUDIT_gaps.md`, `payment-service` skill.
