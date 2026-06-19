/**
 * Pincode → Indian State resolver
 *
 * Uses the standard India Post PIN zone structure:
 *  - First digit  = zone (1–9)
 *  - First 2-3 digits = circle/district
 *
 * Accuracy target: ~95%. The DB trigger (INTERSTATE_GST) is the authoritative
 * backstop for any cases this misses.
 *
 * Map order: longest prefix wins (3-digit checked before 2-digit).
 */

const PREFIX_MAP: Array<[string, string]> = [
  // ── Zone 1 – Delhi, Haryana, Punjab, HP, J&K, Ladakh ──────────────────
  ['11', 'Delhi'],
  ['12', 'Haryana'],
  ['13', 'Haryana'],
  ['14', 'Punjab'],
  ['15', 'Punjab'],
  ['16', 'Punjab'],
  ['17', 'Himachal Pradesh'],
  ['18', 'Jammu & Kashmir'],
  ['19', 'Jammu & Kashmir'],

  // ── Zone 2 – Uttarakhand, UP ───────────────────────────────────────────
  ['20', 'Uttar Pradesh'],
  ['21', 'Uttar Pradesh'],
  ['22', 'Uttar Pradesh'],
  ['23', 'Uttar Pradesh'],
  ['24', 'Uttar Pradesh'],
  ['25', 'Uttar Pradesh'],
  ['26', 'Uttar Pradesh'],
  ['27', 'Uttar Pradesh'],
  ['28', 'Uttar Pradesh'],
  // 244–246 Uttarakhand — override below at 3-digit level not needed;
  // whole 24x and partially 25x belong to UP/Uttarakhand. Use 3-digit:
  ['244', 'Uttarakhand'],
  ['245', 'Uttarakhand'],
  ['246', 'Uttarakhand'],
  ['247', 'Uttarakhand'],
  ['248', 'Uttarakhand'],
  ['249', 'Uttarakhand'],
  ['263', 'Uttarakhand'],
  ['264', 'Uttarakhand'],
  ['265', 'Uttarakhand'],
  ['266', 'Uttarakhand'],
  ['267', 'Uttarakhand'],
  ['268', 'Uttarakhand'],
  ['269', 'Uttarakhand'],

  // ── Zone 3 – Rajasthan ─────────────────────────────────────────────────
  ['30', 'Rajasthan'],
  ['31', 'Rajasthan'],
  ['32', 'Rajasthan'],
  ['33', 'Rajasthan'],
  ['34', 'Rajasthan'],

  // ── Zone 3 / 4 – Gujarat ──────────────────────────────────────────────
  ['36', 'Gujarat'],
  ['37', 'Gujarat'],
  ['38', 'Gujarat'],
  ['39', 'Gujarat'],
  // Dadra & Nagar Haveli + Daman & Diu share 396xxx
  ['396', 'Dadra & Nagar Haveli and Daman & Diu'],

  // ── Zone 4 – Maharashtra, Goa ─────────────────────────────────────────
  ['40', 'Maharashtra'],
  ['41', 'Maharashtra'],
  ['42', 'Maharashtra'],
  ['43', 'Maharashtra'],
  ['44', 'Maharashtra'],
  ['403', 'Goa'],

  // ── Zone 4 – MP / Chhattisgarh ────────────────────────────────────────
  ['45', 'Madhya Pradesh'],
  ['46', 'Madhya Pradesh'],
  ['47', 'Madhya Pradesh'],
  ['48', 'Madhya Pradesh'],
  ['49', 'Madhya Pradesh'],
  // Chhattisgarh carved out of MP — 3-digit overrides
  ['490', 'Chhattisgarh'],
  ['491', 'Chhattisgarh'],
  ['492', 'Chhattisgarh'],
  ['493', 'Chhattisgarh'],
  ['494', 'Chhattisgarh'],
  ['495', 'Chhattisgarh'],
  ['496', 'Chhattisgarh'],
  ['497', 'Chhattisgarh'],
  ['498', 'Chhattisgarh'],

  // ── Zone 5 – AP, Telangana ────────────────────────────────────────────
  // 500–509 Telangana (Hyderabad circle)
  ['500', 'Telangana'],
  ['501', 'Telangana'],
  ['502', 'Telangana'],
  ['503', 'Telangana'],
  ['504', 'Telangana'],
  ['505', 'Telangana'],
  ['506', 'Telangana'],
  ['507', 'Telangana'],
  ['508', 'Telangana'],
  ['509', 'Telangana'],
  // 510–535 AP
  ['51', 'Andhra Pradesh'],
  ['52', 'Andhra Pradesh'],
  ['53', 'Andhra Pradesh'],

  // ── Zone 5 – Karnataka ────────────────────────────────────────────────
  ['56', 'Karnataka'],
  ['57', 'Karnataka'],
  ['58', 'Karnataka'],
  ['59', 'Karnataka'],

  // ── Zone 6 – Tamil Nadu ───────────────────────────────────────────────
  ['60', 'Tamil Nadu'],
  ['61', 'Tamil Nadu'],
  ['62', 'Tamil Nadu'],
  ['63', 'Tamil Nadu'],
  ['64', 'Tamil Nadu'],
  ['643', 'Tamil Nadu'], // Nilgiris — already covered by 64
  // Puducherry overlap — use 3-digit
  ['605', 'Puducherry'],
  ['607', 'Puducherry'],
  ['609', 'Puducherry'],
  // 65–66 Tamil Nadu
  ['65', 'Tamil Nadu'],
  ['66', 'Tamil Nadu'],

  // ── Zone 6 – Kerala ───────────────────────────────────────────────────
  ['67', 'Kerala'],
  ['68', 'Kerala'],
  ['69', 'Kerala'],

  // ── Zone 6 – Lakshadweep ──────────────────────────────────────────────
  ['682', 'Lakshadweep'],

  // ── Zone 7 – West Bengal, Sikkim, A&N Islands ─────────────────────────
  ['70', 'West Bengal'],
  ['71', 'West Bengal'],
  ['72', 'West Bengal'],
  ['73', 'West Bengal'],
  ['74', 'West Bengal'],
  // Sikkim
  ['737', 'Sikkim'],
  // Andaman & Nicobar
  ['744', 'Andaman & Nicobar Islands'],

  // ── Zone 7 – Odisha ───────────────────────────────────────────────────
  ['75', 'Odisha'],
  ['76', 'Odisha'],
  ['77', 'Odisha'],

  // ── Zone 7 – Assam, NE states ─────────────────────────────────────────
  ['78', 'Assam'],
  // 781–786 Assam; 787 Assam/Arunachal; overrides:
  ['790', 'Arunachal Pradesh'],
  ['791', 'Arunachal Pradesh'],
  ['792', 'Arunachal Pradesh'],
  ['793', 'Meghalaya'],
  ['794', 'Meghalaya'],
  ['795', 'Manipur'],
  ['796', 'Mizoram'],
  ['797', 'Nagaland'],
  ['798', 'Nagaland'],
  ['799', 'Tripura'],

  // ── Zone 8 – Bihar, Jharkhand ─────────────────────────────────────────
  ['80', 'Bihar'],
  ['81', 'Bihar'],
  ['82', 'Bihar'],
  ['83', 'Bihar'],
  ['84', 'Bihar'],
  ['85', 'Bihar'],
  // Jharkhand
  ['82', 'Jharkhand'], // overlap — 3-digit overrides below
  ['820', 'Jharkhand'],
  ['821', 'Jharkhand'],
  ['822', 'Jharkhand'],
  ['823', 'Jharkhand'],
  ['824', 'Jharkhand'],
  ['825', 'Jharkhand'],
  ['826', 'Jharkhand'],
  ['827', 'Jharkhand'],
  ['828', 'Jharkhand'],
  ['829', 'Jharkhand'],
  ['830', 'Jharkhand'],
  ['831', 'Jharkhand'],
  ['832', 'Jharkhand'],
  ['833', 'Jharkhand'],
  ['834', 'Jharkhand'],
  ['835', 'Jharkhand'],

  // ── Zone 9 – Mumbai GPO / APO / military (starts 9) ───────────────────
  // Not a real civilian zone; return null (handled by fallthrough)
]

/**
 * Build a lookup map: longest prefix wins.
 * We sort by prefix length descending so the first match wins.
 */
const SORTED_PREFIXES = PREFIX_MAP.sort((a, b) => b[0].length - a[0].length)

/**
 * Map an Indian 6-digit pincode to its state name.
 * Returns null when the pincode is unknown or invalid.
 */
export function stateForPincode(pincode: string): string | null {
  if (!/^\d{6}$/.test(pincode)) return null
  for (const [prefix, state] of SORTED_PREFIXES) {
    if (pincode.startsWith(prefix)) return state
  }
  return null
}

/**
 * Case-insensitive, trimmed state equality.
 * Returns false when either value is null / undefined / empty.
 */
export function statesMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}
