/**
 * ReelMart — Order-Path Spike Test (k6)
 *
 * Covers the checkout / order-create path exclusively.
 *
 * IMPORTANT — READ-PATH ONLY POLICY:
 *   This script does NOT submit real orders. It tests only the read-side of the
 *   checkout funnel:
 *     - The checkout page SSR (GET /store/:slug/checkout) — Vercel/Next.js
 *     - The catalog products endpoint (GET /api/catalog/stores/:id/products) — ALB
 *     - The delivery rates endpoint (POST /api/delivery/rates) — ALB (stub; no courier charges)
 *
 *   POST /api/orders (order creation) and POST /api/payments/* are explicitly excluded.
 *   This upholds the "no real orders/charges" guardrail for load testing on dev.
 *
 * WHY CHECKOUT PAGE SSR:
 *   /store/:slug/checkout is the most latency-sensitive SSR page in the product.
 *   It fetches the store record from Supabase on the Vercel edge (server component),
 *   so it exercises the full Vercel → Supabase path at load, not just the ECS services.
 *
 * WHY DELIVERY RATES:
 *   POST /api/delivery/rates is called client-side on every checkout page mount.
 *   In dev (NIMBUS_AUTH_TOKEN absent) it responds with a stub fee = courierFee + commission.
 *   It still exercises the ALB → ECS delivery-service path and reveals connection-pool pressure.
 *
 * THRESHOLDS:
 *   - http_req_duration p(95) < 2000ms
 *   - delivery_rates_duration p(90) < 1000ms  (should be fast; pure arithmetic stub on dev)
 *   - http_req_failed rate < 1%
 *
 * RUN:
 *   k6 run tests/performance/order-spike.js
 *   # with JSON artifact:
 *   k6 run tests/performance/order-spike.js --out json=tests/performance/results/order-spike-$(date +%Y%m%d-%H%M%S).json
 *
 * GUARDRAILS:
 *   - Run off-hours (08:00–22:00 IST is business hours; nightly scale-to-zero at 22:00).
 *   - 50 VU peak is moderate for a 256 CPU Fargate task. Watch CloudWatch metrics.
 *   - Delivery-service has 1 ECS task in dev. This spike will saturate it at ~50 VU.
 *     That saturation IS the data point — hand findings to infra-engineer.
 */

import http from 'k6/http'
import { check, group, sleep } from 'k6'
import { Trend, Rate } from 'k6/metrics'

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------
const WEB_BASE = __ENV.WEB_BASE || 'https://dev.reelmart.in'
const API_BASE = __ENV.API_BASE || 'https://api-dev.reelmart.in'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/**
 * Checkout is store-scoped. blue-whale has gst_verified=true so the interstate
 * GST block does not fire regardless of buyer pincode. This makes it the correct
 * store to load-test the checkout page SSR path.
 */
const CHECKOUT_STORE_SLUG = 'blue-whale'

/**
 * Delivery rates body — mirrors what CheckoutClient.tsx sends in production.
 * Weight 500g, distance pincode 560038 (Bengaluru), no auth required.
 * The stub path returns { courierFee: 60, commission: 20, totalFee: 80 } when
 * NIMBUS_AUTH_TOKEN is absent.
 */
const DELIVERY_RATES_BODY = JSON.stringify({
  storeId:       'REPLACE_WITH_BLUE_WHALE_STORE_UUID', // optional — stub ignores it
  weight:        500,
  destinationPin: '560038',
  originPin:     '522101',
})

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const deliveryRatesDuration = new Trend('delivery_rates_duration', true)
const checkoutPageDuration  = new Trend('checkout_page_duration',  true)
const deliveryRatesErrors   = new Rate('delivery_rates_error_rate')

// ---------------------------------------------------------------------------
// k6 options — Instagram viral spike profile
// ---------------------------------------------------------------------------
export const options = {
  scenarios: {
    /**
     * Spike: 0 → 50 VU in 15 s, hold 60 s, recover.
     * Chosen to match the realistic Instagram surge window:
     * a seller posts at prime time (20:00 IST), share link clicked by 50 concurrent
     * buyers simultaneously within the first minute.
     */
    instagram_viral_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 5  }, // pre-warm (avoids cold-start skewing p99)
        { duration: '15s', target: 50 }, // viral surge — ramp to peak
        { duration: '60s', target: 50 }, // hold at peak (full minute of traffic)
        { duration: '10s', target: 10 }, // taper — surge dying down
        { duration: '5s',  target: 0  }, // drain
      ],
      gracefulStop: '20s',
    },
  },

  thresholds: {
    // Checkout SSR page — buyers must not wait more than 2 s
    'checkout_page_duration':  ['p(90)<1500', 'p(95)<2000'],
    // Delivery rates — lightweight stub; should respond in < 1 s
    'delivery_rates_duration': ['p(90)<1000', 'p(95)<1500'],
    // Global
    'http_req_duration':       ['p(95)<2000'],
    'http_req_failed':         ['rate<0.01'],
    'delivery_rates_error_rate': ['rate<0.01'],
  },

  tags: {
    project:     'reelmart',
    surface:     'order_path',
    environment: 'dev',
  },
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------
const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en-GB;q=0.9,hi;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
}

