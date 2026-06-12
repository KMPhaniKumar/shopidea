# NimbusPost Integration — Implementation Spec

**Author:** product-architect · **Status:** ready for implementation · **Owner service:** `reelmart/services/delivery-service`
**Source of truth:** NimbusPost Partners API (Postman: `documenter.getpostman.com/view/9692837/TW6wHnoz`), content captured below.
**Base URL:** `https://api.nimbuspost.com/v1`

> Goal: replace the current partially-wrong, inert NimbusPost client with a complete, secure, well-tested integration. Auth credentials are **placeholders** for now (user supplies values later via Secrets Manager) — code and infra must be wired so that dropping in the real secret is the only remaining step.

---

## 1. Auth model (IMPORTANT — current code is wrong)

- NimbusPost auth header is **`Authorization: Bearer <jwt>`**. The current code sends `NP-AUTH-TOKEN` — **that is incorrect, change it.**
- The JWT is obtained from `POST /v1/users/login` with `{ email, password }` → `{ status:true, data:"<jwt>" }`.
- The JWT **expires (~3 hours** per the sample `exp`). So a static token will go stale. Implement:
  1. **Primary:** login with `NIMBUS_EMAIL` + `NIMBUS_PASSWORD`, cache the JWT in memory with its expiry, and **re-login automatically on 401 or when near expiry**.
  2. **Override (testing):** if `NIMBUS_AUTH_TOKEN` is set, use it verbatim and skip login (lets us test with a manually-pasted token).
- **Placeholders now:** `NIMBUS_EMAIL`, `NIMBUS_PASSWORD`, `NIMBUS_AUTH_TOKEN` (override), `NIMBUS_WAREHOUSE_NAME` (default/platform pickup). Infra adds **empty secret shells**; values filled later. When none are configured, the service must stay in today's safe **stub mode** (no crashes).
- **Never** log or return the token / password in any response, log line, or error `details`.

## 2. Endpoint catalog (exact contracts)

All requests: `Content-Type: application/json`, `Authorization: Bearer <token>` (except Login). All responses use `{ status: boolean, ... }`; `status:false` carries `message`.

### Users
- **Login** — `POST /users/login` — body `{ email, password }` → `{ status, data:"<jwt>" }` (200) / 401 on bad creds.

### Shipments
- **Create Shipment** — `POST /shipments` — body:
  ```json
  { "order_number":"#001","shipping_charges":40,"discount":100,"cod_charges":30,
    "payment_type":"cod","order_amount":1000,"package_weight":300,
    "package_length":10,"package_breadth":10,"package_height":10,"request_auto_pickup":"yes",
    "consignee":{"name":"","address":"","address_2":"","city":"","state":"","pincode":"","phone":"9999999999"},
    "pickup":{"warehouse_name":"warehouse 1","name":"","address":"","address_2":"","city":"","state":"","pincode":"","phone":""},
    "order_items":[{"name":"product 1","qty":"18","price":"100","sku":"sku001"}],
    "courier_id":"1","is_insurance":"0","tags":"tag1, tag2" }
  ```
  → `{ status, data:{ order_id, shipment_id, awb_number, courier_id, courier_name, status, payment_type, label } }`.
  Notes: `payment_type` ∈ `cod|prepaid|reverse`. `package_weight` in **grams**, dims in **cm**. `request_auto_pickup`:`"yes"|"no"`. `pickup` may be just `{warehouse_name}` when the warehouse already exists. `courier_id` optional (omit ⇒ NimbusPost auto-selects).
- **Track Single** — `GET /shipments/track/{awb}` (AWB in **path**) → `{ status, data:{ awb_number, status, rto_status, shipment_info, history:[{ status_code, location, event_time, message }] } }`.
- **Bulk Track** — `POST /shipments/track/bulk` — body `{ awb:[".."] }` (≤100) → `{ status, data:[ {…same as single…} ] }`.
- **Manifest** — `POST /shipments/manifest` — body `{ awbs:[".."] }` → `{ status, data:"<pdf-url>" }`.
- **Cancel** — `POST /shipments/cancel` — body `{ awb:".." }` → `{ status, message:"Shipment Cancelled" }`.
- **Hyperlocal** — `POST /shipments/hyperlocal` — like Create Shipment **plus** `consignee.latitude/longitude` and `pickup.latitude/longitude`; `courier_id:"autoship"` allowed. (Implement the client method; wiring a buyer-facing flow is out of scope for now.)

### Couriers
- **Courier List** — `GET /courier` → `{ status, data:[{ id, name }] }`.
- **Serviceable Pincodes** — `GET /courier/serviceability` → `{ status, count, data:[{ pincode, cod, prepaid }] }` (large list).
- **Rate & Serviceability** — `POST /courier/serviceability` — body `{ origin, destination, payment_type, order_amount, weight?, length?, breadth?, height? }` (origin/destination = 6-digit; weight default 500g, dims default 10) → `{ status, data:[{ id, name, freight_charges, cod_charges, total_charges, min_weight, chargeable_weight }] }`. **No `estimated_delivery_days` field exists** — stop reading it; derive ETA separately or drop it. `data:[]` ⇒ not serviceable. 404 `{status:false,message}` on bad input.

