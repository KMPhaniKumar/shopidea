# Design: Seller Product Categorisation + Automatic HSN/GST Assignment
**Status:** Design (not yet implemented)  
**Owner:** Platform Architect  
**Date:** 2026-06-24  
**Migration target:** 042 onwards

---

## 1. Context and Current State

The existing `products` table has a free-text `category TEXT` column (migration 003). The product-add form (`/seller/products/new/page.tsx`) renders a `<select>` populated from `productCategoriesFor(storeCategory)` in `lib/businessCategories.ts` — a flat string list keyed by the store's business type. There is no HSN code, no GST rate, no tax data anywhere on a product row or order item.

The `stores` table has `gst_verified BOOLEAN`, `gst_number TEXT`, and `state TEXT` (migrations 020, 026, 038). The intrastate guard trigger (migration 038) already enforces that non-GST sellers can only receive intra-state orders. The checkout client (`CheckoutClient.tsx`) reads `store.gst_verified` and `store.state` and presents `interstateGstBlock` to the buyer before order placement.

The `orders` table stores `items JSONB` — a snapshot of cart items — and does not today carry any tax breakdown.

The payment and order services create/verify orders against the order total. There is no GST line on invoices today.

**This design adds a third level to the category hierarchy, auto-assigns HSN/GST from a server-authoritative master table, snapshots tax data onto order items at purchase time, and wires CGST/SGST vs IGST computation into the invoice path.**

---

## 2. Taxonomy Design (Decision 1)

### 2.1 Depth: 3 levels, not 2

The seller's draft proposed Parent → Sub-category (2 levels). 2 levels is insufficient for clean HSN mapping in Indian commerce for the following reason: several sub-categories map to multiple HSN codes depending on a more specific product type. Examples:

- "Apparel" → Men's Kurta (HSN 62044) vs. Women's Salwar (HSN 62044) vs. Kids Dress (HSN 62044 or 62114) — the HSN is actually the same at Chapter 62 level, but the price threshold slab differs (under ₹1000 = 5% GST, above ₹1000 = 12% GST as of pre-GST-2.0).
- "Footwear" → Leather shoes (HSN 6403) vs. Rubber slippers (HSN 6402) — different HSN at the sub-category level.
- "Jewellery" → Gold jewellery (HSN 7113) vs. Artificial/imitation (HSN 7117) — different HSN requiring a product-type split.

**Decision: 3 levels — Parent Category → Sub-category → Product Type.** The HSN code and GST rate attach to the Product Type (leaf node). This makes the mapping 1:1 and avoids ambiguity.

### 2.2 Gender: attribute, not a category level

The seller wants "Men's/Women's/Kids wear" groupings. This is NOT a separate category level. Reasons:
- Meesho, Myntra, and Ajio all handle gender as a product attribute/filter, not a separate HSN-bearing category.
- Men's Kurta and Women's Kurti share the same HSN chapter (62) and price-slab logic.
- Adding a gender level would triple the leaf count and create a confusing 4-level hierarchy for sellers.

**Decision: gender = a product attribute (a free-text or enum field on the product, not in the category master).** The product-add form gains a "Gender" attribute selector that is shown only when the parent category is "Clothing & Fashion". It is stored on `products.attributes JSONB` (new column, same migration).

### 2.3 Recommended Tree (starter, CA-validation pending — see Section 9)

```
PARENT                  SUB-CATEGORY              PRODUCT TYPE         (HSN — indicative)
──────────────────────────────────────────────────────────────────────────────────────────
Clothing & Fashion      Ethnic Wear               Sarees               6212 / 6204
                                                  Kurtas & Kurtis      6204 / 6211
                                                  Lehengas             6204
                                                  Sherwanis            6203
                        Western Wear              T-Shirts             6109
                                                  Jeans & Trousers     6203 / 6204
                                                  Dresses              6204
                        Kids Wear                 Kids Ethnic          6209
                                                  Kids Casual          6209
                        Accessories               Scarves & Dupattas   6214
                                                  Belts                6217
Footwear                Leather Footwear          Leather Shoes        6403
                                                  Leather Sandals      6403
                        Non-leather Footwear      Rubber Slippers      6402
                                                  Canvas Shoes         6404
                                                  Sports Shoes         6404
Jewellery               Precious Jewellery        Gold Jewellery       7113
                                                  Silver Jewellery     7113
                        Artificial Jewellery      Fashion Jewellery    7117
                                                  Bangles (plastic)    7117
                                                  Imitation Necklaces  7117
                        Gemstones                 Loose Gemstones      7103
Home & Kitchen          Cookware                  Stainless Steel      7323
                                                  Non-stick Pans       7323
                        Home Décor                Decorative Items     6913
                                                  Diyas & Candles      3406 / 6913
                        Bedding & Linen           Bedsheets            6302
                                                  Pillow Covers        6302
                        Storage                   Plastic Containers   3924
Electronics             Mobile Accessories        Phone Cases          3926 / 3919
                                                  Screen Protectors    3926
                        Audio                     Earphones/TWS        8518
                                                  Bluetooth Speakers   8518
                        Charging                  USB Cables           8544
                                                  Chargers             8504
                        Smart Wearables           Smart Watches        9102
                        Gadgets                   Selfie Sticks        9008 / 8525
Gifts & Stationery      Books                     Books                4901 (0% GST)
                                                  Notebooks            4820
                        Art Supplies              Sketch Pens          9609 / 9608
                                                  Craft Kits           9503
                        Gift Items                Gift Hampers         (parent HSN)
Beauty & Wellness       Skincare                  Face Creams          3304
                                                  Serums               3304
                        Haircare                  Shampoos             3305
                                                  Hair Oils            1510 / 3305
                        Makeup                    Lipsticks            3304
                                                  Eye Makeup           3304
                        Fragrances                Perfumes             3303
                        Organic/Herbal            Herbal Supplements   2106 / 3004
Handicrafts             Pottery                   Clay Pots            6913
                                                  Terracotta Items     6913
                        Paintings & Art           Canvas Paintings     9701
                                                  Digital Prints       4911
                        Handmade Bags             Jute Bags            6305
                                                  Fabric Bags          4202
                        Woodcraft                 Wooden Toys          9503
                                                  Wooden Décor         4420
Other                   General                   General Product      (admin assigns)
```

