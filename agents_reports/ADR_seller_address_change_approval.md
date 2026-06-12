# ADR — Seller pickup-address changes require admin approval

**Author:** product-architect · **Status:** proposed (needs sign-off on the one open decision) · **Date:** 2026-06-12
**Surfaces touched:** data (Supabase), web seller dashboard, web admin dashboard, delivery-service (pickup), notification-service.

## Context — how it works today
- The seller Settings page writes address fields **directly to the live `stores` row** from the browser (`supabase.from('stores').update({address, area, city, state, pincode, …})`, [settings/page.tsx:103](../reelmart/apps/web/app/seller/(dashboard)/settings/page.tsx#L103)) under the seller's own RLS UPDATE policy, then calls `/api/seller/pickup/sync` which immediately re-registers the new address with NimbusPost.
- `stores` has `approval_status ∈ {pending,approved,rejected}` (015) and `pickup_status ∈ {none,pending,verified,failed}` (019).
- **Net:** a seller can change their pickup address post-approval with **no admin review**, and it re-registers with the courier instantly.

## Requirement
A seller editing their **pickup address** must route through **admin approval** before it takes effect (live address + courier pickup).

## Key design constraint (the crux)
Because the seller currently updates the `stores` row **directly via RLS from the client**, simply changing the UI to "submit a request" is **not enforceable** — a seller could call Supabase directly and still overwrite their address. Approval must be enforced at the **data layer**:

> **Revoke column-level UPDATE on the address columns from `authenticated`**, so only the service role (the admin-approval server route) can write them.
> `REVOKE UPDATE (address, area, city, state, pincode) ON public.stores FROM authenticated;`
> Postgres column privileges compose with RLS — the seller keeps row UPDATE for non-address fields (name, description, logo, whatsapp), but address writes can only happen server-side on approval.

## Decision (recommended)
**Moderated address change via a request table; the store stays LIVE on its old address until approved (Option A).**

- Seller submits a proposed address → stored as a **pending change request**, NOT applied to the live store.
- Store keeps operating and shipping from its existing verified pickup until admin acts.
- Admin approves → service route applies the new address to `stores` + re-registers the NimbusPost pickup (`pickup_status` → pending→verified).
- Admin rejects (with reason) → request discarded, live address unchanged, seller notified.

### Data model — new table
```sql
create table public.store_address_changes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  proposed jsonb not null,          -- { address, area, city, state, pincode }
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reject_reason text,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz
);
create unique index store_address_changes_one_open
  on public.store_address_changes (store_id) where status = 'pending';  -- one open request per store
```
RLS: seller may `INSERT`/`SELECT` their own store's requests; only admin/service may update status. Address columns on `stores` locked via the column REVOKE above.

### Flow (sequence)
1. Seller edits address on Settings → web route `POST /api/seller/address-change` (server, validates ownership + Zod) → upsert a `pending` row in `store_address_changes` (supersedes any existing open one). Non-address fields still save directly as today.
2. Seller UI shows "Address change pending admin approval" banner; the live address shown is the current one.
3. Admin dashboard: new **"Address changes"** review queue — shows old vs proposed diff per store → Approve / Reject(reason).
4. **Approve** → service route: update `stores` address columns (service role), set request `approved`, call `registerStorePickup(storeId)` (existing path) to re-register with NimbusPost, notify seller.
5. **Reject** → set `rejected` + reason, notify seller; live address untouched.

### Edge cases
- **First onboarding** (store still `pending`): address captured at registration and approved as part of the normal store approval — **no separate change request**. This feature only governs **post-approval** edits.
- **Resubmit:** the partial unique index allows only one open request; a new submit replaces/updates it.
- **Pincode serviceability:** optional — validate the new pincode via NimbusPost `rate/serviceability` at submit time and warn early.
- **Scope:** pickup/store **address only**. Store name/KYC-doc edits are out of scope here (flag separately if they should also be moderated).

## Work breakdown
- **database-engineer:** migration for `store_address_changes` + RLS + the column-level `REVOKE UPDATE (address…)`. (Migration-first; coordinate numbering after 021.)
- **backend/ui-engineer (web seller):** `POST /api/seller/address-change` server route; rework Settings save to submit a request for address fields (keep non-address direct); pending-state banner; **remove** the direct client-side address update + the immediate `pickup/sync`.
- **ui-engineer (web admin):** "Address changes" review queue (list + old/new diff + approve/reject-with-reason), calling a new `PUT /api/admin/stores/[id]/address-change`.
- **backend (admin route):** approve = apply address (service role) + `registerStorePickup` + notify; reject = reason + notify.
- **notification-service:** "address change submitted" (to admin) / "approved" / "rejected (reason)" (to seller) — reuse existing channels.
- **app-security-engineer:** review the RLS + column-REVOKE actually enforces it (seller can't bypass via direct Supabase), ownership checks, Zod validation.

## Open decision to confirm (drives the build)
**While a change is pending, what is the store's state?**
- **A (recommended):** stays LIVE on the old address; only the new address waits. Least disruptive.
- **B:** editing flips the whole store back to `approval_status='pending'` and takes it OFFLINE until re-approved. Simpler (reuses the existing store-approval queue) but the store goes dark over an address tweak.

I recommend **A**. Confirm A or B before implementation.
