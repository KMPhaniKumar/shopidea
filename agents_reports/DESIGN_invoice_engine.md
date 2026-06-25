# Design: Invoice Engine — Two-Invoice Model per Order
**Status:** Design (not yet implemented)
**Owner:** Platform Architect
**Date:** 2026-06-24
**Builds on:** `agents_reports/DESIGN_category_hsn_gst.md` (category/HSN/GST schema, `ca_validated` gate, tax snapshotting — do not re-read tax-rate derivation here; treat that design as authoritative input)
**Migration target:** 045 onwards (after 042–044 from category/HSN design)

---

## 1. Context

ReelMart is a two-sided marketplace. Each completed order involves two separate taxable events:

1. **Seller sells goods to the buyer.** The seller's outward supply. The seller must issue a tax invoice to the buyer. The seller files their own GST (GSTR-1) on this. ReelMart generates the document on the seller's behalf and gives them the data to file.

2. **ReelMart sells services to the seller.** ReelMart charges commission and logistics/delivery fees and is separately GST-registered. ReelMart issues its own tax invoice to the seller for these service charges. This is ReelMart's outward supply; ReelMart files its own GSTR-1 and GSTR-8 on this.

Additionally, ReelMart as an e-commerce operator (ECO) has **two statutory deduction obligations** that sit alongside these invoices:
- **GST TCS (Sec 52, CGST Act):** ReelMart must collect 1% (0.5% CGST + 0.5% SGST intrastate, or 1% IGST interstate) on the net taxable value of supplies made through the platform, deposit to the government, and report in GSTR-8. This appears in the seller's GSTR-2A as a credit.
- **Income-tax TDS (Sec 194-O, Income Tax Act):** ReelMart must deduct 0.1% (reduced from 1%, effective October 2024) on gross sales proceeds paid to the seller, and deposit/report via Form 26Q. This appears in the seller's Form 26AS.

These are **different statutes, different rates, different filing vehicles, and different treatment on the seller's books.** The current payout-service conflates them — see Section 7 for the corrected model and the required fix.

---

## 2. Corrected TCS/TDS Model (payout-service fix required)

### 2.1 What the current code does (wrong)

`payout-service/src/routes/payouts.ts` line 8–11:
```
// TCS (Tax Collected at Source) under Section 194-O of the Income Tax Act.
// Applicable to e-commerce operators paying sellers: 1% of gross order value.
const TCS_PCT = 0.01
```
And `041_payouts_fee_tcs.sql` column comment:
```
'1% Tax Collected at Source under Sec 194-O (TCS_PCT × gross)'
```

This is wrong in two independent ways:
- **Sec 194-O is Income-tax TDS, not GST TCS.** The "TCS" acronym in GST law (Sec 52 CGST Act) and the "TDS" in income-tax law (Sec 194-O) are different statutes entirely. They both use the word "collection/deduction at source" colloquially but operate independently.
- **The rate is wrong.** Sec 194-O TDS was reduced from 1% to **0.1%** with effect from 1 October 2024. The code uses 1%, which over-deducts by 10x.

### 2.2 Correct model (two separate deductions)

| Deduction | Statute | Rate | Basis | Deposited to | Seller sees it in | On the ReelMart→Seller statement |
|---|---|---|---|---|---|---|
| **GST TCS** | Sec 52 CGST Act | 1% of net taxable value of supply (0.5% CGST + 0.5% SGST intrastate; 1% IGST interstate) | Taxable value of goods sold through the platform (net of returns) | GST government portal via GSTR-8 | Seller's GSTR-2A as input tax credit | Shown as "GST TCS @ 0.5% CGST + 0.5% SGST" or "GST TCS @ 1% IGST" on the payout statement |
| **IT TDS** | Sec 194-O Income Tax Act | **0.1%** of gross payment made to seller | Gross order value (before any deductions) | Income tax via Form 26Q (quarterly) | Seller's Form 26AS as TDS credit | Shown as "IT TDS u/s 194-O @ 0.1%" on the payout statement |

**Both apply only when the seller's gross sales through ReelMart exceed the threshold in a financial year (Sec 194-O threshold: ₹5 lakh turnover through the ECO in a FY). Below ₹5 lakh, TDS is not required. GST TCS Sec 52 has its own conditions — see open question OQ-5.**

### 2.3 What payout-service must change

This is flagged for the backend engineer; the architect's design specifies:

1. **Rename and correct the rate constant:**
   - Remove `TCS_PCT = 0.01`
   - Add `GST_TCS_PCT = 0.01` (1% of taxable value of supply — this is actually a different calculation basis, see below)
   - Add `IT_TDS_PCT = 0.001` (0.1% of gross payment)

2. **Different calculation bases:**
   - GST TCS (Sec 52) applies to the **net taxable value of supplies** through the platform (not the commission — this is on the goods sold by the seller). For a GST-registered seller, the taxable value is the order value excluding GST (price is GST-inclusive, so taxable value = order value / (1 + gst_rate)). For an unregistered seller, GST TCS technically does not apply (they are not making a taxable supply). For practical MVP: apply GST TCS on the product subtotal (before delivery fee, after discount) as an approximation; refine after CA validation.
   - IT TDS (Sec 194-O) applies to **gross payment made** — i.e. the net payout (after platform fee) that ReelMart transfers to the seller's bank, not on the gross order value.

3. **The payout schema (`payouts` table) needs two separate columns, correctly named:**
   - `gst_tcs_amount` (replaces the incorrectly labelled `tcs_amount` column — a migration renaming the column comment at minimum, or a proper rename-and-add)
   - `it_tds_amount` (new column; currently missing entirely)
   - `platform_fee` stays correct

4. **Migration 046 (data-architect task):** rename `tcs_amount` → `gst_tcs_amount` and add `it_tds_amount` on the `payouts` table.

5. **The payout summary endpoint and admin payout UI must expose both deductions separately** so the seller understands what went where.

### 2.4 Worked payout math (reconciliation — see also Section 4)

Using the worked example from Section 4:

```
Gross order value (product subtotal):          ₹1,180  (GST-inclusive)
Delivery fee:                                  ₹60
Total order value:                             ₹1,240

Platform commission (5% of product subtotal):  ₹59.00
GST on commission (18%):                       ₹10.62  ← appears on ReelMart→Seller invoice
GST on delivery fee (18% SAC 996812):          ₹10.80  ← appears on ReelMart→Seller invoice
Total ReelMart charges to seller:              ₹80.42  (commission + delivery fee + GST on both)

GST TCS (Sec 52, 1% of taxable value of supply):
  Taxable value = ₹1,000 (₹1,180 / 1.18, backing out 18% GST)
  GST TCS = ₹10.00 (0.5% CGST ₹5 + 0.5% SGST ₹5 for intrastate)

IT TDS (Sec 194-O, 0.1% of gross payment to seller):
  Payment to seller before TDS = ₹1,240 - ₹80.42 = ₹1,159.58
  IT TDS = ₹1.16 (0.1% × ₹1,159.58, rounded)

Net payout to seller's bank:
  ₹1,240 - ₹80.42 (ReelMart charges) - ₹10.00 (GST TCS) - ₹1.16 (IT TDS)
  = ₹1,148.42
```

