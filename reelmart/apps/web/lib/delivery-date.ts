/**
 * Formats a delivery date for display on the storefront.
 * Matches the wording used in CheckoutClient.tsx — "Arriving by {date} · {days}-day delivery".
 * Exported here so both the pre-checkout pincode checker and checkout can share it.
 */
export function formatDeliveryDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + Math.max(1, Math.round(daysFromNow)))
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}