**All HSN codes above are indicative, not authoritative.** The `gst_rate` values will be populated via the seed but are intentionally left empty in this schema design until CA validation is completed (see Section 9, Risk R-1).

---

## 3. Schema Design (Decision 2)

### 3.1 Master tables (migration 042)

```sql
-- ============================================================
-- Migration 042: Category master + HSN/GST assignment
-- ============================================================

-- 3-level self-referencing category tree.
-- Leaf nodes (depth=3, no children) carry hsn_code + gst_rate.
-- Parent/intermediate nodes carry NULL hsn_code (HSN lives at the leaf).
CREATE TABLE public.product_categories (
  id            UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id     UUID    REFERENCES public.product_categories(id) ON DELETE RESTRICT,
  name          TEXT    NOT NULL,
  depth         SMALLINT NOT NULL CHECK (depth IN (1,2,3)),
    -- 1=parent, 2=sub-category, 3=product-type (leaf)
  hsn_code      TEXT,   -- populated only on depth=3 nodes
  slug          TEXT    UNIQUE NOT NULL,
    -- machine-readable key; used as stable FK from products.category_id
    -- e.g. "clothing--ethnic-wear--sarees"
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT leaf_has_hsn CHECK (
    depth < 3 OR hsn_code IS NOT NULL
  ),
  CONSTRAINT non_leaf_no_hsn CHECK (
    depth = 3 OR hsn_code IS NULL
  ),
  CONSTRAINT has_parent_when_not_root CHECK (
    depth = 1 OR parent_id IS NOT NULL
  )
);

-- GST rate table: separate from the category tree so rates can be updated
-- independently without touching the category hierarchy.
-- One row per (hsn_code, effective_from) pair; the CURRENT rate for a given
-- HSN is the row with the latest effective_from that is <= NOW().
-- price_threshold_paise: if NOT NULL, this rate applies only when the unit
-- selling price >= threshold. A second row with a lower (or zero) threshold
-- covers the price-below case (see Section 6).
CREATE TABLE public.gst_rates (
  id                    UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  hsn_code              TEXT    NOT NULL,
  description           TEXT,   -- human label for admin UI, e.g. "Apparel ≥ ₹1000"
  gst_rate_pct          DECIMAL(5,2) NOT NULL,
    -- total GST %; split into CGST/SGST or IGST at invoice time
  price_threshold_paise BIGINT,
    -- NULL = flat rate; non-NULL = applies when unit_price_paise >= this value.
    -- Stored in paise (1/100 of a rupee) to avoid decimal comparison issues.
    -- Example: 100000 = ₹1000.00
  effective_from        DATE    NOT NULL DEFAULT CURRENT_DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  ca_validated          BOOLEAN NOT NULL DEFAULT false,
    -- Must be set true by a CA/tax professional before going live.
    -- Products in categories whose rate has ca_validated=false are blocked
    -- from being listed (enforced in catalog-service save logic).
  notes                 TEXT,   -- e.g. "Post-56th GST Council revision, Oct 2025"
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX gst_rates_hsn_threshold_effective_uidx
  ON public.gst_rates (hsn_code, COALESCE(price_threshold_paise, -1), effective_from);

-- Index supporting the "current rate for a given HSN" lookup.
CREATE INDEX gst_rates_hsn_effective_idx ON public.gst_rates (hsn_code, effective_from DESC);
```

### 3.2 Products table additions (migration 042 continued)

