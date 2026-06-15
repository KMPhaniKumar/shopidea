# ReelMart — DLT SMS Template Pack
**Compliant with TRAI Direction dated 18 Nov 2025 (variable pre-tagging, Annexure-I)**

For every template below, on the Airtel DLT portal select:
- **Header / CLI:** your approved ReelMart header
- **Communication type:** SERVICE IMPLICIT
- **Sector / Category:** CONSUMER GOODS AND AUTOMOBILES
- **Message type:** Text (English)

---

## The 9 templates

### 1. OTP / Login verification
> Your ReelMart verification code is #number#. Valid for 10 minutes. Do not share this code with anyone. - Team ReelMart

Variables: 1 → `#number#` (the OTP code)

---

### 2. Order Confirmation (to buyer)
> Thank you for shopping with ReelMart. Your order #alphanumeric# is confirmed. Amount paid Rs #number#. We will notify you once it ships. - ReelMart

Variables: 2 → order ID `#alphanumeric#`, amount `#number#`

---

### 3. Order Shipped (to buyer)
> Good news! Your ReelMart order #alphanumeric# has been shipped. Track your shipment here: #url# - ReelMart

Variables: 2 → order ID `#alphanumeric#`, tracking link `#url#`
**Requires CTA whitelisting** (see below).

---

### 4. Out for Delivery (to buyer)
> Your ReelMart order #alphanumeric# is out for delivery today and will reach you soon. - ReelMart

Variables: 1 → order ID `#alphanumeric#`

**COD variant** (register separately if you offer cash on delivery):
> Your ReelMart order #alphanumeric# is out for delivery today. Please keep Rs #number# ready for the delivery agent. - ReelMart

Variables: 2 → order ID `#alphanumeric#`, amount `#number#`

---

### 5. Delivered (to buyer)
> Your ReelMart order #alphanumeric# has been delivered. We hope you love it. Thank you for shopping with ReelMart.

Variables: 1 → order ID `#alphanumeric#`

---

### 6. Order Cancelled (to buyer)
> Your ReelMart order #alphanumeric# has been cancelled. Any amount paid will be refunded within 5-7 business days. - ReelMart

Variables: 1 → order ID `#alphanumeric#`

---

### 7. Refund Initiated (to buyer)
> A refund of Rs #number# for your ReelMart order #alphanumeric# has been initiated. It will reflect in your account in 5-7 business days. - ReelMart

Variables: 2 → amount `#number#`, order ID `#alphanumeric#`

---

### 8. New Order Alert (to seller)
> New order on ReelMart. Order #alphanumeric# worth Rs #number# received. Please confirm stock and pack within 24 hours. Pickup will be scheduled. - ReelMart

Variables: 2 → order ID `#alphanumeric#`, amount `#number#`

---

### 9. Pickup Scheduled (to seller)
> Pickup is scheduled for your ReelMart order #alphanumeric#. Please keep the package ready and labelled for the courier. - ReelMart

Variables: 1 → order ID `#alphanumeric#`

---

## Tag legend (Annexure-I — the ONLY tags allowed)

| Tag | Use for | Scrubbing rule |
|---|---|---|
| `#number#` / `#numeric#` | OTP, amounts, pure-digit IDs | Digits only — no letters/special chars |
| `#alphanumeric#` | Order/booking IDs (letters+numbers) | Max 40 characters |
| `#url#` | Web/tracking links | Must match a whitelisted CTA |
| `#urlott#` | App/APK download links | Must match an OTT/APK CTA |
| `#cbn#` | Call-back support number | Must match a registered number CTA |
| `#email#` | Support email address | Must be valid email format |

---

## CTAs to whitelist BEFORE registering URL templates
Template 3 (and any future template using `#url#`) will be **rejected** unless the link is registered as a CTA first.

- [ ] **Tracking URL** — your order-tracking link (e.g. `https://reelmart.in/track` or your NimbusPost tracking domain). Register under **CTA > URL** on the DLT portal, then submit Template 3.

If you later add support contact templates, also whitelist:
- [ ] Support phone number (for `#cbn#`)
- [ ] Support email `support@reelmart.in` (for `#email#`)

---

## Compliance checklist (read before submitting any template)

- [ ] **Order ID tag choice:** templates use `#alphanumeric#`. If your order numbers are *pure digits* (no letters), switch those to `#number#` — it's stricter and approves cleaner. Pick one format and keep it consistent app-wide.
- [ ] **No customer names.** Annexure-I has no name tag, so SMS cannot personalize with a first name. Keep "Hi {name}" only for WhatsApp/email.
- [ ] **No adjacent variables.** Every variable has fixed text between it and the next. Don't edit templates in a way that puts two tags side by side.
- [ ] **Use "Rs" not the rupee symbol.** The ₹ symbol forces Unicode encoding (70 chars/segment, higher cost). "Rs" keeps messages in the cheaper GSM-7 set.
- [ ] **Use plain hyphen "-" not em dash "—".** The em dash also forces Unicode. (All templates above already use a plain hyphen.)
- [ ] **Match MSG91 character-for-character.** Whatever you register here must read *identically* to what MSG91 sends — same words, spacing, punctuation. A mismatch passes DLT but fails at send time during testing.
- [ ] **Keep promotional language out.** Service Implicit templates with any offer/discount wording get rejected or reclassified.
