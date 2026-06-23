# QA Test Run Report — 2026-06-23

**Prepared by:** qa-lead  
**Date:** 2026-06-23  
**Node version:** v25.9.0 (system default, Homebrew)  
**Vitest (harness):** 1.6.1 · **Vitest (service-level):** 4.1.8  
**Playwright:** 1.61.0

---

## Executive Summary

Five test suites ran to completion today. The two backend service-level suites are clean. The core API authz suite has 3 failures against 117 passes. The Playwright e2e suite is split: on Chrome (mobile + desktop) 6/12 scenarios fail because the seller re-registration fix is **committed locally but not yet pushed or deployed**; on mobile-safari the suite cannot run at all because the WebKit browser binary is not installed. One infra bug (broken `npm run test:api` script) was confirmed. The previously reported "Node 25 V8 stack-overflow" does NOT reproduce — Vitest 1.6.1 emits a CJS deprecation warning on Node 25 but executes without crashing.

**The seller re-registration bug escaped testing because no test for the seller registration page existed before today.** The coverage gap is an agent-coverage gap in the ui-test-engineer scope, not a missing agent role. Recommendation: no new agent needed; ui-test-engineer must own registration/auth-onboarding Playwright specs going forward.

---

## 1. Suites Run — Results Table

| Suite | Runner | Files | Tests | Pass | Fail | Errors | Notes |
|---|---|---|---|---|---|---|---|
| API authz (10 services) | Vitest 1.6.1 + Supertest | 10 | 120 | 117 | 3 | 1 unhandled | catalog × 2, delivery × 1 |
| whatsapp-service | Vitest 4.1.8 + Supertest | 1 | 11 | 11 | 0 | 0 | Clean |
| notification-service | Vitest 4.1.8 + Supertest | 1 | 33 | 33 | 0 | 0 | Clean |
| e2e seller-register (Chrome) | Playwright 1.61.0 | 1 | 12 | 6 | 6 | 0 | Fix not deployed; 3 would pass post-deploy |
| e2e seller-register (Safari) | Playwright 1.61.0 | 1 | 6 | 0 | 6 | 6 | WebKit binary not installed |
| **Total** | | **14** | **182** | **167** | **15+6** | **7** | |

**Suites not run:** DB integrity (`tests/db/` does not exist yet). Performance k6 (`tests/performance/` not explored further — not in scope for this run). Buyer-app Expo tests (none written).

---

## 2. Bug Catalog

### INFRA-01 — `npm run test:api` resolves to non-existent path

**Severity:** Medium (breaks CI convenience scripts; `npx vitest run api` works fine)  
**Location:** `/tests/package.json`, scripts `test:api` and `test:db`  
**Repro:** `cd tests && npm run test:api` → `No test files found, exiting with code 1`  
**Root cause:** The script is `vitest run tests/api`. Vitest is run from within the `tests/` directory, so the filter resolves to `tests/tests/api` — a path that does not exist. The correct filter is `vitest run api` (relative to the CWD of `tests/`).  
**Fix:** Change `"test:api": "vitest run tests/api"` to `"test:api": "vitest run api"` and similarly `"test:db": "vitest run db"` in `/tests/package.json`. The `test:ui` and `test:e2e` scripts use `playwright test ui/e2e` which is correct.

### INFRA-02 — Node 25 / Vitest 1.6.1 CJS deprecation warning (NOT a crash)

**Severity:** Low (warning only; does not affect test execution)  
**Location:** `tests/node_modules` (Vitest 1.6.1 requires Vite CJS build on Node 25)  
**Repro:** Run any `npx vitest run` in `tests/` → `The CJS build of Vite's Node API is deprecated` printed to stderr.  
**Status update:** The previously reported "V8 stack-overflow crash" does NOT reproduce on this machine. All 120 API tests run and complete normally on Node 25.9.0. The warning is cosmetic.  
**Fix recommendation (non-urgent):** Upgrade `tests/package.json` `vitest` from `^1.6.0` to `^4.1.8` (matching the service-level harnesses). This eliminates the warning and aligns all three test harnesses on the same major version. No test changes needed — the API is stable.

### INFRA-03 — WebKit (mobile-safari) browser binary not installed