```sql
-- Replace the free-text category column with a FK to the leaf node.
-- The old text column is kept (renamed) for backfill/rollout; see Section 8.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.product_categories(id),
  ADD COLUMN IF NOT EXISTS category_legacy TEXT,   -- renamed from 'category' during backfill
  ADD COLUMN IF NOT EXISTS hsn_snapshot TEXT,
    -- denormalised HSN at time of last save; informational (invoice snapshot is on order_items)
  ADD COLUMN IF NOT EXISTS gst_rate_snapshot DECIMAL(5,2),
    -- denormalised rate at last save; informational only
  ADD COLUMN IF NOT EXISTS attributes JSONB DEFAULT '{}';
    -- free-form product attributes: {"gender":"women","material":"cotton"}
    -- gender is stored here, not as a category level

-- category_id is NOT YET NOT NULL — becomes mandatory after backfill (migration 043).
-- See Section 8 for the rollout sequence.
```

### 3.3 Order items GST snapshot (migration 042 continued)

The `orders.items` column is currently `JSONB NOT NULL DEFAULT '[]'`. Each element is a cart item snapshot. We extend the per-item shape to include tax data.

```sql
-- No schema change is needed to the orders table itself — JSONB absorbs new keys.
-- The application layer (catalog-service product resolver + order-service order create)
-- is responsible for writing the extended item shape at order creation time.
-- The extended item shape (TypeScript type):
--
-- interface OrderItem {
--   productId:    string    // products.id
--   name:         string    // product name at time of order
--   price:        number    // unit selling price (₹, inclusive of GST)
--   qty:          number
--   weight_grams: number | null
--   // --- new tax snapshot fields ---
--   hsn_code:     string | null   // null for unregistered seller
--   gst_rate_pct: number | null   // null for unregistered seller
--   cgst_pct:     number | null   // intra-state: gst_rate_pct / 2
--   sgst_pct:     number | null   // intra-state: gst_rate_pct / 2
--   igst_pct:     number | null   // inter-state: gst_rate_pct (full)
--   gst_amount:   number | null   // total GST amount for this line (₹)
--   tax_basis:    'intra' | 'inter' | 'exempt' | null
-- }
--
-- These fields are written ONCE at order creation and never updated thereafter.
-- A later change to gst_rates does not affect historical order items.
```

### 3.4 RLS

```sql
-- product_categories: publicly readable; only service_role inserts/updates.
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories publicly readable"
  ON public.product_categories FOR SELECT USING (is_active = true);
-- No INSERT/UPDATE for authenticated or anon — admin manages via service_role only.

-- gst_rates: publicly readable; only service_role inserts/updates.
ALTER TABLE public.gst_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "GST rates publicly readable"
  ON public.gst_rates FOR SELECT USING (is_active = true);
```

### 3.5 Admin rate-management endpoint

A new catalog-service route (internal, admin-auth-gated):

```
GET  /api/catalog/admin/categories          — list full tree
GET  /api/catalog/admin/gst-rates           — list all rates
POST /api/catalog/admin/gst-rates           — create new rate row
PUT  /api/catalog/admin/gst-rates/:id       — update (typically: set ca_validated=true, change rate)
```

These routes require `is_admin = true` on the requesting user and use `supabaseAdmin` (service_role). They never accept `hsn_code` or `gst_rate_pct` from the product-add form.

---

## 4. Price-Slab GST (Decision 4)

Some HSN categories in India have **price-dependent GST rates**: the most prominent examples are apparel (HSN 61xx/62xx: 5% when unit price < ₹1000, 12% GST otherwise, per pre-GST-2.0 slabs) and footwear (HSN 64xx: 5% below ₹500, 18% above, per pre-GST-2.0 — these exact thresholds are subject to GST 2.0 changes, see Risk R-1).

**Design:**

- The `gst_rates` table stores one row per (hsn_code, price_threshold_paise) pair.
- When the catalog-service resolves the applicable rate for a product, it queries: `SELECT gst_rate_pct FROM gst_rates WHERE hsn_code = $1 AND effective_from <= NOW() AND is_active = true ORDER BY COALESCE(price_threshold_paise, 0) DESC LIMIT 1` — this returns the row with the highest threshold that does not exceed the product price.
- The query is: for a given HSN, get all rows ordered by threshold descending; pick the first where `price_paise >= price_threshold_paise` (or where threshold is NULL, as a catch-all fallback).

**Example seed rows for Apparel (indicative, CA-validation required):**

| hsn_code | description | gst_rate_pct | price_threshold_paise | ca_validated |
|---|---|---|---|---|
| 6204 | Apparel >= ₹1000 | 12.00 | 100000 | false |
| 6204 | Apparel < ₹1000  | 5.00  | null   | false |

The catalog-service rate resolver function (pseudocode):

```typescript
async function resolveGstRate(hsnCode: string, unitPricePaise: number): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from('gst_rates')
    .select('gst_rate_pct, price_threshold_paise')
    .eq('hsn_code', hsnCode)
    .eq('is_active', true)
    .lte('effective_from', new Date().toISOString().split('T')[0])
    .order('price_threshold_paise', { ascending: false, nullsFirst: false })
  
  for (const row of (data ?? [])) {
    const threshold = row.price_threshold_paise ?? 0
    if (unitPricePaise >= threshold) return row.gst_rate_pct
  }
  return null
}
```