This is the complete payout reconciliation. The seller receives ₹1,148.42 in their bank, has a credit of ₹10 in their GSTR-2A, and a credit of ₹1.16 in their Form 26AS.

---

## 3. The Two Invoice Templates

### 3.1 Invoice Type A — Seller to Buyer (Goods Tax Invoice)

This is the seller's outward supply document. For a GST-registered seller it is a full tax invoice under rule 46 of CGST Rules. For an unregistered seller it is a "bill of supply."

**Header block:**
```
TAX INVOICE / BILL OF SUPPLY
------------------------------------------------------
Invoice Number:    [SELLER-SERIES]-[FY]-[NNNNNN]     e.g. SB/2025-26/000042
Invoice Date:      DD/MM/YYYY
Place of Supply:   [Buyer delivery state]
------------------------------------------------------
SOLD BY (Supplier):
  Store Name:      [stores.store_name]
  Address:         [stores.address snapshot at order time]
  GSTIN:           [stores.gst_number]   OR  "Unregistered Dealer"
  State:           [stores.state]
  State Code:      [2-digit GST state code]
------------------------------------------------------
BILLED TO / SHIP TO (Recipient):
  Name:            [orders.delivery_address.name]
  Phone:           [orders.delivery_address.phone]
  Address:         [orders.delivery_address.address], [city], [pincode]
  State:           [orders.delivery_address.state]
  GSTIN:           N/A (B2C buyer)
------------------------------------------------------
```

**Line items table (GST-registered seller path):**
```
| # | Product Name       | HSN   | Qty | Unit Price | Taxable Value | CGST%  | CGST Amt | SGST%  | SGST Amt | IGST%  | IGST Amt | Total     |
|---|-------------------|-------|-----|-----------|---------------|--------|----------|--------|----------|--------|----------|-----------|
| 1 | Women's Chiffon    | 6204  |  2  | ₹590.00   | ₹1,000.00     | 9.00%  | ₹90.00   | 9.00%  | ₹90.00   | —      | —        | ₹1,180.00 |
|   | Saree (intra)      |       |     |           |               |        |          |        |          |        |          |           |
```

**Line items table (unregistered seller path):**
```
| # | Product Name       | Qty | Unit Price | Amount     |
|---|-------------------|-----|-----------|------------|
| 1 | Women's Chiffon    |  2  | ₹590.00   | ₹1,180.00  |
```

**Totals block (GST-registered):**
```
Product Subtotal (taxable value):      ₹1,000.00
CGST  @ [rate/2]%:                     ₹90.00
SGST  @ [rate/2]%:                     ₹90.00
  (or: IGST @ [rate]%:                 ₹180.00  for interstate)
Delivery charges:                      ₹60.00
Discount / Coupon:                     ₹0.00
                                       ----------
TOTAL AMOUNT:                          ₹1,240.00
Amount in words: Rupees One Thousand Two Hundred Forty Only
```

**Footer (GST-registered seller):**
```
Tax Invoice generated by ReelMart on behalf of [Store Name].
GSTIN of seller: [gst_number]. HSN codes and GST rates auto-assigned per
Indian GST schedule. Subject to the seller's own GST filing obligations.
This is a computer-generated document. Signature not required.
```

**Footer (unregistered seller):**
```
Bill of Supply generated by ReelMart on behalf of [Store Name].
Sold by unregistered dealer. GST not applicable.
This is a computer-generated document. Signature not required.
```

### 3.2 Invoice Type B — ReelMart to Seller (Services Tax Invoice)

This is ReelMart's outward supply of marketplace and logistics services to the seller. Always B2B (seller is the recipient). SAC codes: SAC 998314 (online marketplace commission services) and SAC 996812 (freight/courier logistics).

**Header block:**
```
TAX INVOICE (Service)
------------------------------------------------------
Invoice Number:    RM/[FY]/[NNNNNN]                  e.g. RM/2025-26/001234
Invoice Date:      DD/MM/YYYY (payout processing date)
------------------------------------------------------
SUPPLIER (ReelMart):
  Legal Name:      ReelMart Internet Private Limited
  Address:         [ReelMart registered address]
  GSTIN:           [REELMART_GSTIN]
  State:           [ReelMart state]
  State Code:      [2-digit]
------------------------------------------------------
RECIPIENT (Seller):
  Store Name:      [stores.store_name]
  Legal Name:      [seller's legal/trade name if available]
  Address:         [stores.address snapshot]
  GSTIN:           [stores.gst_number]  OR  "Unregistered"
  State:           [stores.state]
------------------------------------------------------
Reference:         Order [order_number], placed [order date]
```

**Line items:**
```
| # | Description                          | SAC    | Taxable Value | CGST 9% | SGST 9% | IGST 18% | Total    |
|---|-------------------------------------|--------|--------------|---------|---------|---------|---------|
| 1 | Marketplace commission (5% of ₹1,000)| 998314 | ₹50.00       | ₹4.50   | ₹4.50   | —       | ₹59.00  |
| 2 | Logistics/delivery service charge    | 996812 | ₹60.00       | ₹5.40   | ₹5.40   | —       | ₹70.80  |
```

Note: CGST/SGST vs IGST on ReelMart's service invoice is determined by whether the seller's state matches ReelMart's registered state (place of supply for services is the recipient's state under CGST Sec 12). If seller is in ReelMart's home state — CGST + SGST. Otherwise — IGST.

**Totals block:**
```
Taxable value of services:             ₹110.00
CGST @ 9%:                             ₹9.90
SGST @ 9%:                             ₹9.90
  (or IGST @ 18%:                      ₹19.80 for out-of-state seller)
TOTAL SERVICE CHARGE (incl. GST):      ₹129.80
```

**Deduction statement (on the same document or a linked payout statement):**
```
PAYOUT RECONCILIATION for Order [order_number]
------------------------------------------------------
Gross order value received:            ₹1,240.00
Less: ReelMart service charges         ₹129.80
Less: GST TCS (Sec 52 CGST Act)
  CGST 0.5% on ₹1,000:                ₹5.00
  SGST 0.5% on ₹1,000:                ₹5.00
Less: IT TDS u/s 194-O @ 0.1%:        ₹1.16
                                       ----------
NET PAYOUT:                            ₹1,099.04
------------------------------------------------------
Note: GST TCS will appear in your GSTR-2A.
      IT TDS will appear in your Form 26AS.
```

---

## 4. Worked Numeric Example

**Scenario:** Seller "Surya Boutiques" (GST-registered, Telangana, GSTIN 36XXXXX) sells 2 Women's Chiffon Sarees (HSN 6204, 18% GST) to a buyer in Telangana (intrastate). Unit price ₹590 (GST-inclusive). Delivery fee ₹60. No coupon. ReelMart is also in Telangana.

**Step 1: Tax snapshot at order creation**
```
Unit price (GST-inclusive):    ₹590
GST rate:                      18%
Taxable value per unit:        ₹590 / 1.18 = ₹500.00
CGST per unit (9%):            ₹45.00
SGST per unit (9%):            ₹45.00
Qty: 2

Line totals:
  Taxable value:               ₹1,000.00
  CGST:                        ₹90.00
  SGST:                        ₹90.00
  Line total (GST-inclusive):  ₹1,180.00

Order total:                   ₹1,180.00 + ₹60.00 (delivery) = ₹1,240.00
```

