/**
 * P1/P3 — Order-tracking timeline logic (drives OrderTrackingScreen + OrderTimeline).
 *
 * Targets the REAL module:
 *   src/services/orderEvents.ts
 *     getEventMeta        (code → railStage / icon / terminal / exception)
 *     deriveTimelineState (events[] → headline, railStage, ETA, terminal flags)
 *     formatIndianDate / formatIndianDateTime (display helpers)
 *
 * These are pure functions — the only dependency is `../lib/supabase`, imported
 * at module load for the fetch/subscribe helpers (not exercised here). It is
 * mocked at the boundary so importing the module never constructs a real client.
 *
 * No network / native / realtime code runs.
 */
jest.mock('../../src/lib/supabase', () => require('../mocks/supabaseMock'));

import {
  getEventMeta,
  deriveTimelineState,
  formatIndianDate,
  formatIndianDateTime,
  RAIL_NODES,
  type OrderStatusEvent,
} from '../../src/services/orderEvents';

// Minimal event factory — fills the required row shape with sensible defaults.
function ev(partial: Partial<OrderStatusEvent> & { code: string }): OrderStatusEvent {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    order_id: 'order-1',
    code: partial.code,
    title: partial.title ?? partial.code,
    description: partial.description ?? null,
    location: partial.location ?? null,
    source: partial.source ?? 'system',
    is_exception: partial.is_exception ?? false,
    estimated_delivery: partial.estimated_delivery ?? null,
    occurred_at: partial.occurred_at ?? '2026-06-01T10:00:00.000Z',
    meta: partial.meta ?? null,
    created_at: partial.created_at ?? '2026-06-01T10:00:00.000Z',
  };
}

describe('orderEvents.getEventMeta — code → rail metadata', () => {
  it('maps known happy-path codes to ascending rail stages', () => {
    expect(getEventMeta('order_placed').railStage).toBe(0);
    expect(getEventMeta('shipment_booked').railStage).toBe(1);
    expect(getEventMeta('out_for_delivery').railStage).toBe(2);
    expect(getEventMeta('delivered').railStage).toBe(3);
  });

  it('flags delivered as terminal-success and not an exception', () => {
    const m = getEventMeta('delivered');
    expect(m.isTerminal).toBe(true);
    expect(m.isException).toBe(false);
  });

  it('flags rejection / cancellation / RTO as exception terminal (-1 rail)', () => {
    expect(getEventMeta('order_rejected')).toMatchObject({ railStage: -1, isException: true, isTerminal: true });
    expect(getEventMeta('order_cancelled')).toMatchObject({ railStage: -1, isException: true, isTerminal: true });
    expect(getEventMeta('rto_delivered')).toMatchObject({ railStage: -1, isException: true, isTerminal: true });
  });

  it('falls back gracefully for an unknown code', () => {
    const m = getEventMeta('some_future_code');
    expect(m).toMatchObject({ railStage: 0, isTerminal: false, isException: false });
    expect(m.label).toBe('some_future_code');
  });

  it('exposes a 4-node rail (Confirmed → Shipped → OFD → Delivered)', () => {
    expect(RAIL_NODES.map(n => n.stage)).toEqual([0, 1, 2, 3]);
    expect(RAIL_NODES.map(n => n.label)).toEqual([
      'Confirmed', 'Shipped', 'Out for delivery', 'Delivered',
    ]);
  });
});

describe('orderEvents.deriveTimelineState — events[] → UI state', () => {
  it('returns a sensible default when there are no events yet', () => {
    const s = deriveTimelineState([]);
    expect(s).toMatchObject({
      railStage: 0,
      headline: 'Order placed',
      isException: false,
      isTerminalSuccess: false,
      isTerminalFailure: false,
      latestEvent: null,
    });
  });

  it('takes the LAST event (ascending order) as the current state', () => {
    const s = deriveTimelineState([
      ev({ code: 'order_placed', title: 'Order placed', occurred_at: '2026-06-01T10:00:00Z' }),
      ev({ code: 'order_accepted', title: 'Order accepted', occurred_at: '2026-06-01T11:00:00Z' }),
      ev({ code: 'shipment_booked', title: 'Shipment booked', occurred_at: '2026-06-02T09:00:00Z' }),
    ]);
    expect(s.headline).toBe('Shipment booked');
    expect(s.railStage).toBe(1);
    expect(s.isTerminalSuccess).toBe(false);
    expect(s.latestEvent?.code).toBe('shipment_booked');
  });

  it('marks a delivered order as terminal success at rail stage 3', () => {
    const s = deriveTimelineState([
      ev({ code: 'out_for_delivery', occurred_at: '2026-06-03T08:00:00Z' }),
      ev({ code: 'delivered', title: 'Delivered', occurred_at: '2026-06-03T15:00:00Z' }),
    ]);
    expect(s.railStage).toBe(3);
    expect(s.isTerminalSuccess).toBe(true);
    expect(s.isTerminalFailure).toBe(false);
  });

  it('marks a rejected order as terminal FAILURE (exception, not success)', () => {
    const s = deriveTimelineState([
      ev({ code: 'order_placed', occurred_at: '2026-06-01T10:00:00Z' }),
      ev({ code: 'order_rejected', title: 'Order rejected', occurred_at: '2026-06-01T12:00:00Z' }),
    ]);
    expect(s.isTerminalFailure).toBe(true);
    expect(s.isTerminalSuccess).toBe(false);
    expect(s.isException).toBe(true);
    expect(s.railStage).toBe(-1);
  });

  it('treats a failed delivery attempt as an exception but NOT terminal', () => {
    const s = deriveTimelineState([
      ev({ code: 'out_for_delivery', occurred_at: '2026-06-03T08:00:00Z' }),
      ev({ code: 'delivery_failed', title: 'Delivery attempted', is_exception: true, occurred_at: '2026-06-03T18:00:00Z' }),
    ]);
    expect(s.isException).toBe(true);
    expect(s.isTerminalFailure).toBe(false);
    expect(s.isTerminalSuccess).toBe(false);
  });

  it('surfaces the most-recent estimated_delivery as the ETA', () => {
    const s = deriveTimelineState([
      ev({ code: 'shipment_booked', estimated_delivery: '2026-06-05', occurred_at: '2026-06-02T09:00:00Z' }),
      ev({ code: 'in_transit', estimated_delivery: '2026-06-04', occurred_at: '2026-06-03T09:00:00Z' }),
    ]);
    // reverse-search picks the latest event carrying an ETA → in_transit's date
    expect(s.etaDate).toBe('2026-06-04');
  });
});

describe('orderEvents date helpers', () => {
  it('formatIndianDate renders "DD MMM YYYY" from a date-only string', () => {
    // en-IN short month; assert the parts rather than exact spacing/locale glyphs.
    const out = formatIndianDate('2026-06-05');
    expect(out).toMatch(/05/);
    expect(out).toMatch(/Jun/);
    expect(out).toMatch(/2026/);
  });

  it('does not throw on a malformed date-only value', () => {
    // NOTE: the helper splits "YYYY-MM-DD" and feeds NaN parts to Date(), which
    // yields the string "Invalid Date" rather than echoing the input or throwing.
    // Asserting the real (non-throwing) behavior so the UI never crashes on bad data.
    expect(() => formatIndianDate('not-a-date')).not.toThrow();
    expect(typeof formatIndianDate('not-a-date')).toBe('string');
  });

  it('formatIndianDateTime returns a non-empty string for a valid ISO datetime', () => {
    const out = formatIndianDateTime('2026-06-05T09:30:00.000Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/2026/);
  });
});