The rate is resolved at product-save time (stored in `products.gst_rate_snapshot`) and again at order-item-snapshot time (written into `orders.items` JSONB). If the product price changes, the seller must re-save the product, which re-resolves the rate.

---

## 5. Invoice Integrity via Snapshotting (Decision 5)

**Decision: HSN code and GST rate are snapshotted onto the order item at purchase time.** The resolved values are written into the `orders.items` JSONB at the moment the order row is inserted. They are never recalculated or overwritten after the order is placed.

This means:
- If the admin updates a rate in `gst_rates` (e.g., a GST Council revision), all future orders pick up the new rate; all past orders retain the rate in effect at purchase time. This is correct for GSTIN-compliant invoicing.
- The `products.hsn_snapshot` and `products.gst_rate_snapshot` columns on the products table are convenience denormalisations for the seller dashboard only; they play no role in invoice generation.

**Enforcement point:** The order-service `POST /api/orders` (or the Supabase client insert in `CheckoutClient.tsx`) must call a catalog-service helper (or inline the same query) to resolve the current rate for each cart item's `category_id` and attach the tax snapshot before inserting the order row. Since orders can currently be inserted directly from the web client via `supabase.from('orders').insert(...)`, this introduces a **required change**: COD orders must route through the order-service backend (or a Next.js route handler) so the snapshot can be computed server-side before write. The Razorpay online flow already goes through the backend `/api/payments/confirm` path, which is correct.

---

## 6. Registered vs Unregistered Seller (Decision 6)

The rule in Indian GST law: composition dealers and unregistered sellers (turnover below ₹20L/year) are not required to collect or remit GST. Their invoices must not show a GST line and must carry the text "Sold by unregistered dealer."

**Binding signals already in the DB:**
- `stores.gst_verified BOOLEAN` — admin has verified the GSTIN
- `stores.gst_number TEXT` — GSTIN on file

**Decision: two separate code paths, enforced server-side.**

| Condition | HSN on product | GST on invoice | Order item snapshot |
|---|---|---|---|
| `gst_verified = false` OR `gst_number IS NULL` | Optional (stored for reference) | No GST line; "Sold by unregistered dealer" | `hsn_code: null, gst_rate_pct: null, cgst_pct: null, sgst_pct: null, igst_pct: null, gst_amount: null, tax_basis: "exempt"` |
| `gst_verified = true` AND `gst_number IS NOT NULL` | Mandatory, auto-assigned from category, no override | GST line with CGST/SGST or IGST; HSN on invoice | All tax fields populated |

**Enforcement:**
1. **At product save** (catalog-service): if seller is GST-registered, `category_id` must be non-null (leaf node with a valid HSN). The service rejects the save with `{ success: false, error: "Category required for GST-registered sellers", code: "CATEGORY_REQUIRED" }` if missing.
2. **At order item snapshot** (order-service or checkout route): the service reads `stores.gst_verified` + `stores.gst_number` and branches accordingly. If GST-registered, it resolves the rate; if unregistered, it writes the exempt snapshot.
3. **HSN and GST rate fields are never accepted from the client request body.** The Zod schema for the product create/update endpoint strips them. The category_id is accepted; HSN/rate are derived server-side only.

---

## 7. CGST/SGST vs IGST (Decision 7)

**Rule:** When seller state == buyer delivery state → CGST + SGST (each = GST rate / 2). When seller state != buyer delivery state → IGST (full GST rate, single line).

This reconciles with the existing `statesMatch` / `interstateGstBlock` logic in `CheckoutClient.tsx` and migration 038. The checkout client already knows both states before order placement.

**Calculation point: order-service at order creation (server-side only).**

Pseudocode at order creation:
```typescript
const sellerState = store.state
const buyerState = deliveryAddress.state
const isIntrastate = statesMatch(sellerState, buyerState)

for (const item of cartItems) {
  const product = await resolveProduct(item.productId)  // includes category_id, price
  if (!store.gst_verified || !store.gst_number) {
    item.hsn_code = null
    item.gst_rate_pct = null
    item.cgst_pct = null; item.sgst_pct = null; item.igst_pct = null
    item.gst_amount = null
    item.tax_basis = 'exempt'
  } else {
    const hsnCode = await resolveHsn(product.category_id)
    const ratePct = await resolveGstRate(hsnCode, product.price * 100)  // price in paise
    const gstAmount = (item.price * item.qty) * (ratePct / 100)
    item.hsn_code = hsnCode
    item.gst_rate_pct = ratePct
    if (isIntrastate) {
      item.cgst_pct = ratePct / 2; item.sgst_pct = ratePct / 2; item.igst_pct = null
      item.tax_basis = 'intra'
    } else {
      item.cgst_pct = null; item.sgst_pct = null; item.igst_pct = ratePct
      item.tax_basis = 'inter'
    }
    item.gst_amount = Math.round(gstAmount * 100) / 100  // ₹, 2dp
  }
}
```

The existing intrastate guard trigger (migration 038) continues to enforce the structural block on non-GST sellers receiving interstate orders. The GST calculation above is the positive path for GST-registered sellers who are permitted interstate orders.

