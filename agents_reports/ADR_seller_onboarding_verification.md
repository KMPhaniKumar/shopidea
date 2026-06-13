# ADR — Seller registration redesign + onboarding verification gating

**Author:** product-architect · **Status:** approved (decisions locked) · **Date:** 2026-06-13
**Surfaces:** web seller (register + dashboard), web admin (PAN review), Supabase data, storage (signatures), notification (email OTP).

## Decisions (locked with product)
1. **Password:** *collect now, use later.* Store a **bcrypt hash** in a new `users.password_hash` column. Do **NOT** set it as the Supabase auth user's password — the MSG91→Supabase bridge signs in with a deterministic HMAC password (`derivePassword(phone)`); overwriting it would break OTP login. Login stays **OTP-only**; password-login is wired later against the stored hash.
2. **PAN verification:** *admin manual review* (extends existing KYC review). New `pan_verified` flag set by admin.
3. **Feature gating:** unlock full seller features only when **mobile + PAN + pickup** are verified. Email + signature are shown in onboarding but **don't block**.

## New registration flow (post-OTP "Your details")
Collect in one step: **Full name (per PAN)** *req*, **Display name** *req*, **PAN number** *req*, **GST** *optional*, **Password** *req*. → "Register & Continue" → seller dashboard (onboarding view).
- The `users` row already exists (auth bridge created id/phone/role='seller' via service role). Profile save goes to a **service-role route** `POST /api/seller/onboard` that sets `users.full_name`, `users.password_hash` (bcrypt) and upserts the store's `store_name`(=display_name), `pan_number`, `gst_number`. (Service role because: no `users` INSERT policy, password hashing server-side, and `role`/`is_admin` are locked from client writes — see §Security.)

## Onboarding status panel (dashboard) — per-item ✅ green / 🟠 pending
| Item | Source of truth | Verified when |
|---|---|---|
| **Mobile number** | `users.phone` | OTP-verified at signup → **auto green** (set `users.phone_verified=true` on signup) |
| **Email ID** | `users.email`, `users.email_verified` | collect email + verify via **email OTP/link** (Supabase email OTP or notification-service). Non-blocking. |
| **PAN number** | `stores.pan_number`, `stores.pan_verified`, `pan_doc_path` | admin reviews doc+number → marks `pan_verified=true` |
| **Pickup address** | `stores.pickup_status` (existing, NimbusPost) | `pickup_status='verified'` |
| **Digital signature** | `stores.signature_path` | uploaded **or** auto-generated from full name (rendered script PNG → `seller-documents` bucket). Non-blocking. |

## Feature gating
Compute `seller_verified = phone_verified AND pan_verified AND pickup_status='verified'`. Extend `components/seller/SellerGate.tsx`: if not `seller_verified`, render the **onboarding/status view only** (no products/orders/payouts/etc.). Expose the flag via a small read (RLS-safe) so the dashboard nav also hides locked features.

## Data model (database-engineer to finalize placement)
- `users`: + `full_name TEXT`, `email TEXT`, `email_verified BOOLEAN DEFAULT false`, `phone_verified BOOLEAN DEFAULT false`, `password_hash TEXT`.
- `stores`: + `pan_verified BOOLEAN DEFAULT false`, `signature_path TEXT`. (`store_name`=display name, `pan_number`/`gst_number` exist.)
- Consider a `seller_verification` view returning the per-item booleans + the computed gate, for the dashboard.

## Security (fold the escalation fix in here)
- **Privilege-escalation fix (critical, found while debugging registration):** `users` "Users can update own profile" UPDATE policy is column-unrestricted → an authenticated user can `update users set is_admin=true, role='admin'`. Lock it the migration-024 way: `REVOKE UPDATE ON users FROM authenticated` then `GRANT UPDATE (name, full_name, email, …non-privileged…) TO authenticated` — **excluding `role, is_admin, phone_verified, email_verified, password_hash`**. Those are set only by service role.
- `password_hash`: never readable by client (column not granted to anon/authenticated SELECT); bcrypt (cost ≥10); never logged/returned.
- Verification flags (`pan_verified`, `email_verified`, `phone_verified`, `pickup_status`) are **service-role/admin write only** — a seller must not self-verify. Enforce via the column-grant exclusion above + admin routes.
- Gating must be enforced server-side too (not just hidden in UI) on the seller-feature APIs eventually; for v1, gate the dashboard UI + note the API-side follow-up.

## Work breakdown (phased)
1. **DB (database-engineer)** — migration 025: new columns, `phone_verified=true` backfill/trigger on signup, `pan_verified`/`signature_path`, the verification view, AND the users privilege column-lock (escalation fix). RLS + grants.
2. **Web seller (ui-engineer)** — register "Your details" redesign; `POST /api/seller/onboard` (service-role: full_name, bcrypt password_hash, store fields); onboarding status panel; SellerGate gating; signature upload + auto-generate; email collect + verify.
3. **Web admin (ui-engineer)** — PAN review/verify action on the seller KYC page (sets `pan_verified`).
4. **Notification (backend)** — email OTP/verification send (if not using Supabase email OTP).
5. **Security review (app-security-engineer)** — escalation fix holds, no self-verify, password hash safety, gating not bypassable.

## Open/é defaults (proceeding unless told otherwise)
- Display name = `stores.store_name`. Email verification via Supabase email OTP (simplest) unless notification-service preferred. Signature auto-gen = server-rendered script-font PNG of full name.