**Severity:** Medium (entire safari project skips in e2e)  
**Location:** Playwright browser cache at `~/.cache/ms-playwright/webkit-2311/`  
**Repro:** Running any Playwright test with `project=mobile-safari` → `browserType.launch: Executable doesn't exist at .../webkit-2311/pw_run.sh`  
**Fix:** Run `npx playwright install webkit` in the `tests/` directory once. Add `npx playwright install --with-deps` to the CI setup step.

### PRODUCT-01 — delivery-service stub fee is ₹80, test expects ₹60

**Severity:** Medium (test-implementation mismatch; reveals a behavior change)  
**Location:** `tests/api/delivery-service/authz.test.ts:151`; `reelmart/services/delivery-service/src/routes/delivery.ts:191`; `reelmart/services/delivery-service/src/lib/commission.ts`  
**Repro:** `npx vitest run api/delivery-service` → `expected 80 to be 60`  
**Root cause:** The stub-mode fallback path returns `courierFee + commission`. `courierFee` is hardcoded to `60`; `commission` is fetched from `delivery_commission_slabs` via `commissionForWeight()`. In the test environment Supabase is mocked at the library level, but the `delivery_commission_slabs` query uses a real `supabaseAdmin` reference (the mock path resolves correctly) — in stub mode the commission call falls back to the default of `20` (empty table). So the response is `60 + 20 = 80`. The test was written before the commission logic was added (`65d8385 feat(delivery): weight-based delivery commission on top of courier fee`), and it was not updated.  
**Fix:** The test must be updated to mock `commissionForWeight` to return `0` (or update the assertion to `80`). This is a test defect, not a product bug. Route to **api-test-engineer**.

### PRODUCT-02 — catalog-service `GET /stores/:id/products` returns 404 in test

**Severity:** Medium (test failure; exposes a real mock-design gap)  
**Location:** `tests/api/catalog-service/authz.test.ts:414–428`  
**Repro:** `npx vitest run api/catalog-service` → `expected 404 to be 200` on the `GET /api/catalog/stores/:id/products` test  
**Root cause:** The route now performs a two-step query: first validates the store (approval_status + is_active + suspended) via `stores` table, then fetches products. The test's `makeQueryBuilder` is keyed only by `products` table, so the first `stores` query returns `null` → the handler returns 404 before ever reaching the products query. The `isStoreSuspended` helper called from `DELETE /products/:id` has the same problem (unhandled rejection).  
**Fix:** The mock must return a valid store row on the first `stores` call. The test's query-builder needs to track call count per table (as the admin-service test does with `storesHit` flags) or the mock needs to yield the store row on first call and fall through on subsequent calls. Route to **api-test-engineer**.

### PRODUCT-03 — catalog `DELETE /products/:id` test times out (10 s) + unhandled rejection

**Severity:** Medium  
**Location:** `tests/api/catalog-service/authz.test.ts` ("allows owning seller to delete their product — CRIT-4 fix")  
**Repro:** `npx vitest run api/catalog-service` → timeout + unhandled `TypeError: supabaseAdmin.from(...).select is not a function` from `isStoreSuspended()`  
**Root cause:** Same as PRODUCT-02 — `isStoreSuspended` calls `.from('stores').select(...)` but the mock only supplies `delete()` on the `stores` table. The route hangs awaiting an unresolved promise chain.  
**Fix:** Same as PRODUCT-02 — fix the mock to handle `.select` on `stores` in the deletion path. Route to **api-test-engineer**.

### PRODUCT-04 — Playwright scenarios 2, 3, 5 fail because fix not deployed

**Severity:** Informational (expected — fix is local, not yet pushed)  
**Location:** `tests/e2e/seller-register-flow.spec.ts` (scenarios 2, 3, 5 on Chrome); `reelmart/apps/web/app/seller/(auth)/register/page.tsx`  
**Repro:** Run Playwright against `dev.reelmart.in` — the deployed JS bundle (compiled from commit `948e601` HEAD) still contains the old `setStep('pending')` logic in both `verifyOTP()` and `detectSession()`. The fix exists only as uncommitted local changes (`git status` shows ` M reelmart/apps/web/app/seller/(auth)/register/page.tsx`).  
**Verification:** `git diff HEAD -- reelmart/apps/web/app/seller/(auth)/register/page.tsx` shows the fix is a working-tree modification, not committed. `git log --oneline -- tests/e2e/seller-register-flow.spec.ts` returns empty — the spec itself has also never been committed.  
**Expected behavior post-deploy:** Once the fix (and the spec) are committed and pushed to `main`, Vercel redeploys and scenarios 2, 3, 5 will pass. Scenario 5b already passes on Chrome (the approved-seller `detectSession` path was in the committed HEAD state). This validates the spec design is correct.  
**Action:** Commit both the fix and the spec together. Route to **ui-engineer** / **devops-engineer**.

