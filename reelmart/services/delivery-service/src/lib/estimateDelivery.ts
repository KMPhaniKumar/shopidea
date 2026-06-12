/**
 * estimateDelivery.ts
 *
 * Heuristic delivery-time estimator based on Indian pincode zones.
 *
 * NimbusPost's rateServiceability API returns no EDD (estimated delivery date)
 * field. Until NimbusPost exposes a native EDD source, we use a pincode-prefix
 * zone model that reflects typical D+N performance for Indian domestic courier.
 *
 * Replace this logic with a NimbusPost EDD API call once the field is available.
 *
 * Zone model — Indian pincodes:
 *   First digit (postal circle):
 *     1 → Delhi / Haryana / Punjab / UP (West), HP part
 *     2 → UP (East) / Uttarakhand
 *     3 → Rajasthan / Gujarat
 *     4 → Maharashtra / Goa / MP (West) / Chhattisgarh part
 *     5 → AP / Telangana / Karnataka (part)
 *     6 → Tamil Nadu / Kerala / Pondicherry
 *     7 → West Bengal / Odisha / NE states / Andaman
 *     8 → Bihar / Jharkhand / Odisha (part)
 *     9 → APO / Army (not relevant for commerce)
 *
 *   First 2 digits (sub-circles used for metro / remote overrides):
 *     11 → Delhi NCR (metro)
 *     40 → Mumbai (metro)
 *     56 → Bangalore (metro)
 *     60 → Chennai (metro)
 *     70 → Kolkata (metro)
 *     50 → Hyderabad (metro)
 *     17 → Himachal Pradesh (remote hill area)
 *     18 → Jammu & Kashmir
 *     19 → Ladakh / J&K high-altitude
 *     78 → Assam / NE start
 *     79 → North-East states
 *
 *   First 3 digits for island territories:
 *     744 → Andaman & Nicobar Islands
 *     682 → Lakshadweep
 */

/** Metro sub-circle prefixes (2-digit). Shipments between any two metros get 4 days. */
const METRO_PREFIXES = new Set(['11', '40', '56', '60', '70', '50'])

/**
 * Remote sub-circle prefixes (2-digit) where last-mile is constrained —
 * typical SLA is 6–7 days.
 */
const REMOTE_2D_PREFIXES = new Set(['17', '18', '19', '78', '79'])

/**
 * Remote 3-digit pincode prefixes for island territories
 * (Andaman & Nicobar, Lakshadweep).
 */
const REMOTE_3D_PREFIXES = new Set(['744', '682'])

/**
 * Estimate the number of days from dispatch to delivery for a domestic
 * India shipment.
 *
 * Rules (evaluated in order, first match wins):
 *  1. Same pincode or same first-3 digits (same city/area district) → 2 days.
 *  2. Either end is an island territory (744, 682)                  → 7 days.
 *  3. Either end is a remote region (J&K, Ladakh, NE, HP hills)     → 7 days.
 *  4. Both ends are metro zones (Delhi/Mumbai/Bangalore/Chennai/
 *     Kolkata/Hyderabad)                                            → 4 days.
 *  5. Same first digit (same broad postal circle / region)          → 3 days.
 *  6. Everything else (cross-zone domestic)                         → 5 days.
 *
 * @param originPincode     6-digit string — seller / pickup pincode
 * @param destPincode       6-digit string — buyer / delivery pincode
 * @returns                 Positive integer number of calendar days
 */
export function estimateDeliveryDays(
  originPincode: string,
  destPincode: string,
): number {
  // Guard: if either input is not 6 digits, fall back to the conservative default.
  if (!/^\d{6}$/.test(originPincode) || !/^\d{6}$/.test(destPincode)) {
    return 5
  }

  const orig3 = originPincode.slice(0, 3)
  const dest3 = destPincode.slice(0, 3)
  const orig2 = originPincode.slice(0, 2)
  const dest2 = destPincode.slice(0, 2)
  const orig1 = originPincode[0]
  const dest1 = destPincode[0]

  // Rule 1 — same city / area: identical pincode or same district prefix
  if (originPincode === destPincode || orig3 === dest3) {
    return 2
  }

  // Rule 2 — island territory at either end
  if (REMOTE_3D_PREFIXES.has(orig3) || REMOTE_3D_PREFIXES.has(dest3)) {
    return 7
  }

  // Rule 3 — remote region (NE / J&K / Ladakh / HP hills) at either end
  if (REMOTE_2D_PREFIXES.has(orig2) || REMOTE_2D_PREFIXES.has(dest2)) {
    return 7
  }

  // Rule 4 — both ends are major metro zones
  if (METRO_PREFIXES.has(orig2) && METRO_PREFIXES.has(dest2)) {
    return 4
  }

  // Rule 5 — same broad postal circle (same first digit)
  if (orig1 === dest1) {
    return 3
  }

  // Rule 6 — cross-zone domestic fallback
  return 5
}