**Step 2: Invoice A — Seller → Buyer**
```
Invoice: SB/2025-26/000042  |  Date: 24/06/2026
Seller: Surya Boutiques, Hyderabad, Telangana  |  GSTIN: 36XXXXX
Buyer: Rahul Kumar, Hyderabad, Telangana

| Product          | HSN  | Qty | Taxable Value | CGST 9% | SGST 9% | Total     |
|-----------------|------|-----|--------------|---------|---------|-----------|
| Chiffon Saree    | 6204 |  2  | ₹1,000.00    | ₹90.00  | ₹90.00  | ₹1,180.00 |

Product Subtotal (taxable): ₹1,000.00
CGST 9%:                    ₹90.00
SGST 9%:                    ₹90.00
Delivery charges:           ₹60.00
TOTAL:                      ₹1,240.00
```

**Step 3: Invoice B — ReelMart → Seller (generated at payout processing)**
```
Invoice: RM/2025-26/001234  |  Date: 24/06/2026
Supplier: ReelMart Internet Pvt Ltd, Hyderabad  |  GSTIN: 36YYYYYYY
Recipient: Surya Boutiques, Hyderabad           |  GSTIN: 36XXXXX

| Service                          | SAC    | Taxable | CGST 9% | SGST 9% | Total   |
|---------------------------------|--------|---------|---------|---------|---------|
| Marketplace commission (5%)      | 998314 | ₹50.00  | ₹4.50   | ₹4.50   | ₹59.00  |
| Logistics/delivery service       | 996812 | ₹60.00  | ₹5.40   | ₹5.40   | ₹70.80  |

Taxable value of services:  ₹110.00
CGST 9%:                    ₹9.90
SGST 9%:                    ₹9.90
TOTAL SERVICE CHARGE:       ₹129.80

Payout Reconciliation:
  Gross order value:         ₹1,240.00
  Less ReelMart charges:    -₹129.80
  Less GST TCS (Sec 52):    -₹10.00  (CGST ₹5 + SGST ₹5 on taxable value ₹1,000)
  Less IT TDS (Sec 194-O):  -₹1.10   (0.1% × ₹1,100.20 net before TDS — rounded)
  NET PAYOUT:                ₹1,099.10
```

---

## 5. Invoice Data Model (SQL — design artifact for migration 045)

```sql
-- ============================================================
-- Migration 045: Invoice Engine
-- ============================================================

-- Invoice header: one row per issued invoice.
-- type = 'seller_to_buyer'   → Invoice A (goods; seller's outward supply)
-- type = 'reelmart_to_seller' → Invoice B (services; ReelMart's outward supply)
CREATE TABLE public.invoices (
  id                UUID      DEFAULT gen_random_uuid() PRIMARY KEY,
  type              TEXT      NOT NULL CHECK (type IN ('seller_to_buyer', 'reelmart_to_seller')),

  -- Links
  order_id          UUID      NOT NULL REFERENCES public.orders(id),
  store_id          UUID      NOT NULL REFERENCES public.stores(id),
  -- buyer_id only relevant for seller_to_buyer invoices
  buyer_id          UUID      REFERENCES public.users(id),

  -- Invoice number (see Section 6 for scheme)
  invoice_number    TEXT      NOT NULL UNIQUE,
  invoice_date      DATE      NOT NULL DEFAULT CURRENT_DATE,
  financial_year    TEXT      NOT NULL,  -- e.g. "2025-26"

  -- Lifecycle
  status            TEXT      NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'credit_noted', 'void')),
  credit_note_id    UUID      REFERENCES public.invoices(id),  -- back-ref to credit note

  -- Snapshotted party details (immutable after generation)
  -- Seller/supplier details
  seller_store_name TEXT      NOT NULL,
  seller_address    JSONB     NOT NULL,  -- full address at invoice time
  seller_gstin      TEXT,               -- null if unregistered
  seller_state      TEXT,
  seller_state_code TEXT,               -- 2-digit GST state code

  -- Buyer details (seller_to_buyer only)
  buyer_name        TEXT,
  buyer_phone       TEXT,
  buyer_address     JSONB,

  -- ReelMart details (reelmart_to_seller only)
  reelmart_gstin    TEXT,
  reelmart_address  JSONB,
  reelmart_state    TEXT,
  reelmart_state_code TEXT,

  -- Aggregate tax totals (derived from line items; stored for fast query)
  taxable_value     DECIMAL(12,2) NOT NULL DEFAULT 0,
  cgst_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_gst_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount      DECIMAL(12,2) NOT NULL,  -- incl. GST

  -- Tax basis for this invoice
  tax_basis         TEXT CHECK (tax_basis IN ('intra', 'inter', 'exempt', 'unregistered')),

  -- For Invoice B only: GST TCS and IT TDS on this payout event
  gst_tcs_cgst      DECIMAL(10,2),   -- 0.5% × taxable value
  gst_tcs_sgst      DECIMAL(10,2),   -- 0.5% × taxable value (intrastate)
  gst_tcs_igst      DECIMAL(10,2),   -- 1.0% × taxable value (interstate)
  it_tds_amount     DECIMAL(10,2),   -- 0.1% × gross payment
  net_payout_amount DECIMAL(12,2),   -- for Invoice B only

  -- PDF storage
  pdf_path          TEXT,    -- storage bucket path; null until generated
  pdf_generated_at  TIMESTAMPTZ,

  -- Payout linkage (Invoice B is linked to a payout batch row)
  payout_id         UUID     REFERENCES public.payouts(id),

  -- Immutability audit
  generated_by      TEXT     NOT NULL DEFAULT 'system',  -- 'system' or admin user id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT invoice_b_has_payout CHECK (
    type != 'reelmart_to_seller' OR payout_id IS NOT NULL
  )
);

-- Invoice line items: one per product (Invoice A) or service charge (Invoice B)
CREATE TABLE public.invoice_line_items (
  id               UUID     DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id       UUID     NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- For Invoice A: product data from orders.items snapshot
  -- For Invoice B: service description
  line_type        TEXT     NOT NULL CHECK (line_type IN ('product', 'delivery', 'commission', 'other')),
  description      TEXT     NOT NULL,
  hsn_sac_code     TEXT,    -- HSN for goods (Invoice A), SAC for services (Invoice B)

  qty              DECIMAL(10,3) NOT NULL DEFAULT 1,
  unit_price       DECIMAL(12,2) NOT NULL,  -- unit selling price (GST-inclusive for goods; ex-GST for services)
  taxable_value    DECIMAL(12,2) NOT NULL,  -- qty × unit price excl. GST

  gst_rate_pct     DECIMAL(5,2),
  cgst_pct         DECIMAL(5,2),
  sgst_pct         DECIMAL(5,2),
  igst_pct         DECIMAL(5,2),
  cgst_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,

  line_total       DECIMAL(12,2) NOT NULL,  -- taxable_value + GST

  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Invoice number sequences: per-seller series for Invoice A;
-- single platform series for Invoice B.
CREATE TABLE public.invoice_sequences (
  id            UUID     DEFAULT gen_random_uuid() PRIMARY KEY,
  series_key    TEXT     NOT NULL UNIQUE,
    -- For Invoice A: 'seller_{store_id}_{financial_year}' e.g. 'seller_abc123_2025-26'
    -- For Invoice B: 'reelmart_{financial_year}' e.g. 'reelmart_2025-26'
  last_number   BIGINT   NOT NULL DEFAULT 0,
  financial_year TEXT    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Credit notes table (mirrors invoice structure but represents negative adjustment)
-- A credit note references the original invoice it is correcting.
-- For cancelled/returned orders: credit note is issued against Invoice A.
-- If ReelMart waives charges: credit note against Invoice B.
CREATE TABLE public.credit_notes (
  id                  UUID     DEFAULT gen_random_uuid() PRIMARY KEY,
  original_invoice_id UUID     NOT NULL REFERENCES public.invoices(id),
  credit_note_number  TEXT     NOT NULL UNIQUE,
  credit_note_date    DATE     NOT NULL DEFAULT CURRENT_DATE,
  financial_year      TEXT     NOT NULL,
  reason              TEXT     NOT NULL,
    -- 'order_cancelled', 'order_returned', 'partial_return', 'pricing_error', 'admin_adjustment'
  order_id            UUID     NOT NULL REFERENCES public.orders(id),
  store_id            UUID     NOT NULL REFERENCES public.stores(id),

  -- Amounts being reversed (all positive values representing the reversal)
  taxable_value       DECIMAL(12,2) NOT NULL,
  cgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  sgst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  igst_amount         DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount        DECIMAL(12,2) NOT NULL,

  status              TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued')),
  pdf_path            TEXT,
  pdf_generated_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX invoices_order_idx     ON public.invoices (order_id);
CREATE INDEX invoices_store_idx     ON public.invoices (store_id, type);
CREATE INDEX invoices_payout_idx    ON public.invoices (payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX invoices_fy_type_idx   ON public.invoices (financial_year, type);
CREATE INDEX invoice_lines_inv_idx  ON public.invoice_line_items (invoice_id, sort_order);
```

