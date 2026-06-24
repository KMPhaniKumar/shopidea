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

---

## Wave 3 findings (2026-06-24)

### ✅ FIXED — CART-IDOR-001 (MEDIUM, security)
`order-service/src/routes/cart.ts` trusted client-supplied identifiers instead of the
authenticated user across **5 endpoints** (GET/POST/PUT/DELETE/clear), so any authed user
could read *and* write another user's cart (service-role bypasses RLS). Fixed: every route now
binds to `req.user.id` with 403 guards / ownership-scoped queries. Sentinels CART-1b…1f assert it.

### Open — owner: backend-engineer
- **MINOR — order-service trust on coupons/edge** and **whatsapp `bot/session.ts`** uses a
  module-level in-memory Map with no `clearSession`/`resetAll` export → blocks deterministic
  bot state-machine tests. Add a test-only reset export.

### Open — owner: ui-engineer (more missing test hooks)
- FILE-TRACK-01..03 (tracking page), FILE-RETURNS-01..03 (orders/returns),
  FILE-MKTG-01..05 (seller marketing/customers) — missing `data-testid`s.
- **APP-BUG-01 / APP-BUG-02 (testability):** SellerGate and OrderConfirmedClient are RSCs that
  reject fake cookies, so logged-in seller/order e2e can't be mocked. Use real logins (MSG91 test
  creds) or add a dev-only `NEXT_PUBLIC_ALLOW_TEST_LOGIN` bypass (mirror the buyer pattern).

### Open — MINOR (mobile, owner: ui-engineer)
- `formatIndianDate('not-a-date')` returns the string "Invalid Date" (no crash, renders garbage).
- guest `saveAddress()` uses `Date.now()` as id → two adds in the same ms collide on remove.

### Test-infra note
- A few agent-written behavior suites have imperfect mock isolation → occasional flake under the
  full parallel `vitest run`. Mitigated with `retry: 2` in vitest.config.ts; harden per-file mock
  setup and remove the retry later.