**Invoice display:**
- Unregistered: subtotal + delivery fee + total; footer "Sold by unregistered dealer. No GST applicable."
- Registered, intra-state: subtotal + CGST line + SGST line + delivery fee + total.
- Registered, inter-state: subtotal + IGST line + delivery fee + total.
- HSN code printed per line item in the registered path.

Prices shown to buyers are always GST-inclusive (the price the seller sets is the selling price). The GST breakdown is informational/compliance on the invoice, not additive to the total.

---

## 8. Migration & Rollout for Existing Products (Decision 8)

Existing products have a free-text `category` string (e.g., "Sarees", "Gold Jewellery"). There are no HSN codes. The rollout must not break existing seller dashboards or storefronts during the transition.

**Sequence:**

**Migration 042** (this design):
- Creates `product_categories` and `gst_rates` tables.
- Adds `category_id UUID` (nullable), `category_legacy TEXT`, `hsn_snapshot`, `gst_rate_snapshot`, `attributes JSONB` to `products`.
- Does NOT make `category_id` mandatory yet.
- Does NOT rename the existing `category` column yet (the UI still reads it; this avoids a breaking change on day 1).

**Migration 043** (seed + mapping, data-architect task):
- Seeds the `product_categories` tree and the starter `gst_rates` rows (all with `ca_validated = false`).
- Runs a best-effort backfill: maps known legacy category strings to the new `category_id` using a known mapping table (e.g., `'Sarees' → slug 'clothing--ethnic-wear--sarees'`).
- Sets `category_legacy = category` for all existing products as a preservation column.
- Leaves `category_id = NULL` for products whose legacy category cannot be mapped (e.g., "Other", "General").

**Migration 044** (mandatory field gate, after CA validation and UI rollout):
- Sets `category_id NOT NULL` constraint with a default pointing to the "Other → General → General Product" catch-all leaf for any remaining nulls.
- Deprecates the `category` text column (kept but ignored in new code paths; can be dropped in a future cleanup migration).
- Sets `ca_validated = true` on rate rows after CA review is signed off (this is an admin action, not a migration).

**Rollout rules:**
- Until CA validation is complete: `category_id` is captured but tax fields are NOT written to order items (tax_basis = 'exempt' for all). The new category picker ships before the HSN/GST logic is live. This is safe and allows sellers to start categorising.
- When CA validation is complete and the `ca_validated` flag is set on rate rows: the order-service activates the tax snapshot path.
- Existing products without `category_id`: treated as unregistered/exempt until the seller edits and re-saves. The seller dashboard product list shows a banner "X products need a category update" using a count of `category_id IS NULL`.

---

## 9. Seller Product-Add UX Flow

### 9.1 Registered seller (gst_verified = true)

```
Step 1: Pick Parent Category
  [dropdown] Clothing & Fashion / Footwear / Jewellery / … / Other
  → on select: load sub-categories for the chosen parent (API: GET /api/catalog/categories?parentId=x)

Step 2: Pick Sub-Category
  [dropdown] Ethnic Wear / Western Wear / Kids Wear / …
  → on select: load product types for the chosen sub-category

Step 3: Pick Product Type
  [dropdown] Sarees / Kurtas & Kurtis / …
  → on select: system calls GET /api/catalog/categories/:id/tax
    response: { hsn_code: "6204", gst_rate_pct: 5.00, description: "Apparel < ₹1000" }
    (rate shown is price-dependent; rate is re-resolved at save using the actual price)

Step 4: HSN + GST display (read-only)
  ┌─────────────────────────────────────────────────────────┐
  │ HSN Code         6204       [cannot edit]  [lock icon]  │
  │ GST Rate         5% (may vary by price)   [cannot edit]  │
  │ Tax Basis        Auto-assigned by ReelMart              │
  └─────────────────────────────────────────────────────────┘
  Tooltip: "HSN and GST are assigned automatically from your product category
            as required by Indian tax law. Contact support if the category is wrong."

Step 5: Fill product details (name, description, price, images, stock)
  [If parent = "Clothing & Fashion": show Gender attribute selector (Men/Women/Kids/Unisex)]

Step 6: Save
  → client sends: { store_id, name, description, price, category_id, attributes, ... }
  → NO hsn_code or gst_rate_pct in request body
  → catalog-service resolves hsn_code and gst_rate from category_id + price
  → saves product with hsn_snapshot + gst_rate_snapshot (informational)
  → returns product row
```

### 9.2 Unregistered seller (gst_verified = false or null)

```
Step 1–3: Same category picker (category is still useful for discovery/search)

Step 4: No HSN/GST block shown at all.
  Small informational text: "Your products are listed as sold by an unregistered dealer.
  To collect GST, complete your GST verification in Settings."

Step 5–6: Same as above.
  → catalog-service saves category_id but hsn_snapshot = null, gst_rate_snapshot = null
```

### 9.3 Category picker component design