### 5.1 RLS

```sql
ALTER TABLE public.invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_sequences   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes        ENABLE ROW LEVEL SECURITY;

-- Invoice A: buyer reads invoices where they are the buyer
CREATE POLICY "Buyer reads own invoices"
  ON public.invoices FOR SELECT
  USING (type = 'seller_to_buyer' AND buyer_id = auth.uid());

-- Invoice A + B: seller reads both their goods invoices AND ReelMart's service invoices to them
CREATE POLICY "Seller reads store invoices"
  ON public.invoices FOR SELECT
  USING (store_id IN (
    SELECT id FROM public.stores WHERE seller_id = auth.uid()
  ));

-- Admin reads all
CREATE POLICY "Admin reads all invoices"
  ON public.invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- Line items: inherit access via invoice
CREATE POLICY "Line items readable with invoice"
  ON public.invoice_line_items FOR SELECT
  USING (invoice_id IN (SELECT id FROM public.invoices));

-- Credit notes: same access as invoices
CREATE POLICY "Buyer reads own credit notes"
  ON public.credit_notes FOR SELECT
  USING (order_id IN (SELECT id FROM public.orders WHERE buyer_id = auth.uid()));

CREATE POLICY "Seller reads store credit notes"
  ON public.credit_notes FOR SELECT
  USING (store_id IN (SELECT id FROM public.stores WHERE seller_id = auth.uid()));

CREATE POLICY "Admin reads all credit notes"
  ON public.credit_notes FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- invoice_sequences: service_role only (no client access needed)
-- No SELECT policy needed for anon/authenticated.
```

---

## 6. Invoice Numbering Scheme

### Decision: per-seller sequential series for Invoice A; single ReelMart series for Invoice B

**Rationale:** Under Indian GST law, a seller's outward supply register (GSTR-1) must have a consecutive tax invoice series per financial year with no gaps. If ReelMart used a single global series for all sellers' goods invoices, a seller's series would have massive gaps (because other sellers are interspersed). It is cleaner — and legally defensible — to give each seller their own sequential series, which is also easier to reconcile with their GSTR-1.

**Series formats:**

- **Invoice A (Seller → Buyer):** `[STORE_PREFIX]/[FY]/[NNNNNN]`
  - STORE_PREFIX: first 4 chars of store slug, uppercased, alphanumeric only (e.g. `SURY` for `suryaboutiques`), padded to 4 if shorter. Stable over the store's life.
  - FY: `2025-26`
  - NNNNNN: zero-padded 6-digit counter per (store, FY) starting at 000001
  - Example: `SURY/2025-26/000042`

- **Invoice B (ReelMart → Seller):** `RM/[FY]/[NNNNNN]`
  - Single global ReelMart counter per FY
  - Example: `RM/2025-26/001234`

- **Credit Notes:** `CN-[original-invoice-number]` with suffix `/R1`, `/R2` for multiples
  - Example: `CN-SURY/2025-26/000042/R1`

**Sequence generation:** The `invoice_sequences` table holds the last-issued number per `series_key`. The invoice-service increments with a `SELECT ... FOR UPDATE` (or an `UPDATE ... RETURNING last_number + 1`) to avoid race conditions. Never rely on `INSERT`-time autoincrement for invoice numbers — the sequence must be gapless and atomic.

**Financial year determination:** `IF month >= 4 THEN FY = "YYYY-(YY+1)" ELSE FY = "(YYYY-1)-YY"`. For example: June 2026 → FY 2026-27. March 2026 → FY 2025-26.

**Cancellations and gaps:** A cancelled invoice is NOT deleted — its status is set to `credit_noted` and a corresponding credit note is issued. The original invoice number is retained in the series permanently (no re-use). The credit note references the original. This is mandatory under GST law.

---

## 7. Generation Trigger and Lifecycle

### 7.1 When each invoice is generated

| Invoice | Trigger event | Rationale |
|---|---|---|
| Invoice A (Seller → Buyer) | **Order payment confirmed** (online: `payment_status = 'paid'` written by `/api/payments/confirm` or webhook; COD: order `status` moves to `accepted` by seller) | GST law requires the invoice to be issued at the time of supply. For goods, the time of supply is typically the earlier of: invoice issuance or payment receipt. Payment confirmed is the earliest unambiguous event. For COD, the seller's acceptance (the point they commit to supply) is the closest equivalent before delivery. |
| Invoice B (ReelMart → Seller) | **Payout processed** (when `POST /api/payouts/process` runs and creates a `payouts` row) | Invoice B represents ReelMart's service charge — the revenue is earned when the payout is settled. Generating it at payout time ties the document to the actual financial event and aligns with the GSTR-1 reporting period. |

### 7.2 Idempotency

Each order may have at most one non-voided Invoice A and one non-voided Invoice B. The invoice-service enforces this with a `UNIQUE` partial index:
```sql
CREATE UNIQUE INDEX invoices_order_type_active_uidx
  ON public.invoices (order_id, type)
  WHERE status != 'void';
```
The generation function checks this constraint before generating, so retried calls (e.g. webhook replay) are no-ops if the invoice already exists.

### 7.3 Lifecycle state machine

```
ISSUED
  │
  ├── Order cancelled (before shipment)     → issue CREDIT NOTE for full amount → invoice status = 'credit_noted'
  ├── Order returned (after delivery)       → issue CREDIT NOTE for returned item value → invoice status = 'credit_noted'
  ├── Partial return                        → issue CREDIT NOTE for partial amount → invoice status stays 'issued' (partial credit note exists)
  └── Admin void (data error only)          → status = 'void' (rare; requires admin action + audit log)

CREDIT_NOTED
  └── (terminal; no further transitions)

VOID
  └── (terminal; only via admin action; no credit note needed — this is for pre-issuance data errors only)
```

