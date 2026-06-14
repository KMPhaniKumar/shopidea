// Seller KYC helpers — PAN / GST number validation.
// (Document uploads — PAN card photo and shop selfie — were removed; sellers
// now self-certify with the PAN/GST numbers only.)

// PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
// GSTIN: 15 chars — 2-digit state code, 10-char PAN, entity digit, 'Z', checksum.
export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export function isValidPan(v: string): boolean {
  return PAN_REGEX.test(v.trim().toUpperCase())
}

export function isValidGst(v: string): boolean {
  return GST_REGEX.test(v.trim().toUpperCase())
}