### PRODUCT-05 — order-service `orderEvents` mock missing `.insert` method

**Severity:** Low (test passes despite warning; background error only)  
**Location:** `tests/api/order-service/authz.test.ts`; `reelmart/services/order-service/src/routes/orders.ts`  
**Repro:** `npx vitest run api/order-service` → stderr: `[orderEvents] unexpected error: supabaseAdmin.from(...).insert is not a function`  
**Root cause:** When the owning seller updates order status to `accepted`, the route fires an event to `order_events` table via `.insert()`. The mock's query-builder for `order_events` has no `insert` method, so the async call errors. The test passes because the status-update response is returned before the event insert, and the unhandled rejection is swallowed by a try/catch in the service.  
**Fix:** Add `.insert: () => builder` to the mock query-builder for `order_events`. Route to **api-test-engineer**. Low priority — the test already validates the correct HTTP response.

---

## 3. Root-Cause Analysis: Why the Seller Re-Registration Bug Escaped Testing

### What coverage existed before today

Before this session, the entire test suite consisted of:
1. `tests/api/*/authz.test.ts` — 10 Vitest/Supertest files testing backend service authorization and IDOR; bootstrapped in commit `b5f49ee` and extended in `944ebfe`.
2. `reelmart/services/whatsapp-service/tests/` and `reelmart/services/notification-service/tests/` — service-level Vitest suites.

Zero Playwright e2e tests existed in the committed codebase. `tests/e2e/` and `tests/test-results/` are both untracked (`??` in `git status`). The `playwright.config.ts` comment says "STATUS: Scaffold only — no tests written yet." The `seller-register-flow.spec.ts` file that now exists was written as part of this session and has never been committed.

### Why the gap existed

The bug lives in `reelmart/apps/web/app/seller/(auth)/register/page.tsx` — client-side Next.js React state machine logic. This code path:

- Is unreachable by Vitest/Supertest (there is no backend endpoint for the `verifyOTP()` + `detectSession()` approval-status branch logic; the branching happens in the browser after the API calls return).
- Was not covered by any Playwright spec because **no seller authentication/onboarding flow was ever written as an e2e test**.

Concretely, the coverage gap has three compounding causes:

**Cause 1 — e2e suite was scaffold-only at the time the bug was introduced.** Commit `111e6ea` (`feat(approval): reject seller with comments → seller revises → resubmit`) introduced the `setStep('pending')` behavior for non-rejected returning sellers. That commit landed before any Playwright spec existed. The `ui-test-engineer` agent definition lists "Seller: login → dashboard, add/edit product, view orders" as coverage targets but was never activated to write the registration flow spec.

**Cause 2 — The ui-test-engineer scope did not specifically enumerate "already-registered seller re-registration" as a required scenario.** The agent definition covers happy-path registration ("login → dashboard") but not re-entry / duplicate-registration edge cases. Registration is treated implicitly as part of the login flow rather than explicitly as a stateful flow with approval-status branches (pending / approved / rejected).

**Cause 3 — The approval-status branching is purely client-side state, making it invisible to backend API tests.** The backend (`admin-service /check-phone`, Supabase stores table) correctly stores and returns `approval_status`. The bug was not in what the API returned, but in what the UI did with it — specifically that both `pending` and `rejected` outcomes took the same client-side path (`setStep('pending')`) instead of branching correctly. API tests cannot catch this class of bug.

**No pre-existing test touched `register/page.tsx` at all** — confirmed by searching the committed test files for "register", "verifyOTP", "detectSession", and "check-phone" (only hits are for FCM token registration in `notification-service`, unrelated).

---

## 4. Coverage Gaps — Prioritized New Test Cases

### P0 (block deploy — ship with the fix)

| # | Test case | Owner | File |
|---|---|---|---|
| P0-1 | Pending seller re-registers via OTP → toast + redirect to dashboard (scenario 2) | ui-test-engineer | `tests/e2e/seller-register-flow.spec.ts` |
| P0-2 | Approved seller re-registers via OTP → toast + redirect (scenario 3) | ui-test-engineer | same |
| P0-3 | Logged-in pending seller navigates to /seller/register → immediate redirect (scenario 5) | ui-test-engineer | same |

