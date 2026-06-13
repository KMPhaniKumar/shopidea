# DLT Setup — Prerequisites for Real OTP Delivery in Production

> India's TRAI requires every transactional SMS sent to an Indian mobile to
> be registered under DLT (Distributed Ledger Technology). Without it,
> telcos (Airtel, Jio, Vi, BSNL) silently drop the SMS at the operator
> gateway. MSG91's dashboard will report the message as "Sent" because it
> handed off cleanly — the operator just throws it away.
>
> **This is mandatory before prod launch.** Dev uses MSG91 Test Mode (no
> SMS sent, no DLT needed) so we don't have to block on this.
>
> Typical lead time: **5–10 business days** from start to first real OTP
> landing on a handset.

---

## What you'll come out with

| Item | Used in |
|---|---|
| **Principal Entity ID (PE ID)** — 19 digits | One-time, identifies ReelMart as the SMS sender to all telcos |
| **Header / Sender ID** — 6 chars (approved: `RELMRT`) | Appears as the SMS sender on the recipient's phone |
| **Transactional template** with a Template ID (TE ID) | Each unique SMS body needs its own approved template — one for OTP, one for order status, etc. |

**Current approved values (dev):**
- Sender / Header: `RELMRT`
- MSG91 Flow Template ID (used by notification-service for non-OTP transactional SMS): `6a09e291763ac6394f0bf9a2`
- DLT PE ID + DLT TE IDs: _pending — fill in here once Vi DLT issues them_

All three get plugged into the **MSG91 dashboard** under DLT settings + per-widget config. Once MSG91 has them, your OTPs reach handsets reliably.

---

## Prerequisites (have these ready before starting)

- **Company GST number** (required for entity registration)
- **Authorised signatory's PAN + phone**
- **Company address proof** (utility bill, lease, etc.)
- **Authorisation letter** on company letterhead (template provided by the DLT portal during signup)

Sole proprietorship / LLP / Pvt Ltd all work; just need GST.

---

## Step-by-step

### 1. Pick a DLT portal (any one)

All Indian telcos accept DLT registrations from any of the 4 portals — they sync via the central registry. So register once.

| Portal | Operator | URL |
|---|---|---|
| Vi (Vodafone Idea) | Vi | https://www.vilpower.in/ |
| Jio | Jio | https://trueconnect.jio.com/ |
| Airtel | Airtel | https://airtel.in/business/dlt |
| BSNL / MTNL | BSNL | https://www.bsnldlt.com/ |

**Recommended: Vi DLT** — most stable UI, fastest approvals, free for basic plans. Used as the reference below; other portals follow similar flows.

### 2. Register as Principal Entity (PE)

1. Sign up on Vi DLT — Sign Up → Principal Entity → fill business details
2. Upload GST, PAN, authorisation letter
3. Pay registration fee (₹5,900 typical — varies by plan)
4. Wait for approval — **2–5 business days**
5. On approval, you receive a **19-digit PE ID** (e.g., `1101234567890123456`). Save it.

### 3. Register a Header (Sender ID)

The header is the 6-character sender that recipients see (e.g. `RELMRT`).

1. DLT portal → **Headers** → **Add New Header**
2. Header: `RELMRT` (must be alphabetic, 6 chars exactly; cannot start with a number)
3. Type: **Transactional** (OTP must be transactional, never promotional)
4. Submit — approval is **same-day to 24h**

Pick the header carefully — once approved, it's stuck to your PE. Changing it means re-registering and updating all templates + MSG91 settings.

### 4. Register the OTP template

1. DLT portal → **Templates** → **Add New Template**
2. **Category**: Transactional
3. **Type**: Service Implicit (allowed without consent — required for OTP)
4. **Template body** — example MSG91 will accept and that maps onto our widget:

```
{#var#} is your ReelMart OTP. Valid for 5 minutes. Do not share with anyone.
```

   - `{#var#}` is the variable placeholder; MSG91 substitutes the actual OTP at send time.
   - Avoid emojis, special characters, or "click here" links — these get rejected.
   - Keep under 160 chars total or you pay for multi-part SMS.

5. **Associate with header** `RELMRT`
6. Submit — approval is typically **1–3 business days**
7. On approval, you get a **Template ID** (TE ID, e.g., `1707170123456789012`). Save it.

Repeat for any *other* SMS the platform sends:
- Order status updates (accepted / shipped / delivered) — one template each, or one parametrised template with multiple `{#var#}` placeholders
- Order-placed confirmation with tracking link
- Password resets if added later