### NDR (failed delivery)
- **NDR List** — `GET /ndr?awb_number=&page_no=&per_page=` (per_page ≤250) → `{ status, data:[{ awb_number, event_date, courier_remarks, total_attempts }] }`. 404 `{status:false,message:"No record found"}`.
- **NDR Action** — `POST /ndr/action` — body is an **ARRAY** (≤100), each: `{ awb, action, action_data }` where action ∈:
  - `re-attempt` → `action_data:{ re_attempt_date:"YYYY-MM-DD" }`
  - `change_address` → `action_data:{ name, address_1, address_2 }`
  - `change_phone` → `action_data:{ phone:"10-digit" }`
  → returns an **array** `[{ status, awb, message }]` (per-item result; action only allowed when courier has raised an exception).

### Tracking status codes
`PP`=Pending Pickup · `IT`=In Transit · `EX`=Exception · `OFD`=Out For Delivery · `DL`=Delivered · `RT`=RTO · `RT-IT`=RTO In Transit · `RT-DL`=RTO Delivered. Map onto our 5-step timeline `confirmed→picked_up→in_transit→out_for_delivery→delivered` (existing `mapNimbusStatus`), and surface `EX`/`RT*` as exception/return states.

## 3. Work breakdown

### Client (`src/lib/nimbus.ts`) — rewrite
- Bearer auth + login/cache/refresh (§1). Single `npRequest(method, path, body?)` that: sets headers, JSON-parses, detects `status:false` → throws a typed `NimbusError(message, raw)`, retries **once** on 401 after re-login, applies a **request timeout** (e.g. 15s via `AbortController`), and never includes credentials in thrown errors.
- Typed methods: `createShipment`, `trackShipment(awb)` (GET path), `bulkTrack(awbs)`, `manifest(awbs)`, `cancelShipment(awb)`, `createHyperlocal`, `courierList`, `serviceablePincodes`, `rateServiceability`, `ndrList(params)`, `ndrAction(actions)`. Keep `registerPickupWarehouse`/`fetchPickupStatus` (warehouse endpoint is newer than this doc — leave as-is, just move onto the Bearer header).
- Defensive response parsing (NimbusPost field shapes vary) — keep the existing tolerant extraction style.

### Routes (`src/routes/delivery.ts`)
- **Fix** `POST /rates`: drop `estimated_delivery_days`; keep cheapest `total_charges`; keep stub fallback.
- **Fix** `POST /create-shipment`: **add ownership check** (seller owns `order.store_id`) — currently missing (IDOR); send `request_auto_pickup:"yes"`, `shipping_charges`/`cod_charges`/`discount` from the order, `address_2`, full consignee/pickup. Use `order.total_amount` from DB (never client amount). Persist `awb_code`, `label` (shipping label URL), `courier_name`, `tracking_url`, status.
- **Fix** `GET /track/:awbCode`: call `trackShipment(awb)` (GET path), map history.
- **Add** `POST /cancel-shipment` (auth + seller-owns-order): cancel AWB, update order status.
- **Add** `POST /ndr/list` + `POST /ndr/action` (seller-scoped: only for the seller's own orders/AWBs).
- **Add** internal `POST /track/bulk` (for a future cron to refresh many shipments) — `requireInternalKey`.

### Security requirements (enforce all)
- **Ownership/authz on every seller action** (create-shipment, cancel, NDR): verify `req.user.id` owns the order's store before calling NimbusPost. Buyers may only read tracking for **their own** orders' AWBs.
- Zod-validate every body/param (AWB format, pincode 6-digit, phone 10-digit, payment_type enum, NDR action enum + required `action_data` per action, array size limits ≤100).
- `{ success, data|error, code }` response shape. No raw NimbusPost payloads with internal IDs leaked to buyers.
- Internal-only endpoints behind `requireInternalKey`. Secrets via env only; never hardcode; never log token/password.
- Idempotency: don't double-book if `order.awb_code` already set — return existing.

### Error handling requirements
- Distinguish: not-configured (stub mode) · NimbusPost `status:false` (surface `message`, 502) · network/timeout (503, retryable) · validation (400) · authz (403) · not-found (404).
- `create-shipment` with no AWB in response ⇒ 502 with safe details (no token).
- Log failures with context (orderId, awb, NimbusPost message) using the service logger — **never** the token.

### Infra (separate hand-off to infra-engineer — placeholders only)
- Add empty Secrets Manager shells `reelmart/dev/nimbus-email`, `reelmart/dev/nimbus-password`, `reelmart/dev/nimbus-auth-token`; add `NIMBUS_EMAIL`/`NIMBUS_PASSWORD`/`NIMBUS_AUTH_TOKEN` (+ existing `NIMBUS_WAREHOUSE_NAME`) to the delivery-service task def. Remove stale Shiprocket secrets (security audit LOW-4).

## 4. Acceptance
- `npm run build` (tsc) clean. Unit-level: with no creds → stub responses, no throw. With `NIMBUS_AUTH_TOKEN` override set → correct Bearer header + paths (verify with a mocked fetch). Ownership checks return 403 for non-owners. NDR action validates per-action `action_data`.
- Do **not** deploy until the user supplies real credentials; this pass is code + infra-shells only.