- Two cascading `<select>` elements (Parent → Sub) are sufficient for the web form given the current tree depth.
- Product Type is a third `<select>` that appears after Sub-category is chosen.
- The three selects call `GET /api/catalog/categories?depth=1`, `?parentId=X&depth=2`, `?parentId=Y&depth=3` respectively. Responses are cacheable (these rarely change).
- On Product Type selection: a fourth read-only panel shows HSN + indicative GST rate (fetched from `GET /api/catalog/categories/:id/tax`).
- The existing Zod `schema` in `new/page.tsx` and `[id]/page.tsx` needs: old `category: z.string().optional()` replaced by `category_id: z.string().uuid().optional()` (optional until migration 044 makes it mandatory).
- The `productCategoriesFor(storeCategory)` helper in `businessCategories.ts` is no longer used for the main category picker. It can be preserved as a legacy fallback for the transition period.

---

## 10. GST 2.0 / Rate Staleness (Decision 3 — Critical)

The 56th GST Council meeting (approximately September 2025) initiated the "GST 2.0 rationalisation" exercise. Key changes that affect the seller's draft rate table:

| Category in seller's draft | Draft rate | GST 2.0 risk |
|---|---|---|
| Apparel < ₹1000 | 5% | Likely unchanged for low-value items, but threshold may have changed |
| Apparel >= ₹1000 | 12% | The 12% slab was partially rationalised; may have moved to 5% or 18% |
| Footwear < ₹500 | 5% | Threshold may have changed or slab merged |
| Footwear >= ₹500 | 18% | 18% slab retained in most rationalisations |
| Artificial Jewellery | 3% | Pre-GST-2.0 rate was 3%; post-rationalisation status uncertain |
| Gold Jewellery | 3% | CGST+SGST = 1.5% each; likely unchanged but verify |
| Electronics: mobile accessories | 18% | Broadly 18%; verify per specific HSN |
| Books | 0% | Exempt from GST; very unlikely to change |
| Cosmetics/Makeup | 18% or 28% | The 28% slab is partially being removed; some luxury cosmetics may have moved |

**Three mandatory controls:**

1. **All `gst_rates` rows ship with `ca_validated = false`.** The catalog-service `resolveGstRate()` function must check `ca_validated = true` before using a rate for a GST-registered seller's order snapshot. If no validated rate exists for the HSN, the function returns null and the order item is treated as exempt until validation is completed.

2. **The `ca_validated` flag is a hard gate before enabling HSN/GST on any order.** Engineering ships the category picker and the schema first; the tax snapshot path is activated only after a CA or GST professional signs off on the rate table and an admin sets `ca_validated = true` on each row.

3. **The `gst_rates` table is DB-driven and admin-editable.** No rate is hardcoded in application logic. When the GST Council publishes a revision, an admin creates a new row with the new `effective_from` date and the new rate. The old row becomes superseded automatically because `resolveGstRate` picks the latest `effective_from <= NOW()`.

---

## 11. Data Flow Sequence

```
SELLER: Add Product (registered seller)
────────────────────────────────────────────────────────────────────────────
Browser
  │ GET /api/catalog/categories?depth=1
  │ ← { data: [{ id, name, slug }, ...] }    (parent categories)
  │
  │ GET /api/catalog/categories?parentId=X&depth=2
  │ ← { data: [sub-categories] }
  │
  │ GET /api/catalog/categories?parentId=Y&depth=3
  │ ← { data: [product types] }
  │
  │ GET /api/catalog/categories/:id/tax
  │ ← { data: { hsn_code: "6204", gst_rate_pct: 5, description: "Apparel < ₹1000" } }
  │   (read-only display only; actual rate re-resolved at save time)
  │
  │ POST /api/catalog/products
  │   body: { store_id, name, price, category_id, attributes, images, ... }
  │   NO hsn_code / gst_rate in body
  │
catalog-service
  │ → verify seller owns store
  │ → verify store not suspended
  │ → if gst_verified: verify category_id is non-null leaf node
  │ → resolve hsnCode from category_id
  │ → resolveGstRate(hsnCode, price * 100)
  │ → INSERT products with hsn_snapshot, gst_rate_snapshot
  │ ← { success: true, data: product }

BUYER: Place Order
────────────────────────────────────────────────────────────────────────────
Browser / order-service
  │ For each cart item:
  │   → fetch product.category_id from catalog
  │   → if store.gst_verified AND store.gst_number:
  │       → resolveHsn(category_id)
  │       → resolveGstRate(hsn, unit_price_paise)
  │       → determine intra vs inter-state using statesMatch(store.state, deliveryAddress.state)
  │       → compute cgst/sgst or igst amounts
  │   → else: set all tax fields null, tax_basis = 'exempt'
  │
  │ INSERT orders (items JSONB includes full tax snapshot per line item)
  │ → orders_intrastate_guard trigger fires (unchanged, still enforces non-GST block)
  │ ← { success: true, data: { id, order_number } }

INVOICE PRINT
────────────────────────────────────────────────────────────────────────────
  → read orders.items JSONB (already has the frozen tax snapshot)
  → if any item.tax_basis = 'exempt' or null: show "Sold by unregistered dealer"
  → if items have intra: show CGST + SGST lines
  → if items have inter: show IGST line
  → print HSN per line item in registered path
```