const JSON_HEADERS = {
  'Accept':       'application/json',
  'Content-Type': 'application/json',
}

// ---------------------------------------------------------------------------
// VU entry point
// ---------------------------------------------------------------------------
export default function () {
  /**
   * Buyer checkout funnel — read-only simulation:
   *  Step 1: Load the checkout page (SSR, Vercel edge → Supabase)
   *  Step 2: Hit delivery rates (ECS delivery-service, no courier call in stub mode)
   *  (Step 3: POST /api/orders — EXCLUDED by policy)
   */

  group('checkout funnel - page load', () => {
    const res = http.get(
      `${WEB_BASE}/store/${CHECKOUT_STORE_SLUG}/checkout`,
      {
        headers: BROWSER_HEADERS,
        tags: { path: 'checkout_page' },
      }
    )
    checkoutPageDuration.add(res.timings.duration)

    check(res, {
      'checkout page status 2xx':    (r) => r.status >= 200 && r.status < 300,
      'checkout page not 5xx':       (r) => r.status < 500,
      'checkout page latency < 3s':  (r) => r.timings.duration < 3000,
    })
  })

  // Simulate time the buyer spends filling in their cart before rates are fetched
  sleep(Math.random() * 2 + 0.5)

  group('checkout funnel - delivery rates', () => {
    const res = http.post(
      `${API_BASE}/api/delivery/rates`,
      DELIVERY_RATES_BODY,
      {
        headers: JSON_HEADERS,
        tags: { path: 'delivery_rates' },
      }
    )
    deliveryRatesDuration.add(res.timings.duration)

    const ok = check(res, {
      'delivery rates not 5xx':      (r) => r.status < 500,
      'delivery rates has fee':      (r) => {
        try {
          const body = JSON.parse(r.body)
          return typeof body?.data?.totalFee === 'number' || body?.success === true
        } catch { return false }
      },
      'delivery rates latency < 2s': (r) => r.timings.duration < 2000,
    })

    deliveryRatesErrors.add(!ok ? 1 : 0)
  })

  // Simulate reading the review/summary screen before placing (which we don't do)
  sleep(Math.random() * 1.5 + 0.5)
}

// ---------------------------------------------------------------------------
// Summary output hook
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  const thresholds = data.metrics

  const summary = {
    generated_at: new Date().toISOString(),
    scenario: 'instagram_viral_spike',
    environment: {
      web: WEB_BASE,
      api: API_BASE,
    },
    results: {
      total_requests:    data.metrics.http_reqs?.values?.count,
      http_req_failed:   data.metrics.http_req_failed?.values?.rate,
      http_req_duration: {
        avg:  data.metrics.http_req_duration?.values?.avg,
        p90:  data.metrics.http_req_duration?.values?.['p(90)'],
        p95:  data.metrics.http_req_duration?.values?.['p(95)'],
        p99:  data.metrics.http_req_duration?.values?.['p(99)'],
        max:  data.metrics.http_req_duration?.values?.max,
      },
      checkout_page_duration: {
        p90: data.metrics.checkout_page_duration?.values?.['p(90)'],
        p95: data.metrics.checkout_page_duration?.values?.['p(95)'],
      },
      delivery_rates_duration: {
        p90: data.metrics.delivery_rates_duration?.values?.['p(90)'],
        p95: data.metrics.delivery_rates_duration?.values?.['p(95)'],
      },
    },
    threshold_status: 'see_k6_summary_above',
    notes: [
      'POST /api/orders excluded — read-path only per guardrails.',
      'delivery-service running in stub mode (no NIMBUS_AUTH_TOKEN on dev task def).',
      'Hand saturation findings to infra-engineer for ECS desired-count / auto-scaling recommendations.',
    ],
  }

  return {
    stdout:                         JSON.stringify(summary, null, 2),
    'tests/performance/results/order-spike-summary.json': JSON.stringify(summary, null, 2),
  }
}