**Credit note trigger:**
- Order cancellation by buyer or seller → cancel-handler in order-service triggers invoice-service `POST /api/invoices/credit-note` with `{orderId, reason: 'order_cancelled'}`
- Return approved by seller → return-service triggers the same endpoint with `{orderId, returnId, reason: 'order_returned'}`

### 7.4 COD invoice trigger detail

Currently, COD orders are inserted as `payment_status = 'pending'`. The Invoice A trigger for COD is seller acceptance (status → `accepted`). The `PUT /api/orders/:id/status` route in order-service must fire an event to invoice-service when `status = 'accepted'` and `payment_status = 'pending'` (COD path). This is a new inter-service call to add.

---

## 8. PDF Rendering and Storage

### Decision: HTML-to-PDF rendered inside invoice-service on ECS Fargate; stored in a private Supabase storage bucket; served via signed URLs.

**Options considered:**

| Option | Pros | Cons |
|---|---|---|
| Puppeteer/Chromium in invoice-service | Full HTML/CSS fidelity; easy to maintain templates | 150–250 MB image size increase; Fargate memory requirement goes up (min 512 MB → 1 GB) |
| `pdfkit` or `pdf-lib` (programmatic PDF) | ~5 MB dependency; minimal memory overhead | Lower fidelity; coding tables/layouts is tedious; harder to maintain |
| External PDF service (WeasyPrint, Gotenberg) | Decoupled; reusable | Another network hop; another service to manage |
| Render on demand via a `/render` route (no stored PDF) | No storage cost; always up-to-date | Re-renders on every view; load risk at scale |

**Recommendation: `pdfkit` (programmatic PDF) for MVP; migrate to Puppeteer when volume justifies.** The invoice layout is a straightforward table — no complex CSS. `pdfkit` produces valid, GST-compliant PDFs with predictable output and zero Chromium overhead on Fargate. The invoice-service container stays lightweight.

**Storage:** Supabase Storage bucket `invoice-documents` (private, no public access).

```
Path structure:
  seller-invoices/{store_id}/{financial_year}/{invoice_number}.pdf
  reelmart-invoices/{financial_year}/{invoice_number}.pdf
  credit-notes/{store_id}/{financial_year}/{credit_note_number}.pdf
```

**Access via signed URLs:** The invoice-service generates a signed URL (expiry 15 minutes) when a buyer, seller, or admin requests download. The API endpoint validates ownership before signing — the client never gets a permanent URL or direct bucket access.

```
GET /api/invoices/:id/download
  → invoice-service verifies caller owns the invoice (buyer/seller/admin)
  → calls supabaseAdmin.storage.from('invoice-documents').createSignedUrl(path, 900)
  → returns { success: true, data: { url: "https://...", expiresAt: ... } }
```

**Generation timing:** PDF is generated asynchronously after the invoice row is inserted. The invoice row is created synchronously (within the order/payout flow) with `pdf_path = null`. A background job (or a queue message to a `/api/invoices/:id/generate-pdf` internal endpoint) renders and uploads the PDF, then updates `pdf_path` and `pdf_generated_at`. This avoids blocking the payment/payout confirmation response on PDF rendering.

**Retry:** If PDF generation fails, the invoice row still exists with `pdf_path = null`. The seller or buyer requesting download triggers a regeneration attempt if `pdf_path` is null. This is safe because invoices are immutable snapshots.

---

## 9. End-to-End Workflow Diagrams

### 9.1 Online Order → Invoice A

```
BUYER places online order
───────────────────────────────────────────────────────────────────────
Browser/buyer-app
  │ POST /api/payments/confirm
  │   body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, order: { store_id, items, ... } }
  │
payment-service
  │ → verify Razorpay signature
  │ → INSERT into orders (payment_status='paid', status='pending')
  │ → recordOrderEvent(order_placed)
  │
  ├── [NEW] POST /api/invoices/generate (internal, fire-and-forget)
  │     body: { order_id, type: 'seller_to_buyer' }
  │
invoice-service
  │ → fetch order + items (with tax snapshot from DESIGN_category_hsn_gst)
  │ → fetch store (gstin, address, state, gst_verified)
  │ → fetch buyer (name, phone, delivery_address from order)
  │ → determine invoice_number (atomically increment invoice_sequences)
  │ → determine financial_year
  │ → INSERT invoices row (status='issued', pdf_path=null)
  │ → INSERT invoice_line_items (per product from orders.items JSONB)
  │ → [async] render PDF via pdfkit → upload to invoice-documents bucket → UPDATE pdf_path
  │
payment-service
  │ ← { success: true, data: { id, order_number } }  (does not wait for PDF)
  │
BUYER sees order confirmation page
SELLER sees new order in dashboard (realtime)
```

### 9.2 COD Order → Invoice A (on acceptance)

```
SELLER accepts COD order
───────────────────────────────────────────────────────────────────────
seller-dashboard
  │ PUT /api/orders/:id/status
  │   body: { status: 'accepted' }
  │
order-service
  │ → verify seller owns store
  │ → UPDATE orders SET status='accepted', accepted_at=NOW()
  │ → recordOrderEvent(order_accepted)
  │ → notifyOrderUpdate(buyer phone)
  │
  ├── [NEW] if order.payment_method = 'cod' AND no existing Invoice A:
  │     POST /api/invoices/generate (internal, fire-and-forget)
  │         body: { order_id, type: 'seller_to_buyer' }
  │
invoice-service
  │ → (same flow as online path above)
```

### 9.3 Payout Processing → Invoice B

```
ADMIN triggers weekly payout
───────────────────────────────────────────────────────────────────────
admin-dashboard
  │ POST /api/payouts/process
  │
payout-service
  │ → fetch eligible orders (delivered, paid, no payout_id, > 7 days)
  │ → group by store
  │ → for each store:
  │     → compute gross, platform_fee, gst_tcs, it_tds, net_amount [CORRECTED RATES]
  │     → INSERT payouts row (with gst_tcs_amount, it_tds_amount columns)
  │     → UPDATE orders SET payout_id = payout.id
  │
  │   [NEW] for each payout row:
  │     → POST /api/invoices/generate (internal)
  │           body: { payout_id, type: 'reelmart_to_seller' }
  │
invoice-service
  │ → fetch payout row (with store and order details)
  │ → fetch ReelMart GSTIN + address from env config
  │ → determine tax_basis for service (reelmart_state vs seller_state)
  │ → determine invoice_number (RM series, atomic increment)
  │ → INSERT invoices row (Invoice B)
  │ → INSERT invoice_line_items: commission line + delivery fee line
  │ → [async] render PDF → upload → update pdf_path
  │
admin/payout-service
  │ ← { success: true, data: { processed, totalAmount } }
```

### 9.4 Cancellation / Return → Credit Note