---

## 12. Work Breakdown by Team

| Team | Tasks |
|---|---|
| **data-architect / database-engineer** | Write migration 042 (schema), migration 043 (seed + backfill mapping), migration 044 (make category_id mandatory). Write the `gst_rates` seed with all starter rows marked `ca_validated=false`. Establish backfill mapping table (legacy text → category slug). |
| **backend-engineer (catalog-service)** | Add `GET /api/catalog/categories` (tree query, depth/parentId filter). Add `GET /api/catalog/categories/:id/tax` (HSN + indicative rate for display). Modify `POST/PUT /api/catalog/products` to accept `category_id`, strip any client-provided hsn/gst fields, resolve and persist snapshots. Add admin routes for category/rate management. Implement `resolveGstRate(hsnCode, pricePaise)` helper. |
| **backend-engineer (order-service or checkout route handler)** | Modify order creation to compute tax snapshot per item before INSERT. This requires refactoring COD order placement from a direct Supabase client INSERT (in `CheckoutClient.tsx`) to a server-side route handler (Next.js API route or order-service endpoint) so snapshot logic runs server-side. The Razorpay `/api/payments/confirm` path already runs server-side and is the correct place for the online path. |
| **ui-engineer (seller dashboard)** | Replace the flat `<select>` category field in `new/page.tsx` and `[id]/page.tsx` with the 3-level cascading picker. Add read-only HSN/GST display panel for registered sellers. Add gender attribute selector for Clothing. Add "X products need a category update" banner on the products list page. |
| **ui-engineer (admin panel)** | Build the rate-management screen at `/admin/categories` (view tree, view rate rows, edit `ca_validated` flag, add new rate rows). Show `ca_validated` status prominently before any tax feature is activated. |
| **ui-engineer (invoice / order detail)** | Update the invoice print view and order detail page to show CGST/SGST or IGST breakdown (or "Sold by unregistered dealer") using the snapshotted values from `orders.items`. |
| **CA / tax professional (external gate)** | Review all HSN codes in the seed against the actual HSN tariff schedule. Confirm GST rates against the most recent GST Council notification (post-56th Council). Set `ca_validated = true` on each rate row via the admin panel after sign-off. This is a hard pre-launch gate for the tax feature. |

---

## 13. Risks and Open Questions

### R-1 (HIGH) — CA validation is a hard gate
The entire tax feature — HSN codes on invoices, GST rate display, CGST/SGST/IGST breakdown — must NOT go live until a CA or GST consultant reviews and approves every rate row in `gst_rates`. Engineering can ship the category picker and schema without tax fields being active (all items exempt until validation). The `ca_validated` flag is the production safety valve. **Do not activate `ca_validated = true` rows without a signed CA sign-off.**

### R-2 (HIGH) — GST 2.0 rate uncertainty
As of June 2026, the GST Council's rationalisation exercise outcome (56th Council and any subsequent notifications) must be confirmed against current CBIC circulars. The draft rates provided by the seller should be treated as directionally useful but numerically unverified. Specific rows requiring CA attention: Apparel thresholds, Footwear thresholds, Artificial Jewellery (was 3%), any items that were in the 28% sin slab.

### R-3 (MEDIUM) — COD order path bypasses server-side tax logic
Currently, COD orders are inserted directly from `CheckoutClient.tsx` via `supabase.from('orders').insert(...)`. The tax snapshot computation cannot run client-side (it requires DB access to `gst_rates` and `product_categories`, and must not be client-controllable). This requires a refactor: introduce a Next.js server action or a new `POST /api/orders` endpoint that runs the tax resolution before the INSERT. Estimated scope: medium backend + frontend change. The Razorpay online path (`/api/payments/confirm`) already runs server-side and is already correct.

### R-4 (MEDIUM) — Category backfill quality
The legacy `category` text values ("Sarees", "Gold Jewellery") were free-text entries. The mapping to the new tree's slugs is best-effort. Products where the legacy category does not match any known slug remain `category_id = NULL` and must be re-categorised by the seller. The admin dashboard should surface a report of uncategorised products.

### R-5 (LOW) — Price-slab rate re-evaluation on price change
When a seller edits a product's price (e.g., changes a kurta from ₹800 to ₹1200), the `gst_rate_snapshot` on the product is stale until re-save. More importantly, the order snapshot at purchase time uses the price at that moment, so the correct rate is always captured at order creation. The product-level snapshot is informational only. The seller should be shown a hint: "Your GST rate will be recalculated if you change the price."

### R-6 (LOW) — HSN display for buyers
Indian consumers are not familiar with HSN codes and need no information about them on the storefront or cart. HSN should appear only on: the print invoice, the seller's product management screen (informational), and the admin panel. It should not appear on the buyer-facing order confirmation page or app.

### Open Questions