### 5. Plug values into MSG91

1. MSG91 dashboard → **Settings** → **DLT** (or **Compliance** depending on UI version)
2. Enter:
   - **PE ID**: from step 2
   - **Header**: `RELMRT`
3. Save

For the **OTP widget** specifically:

1. MSG91 → **OTP** → **Widgets** → `ReelMartOTP-Prod` → **Edit**
2. Find **SMS Template** / **DLT Template ID** field
3. Paste the **Template ID** from step 4
4. Save

### 6. Test with a real number

After all approvals are in MSG91, send an OTP to your own non-test phone via the prod widget. SMS should land within seconds, from sender `RELMRT`. If it doesn't, see Troubleshooting below.

---

## Wiring into ReelMart's two environments

The codebase already supports per-environment widgets via Vercel env vars; the DLT side mirrors that.

| Asset | Dev (current) | Prod (after DLT) |
|---|---|---|
| MSG91 widget | `ReelMartOTP` (Test Mode on, captcha checkbox) | `ReelMartOTP-Prod` (Test Mode off, captcha checkbox, DLT template ID set) |
| `NEXT_PUBLIC_MSG91_WIDGET_ID` on Vercel | dev widget id (already set) | scope a separate value to Production target only |
| `NEXT_PUBLIC_MSG91_TOKEN_AUTH` on Vercel | dev tokenAuth (already set) | scope a separate value to Production target only |
| `MSG91_WIDGET_AUTHKEY` in AWS Secrets | `reelmart/dev/msg91` | new `reelmart/prod/msg91` |
| DLT PE ID + Template ID | not needed | enter into prod widget config in MSG91 |

Code does not change between envs — only the widget ID it loads.

---

## Cost (production scale)

Per Vi DLT (typical):
- **PE registration**: ~₹5,900 one-time
- **Per template**: free up to a small monthly count, then a few paise per template per month
- **Per SMS sent via MSG91**: ~₹0.15–0.30 (separate from DLT)
- **WhatsApp OTP** (alternative channel that MSG91 also offers): different pricing, may be cheaper for high volume

DLT itself is small in the ongoing bill; SMS delivery cost dominates.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| MSG91 says "Sent" but no SMS | Template not associated with the header you're sending from, or template approval still pending | Verify Template ID is set in widget config AND status shows "Approved" on DLT portal |
| SMS arrives but header shows `MD-MSGIND` or similar generic | DLT header field not configured in MSG91 → MSG91 used a fallback shared header | Set the registered header (`RELMRT`) under MSG91 DLT settings |
| Body is truncated or has `{#var#}` literal | Template variable substitution broke — usually MSG91 expects `##OTP##` placeholder, DLT uses `{#var#}` — MSG91 maps between them | Check MSG91's template registration screen — the placeholder format may differ from what you registered on DLT |
| Some networks (Airtel) deliver, others (Jio) don't | A specific operator may not have synced the template yet from the central DLT registry | Wait 24–48h, or re-submit the template registration on the lagging operator's portal directly |
| DLT portal rejects template body | Forbidden words (emojis, URL shorteners, "FREE", "WINNER"), or too short / too long | Rewrite without forbidden patterns; keep body under 160 chars |
| Recipient on DND, says "no SMS" | DLT-approved transactional templates bypass DND, but recipient must have validly opted in or template must be Service Implicit type | Make sure the template was registered as "Service Implicit" (no consent required), not "Service Explicit" |

---

## Recommended timeline before prod launch

| Week | What to do |
|---|---|
| **Week 1** | Start PE registration on Vi DLT, upload docs |
| **Week 2** | PE ID issued → register header → submit OTP template |
| **Week 3** | All approvals come in → set up `reelmart/prod/msg91` secret → create `ReelMartOTP-Prod` widget in MSG91 → wire env vars in Vercel scoped to Production target |
| **Week 4** | First real prod OTP test → smoke check all 4 web flows + mobile after migration |

---

## Reference

- Vi DLT portal: https://www.vilpower.in/
- MSG91 DLT docs: https://docs.msg91.com/sms/dlt-registration
- TRAI DLT regulations overview: https://www.trai.gov.in/sites/default/files/Regulation_19062018.pdf
- ReelMart deployment plan: [DEPLOYMENT_PLAN.md](DEPLOYMENT_PLAN.md)
- DNS records (for context on prod cutover): [DNS_RECORDS.md](DNS_RECORDS.md)
