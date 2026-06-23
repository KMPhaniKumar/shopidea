# Bugs found during the QA test build-out (Waves 1–2) — 2026-06-24

These were surfaced by the specialist test agents while writing coverage. Tests were
written to **document current behavior** (with sentinel comments) — they pass today and
will flip when the bug is fixed, at which point the test + code change land together.

## 🔴 Financial / regulatory — owner: backend-engineer

### BUG-TCS-001 — payout-service does not deduct 1% TCS (P1, regulatory)
`payout-service/src/routes/payouts.ts:87`. Current: `net = gross × (1 − PLATFORM_FEE_PCT) = gross × 0.95`.
Required (Sec 194-O, Income Tax Act): `net = gross × (1 − 0.05 − 0.01) = gross × 0.94`.
At ₹1000 gross, sellers are **overpaid ₹10** and **TCS is not remitted**. Test sentinel: CALC-8.

### BUG-ORDER-SUBTOTAL-001 — order-service trusts client subtotal (P2, integrity)
`order-service/src/routes/orders.ts`. `POST /` accepts a client-supplied subtotal without
server-side recompute from `items[].price × qty`. A manipulated subtotal flows into the order
total. Fix: recompute server-side. Test sentinel: CALC-1 test 4.

## 🟡 Reliability — owner: backend-engineer

- **NOTIF-BUG-03 (MEDIUM)** `notification-service/.../notifications.ts:131` — `order-update` uses
  `Promise.all([buyerPush, wa])` not `allSettled`. If a provider throws above its internal catch,
  `res.json` is never called and the request hangs. Called fire-and-forget after **every** order
  status change → hangs consume connection-pool slots. Fix: `Promise.allSettled`.
- **NOTIF-BUG-01 / 02 (LOW)** same pattern on `POST /push` (line 53) and `POST /whatsapp` (line 60).
- **NOTIF-GAP-01 (INFO)** no seller push/WhatsApp on `order-placed` — seller only gets a Realtime
  dashboard toast (requires the tab open). Consider an FCM push to the seller.

## 🟡 Testability + accessibility — owner: ui-engineer
Missing `data-testid` / `htmlFor` / `aria-label` across the web UI. Beyond breaking robust Playwright
selectors (forcing positional/text heuristics that flake), the missing `htmlFor` is a real
screen-reader accessibility defect.
- Storefront: category pills, qty controls, cart-footer total, product cards, Add-to-Cart/±buttons.
- Seller dashboard: verification-locked banner; product add/edit category `<select>` (no label);
  edit-product name/price inputs (no placeholder); **settings form labels all missing `htmlFor`**.
- Admin login: Email/Password labels missing `htmlFor`.

## 🟢 Seed / data — owner: devops / ui-engineer
- **BUG-STOREFRONT-01** the `blue-whale` dev store has no product images (placeholder emoji), so the
  image lazy-load path is never exercised live. Upload an image or update the seed.

---

### Pre-existing (from QA_test_run_2026-06-23.md, still open)
- **INFRA-02** Vitest 1.6.1 CJS deprecation warning on Node 25 — upgrade harness to ^4.
- Service-role backend routes bypass RLS (CRIT-4/HIGH-4/HIGH-5 in SECURITY_AUDIT.md).