These are already written in `tests/e2e/seller-register-flow.spec.ts` but need to be committed alongside the fix.

### P1 (within one sprint)

| # | Test case | Owner | File |
|---|---|---|---|
| P1-1 | Fix delivery-service mock to expect fee=80 (or mock commission=0) | api-test-engineer | `tests/api/delivery-service/authz.test.ts:151` |
| P1-2 | Fix catalog-service mock to handle two-query stores→products flow | api-test-engineer | `tests/api/catalog-service/authz.test.ts` |
| P1-3 | Install WebKit browser binary; add `playwright install` to CI | e2e-test-engineer / devops-engineer | `.github/workflows/` |
| P1-4 | Fix `npm run test:api` and `test:db` scripts (path filter) | qa-lead | `tests/package.json` |
| P1-5 | Seller happy-path registration: new number → profile → submit → pending screen | ui-test-engineer | `tests/e2e/seller-register-flow.spec.ts` |
| P1-6 | Rejected seller edit/resubmit flow: OTP → edit form prefilled → resubmit → pending | ui-test-engineer | `tests/e2e/seller-register-flow.spec.ts` |

### P2 (next sprint)

| # | Test case | Owner |
|---|---|---|
| P2-1 | Seller login: unregistered number → "please sign up" error; registered → dashboard | ui-test-engineer |
| P2-2 | SellerGate: pending seller sees waiting screen, not dashboard content | ui-test-engineer |
| P2-3 | SellerGate: approved seller reaches dashboard | ui-test-engineer |
| P2-4 | Fix order-service mock to add `.insert` for `order_events` | api-test-engineer |
| P2-5 | Admin approval flow: approve seller → SellerGate unlocks | e2e-test-engineer |
| P2-6 | Buyer checkout: cart → OTP → address → place order → confirmation screen | e2e-test-engineer |
| P2-7 | `GET /stores/:id/products` blocked when store not approved (404) | api-test-engineer |

---

## 5. Agent Assessment: Is a New Web Testing Agent Needed?

**Verdict: No new agent needed.**

The bug escaped testing due to a **test-coverage gap within existing agent scope**, not a gap in agent roles.

The `ui-test-engineer` agent's stated scope already includes seller registration ("Seller: login → dashboard"). The `e2e-test-engineer` scope explicitly starts from "seller signup/login." The boundary between these two agents is clear: `ui-test-engineer` owns per-screen Playwright specs (including auth/onboarding page behavior, state branches, form rendering), while `e2e-test-engineer` owns cross-context lifecycle flows spanning multiple user roles.

The registration re-registration bug is a single-page client-side state machine test — squarely in `ui-test-engineer` territory. The gap was that this agent was never activated to cover the seller registration page before the buggy code landed.

**What to do instead of creating an agent:**

1. Update the `ui-test-engineer.md` agent definition to explicitly enumerate seller auth/onboarding as a **required** coverage surface, with the specific branch scenarios (pending / approved / rejected / new-number).
2. Establish a rule: whenever a new client-side page is shipped in `seller/(auth)/` or `seller/(dashboard)/`, `ui-test-engineer` must be activated before the PR merges to write at least a smoke spec covering all approval-status branches.
3. The `e2e-test-engineer` should add the happy-path seller onboarding → approval → first product cross-context flow as a release-gating test (P2-5 above).

A hypothetical "auth-onboarding-test-engineer" would duplicate the existing ui-test-engineer scope for one narrow subsurface. The cost (context, routing, coordination) outweighs any benefit. The existing agents suffice with tighter scope enforcement.

---

## 6. Infra Gaps Not in Scope Today (for awareness)

- `tests/db/` does not exist. DB integrity tests (`db-integrity-test-engineer`) have not been started.
- `tests/performance/` — k6 scripts were referenced in the project charter but were not found in the committed tree. Performance testing not yet bootstrapped.
- Buyer-app (Expo) has zero tests at any level. The `buyer-app` test surface is entirely uncovered.
- CI `test.yml` or test step in `deploy.yml` does not exist yet — tests are not gate-blocking deploys. This is the highest-priority CI gap.