```
ORDER CANCELLED (buyer or seller)
───────────────────────────────────────────────────────────────────────
order-service (on cancellation)
  │ → UPDATE orders SET status='cancelled'
  │
  │ [NEW] → POST /api/invoices/credit-note (internal)
  │           body: { order_id, reason: 'order_cancelled' }
  │
invoice-service
  │ → fetch existing Invoice A for this order
  │ → if no issued Invoice A: no-op (order was cancelled before invoice was generated)
  │ → if issued Invoice A exists:
  │     → generate credit_note_number (same series key with CN- prefix)
  │     → INSERT credit_notes (full reversal of Invoice A amounts)
  │     → UPDATE invoices SET status='credit_noted', credit_note_id=credit_note.id
  │     → [async] render credit note PDF → upload → update credit_note.pdf_path
```

### 9.5 Buyer / Seller Invoice Access

```
BUYER downloads Invoice A
───────────────────────────────────────────────────────────────────────
buyer-app / web order page
  │ GET /api/invoices?orderId={id}&type=seller_to_buyer
  │ → invoice-service verifies order.buyer_id = auth.uid()
  │ ← { success: true, data: { id, invoice_number, status, pdf_path } }
  │
  │ GET /api/invoices/{id}/download
  │ → invoice-service verifies buyer_id match
  │ → createSignedUrl(pdf_path, 900 seconds)
  │ ← { success: true, data: { url, expiresAt } }
  │ → browser/app opens the signed URL directly

SELLER downloads Invoice A (for their records) and Invoice B (ReelMart charges)
  │ GET /api/invoices?storeId={id}   (returns all invoice types for their store)
  │ → verify store belongs to seller
  │ ← list of invoices (A + B)
  │
  │ GET /api/invoices/{id}/download (for each invoice)
  │ → verify store ownership
  │ ← signed URL
```

---

## 10. Seller Self-Filing Support (GSTR-1 Data Export)

ReelMart gives sellers two exports to help them file GSTR-1 independently.

### 10.1 HSN-wise outward supply summary

Aggregates `invoice_line_items` grouped by `hsn_sac_code`, for a period (typically a GSTR-1 period: monthly or quarterly).

**Export endpoint:** `GET /api/invoices/export/hsn-summary?storeId=&from=&to=`

**Output format (CSV and JSON):**
```
HSN Code | Description | UOM | Total Qty | Total Taxable Value | CGST | SGST | IGST | Total Tax | Total Value
6204     | Apparel     | NOS | 24        | 18,000.00           | 810  | 810  | 0    | 1,620     | 19,620
7117     | Art. Jewel  | NOS | 6         | 3,000.00            | 0    | 0    | 540  | 540       | 3,540
```

### 10.2 Invoice register (outward supply register)

A list of all Invoice A entries for the period, ready to reconcile with GSTR-1 Table 7 (B2C, consolidated).

**Export endpoint:** `GET /api/invoices/export/invoice-register?storeId=&from=&to=`

**Output format (CSV):**
```
Invoice Number | Invoice Date | Buyer State | Taxable Value | CGST | SGST | IGST | Total | Status | Credit Note
SURY/2025-26/000042 | 24/06/2026 | Telangana | 1,000 | 90 | 90 | 0 | 1,180 | issued |
SURY/2025-26/000043 | 25/06/2026 | Maharashtra | 500 | 0 | 0 | 90 | 590 | credit_noted | CN-SURY/2025-26/000043/R1
```

These exports are available in the seller dashboard under a "Tax Filing" section. They are served by the invoice-service and gated by seller store ownership.

---

## 11. ReelMart's Own Filing Support (Admin)

The admin panel gains a "GST/Tax Registers" section under `/admin/tax`.

### 11.1 ReelMart outward supply register (GSTR-1 preparation)

All Invoice B entries for a period: `GET /api/invoices/admin/export/reelmart-outward?from=&to=`

Groups by seller (B2B recipients with GSTIN) and by unregistered sellers, matching GSTR-1 Table 4 (B2B) structure.

### 11.2 GST TCS register (GSTR-8 preparation)

Per-seller, per-period summary of net taxable value of supply made through the platform and the 1% TCS collected.

**Endpoint:** `GET /api/invoices/admin/export/gst-tcs-register?from=&to=`

**Output (CSV):**
```
Seller GSTIN | Store Name | Net Taxable Value | CGST TCS | SGST TCS | IGST TCS | Total TCS
36XXXXX      | Surya Bou. | 15,000.00         | 37.50    | 37.50    | 0        | 75.00
UNREG        | Rahul Arts | 8,000.00          | 0        | 0        | 0        | 0
```

Note: GST TCS (Sec 52) is collected only on supplies by registered (or persons liable to be registered) sellers through the platform. Supplies by unregistered sellers: TCS does not apply (the platform is not collecting tax on their behalf because they are not making a "taxable supply").

### 11.3 IT TDS register (Form 26Q preparation, Sec 194-O)

Per-seller, per-quarter summary of gross payments and TDS deducted.

**Endpoint:** `GET /api/invoices/admin/export/it-tds-register?from=&to=`

**Output (CSV):**
```
Seller PAN | Store Name | Gross Payment | TDS 0.1% | Net Paid
ABCDE1234F | Surya Bou. | 45,000.00    | 45.00    | 44,955.00
```

PAN is available from `stores.pan_number` (migration 020). The export requires it — flag missing PANs. TDS applies when aggregate payments in the FY exceed ₹5 lakh (the Sec 194-O threshold).

---

## 12. Unregistered and Composition Seller Variants

### 12.1 Unregistered seller (gst_verified = false)

- Invoice A is a **Bill of Supply**, not a Tax Invoice.
- No CGST/SGST/IGST lines. No HSN column (HSN is optional and informational for unregistered sellers).
- Footer: "Sold by unregistered dealer. GST not applicable."
- `invoices.tax_basis = 'unregistered'`
- `invoices.seller_gstin = NULL`
- All `cgst_amount`, `sgst_amount`, `igst_amount` = 0
- Invoice numbering still applies — the seller needs a sequential series for their bill of supply.
- GST TCS (Sec 52) does not apply (no taxable supply by the seller through the platform in a GST sense — confirm with CA, see OQ-5).

### 12.2 Composition scheme sellers (open question — hook designed, not activated)

If a seller is on the Composition Scheme:
- They **cannot** charge GST to their buyers.
- Their invoice must carry the declaration: "Composition taxable person, not eligible to collect tax on supplies."
- They pay a flat rate (1%, 2%, or 6% depending on business type) on their aggregate turnover, directly to the government — not collected from buyers.
- Their document is also a Bill of Supply (not a Tax Invoice).

**Design hook:** Add a `composition_dealer BOOLEAN DEFAULT false` column to `stores` (future migration). The invoice-service checks: if `gst_verified = true AND composition_dealer = true`, render the Composition variant. This avoids a breaking change today. The CA must confirm whether any current sellers are on Composition before this is activated.

---

## 13. Where Computation Lives — Service Architecture

### Decision: New `invoice-service` as the 11th microservice

**Options:**

| Option | Pros | Cons |
|---|---|---|
| Extend payment-service | Payment flow already triggers Invoice A | Mixes payment concerns with invoice rendering/storage; payment-service is already responsible for Razorpay integration |
| Extend order-service | Order lifecycle owns the trigger | Order-service would need PDF deps + storage access + sequence management — scope creep |
| Extend payout-service | Payout trigger is natural for Invoice B | Same issue; payout-service is already complex; mixing payout logic with invoice numbering is fragile |
| **New invoice-service** | Single responsibility; clear API contract; independently deployable and scalable; owns all invoice logic (numbering, PDF, storage, exports) | 11th service adds infra overhead (new ECS task def, ECR repo, ALB target group, Terraform) |

