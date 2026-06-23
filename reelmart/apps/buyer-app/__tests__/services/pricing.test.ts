/**
 * P0 — Checkout pricing + interstate-GST gating logic.
 *
 * Targets the REAL modules (no mocks needed — these are pure functions):
 *   src/services/orderPricing.ts  (computePriceBreakup, fmtRupee)
 *   src/lib/pincode-state.ts      (statesMatch, stateForPincode)
 *
 * These two modules drive what the CheckoutScreen / order-detail UI shows:
 *   - the price breakup (MRP vs special, fees, total, "paid by")
 *   - the interstate-GST block (statesMatch + stateForPincode decide whether
 *     a buyer in a different state from the seller is allowed to check out).
 *
 * No network / native code runs.
 */
import { computePriceBreakup, fmtRupee } from '../../src/services/orderPricing';
import { statesMatch, stateForPincode } from '../../src/lib/pincode-state';

describe('orderPricing.computePriceBreakup — checkout/order-detail breakup', () => {
  const baseItems = [
    { price: 500, qty: 2, compare_price: 700 }, // MRP 700×2=1400, special 500×2=1000
    { price: 300, qty: 1, compare_price: null }, // no MRP → listing uses price
  ];

  it('computes listing (MRP) total, special total, fees and grand total', () => {
    const b = computePriceBreakup({
      items: baseItems,
      subtotal: 1300, // 1000 + 300
      delivery_fee: 60,
      total_amount: 1360,
      payment_method: 'cod',
    });
    expect(b.listingTotal).toBe(1700); // 1400 + 300
    expect(b.specialTotal).toBe(1300);
    expect(b.fees).toBe(60);
    expect(b.total).toBe(1360);
    expect(b.hasMrp).toBe(true); // 1700 > 1300
  });

  it('marks hasMrp false when no item has a higher compare_price', () => {
    const b = computePriceBreakup({
      items: [{ price: 300, qty: 1, compare_price: 300 }], // equal → not an MRP saving
      subtotal: 300,
      delivery_fee: 0,
      total_amount: 300,
      payment_method: 'cod',
    });
    expect(b.hasMrp).toBe(false);
    expect(b.listingTotal).toBe(300);
  });

  it('sums discount_amount and coins_discount into otherDiscount', () => {
    const b = computePriceBreakup({
      items: baseItems,
      subtotal: 1300,
      delivery_fee: 60,
      discount_amount: 100,
      coins_discount: 25,
      total_amount: 1235,
      payment_method: 'cod',
    });
    expect(b.otherDiscount).toBe(125);
  });

  it('labels paidBy "Cash on Delivery" for COD', () => {
    const b = computePriceBreakup({
      items: baseItems, subtotal: 1300, delivery_fee: 60,
      total_amount: 1360, payment_method: 'cod',
    });
    expect(b.paidBy).toBe('Cash on Delivery');
  });

  it('prettifies an online payment method detail (upi → UPI)', () => {
    const b = computePriceBreakup({
      items: baseItems, subtotal: 1300, delivery_fee: 60,
      total_amount: 1360, payment_method: 'online', payment_method_detail: 'upi',
    });
    expect(b.paidBy).toBe('UPI');
  });

  it('falls back to "Online" for an unknown/missing online detail', () => {
    const b = computePriceBreakup({
      items: baseItems, subtotal: 1300, delivery_fee: 60,
      total_amount: 1360, payment_method: 'online', payment_method_detail: null,
    });
    expect(b.paidBy).toBe('Online');
  });
});

describe('orderPricing.fmtRupee — ₹ display formatting (en-IN)', () => {
  it('formats integers with Indian grouping and no decimals', () => {
    expect(fmtRupee(1360)).toBe('1,360');
    expect(fmtRupee(1234567)).toBe('12,34,567'); // crore/lakh grouping
  });
  it('formats fractional amounts to exactly two decimals', () => {
    expect(fmtRupee(99.5)).toBe('99.50');
    expect(fmtRupee(1234.1)).toBe('1,234.10');
  });
  it('formats zero as "0"', () => {
    expect(fmtRupee(0)).toBe('0');
  });
});

describe('pincode-state.stateForPincode — pincode → state (interstate gate input)', () => {
  it('maps Telangana (Hyderabad 500xxx) — longest prefix wins over AP zone', () => {
    expect(stateForPincode('500034')).toBe('Telangana');
  });
  it('maps Andhra Pradesh (522101 = COD_STORE / Bapatla)', () => {
    expect(stateForPincode('522101')).toBe('Andhra Pradesh');
  });
  it('maps Karnataka (Bangalore 560038 — buyer saved address)', () => {
    expect(stateForPincode('560038')).toBe('Karnataka');
  });
  it('maps Delhi (110001) and Maharashtra (Mumbai 400001)', () => {
    expect(stateForPincode('110001')).toBe('Delhi');
    expect(stateForPincode('400001')).toBe('Maharashtra');
  });
  it('returns null for an invalid pincode (wrong length / non-numeric)', () => {
    expect(stateForPincode('12345')).toBeNull();
    expect(stateForPincode('1234567')).toBeNull();
    expect(stateForPincode('ABC123')).toBeNull();
  });
});

describe('pincode-state.statesMatch — interstate-GST equality', () => {
  it('matches case-insensitively and trims whitespace', () => {
    expect(statesMatch('Telangana', 'telangana')).toBe(true);
    expect(statesMatch('  Andhra Pradesh ', 'Andhra Pradesh')).toBe(true);
  });
  it('does NOT match two different states (block would fire)', () => {
    expect(statesMatch('Telangana', 'Andhra Pradesh')).toBe(false);
  });
  it('returns false when either side is null/empty', () => {
    expect(statesMatch(null, 'Telangana')).toBe(false);
    expect(statesMatch('Telangana', '')).toBe(false);
    expect(statesMatch(undefined, undefined)).toBe(false);
  });
});
