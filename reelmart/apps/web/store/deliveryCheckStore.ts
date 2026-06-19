import { create } from 'zustand'

/** Result of a completed pincode serviceability check for a store. */
export interface DeliveryCheckResult {
  pincode: string
  /** Resolved state from pincode-state resolver (null = unknown pincode). */
  buyerState: string | null
  /** false = not serviceable (either courier says no, or GST interstate block). */
  serviceable: boolean
  /** True specifically when blocked by the interstate-GST rule. */
  interstateBlocked: boolean
}

interface DeliveryCheckStore {
  /** Map of storeId → last completed check result. */
  checks: Record<string, DeliveryCheckResult>
  setCheck: (storeId: string, result: DeliveryCheckResult) => void
  clearCheck: (storeId: string) => void
  getCheck: (storeId: string) => DeliveryCheckResult | null
}

export const useDeliveryCheckStore = create<DeliveryCheckStore>((set, get) => ({
  checks: {},
  setCheck: (storeId, result) =>
    set(s => ({ checks: { ...s.checks, [storeId]: result } })),
  clearCheck: (storeId) =>
    set(s => {
      const next = { ...s.checks }
      delete next[storeId]
      return { checks: next }
    }),
  getCheck: (storeId) => get().checks[storeId] ?? null,
}))