**Recommendation: new invoice-service.** The invoice system is self-contained enough to merit its own service. It is the only consumer of the `invoice_sequences` table (preventing race conditions across services on numbering) and the only service that writes to the `invoice-documents` bucket. The infra overhead is one Terraform module — the pattern is established.

**Internal API contract (called by order-service, payment-service, payout-service):**

```
POST /api/invoices/generate
  Auth: x-internal-key header
  Body: { type: 'seller_to_buyer' | 'reelmart_to_seller', order_id?, payout_id? }
  Response: { success: true, data: { id, invoice_number } }

POST /api/invoices/credit-note
  Auth: x-internal-key header
  Body: { order_id, reason: string }
  Response: { success: true, data: { id, credit_note_number } }

GET /api/invoices?orderId=&storeId=&type=
  Auth: Bearer (buyer/seller auth token)
  Response: { success: true, data: Invoice[] }

GET /api/invoices/:id/download
  Auth: Bearer
  Response: { success: true, data: { url, expiresAt } }

GET /api/invoices/export/hsn-summary?storeId=&from=&to=
GET /api/invoices/export/invoice-register?storeId=&from=&to=
GET /api/invoices/admin/export/reelmart-outward?from=&to=
GET /api/invoices/admin/export/gst-tcs-register?from=&to=
GET /api/invoices/admin/export/it-tds-register?from=&to=
  Auth: Bearer (seller/admin respectively)
  Response: CSV download (Content-Type: text/csv)
```

**Port:** 3000 (consistent with all other services)
**ALB path prefix:** `/api/invoices/*`
**ECR:** `reelmart/invoice-service:dev-latest`
**Memory:** 512 MB on Fargate (pdfkit does not require significant memory)

---

## 14. Phase-Gate: `ca_validated` and Invoice Engine Activation

The category/HSN/GST design established the `ca_validated` flag as a hard gate before HSN codes and GST rates appear on any order. The invoice engine extends this gate:

| Phase | What ships | Tax on invoices |
|---|---|---|
| Phase 1 (now) | Invoice schema + service + numbering + PDF generation + storage + buyer/seller access | Invoice A renders as Bill of Supply ("Sold by unregistered dealer") for ALL sellers, regardless of `gst_verified` status. Invoice B renders with commission + delivery charges but with a note "GST pending CA validation." No GST lines on either invoice. |
| Phase 2 (after CA validates `ca_validated=true` on gst_rates rows) | No new code change needed | Invoice A switches to full tax invoice for `gst_verified=true` sellers, using HSN + GST from order item snapshots. Invoice B gains full CGST/SGST/IGST lines for platform commission + delivery. GST TCS and IT TDS columns go live on payouts table. |
| Phase 3 | Seller export routes, admin GSTR-8 and 26Q registers | Self-filing support available to sellers and admin. |

The flag in the invoice-service:
```typescript
// In invoice generation logic:
const gstActive = await isGstActivated()  // checks any ca_validated=true row exists in gst_rates
if (!gstActive || !store.gst_verified || !store.gst_number) {
  // render unregistered/bill-of-supply variant
} else {
  // render full GST invoice using tax snapshot from orders.items
}
```

---

## 15. Work Breakdown by Team

### Data / Database Engineer
- Migration 045: `invoices`, `invoice_line_items`, `invoice_sequences`, `credit_notes` tables + RLS policies (schema above is the design artifact)
- Migration 046: rename `payouts.tcs_amount` → `payouts.gst_tcs_amount`; add `payouts.it_tds_amount`; update column comments with correct statute references
- Migration 046 (same): add `stores.composition_dealer BOOLEAN DEFAULT false` (future-proofing hook)
- Add `invoice-documents` private storage bucket in Supabase (via Supabase dashboard or `storage.buckets` migration)
- Ensure `invoice_sequences` has a pessimistic lock pattern (advise backend on `SELECT ... FOR UPDATE` or `UPDATE ... RETURNING`)

### Backend Engineer (invoice-service — new)
- Create `reelmart/services/invoice-service` with Express/TS scaffold (Dockerfile, package.json, port 3000, /health)
- Implement `POST /api/invoices/generate` (both types; idempotency check; sequence generation; line item derivation from orders.items tax snapshot; RLS-bypassing supabaseAdmin)
- Implement `POST /api/invoices/credit-note` (full and partial reversal; credit note numbering)
- Implement `GET /api/invoices` (buyer + seller + admin scoped list)
- Implement `GET /api/invoices/:id/download` (signed URL; ownership check)
- Implement PDF rendering with `pdfkit` (Invoice A template: registered + unregistered variants; Invoice B template; credit note template)
- Implement async PDF upload to Supabase Storage `invoice-documents` bucket
- Implement HSN-wise summary export and invoice register export endpoints
- Implement admin export endpoints (ReelMart outward supply, GST TCS register, IT TDS register)

### Backend Engineer (payout-service)
- Fix `TCS_PCT` → split into `GST_TCS_PCT = 0.01` and `IT_TDS_PCT = 0.001`
- Fix calculation bases (GST TCS on taxable value; IT TDS on net payment before TDS)
- Fix label in payout summary response: separate `gstTcsAmount` and `itTdsAmount` fields
- Add call to `POST /api/invoices/generate` (Invoice B) after each payout row is inserted
- Add threshold check for IT TDS: track per-seller FY gross payment total; skip IT TDS if below ₹5 lakh

### Backend Engineer (order-service)
- Add call to `POST /api/invoices/generate` (Invoice A) after COD order acceptance (`status = 'accepted'`)
- Add call to `POST /api/invoices/credit-note` after order cancellation or return approval

### Backend Engineer (payment-service)
- Add call to `POST /api/invoices/generate` (Invoice A) after online payment confirm (inside `/api/payments/confirm`; fire-and-forget)

### Infrastructure Engineer
- Terraform: new ECS task definition, ECR repo, ALB target group + listener rule for `/api/invoices/*` → invoice-service
- Environment variables for invoice-service: `REELMART_GSTIN`, `REELMART_LEGAL_NAME`, `REELMART_ADDRESS_JSON`, `REELMART_STATE`, `REELMART_STATE_CODE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_API_KEY`
- Supabase Storage: provision `invoice-documents` bucket as private

### UI Engineer (seller dashboard)
- Seller payouts page (`/seller/payouts`): add per-payout "Download Invoice" button (Invoice B)
- Seller orders page (`/seller/orders`): add "Download Invoice" button on each order (Invoice A, for their records)
- New seller page `/seller/tax`: "Tax Filing" section with GSTR-1 period selector, HSN-wise summary export, and invoice register CSV download
- Update payout summary card to show separate `gstTcsAmount` (with label "GST TCS — see GSTR-2A") and `itTdsAmount` (with label "IT TDS u/s 194-O — see Form 26AS")

### UI Engineer (buyer)
- Web order detail page (`/order/[id]`): add "Download Invoice" button (Invoice A)
- Buyer app order detail screen: add "Download Invoice" button (Invoice A)