1. Does ReelMart intend to file GSTR-1 on behalf of sellers, or are sellers filing independently? If ReelMart files on behalf, the order-items tax snapshot design here is sufficient and the outward supply data is queryable by HSN/period. If sellers file independently, they need an HSN-wise sales summary export from the seller dashboard — this is a separate feature to scope.

2. What is the treatment of composite orders (a buyer orders from two stores in one session — currently not a platform feature, but worth confirming)? Today each store = one order, so no blending issue.

3. Should the platform enforce a `gst_number` format check (GSTIN is 15 characters: 2-digit state code + 10-digit PAN + entity + Z + check digit) at store-settings save time? Currently `stores.gst_number` is a free-text column. A validation function would catch typos before admin review.

4. Are Handicrafts sellers typically registered under the Composition Scheme (flat 1% or 6% rate) rather than the regular scheme? Composition dealers have different invoicing rules (cannot collect GST from buyers at all; pay a flat rate on turnover). If ReelMart onboards Composition sellers, the tax path needs a third branch in addition to "registered" and "unregistered."

---

## 14. Starter Seed (Indicative — Rates Pending CA Validation)

The following is a sample of the `gst_rates` seed that the data-architect should populate in migration 043. All rows have `ca_validated = false`. **Do not treat these rates as authoritative. Every row must be validated by a CA against the current CBIC rate schedule before `ca_validated` is set to true.**

| hsn_code | description | gst_rate_pct | price_threshold_paise | notes |
|---|---|---|---|---|
| 6204 | Apparel (women, woven) ≥ ₹1000 | 12.00 | 100000 | PRE-GST-2.0 rate; verify 56th Council outcome |
| 6204 | Apparel (women, woven) < ₹1000 | 5.00 | null | Flat rate below threshold |
| 6109 | T-shirts ≥ ₹1000 | 12.00 | 100000 | PRE-GST-2.0 rate |
| 6109 | T-shirts < ₹1000 | 5.00 | null | |
| 6403 | Leather footwear ≥ ₹500 (indicative) | 18.00 | 50000 | PRE-GST-2.0; footwear threshold may have changed |
| 6403 | Leather footwear < ₹500 (indicative) | 5.00 | null | |
| 6402 | Rubber/plastic footwear ≥ ₹500 | 18.00 | 50000 | PRE-GST-2.0 |
| 6402 | Rubber/plastic footwear < ₹500 | 5.00 | null | |
| 7113 | Gold/silver jewellery | 3.00 | null | CGST 1.5% + SGST 1.5%; likely unchanged but verify |
| 7117 | Artificial/imitation jewellery | 3.00 | null | PRE-GST-2.0; verify post-rationalisation |
| 7323 | Cookware (stainless steel, non-stick) | 12.00 | null | PRE-GST-2.0; verify |
| 6302 | Bedsheets / linen | 5.00 | null | Likely unchanged |
| 3304 | Beauty / cosmetics | 18.00 | null | Was 28% for luxury; verify per sub-HSN |
| 3303 | Perfumes | 18.00 | null | PRE-GST-2.0; some perfumes were 28% |
| 3305 | Haircare products | 18.00 | null | PRE-GST-2.0 |
| 8518 | Earphones / speakers | 18.00 | null | Broadly 18%; verify |
| 9102 | Smart watches | 18.00 | null | Verify |
| 4901 | Books (printed) | 0.00 | null | GST exempt; zero-rated |
| 4820 | Notebooks / stationery | 12.00 | null | Verify |
| 9503 | Toys / wooden toys | 12.00 | null | PRE-GST-2.0 rate; verify |
| 6913 | Decorative ceramics / pottery | 12.00 | null | Verify |
| 9701 | Paintings / art works | 0.00 | null | Original artworks exempt; reproductions taxable |

---

## 15. Summary of Headline Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | 3-level taxonomy (Parent → Sub → Product Type); gender = product attribute | Clean 1:1 HSN mapping at leaf; aligns with Meesho/Myntra conventions |
| 2 | Server-authoritative master tables (`product_categories`, `gst_rates`); no client-side HSN/GST input | Prevents tax misuse; rate changes are admin-only with audit trail |
| 3 | `ca_validated` flag is a hard gate; all rates ship false | Prevents incorrect tax collection before CA review |
| 4 | Price-slab handled via multiple rows per HSN in `gst_rates` with `price_threshold_paise` | Covers apparel/footwear thresholds without special-case code |
| 5 | Tax values snapshotted into `orders.items` JSONB at purchase time | Historical invoice integrity; no retroactive recalculation |
| 6 | Unregistered sellers: no GST line, "Sold by unregistered dealer"; registered: mandatory category + auto HSN | Correct under Indian GST law; enforced server-side |
| 7 | CGST/SGST vs IGST resolved at order creation using `statesMatch()`; aligns with existing checkout logic | Consistent with migration 038 intrastate guard; no double enforcement |
| 8 | Phased rollout: category picker ships first → CA validation → tax activation; `category_id` nullable → mandatory | No breaking change to existing sellers; safe incremental rollout |