### UI Engineer (admin)
- Admin orders list: add "View Invoice" link per order (Invoice A)
- New admin section `/admin/tax`: 
  - GSTR-1 export (ReelMart's own outward supply register)
  - GSTR-8 register (GST TCS per seller per period)
  - Sec 194-O TDS register (IT TDS per seller per period)
  - Period selector (month/quarter/FY)

---

## 16. Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **GST TCS base (Sec 52) for unregistered sellers.** The statute is unclear on whether TCS applies when the seller is unregistered (not a "taxable person" making a "taxable supply"). If TCS is applied incorrectly, it creates a liability. | HIGH | CA validation required before GST TCS goes live. Phase gate covers this (Phase 1 has no TCS). |
| R-2 | **IT TDS threshold tracking.** Sec 194-O TDS kicks in only above ₹5 lakh per seller per FY. Without tracking cumulative FY payments per seller, TDS is either over-deducted (below threshold) or under-deducted (above threshold, not tracked). | HIGH | Payout-service must maintain a `seller_fy_gross_payout` aggregate. Add a column to track FY cumulative payout per store. Alternatively: deduct TDS on all payouts and refund/adjust at year-end — simpler but less accurate. Flag for CA guidance. |
| R-3 | **Invoice number gaplessness under concurrent payout processing.** If two payout batches run concurrently (race on `invoice_sequences`), invoice numbers could gap or duplicate. | HIGH | Use `SELECT ... FOR UPDATE SKIP LOCKED` or an atomic `UPDATE invoice_sequences SET last_number = last_number + 1 WHERE series_key = $1 RETURNING last_number` — this is atomic in Postgres. |
| R-4 | **COD orders: Invoice A timing.** Indian GST rule 47 requires the invoice to be issued within 30 days of supply. For COD: goods reach the buyer at delivery, not at acceptance. Generating at acceptance is earlier (safer), but if the order is later rejected/cancelled at packing, a credit note is needed. This creates more credit note churn than generating at delivery. | MEDIUM | Generate at acceptance (conservative, earlier than required). Credit notes for subsequent cancellations. Acceptable churn for MVP. Revisit at scale. |
| R-5 | **Place of supply for Invoice B (ReelMart → Seller service invoice).** For services, the place of supply is the recipient's location (CGST Sec 12). If a seller moves state (updates their store address), future Invoice B must use the updated state. The snapshot must capture the seller's state at invoice time, not today. | MEDIUM | Invoice B snapshots `seller_address` and `seller_state` at generation time (the design does this). The seller's current `stores.state` at payout time is used — if they changed their address, the new state applies to future invoices. |
| R-6 | **Seller GSTIN mismatch on Invoice A.** If an admin-verified GSTIN is later found to be incorrect (e.g. the CA notices a digit error), already-issued invoices show the wrong GSTIN. Tax invoices cannot be amended — a credit note + new invoice is required. | MEDIUM | GSTIN format validation (15 chars, known structure) at store settings save time. Add to admin-service or catalog-service. |
| R-7 | **PDF accessibility in buyer-app.** Signed URLs are 15-minute expiry. The buyer app must open the URL in an in-app browser or pass to the OS PDF viewer; deep-linking the PDF via the app's order screen requires a working `WebBrowser.openAsync` (Expo) call. | LOW | Expo's `WebBrowser.openAsync` handles this correctly. Test on Android (most common buyer device). |
| R-8 | **Composition scheme sellers: no hook in current code.** If a composition seller onboards before migration 046 adds the `composition_dealer` column, they will be incorrectly treated as unregistered. | LOW | The `stores.gst_verified` flag covers this for now — composition sellers typically do not have a standard GSTIN on the platform. The `composition_dealer` column is a future hook. |

---

## 17. Open Questions

**OQ-1 (for CA — HIGH):** Does GST TCS (Sec 52) apply to supplies made by unregistered sellers through ReelMart? The statute says TCS applies to "supplies made through" the ECO. An unregistered seller's supply is not a "taxable supply" in GST — does the TCS obligation still arise? This determines whether TCS deduction logic for unregistered sellers is correct.

**OQ-2 (for CA — HIGH):** Confirm the SAC codes for ReelMart's two service lines: (a) online marketplace intermediary/commission service and (b) logistics/delivery facilitation. The design uses SAC 998314 and SAC 996812 as indicative — these need CA confirmation before Invoice B goes live.

**OQ-3 (for founder — MEDIUM):** What is ReelMart's registered state and GSTIN? These are required environment variables for Invoice B. Confirm the legal entity name for the invoice header.

**OQ-4 (for founder — MEDIUM):** Are there any sellers on the Composition Scheme today, or is it expected? If yes, priority the `composition_dealer` flag migration. If no, this is a future hook only.

**OQ-5 (for CA — MEDIUM):** IT TDS Sec 194-O — should ReelMart deduct on all sellers from rupee one, or track the ₹5 lakh annual threshold and only deduct above it? Simple approach (deduct always) is over-conservative but avoids tracking complexity. The seller can claim the excess TDS credit in their ITR. Is this acceptable?

**OQ-6 (for CA — LOW):** For Invoice A, are prices to be stated GST-inclusive or GST-exclusive? The design treats the seller's listed price as GST-inclusive and backs out the taxable value. This is the common practice for B2C sellers (consumers see GST-inclusive prices). Confirm this is correct for the seller categories on the platform.

**OQ-7 (engineering — LOW):** The `pdfkit` library produces a text/table-based PDF. Are there any branding requirements for the invoice template (logo, colour scheme, QR code for e-invoice integration)? Currently designed as plain-text with ReelMart header. A QR code for e-invoice (IRP registration) is mandatory for B2B invoices above ₹5 crore — not relevant at current scale, but flag for future.

---

## 18. Summary of Headline Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Two invoices per order: Invoice A (Seller→Buyer goods) and Invoice B (ReelMart→Seller services) | Correctly models two separate taxable events; each party files their own GST |
| 2 | New invoice-service as the 11th microservice | Single responsibility; owns numbering, PDF, storage, exports; prevents cross-service race conditions on sequence |
| 3 | Per-seller sequential series for Invoice A; single RM series for Invoice B | Legal requirement for seller's GSTR-1 (no gaps in seller's own series); ReelMart's series is its own register |
| 4 | Invoice A triggered at payment confirm (online) or seller acceptance (COD); Invoice B triggered at payout | Aligns with GST "time of supply" rules; Invoice B tied to the actual financial settlement event |
| 5 | Credit notes for all cancellations/returns; invoice never deleted or overwritten | GST law prohibits deletion of issued tax invoices; credit note is the correct reversal mechanism |
| 6 | pdfkit for PDF rendering (not Puppeteer) for MVP | Lightweight; no Chromium overhead on Fargate; adequate for table-based invoice layout |
| 7 | Private Supabase bucket `invoice-documents`; 15-minute signed URLs | Access controlled per-invoice; no permanent public URLs; buyer and seller get scoped access |
| 8 | GST TCS and IT TDS are two separate deductions; payout-service must be corrected | These are different statutes (CGST Act vs Income Tax Act), different rates (1% vs 0.1%), different filing vehicles (GSTR-8 vs 26Q) |
| 9 | Phase gate: Phase 1 ships bill-of-supply for all sellers; Phase 2 activates full GST invoices after `ca_validated=true` | Safe rollout; invoice system live and useful before CA validation completes |
